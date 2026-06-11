#!/usr/bin/env node
/**
 * Records a real browserbash run as a replayable demo.
 * Usage:
 *   node scripts/record-demo.mjs "<objective>" <output-name>
 * Example:
 *   ANTHROPIC_API_KEY=... node scripts/record-demo.mjs \
 *     "Open https://news.ycombinator.com and store the top story title as 'top_story'" hn
 *
 * Output: public/demos/<output-name>.json
 *   { objective, command, recordedAt, events: [{ t, line }] }
 * Events are the CLI's real --agent NDJSON lines with millisecond offsets.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', '..', 'dist', 'index.js');

const [objective, name] = process.argv.slice(2);
if (!objective || !name) {
    console.error('usage: node scripts/record-demo.mjs "<objective>" <output-name>');
    process.exit(1);
}

const command = `browserbash run "${objective}" --agent --headless`;
const start = Date.now();
const events = [];

const child = spawn('node', [cli, 'run', objective, '--agent', '--headless', '--timeout', '180'], {
    stdio: ['ignore', 'pipe', 'inherit'],
});

let buf = '';
child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) events.push({ t: Date.now() - start, line });
    }
});

child.on('close', (code) => {
    const out = join(here, '..', 'public', 'demos', `${name}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ objective, command, recordedAt: new Date().toISOString(), events }, null, 2));
    console.log(`wrote ${out} (${events.length} events, exit ${code})`);
    process.exit(0);
});
