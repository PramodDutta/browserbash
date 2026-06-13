import { loadConfig } from './config.js';
import { runAgent } from './engine/agent.js';
import { runStagehandAgent, stagehandSupports } from './engine/stagehand.js';
import { resolveModel } from './llm.js';
import { Reporter } from './output.js';
import { getProvider } from './providers/index.js';
import { syncRun } from './sync.js';
import { persistRun } from './local-store.js';
import type { RunOptions, RunResult } from './types.js';

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
    const resolved = { ...options, model };

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

    try {
        if (options.startUrl) {
            await session.page.goto(options.startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        }

        const result = await runAgent({
            objective: options.objective,
            page: session.page,
            reporter,
            maxSteps: options.maxSteps,
            timeoutSec: options.timeoutSec,
            variables: options.variables,
            model: options.model ?? defaultModel,
        });
        result.testUrl = session.testUrl;

        if (session.reportStatus) {
            await session.reportStatus(result.status === 'passed' ? 'passed' : 'failed', result.summary);
        }
        return result;
    } finally {
        await session.close().catch(() => undefined);
    }
}
