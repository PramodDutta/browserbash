import { loadConfig } from './config.js';
import { runAgent } from './engine/agent.js';
import { Reporter } from './output.js';
import { getProvider } from './providers/index.js';
import type { RunOptions, RunResult } from './types.js';

/** Connect provider → run agent loop → report status back to vendor → close. */
export async function executeRun(options: RunOptions): Promise<RunResult> {
    const config = loadConfig();
    const reporter = new Reporter(options.agent, options.variables);
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
            model: options.model ?? config.model,
        });
        result.testUrl = session.testUrl;

        if (session.reportStatus) {
            await session.reportStatus(result.status === 'passed' ? 'passed' : 'failed', result.summary);
        }

        reporter.runEnd({
            type: 'run_end',
            status: result.status,
            summary: result.summary,
            final_state: result.finalState,
            duration_ms: result.durationMs,
            steps_executed: result.stepsExecuted,
            provider: provider.id,
            test_url: result.testUrl,
        });
        return result;
    } finally {
        await session.close().catch(() => undefined);
    }
}
