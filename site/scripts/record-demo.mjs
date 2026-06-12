#!/usr/bin/env node
/**
 * Records a real browserbash run as a replayable demo.
 * Usage:
 *   node scripts/record-demo.mjs <output-name> "<display command>" -- <cli args...>
 * Example:
 *   node scripts/record-demo.mjs hn 'browserbash run "..." --agent --headless' -- \
 *     run "Open https://news.ycombinator.com ..." --agent --headless --timeout 180
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

const sep = process.argv.indexOf('--');
const [name, displayCommand] = process.argv.slice(2, sep);
const cliArgs = process.argv.slice(sep + 1);
if (!name || !displayCommand || cliArgs.length === 0) {
    console.error('usage: node scripts/record-demo.mjs <name> "<display command>" -- <cli args...>');
    process.exit(1);
}

const objective = cliArgs.find((a, i) => i > 0 && !a.startsWith('-') && cliArgs[i - 1] !== '--model' && cliArgs[i - 1] !== '--variables' && cliArgs[i - 1] !== '--timeout') ?? '';
const start = Date.now();
const events = [];

const child = spawn('node', [cli, ...cliArgs], { stdio: ['ignore', 'pipe', 'inherit'] });

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
    writeFileSync(out, JSON.stringify({ objective, command: displayCommand, recordedAt: new Date().toISOString(), events }, null, 2));
    console.log(`wrote ${out} (${events.length} events, exit ${code})`);
    process.exit(0);
});
