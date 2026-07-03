import fs from 'node:fs';
import path from 'node:path';
import { executeRun } from '../runner.js';
import type { RunOptions, RunResult } from '../types.js';
import { parseTestMd } from './parser.js';

/**
 * Where the human-readable result file goes. Default: Result.md next to the
 * test file. The fixed name clobbers under parallel runs of tests sharing a
 * directory, so callers (e.g. a suite runner) can override per run.
 */
export function resolveResultPath(sourcePath: string, override?: string): string {
    if (!override) return path.join(path.dirname(sourcePath), 'Result.md');
    return path.resolve(override);
}

/**
 * Run a *_test.md file: steps are joined into one ordered objective for the
 * agent, and a human-readable Result.md is written next to the test file
 * (or at options.resultPath when given).
 */
export async function runTestMd(
    filePath: string,
    options: Omit<RunOptions, 'objective' | 'name'> & { resultPath?: string },
): Promise<RunResult> {
    const test = parseTestMd(filePath);
    const objective = [
        `Execute this test: "${test.title}". Perform the following steps in order and verify each succeeds:`,
        ...test.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');

    const { resultPath: resultPathOverride, ...runOptions } = options;
    const result = await executeRun({ ...runOptions, objective, name: test.title });

    const resultPath = resolveResultPath(test.sourcePath, resultPathOverride);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    const lines = [
        `# Result: ${test.title}`,
        '',
        `- **Status:** ${result.status}`,
        `- **Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
        `- **Steps executed:** ${result.stepsExecuted}`,
        result.testUrl ? `- **Report:** ${result.testUrl}` : '',
        '',
        '## Summary',
        '',
        result.summary,
        '',
    ];
    if (Object.keys(result.finalState).length > 0) {
        lines.push('## Extracted values', '', '```json', JSON.stringify(result.finalState, null, 2), '```', '');
    }
    fs.writeFileSync(resultPath, lines.filter((l) => l !== undefined).join('\n'), 'utf-8');
    return result;
}
