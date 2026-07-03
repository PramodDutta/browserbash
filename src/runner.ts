import { loadConfig } from './config.js';
import { runAgent } from './engine/agent.js';
import { replayJournal, ReplayMiss, ReplaySecurityError } from './engine/replay.js';
import { runStagehandAgent, stagehandSupports } from './engine/stagehand.js';
import { resolveModel } from './llm.js';
import { Reporter } from './output.js';
import { getProvider } from './providers/index.js';
import { syncRun } from './sync.js';
import { persistRun } from './local-store.js';
import {
    deleteJournal,
    journalKey,
    journalPath,
    loadJournal,
    saveJournal,
    type ActionJournal,
    type RecordedAction,
} from './cache-store.js';
import type { CacheVerdict, RunOptions, RunResult } from './types.js';

/**
 * Engine selection:
 *  - stagehand (default) — open-source Stagehand agent (stagehand.dev, MIT).
 *    Drives local Chromium, CDP endpoints, and Browserbase natively.
 *  - builtin — in-repo Anthropic tool-use loop. Required for lambdatest /
 *    browserstack grids (Playwright-protocol WS, which Stagehand cannot attach to).
 */
export async function executeRun(options: RunOptions): Promise<RunResult> {
    const config = loadConfig();
    const reporter = new Reporter(options.agent, options.variables);

    let engine = options.engine ?? config.engine;
    if (engine === 'stagehand' && !stagehandSupports(options.provider)) {
        reporter.info(`Provider '${options.provider}' needs the builtin engine — switching automatically.`);
        engine = 'builtin';
    }

    const model = await resolveModel(options.model ?? config.model, (msg) => reporter.info(msg));
    if (engine === 'builtin' && (model.startsWith('ollama/') || model.startsWith('openrouter/'))) {
        throw new Error(
            `The builtin engine (provider '${options.provider}') speaks the Anthropic API and cannot use '${model}' directly. ` +
            'Options: use a stagehand-capable provider (local/cdp/browserbase), set ANTHROPIC_API_KEY, ' +
            'or point ANTHROPIC_BASE_URL at an Anthropic-compatible gateway (e.g. LiteLLM) and pass a claude model id.',
        );
    }
    const routing = options.routing ?? config.routing;
    const resolved = { ...options, model, routing };

    const result = engine === 'stagehand'
        ? await runWithStagehand(resolved, reporter, model)
        : await runWithBuiltin(resolved, reporter, model);

    reporter.runEnd({
        type: 'run_end',
        status: result.status,
        summary: result.summary,
        final_state: result.finalState,
        duration_ms: result.durationMs,
        steps_executed: result.stepsExecuted,
        provider: options.provider,
        test_url: result.testUrl,
        ...(result.cache ? { cache: result.cache } : {}),
        ...(result.tokensIn !== undefined ? { tokens_in: result.tokensIn } : {}),
        ...(result.tokensOut !== undefined ? { tokens_out: result.tokensOut } : {}),
    });

    // Always keep a private local copy for `browserbash dashboard` (on-disk,
    // never leaves the machine, secrets masked).
    persistRun({ objective: options.objective, result, provider: options.provider, model, variables: options.variables });

    // Cloud sync is opt-in per run via --upload (and needs `browserbash connect`).
    if (options.upload) {
        await syncRun(config, options.objective, result, options.variables, options.provider, model, (msg) => reporter.info(msg));
    } else if (config.apiKey && !options.agent) {
        reporter.info('Kept local. Add --upload to push this run to your cloud dashboard.');
    }

    return result;
}

async function runWithStagehand(options: RunOptions, reporter: Reporter, defaultModel: string): Promise<RunResult> {
    return await runStagehandAgent({
        objective: options.objective,
        provider: options.provider,
        headless: options.headless,
        reporter,
        maxSteps: options.maxSteps,
        timeoutSec: options.timeoutSec,
        variables: options.variables,
        model: options.model ?? defaultModel,
        cdpEndpoint: options.cdpEndpoint,
        startUrl: options.startUrl,
        record: options.record,
        name: options.name,
        cache: options.cache,
        ...(options.routing?.executionModel ? { executionModel: options.routing.executionModel } : {}),
    });
}

async function runWithBuiltin(options: RunOptions, reporter: Reporter, defaultModel: string): Promise<RunResult> {
    const config = loadConfig();
    const provider = getProvider(options.provider);
    reporter.info(`Provider: ${provider.id} — ${provider.description}`);

    const session = await provider.connect({
        headless: options.headless,
        name: options.name ?? options.objective.slice(0, 80),
        cdpEndpoint: options.cdpEndpoint,
        config,
    });

    // Replay-first journal cache. Keyed on the TEMPLATED objective so secret
    // values never influence the key, and editing the test invalidates it.
    const cacheEnabled = options.cache?.enabled ?? false;
    const file = cacheEnabled
        ? journalPath(options.cache!.dir, journalKey(options.objective, options.variables, options.startUrl))
        : undefined;
    if (file && options.cache!.refresh) {
        deleteJournal(file);
        reporter.info('Cache entry wiped (--refresh-cache)');
    }
    const journal = file ? loadJournal(file) : null;

    const start = Date.now();
    try {
        if (options.startUrl) {
            await session.page.goto(options.startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        }

        let result: RunResult;
        let cacheVerdict: CacheVerdict = cacheEnabled ? 'miss' : 'off';
        let healPrefix: RecordedAction[] | null = null;
        let healSeedState: Record<string, string> | undefined;
        let resumeNote: string | undefined;

        if (journal) {
            reporter.info(`Replaying ${journal.actions.length} cached actions (no model)`);
            try {
                const finalState = await replayJournal(session.page, journal, options.variables, reporter);
                cacheVerdict = 'hit';
                journal.stats.hits += 1;
                saveJournal(file!, journal);
                result = {
                    status: 'passed',
                    summary: `Replayed ${journal.actions.length} cached actions successfully (no model calls).`,
                    finalState,
                    stepsExecuted: journal.actions.length,
                    durationMs: Date.now() - start,
                    cache: 'hit',
                };
                result.testUrl = session.testUrl;
                if (session.reportStatus) {
                    await session.reportStatus('passed', result.summary);
                }
                return result;
            } catch (err) {
                if (err instanceof ReplaySecurityError) {
                    // Fail closed: no heal, no substitution beyond this point.
                    throw err;
                }
                if (err instanceof ReplayMiss) {
                    reporter.info(`${err.message} — healing with the agent (1 heal per run)`);
                    healPrefix = err.completedActions;
                    healSeedState = err.finalStateSoFar;
                    resumeNote =
                        `Note: the first ${err.completedActions.length} recorded actions of this test were already ` +
                        'replayed successfully and the page reflects their effects. Continue the objective from the current page state.';
                } else {
                    throw err;
                }
            }
        }

        const actionSink: RecordedAction[] = [];
        result = await runAgent({
            objective: options.objective,
            page: session.page,
            reporter,
            maxSteps: options.maxSteps,
            timeoutSec: options.timeoutSec,
            variables: options.variables,
            model: options.model ?? defaultModel,
            ...(options.routing ? { routing: options.routing } : {}),
            ...(cacheEnabled ? { actionSink } : {}),
            ...(healSeedState ? { initialFinalState: healSeedState } : {}),
            ...(resumeNote ? { resumeNote } : {}),
        });
        result.cache = cacheVerdict;
        result.testUrl = session.testUrl;

        if (file) {
            if (result.status === 'passed') {
                // Heal: stitch the green replay prefix to the freshly recorded
                // tail. Cold miss: the whole run is the journal.
                const actions = healPrefix ? [...healPrefix, ...actionSink] : actionSink;
                if (actions.length > 0) {
                    const prior = journal?.stats ?? { hits: 0, heals: 0 };
                    const next: ActionJournal = {
                        v: 1,
                        engine: 'builtin',
                        recordedModel: options.model ?? defaultModel,
                        variableKeys: Object.keys(options.variables).sort(),
                        startUrl: options.startUrl,
                        actions,
                        stats: { hits: prior.hits, heals: prior.heals + (healPrefix ? 1 : 0) },
                    };
                    saveJournal(file, next);
                    reporter.info(healPrefix ? 'Cache entry healed and re-recorded' : 'Recorded action journal for replay');
                }
            } else if (healPrefix) {
                // Heal failed: the entry is stale beyond repair, drop it.
                deleteJournal(file);
                reporter.info('Cache entry deleted (heal failed)');
            }
        }

        if (session.reportStatus) {
            await session.reportStatus(result.status === 'passed' ? 'passed' : 'failed', result.summary);
        }
        return result;
    } finally {
        await session.close().catch(() => undefined);
    }
}
