import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAll } from '../../dist/orchestrator/run-all.js';

/**
 * Real-process check of the RSS watchdog: the fake CLI balloons its heap far
 * past the cap and would otherwise live for 30s; the watchdog must kill it
 * and classify the test as an infra error, well before the child's natural
 * exit. Uses ps, so this only runs where ps exists (darwin/linux).
 */
const hasPs = process.platform !== 'win32';

describe.skipIf(!hasPs)('run-all memory cap', () => {
    it('kills a ballooning child tree and reports infra + test_kill', { timeout: 30_000 }, async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-memcap-'));
        const testsDir = path.join(dir, 'tests');
        fs.mkdirSync(testsDir);
        fs.writeFileSync(path.join(testsDir, 'balloon_test.md'), '# balloon\n\n- irrelevant\n');

        // Stands in for the CLI entry: ignores argv, allocates ~64MB every
        // 150ms, exits on its own after 30s if nobody kills it.
        const fakeCli = path.join(dir, 'fake-cli.js');
        fs.writeFileSync(fakeCli, `
            const chunks = [];
            setInterval(() => { chunks.push(Buffer.alloc(64 * 1024 * 1024, 1)); }, 150);
            setTimeout(() => process.exit(0), 30000);
        `);

        const result = await runAll({
            target: testsDir,
            concurrency: 1,
            memoryBudgetMb: 700,
            memoryCapMb: 200,
            retries: 0,
            maxFailures: 0,
            eventsPath: path.join(dir, 'events.ndjson'),
            agent: false,
            staggerMs: 0,
            childFlags: [],
            cliBin: fakeCli,
            resultsDir: path.join(dir, 'results'),
        });

        expect(result.infra).toBe(1);
        expect(result.exitCode).toBe(2);
        expect(result.outcomes[0].summary).toMatch(/exceeded --memory-cap 200MB/);
        // Killed by the watchdog, not the child's 30s self-exit.
        expect(result.outcomes[0].durationMs).toBeLessThan(20_000);

        const events = fs.readFileSync(path.join(dir, 'events.ndjson'), 'utf-8')
            .trim().split('\n').map((l) => JSON.parse(l));
        const kill = events.find((e) => e.type === 'test_kill');
        expect(kill).toBeDefined();
        expect(kill.reason).toBe('memory');
        expect(kill.cap_mb).toBe(200);
        expect(kill.rss_mb).toBeGreaterThan(200);

        fs.rmSync(dir, { recursive: true, force: true });
    });
});
