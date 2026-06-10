import type { RunEndEvent, StepEvent, VariableValue } from './types.js';
import { maskSecrets } from './variables.js';

/**
 * Output sink. With --agent every event is one NDJSON line on stdout
 * (stable schema for AI agents / CI). Without it, human-readable lines.
 */
export class Reporter {
    constructor(
        private readonly agentMode: boolean,
        private readonly vars: Record<string, VariableValue> = {},
    ) {}

    step(event: StepEvent): void {
        const safe = { ...event, remark: maskSecrets(event.remark, this.vars) };
        if (this.agentMode) {
            process.stdout.write(JSON.stringify(safe) + '\n');
        } else {
            const icon = safe.status === 'passed' ? '✓' : safe.status === 'failed' ? '✗' : '→';
            process.stdout.write(`  ${icon} [${safe.step}] ${safe.action}: ${safe.remark}\n`);
        }
    }

    runEnd(event: RunEndEvent): void {
        const safe = { ...event, summary: maskSecrets(event.summary, this.vars) };
        if (this.agentMode) {
            process.stdout.write(JSON.stringify(safe) + '\n');
        } else {
            process.stdout.write(`\n${safe.status.toUpperCase()} in ${(safe.duration_ms / 1000).toFixed(1)}s — ${safe.summary}\n`);
            if (Object.keys(safe.final_state).length > 0) {
                process.stdout.write(`Extracted: ${JSON.stringify(safe.final_state, null, 2)}\n`);
            }
            if (safe.test_url) {
                process.stdout.write(`Report: ${safe.test_url}\n`);
            }
        }
    }

    info(message: string): void {
        if (!this.agentMode) {
            process.stderr.write(message + '\n');
        }
    }
}
