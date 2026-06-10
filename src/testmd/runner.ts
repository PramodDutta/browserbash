import fs from 'node:fs';
import path from 'node:path';
import { executeRun } from '../runner.js';
import type { RunOptions, RunResult } from '../types.js';
import { parseTestMd } from './parser.js';

/**
 * Run a *_test.md file: steps are joined into one ordered objective for the
 * agent, and a human-readable Result.md is written next to the test file.
 */
export async function runTestMd(filePath: string, options: Omit<RunOptions, 'objective' | 'name'>): Promise<RunResult> {
    const test = parseTestMd(filePath);
    const objective = [
        `Execute this test: "${test.title}". Perform the following steps in order and verify each succeeds:`,
        ...test.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');

    const result = await executeRun({ ...options, objective, name: test.title });

    const resultPath = path.join(path.dirname(test.sourcePath), 'Result.md');
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
