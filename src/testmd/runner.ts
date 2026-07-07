import fs from 'node:fs';
import path from 'node:path';
import { executeRun } from '../runner.js';
import { loadConfig } from '../config.js';
import { getProvider } from '../providers/index.js';
import { resolveModel } from '../llm.js';
import { runAgent } from '../engine/agent.js';
import { startTrace } from '../engine/trace.js';
import { profileCoversOrigin, resolveAuthProfile, type AuthProfile } from '../auth-store.js';
import { estimateCostUsd } from '../pricing.js';
import { persistRun } from '../local-store.js';
import { syncRun } from '../sync.js';
import { Reporter } from '../output.js';
import type { RunArtifacts, RunOptions, RunResult } from '../types.js';
import type { AssertablePage } from '../engine/assertions.js';
import { parseTestMd, type TestMdFile } from './parser.js';
import { classifySteps, toExecutionUnits } from './steps.js';
import { executeV2 } from './v2-runner.js';

/**
 * Where the human-readable result file goes. Default: Result.md next to the
 * test file. The fixed name clobbers under parallel runs of tests sharing a
 * directory, so callers (e.g. a suite runner) can override per run.
 */
export function resolveResultPath(sourcePath: string, override?: string): string {
    if (!override) return path.join(path.dirname(sourcePath), 'Result.md');
    return path.resolve(override);
}

type TestMdOptions = Omit<RunOptions, 'objective' | 'name'> & { resultPath?: string };

/**
 * Run a *_test.md file.
 *  - version 1 (default): steps are joined into one ordered objective.
 *  - version 2 (frontmatter `version: 2`): per-step execution — API steps and
 *    Verify assertions run deterministically, plain-English steps run in
 *    agent blocks against one persistent browser session.
 * A human-readable Result.md is written next to the test file (or at
 * options.resultPath when given).
 */
export async function runTestMd(filePath: string, options: TestMdOptions): Promise<RunResult> {
    const test = parseTestMd(filePath);

    const result = test.version === 2
        ? await runTestMdV2(test, options)
        : await runTestMdV1(test, options);

    writeResultMd(test, result, options.resultPath);
    return result;
}

async function runTestMdV1(test: TestMdFile, options: TestMdOptions): Promise<RunResult> {
    const objective = [
        `Execute this test: "${test.title}". Perform the following steps in order and verify each succeeds:`,
        ...test.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');

    const { resultPath: _resultPath, ...runOptions } = options;
    return executeRun({
        ...runOptions,
        auth: options.auth ?? test.auth,
        objective,
        name: test.title,
    });
}

/**
 * v2 path: needs a page that survives across steps, so it owns the provider
 * session directly and always drives the builtin engine (Stagehand tears its
 * browser down per execute call).
 */
async function runTestMdV2(test: TestMdFile, options: TestMdOptions): Promise<RunResult> {
    const config = loadConfig();
    const reporter = new Reporter(options.agent, options.variables);

    if ((options.engine ?? config.engine) === 'stagehand') {
        reporter.info('testmd v2 (per-step execution) runs on the builtin engine — switching automatically.');
    }
    const model = await resolveModel(options.model ?? config.model, (msg) => reporter.info(msg));
    if (model.startsWith('ollama/') || model.startsWith('openrouter/')) {
        throw new Error(
            `testmd v2 uses the builtin engine, which speaks the Anthropic API and cannot use '${model}'. ` +
            'Set ANTHROPIC_API_KEY, or point ANTHROPIC_BASE_URL at an Anthropic-compatible gateway (e.g. LiteLLM) and pass a claude model id. ' +
            'Or drop `version: 2` from the frontmatter to run the whole file on the stagehand engine.',
        );
    }

    let authProfile: AuthProfile | undefined;
    const authName = options.auth ?? test.auth;
    if (authName) {
        authProfile = resolveAuthProfile(authName);
        if (!profileCoversOrigin(authProfile, options.startUrl)) {
            reporter.info(`Warning: auth profile '${authProfile.name}' was saved for ${authProfile.origins.join(', ')}`);
        }
        reporter.info(`Auth: using saved session '${authProfile.name}'`);
    }

    const provider = getProvider(options.provider);
    reporter.info(`Provider: ${provider.id} — ${provider.description}`);
    reporter.info(`testmd v2: per-step execution (${test.steps.length} steps)`);

    const session = await provider.connect({
        headless: options.headless,
        name: test.title,
        cdpEndpoint: options.cdpEndpoint,
        config,
        ...(authProfile || options.viewport
            ? {
                  context: {
                      ...(authProfile ? { storageStatePath: authProfile.file } : {}),
                      ...(options.viewport ? { viewport: options.viewport } : {}),
                  },
              }
            : {}),
    });

    const trace = options.record ? await startTrace(session.page) : undefined;
    if (trace) reporter.info('Recording Playwright trace (--record)');

    try {
        if (options.startUrl) {
            await session.page.goto(options.startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        }

        const units = toExecutionUnits(classifySteps(test.steps));
        const routing = options.routing ?? config.routing;

        const result = await executeV2(
            {
                title: test.title,
                units,
                variables: options.variables,
                timeoutSec: options.timeoutSec,
                reporter,
            },
            {
                page: session.page as unknown as AssertablePage,
                runAgentBlock: async (objective, seedState, remainingSec) => {
                    const block = await runAgent({
                        objective,
                        page: session.page,
                        reporter,
                        maxSteps: options.maxSteps,
                        timeoutSec: remainingSec,
                        variables: options.variables,
                        model,
                        ...(routing ? { routing } : {}),
                        initialFinalState: seedState,
                    });
                    return {
                        status: block.status,
                        summary: block.summary,
                        finalState: block.finalState,
                        stepsExecuted: block.stepsExecuted,
                        tokensIn: block.tokensIn,
                        tokensOut: block.tokensOut,
                    };
                },
            },
        );

        result.testUrl = session.testUrl;
        // v2 runs are per-step; the whole-run replay journal does not apply.
        result.cache = 'off';
        if (trace) {
            const artifacts: RunArtifacts = {};
            const out = await trace.stop();
            if (out.trace) artifacts.trace = out.trace;
            if (out.screenshot) artifacts.screenshot = out.screenshot;
            if (Object.keys(artifacts).length > 0) result.artifacts = artifacts;
        }
        if (result.tokensIn !== undefined || result.tokensOut !== undefined) {
            const cost = estimateCostUsd(model, result.tokensIn ?? 0, result.tokensOut ?? 0);
            if (cost !== undefined) result.costUsd = cost;
        }

        reporter.runEnd({
            type: 'run_end',
            status: result.status,
            summary: result.summary,
            final_state: result.finalState,
            duration_ms: result.durationMs,
            steps_executed: result.stepsExecuted,
            provider: options.provider,
            test_url: result.testUrl,
            cache: 'off',
            ...(result.tokensIn !== undefined ? { tokens_in: result.tokensIn } : {}),
            ...(result.tokensOut !== undefined ? { tokens_out: result.tokensOut } : {}),
            ...(result.costUsd !== undefined ? { cost_usd: result.costUsd } : {}),
            ...(result.assertions ? { assertions: result.assertions } : {}),
        });

        persistRun({ objective: `testmd v2: ${test.title}`, result, provider: options.provider, model, variables: options.variables });
        if (options.upload) {
            await syncRun(config, `testmd v2: ${test.title}`, result, options.variables, options.provider, model, (msg) => reporter.info(msg));
        }
        if (session.reportStatus) {
            await session.reportStatus(result.status === 'passed' ? 'passed' : 'failed', result.summary);
        }
        return result;
    } finally {
        await session.close().catch(() => undefined);
    }
}

function writeResultMd(test: TestMdFile, result: RunResult, resultPathOverride?: string): void {
    const resultPath = resolveResultPath(test.sourcePath, resultPathOverride);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    const lines = [
        `# Result: ${test.title}`,
        '',
        `- **Status:** ${result.status}`,
        `- **Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
        `- **Steps executed:** ${result.stepsExecuted}`,
        ...(result.costUsd !== undefined ? [`- **Estimated cost:** $${result.costUsd.toFixed(4)}`] : []),
        ...(result.testUrl ? [`- **Report:** ${result.testUrl}`] : []),
        '',
        '## Summary',
        '',
        result.summary,
        '',
    ];
    if (result.assertions && result.assertions.details.length > 0) {
        lines.push('## Assertions', '', '| Assertion | Result | Detail |', '|---|---|---|');
        for (const a of result.assertions.details) {
            const detail = a.passed ? '' : `expected ${a.expected ?? ''}, got ${a.actual ?? ''}`;
            lines.push(`| ${a.step.replace(/\|/g, '\\|')} | ${a.passed ? 'PASS' : 'FAIL'}${a.judged ? ' (agent-judged)' : ''} | ${detail.replace(/\|/g, '\\|')} |`);
        }
        lines.push('');
    }
    if (Object.keys(result.finalState).length > 0) {
        lines.push('## Extracted values', '', '```json', JSON.stringify(result.finalState, null, 2), '```', '');
    }
    fs.writeFileSync(resultPath, lines.join('\n'), 'utf-8');
}
