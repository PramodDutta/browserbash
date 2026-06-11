import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const run = promisify(execFile);

// Real browser + real LLM. Opt in: needs ANTHROPIC_API_KEY, or set BB_LIVE=1
// with a local Ollama running. Skipped otherwise so CI stays hermetic.
const hasBackend = !!process.env.ANTHROPIC_API_KEY || !!process.env.BB_LIVE;

describe.skipIf(!hasBackend)('live run', () => {
    it('opens example.com and extracts the heading', async () => {
        const { stdout } = await run('node', [join(process.cwd(), 'dist/index.js'), 'run',
            "Open https://example.com and store the main heading text as 'h1'",
            '--agent', '--headless', '--timeout', '120'], { timeout: 180000 });
        const end = JSON.parse(stdout.trim().split('\n').pop()!);
        expect(end.status).toBe('passed');
        expect(JSON.stringify(end.final_state).toLowerCase()).toContain('example');
    }, 180000);
});
