#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { configDir, configPath, loadConfig, projectDir, saveConfig, type BrowserBashConfig } from './config.js';
import { getProvider, listProviders } from './providers/index.js';
import { executeRun } from './runner.js';
import { runTestMd } from './testmd/runner.js';
import { runAll } from './orchestrator/run-all.js';
import { clearRuns, runsDir } from './local-store.js';
import { startDashboard, openBrowser } from './dashboard/server.js';

const CLI_ENTRY = fileURLToPath(import.meta.url);
import { EXIT_CODES, type EngineId, type RunCacheOptions, type RunStatus, type VariableValue } from './types.js';
import { loadVariables, maskSecrets } from './variables.js';

// Downstream consumers (grep -q, head, jq) may close the pipe early.
// That must end the process quietly, not crash with an EPIPE stack.
for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') process.exit(0);
        throw err;
    });
}

const program = new Command();

program
    .name('browserbash')
    .description('Vendor-independent natural-language browser automation CLI')
    .version('1.3.1');

interface CommonFlags {
    provider?: string;
    engine?: 'stagehand' | 'builtin';
    agent?: boolean;
    headless?: boolean;
    maxSteps?: string;
    timeout?: string;
    variables?: string;
    variablesFile?: string;
    cdpEndpoint?: string;
    url?: string;
    model?: string;
    name?: string;
    record?: boolean;
    upload?: boolean;
    dashboard?: boolean;
    port?: string;
    /** commander --no-cache: defaults true, false when the flag is passed. */
    cache?: boolean;
    refreshCache?: boolean;
}

/** Effective cache options for a run: config defaults, overridden by flags. */
function cacheOptionsFrom(flags: CommonFlags, config: BrowserBashConfig): RunCacheOptions {
    return {
        enabled: flags.cache !== false && config.cache.enabled,
        refresh: flags.refreshCache ?? false,
        dir: config.cache.dir,
    };
}

function addRunFlags(cmd: Command): Command {
    return cmd
        .option('-p, --provider <id>', 'browser provider: local | cdp | browserbase | lambdatest | browserstack')
        .option('-e, --engine <id>', 'automation engine: stagehand (default, OSS) | builtin')
        .option('--agent', 'emit NDJSON events on stdout (for AI agents / CI)')
        .option('--headless', 'run without a visible browser window')
        .option('--max-steps <n>', 'cap agent steps')
        .option('--timeout <s>', 'hard timeout in seconds')
        .option('--variables <json>', 'inline variables JSON for {{key}} substitution')
        .option('--variables-file <path>', 'variables JSON file')
        .option('--cdp-endpoint <url>', 'CDP endpoint (implies/required by --provider cdp)')
        .option('--url <url>', 'start URL to open before the agent begins')
        .option('--model <id>', 'Anthropic model id override')
        .option('--record', 'capture a session recording (screenshot + video on any engine; trace adds on builtin; needs ffmpeg)')
        .option('--upload', 'push this run to your cloud dashboard (needs: browserbash connect)')
        .option('--dashboard', 'open the local web dashboard when the run finishes')
        .option('--port <n>', 'port for the local dashboard (with --dashboard)', '4477')
        .option('--no-cache', 'disable the replay-first action cache for this run')
        .option('--refresh-cache', 'wipe this test\'s cache entry before running');
}

function exitWith(status: RunStatus): never {
    process.exit(EXIT_CODES[status]);
}

/** Serve the local dashboard and block until Ctrl-C, then exit with the run's
 * verdict code. Used by `run --dashboard` / `testmd run --dashboard`. */
async function serveDashboardThenExit(port: number, exitStatus: RunStatus): Promise<never> {
    const handle = await startDashboard(port);
    process.stdout.write(`\nLocal dashboard: ${handle.url}  (Ctrl-C to stop)\n`);
    openBrowser(handle.url);
    // SIGTERM too: a parent process (CI runner, suite orchestrator) stops
    // children with SIGTERM, and the run's verdict code must survive that.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            void handle.close().then(() => process.exit(EXIT_CODES[exitStatus]));
        });
    }
    return new Promise<never>(() => {}); // keep the process alive
}

function parsePositiveInteger(value: number | string | undefined, name: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
}

function parseBooleanConfig(value: string, name: string): boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} must be true or false`);
}

function parseEngine(value: string | undefined): EngineId | undefined {
    if (value === undefined) return undefined;
    if (value === 'stagehand' || value === 'builtin') return value;
    throw new Error('engine must be stagehand or builtin');
}

function resolveProvider(flags: CommonFlags, defaultProvider: string): string {
    const provider = flags.cdpEndpoint ? 'cdp' : flags.provider ?? defaultProvider;
    getProvider(provider);
    return provider;
}

async function handleRunError(
    err: unknown,
    agentMode: boolean,
    variables: Record<string, VariableValue> = {},
    provider?: string,
): Promise<never> {
    const message = maskSecrets((err as Error).message ?? String(err), variables);
    if (agentMode) {
        // Keep the error-path run_end shape aligned with the normal one:
        // NDJSON consumers should not need a special case for the provider field.
        process.stdout.write(JSON.stringify({ type: 'run_end', status: 'error', summary: message, final_state: {}, duration_ms: 0, steps_executed: 0, provider: provider ?? 'unknown' }) + '\n');
    } else {
        process.stderr.write(`Error: ${message}\n`);
    }
    exitWith('error');
}

/** Best-effort provider name for error reporting, never throws. */
function providerForError(flags: CommonFlags, defaultProvider: string): string {
    return flags.cdpEndpoint ? 'cdp' : flags.provider ?? defaultProvider;
}

addRunFlags(
    program
        .command('run <objective>')
        .description('Run a one-shot plain-English objective in a real browser')
        .option('--name <name>', 'run name shown on vendor dashboards / saved test recording'),
).action(async (objective: string, flags: CommonFlags) => {
    const config = loadConfig();
    let variables: Record<string, VariableValue> = {};
    try {
        variables = loadVariables(flags.variables, flags.variablesFile);
        const result = await executeRun({
            objective,
            provider: resolveProvider(flags, config.defaultProvider),
            engine: parseEngine(flags.engine ?? config.engine),
            agent: flags.agent ?? false,
            headless: flags.headless ?? config.headless,
            maxSteps: parsePositiveInteger(flags.maxSteps ?? config.maxSteps, 'max-steps'),
            timeoutSec: parsePositiveInteger(flags.timeout ?? config.timeoutSec, 'timeout'),
            variables,
            cdpEndpoint: flags.cdpEndpoint,
            startUrl: flags.url,
            model: flags.model,
            record: flags.record ?? false,
            name: flags.name,
            upload: flags.upload ?? false,
            dashboard: flags.dashboard ?? false,
            cache: cacheOptionsFrom(flags, config),
        });
        if (flags.dashboard) {
            await serveDashboardThenExit(parsePositiveInteger(flags.port ?? '4477', 'port'), result.status);
        }
        exitWith(result.status);
    } catch (err) {
        await handleRunError(err, flags.agent ?? false, variables, providerForError(flags, config.defaultProvider));
    }
});

const testmd = program.command('testmd').description('Run committable *_test.md test files');
addRunFlags(
    testmd
        .command('run <path>')
        .description('Run a *_test.md file (plain-English steps, @import composition)')
        .option('--result-path <file>', 'write Result.md to this path instead of next to the test file'),
).action(async (file: string, flags: CommonFlags & { resultPath?: string }) => {
    const config = loadConfig();
    let variables: Record<string, VariableValue> = {};
    try {
        variables = loadVariables(flags.variables, flags.variablesFile);
        const result = await runTestMd(file, {
            resultPath: flags.resultPath,
            provider: resolveProvider(flags, config.defaultProvider),
            engine: parseEngine(flags.engine ?? config.engine),
            agent: flags.agent ?? false,
            headless: flags.headless ?? config.headless,
            maxSteps: parsePositiveInteger(flags.maxSteps ?? config.maxSteps, 'max-steps'),
            timeoutSec: parsePositiveInteger(flags.timeout ?? config.timeoutSec, 'timeout'),
            variables,
            cdpEndpoint: flags.cdpEndpoint,
            startUrl: flags.url,
            model: flags.model,
            record: flags.record ?? false,
            upload: flags.upload ?? false,
            dashboard: flags.dashboard ?? false,
            cache: cacheOptionsFrom(flags, config),
        });
        if (flags.dashboard) {
            await serveDashboardThenExit(parsePositiveInteger(flags.port ?? '4477', 'port'), result.status);
        }
        exitWith(result.status);
    } catch (err) {
        await handleRunError(err, flags.agent ?? false, variables, providerForError(flags, config.defaultProvider));
    }
});

program
    .command('run-all [target]')
    .description('Run a folder of *_test.md files in parallel with memory-aware scheduling')
    .option('-c, --concurrency <n>', 'max parallel runs (default: auto from CPU + memory)')
    .option('--memory-budget <mb>', 'estimated memory per run for the concurrency formula', '700')
    .option('--retries <n>', 'retry a test this many times on infra errors only', '1')
    .option('--max-failures <n>', 'stop launching new tests after N failures (0 = run all)', '0')
    .option('--stagger <ms>', 'delay between launches to soften burst load', '250')
    .option('--junit <path>', 'write a JUnit XML report')
    .option('--events <path>', 'write the merged NDJSON event stream', 'browserbash-events.ndjson')
    .option('--agent', 'also stream merged NDJSON on stdout')
    .option('-p, --provider <id>', 'browser provider for every test')
    .option('-e, --engine <id>', 'engine for every test')
    .option('--model <id>', 'model for every test')
    .option('--timeout <s>', 'per-test timeout in seconds')
    .option('--variables <json>', 'inline variables JSON for every test')
    .option('--variables-file <path>', 'variables JSON file for every test')
    .option('--no-cache', 'disable the replay cache for every test')
    .option('--no-memory', 'do not read or write run history for ordering')
    .action(async (target: string | undefined, flags: Record<string, string | boolean | undefined>) => {
        const config = loadConfig();
        // Spawn hygiene: children inherit ONLY safe flags. Never --dashboard
        // (it parks the child forever) and never secrets on argv.
        const childFlags: string[] = [];
        if (flags.provider) childFlags.push('--provider', String(flags.provider));
        if (flags.engine) childFlags.push('--engine', String(flags.engine));
        if (flags.model) childFlags.push('--model', String(flags.model));
        if (flags.timeout) childFlags.push('--timeout', String(flags.timeout));
        if (flags.cache === false) childFlags.push('--no-cache');

        let variablesJson: string | undefined;
        const variables = loadVariables(flags.variables as string | undefined, flags.variablesFile as string | undefined);
        if (Object.keys(variables).length > 0) {
            variablesJson = JSON.stringify(
                Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, v.secret ? { value: v.value, secret: true } : v.value])),
            );
        }

        const eventsDir = path.dirname(path.resolve(String(flags.events ?? 'browserbash-events.ndjson')));
        const result = await runAll({
            target: target ?? path.join(projectDir(), 'tests'),
            concurrency: flags.concurrency ? parsePositiveInteger(String(flags.concurrency), 'concurrency') : undefined,
            memoryBudgetMb: parsePositiveInteger(String(flags.memoryBudget ?? '700'), 'memory-budget'),
            retries: Number(flags.retries ?? '1'),
            maxFailures: Number(flags.maxFailures ?? '0'),
            junitPath: flags.junit ? String(flags.junit) : undefined,
            eventsPath: String(flags.events ?? 'browserbash-events.ndjson'),
            agent: flags.agent === true,
            staggerMs: Number(flags.stagger ?? '250'),
            childFlags,
            variablesJson,
            cliBin: CLI_ENTRY,
            resultsDir: path.join(eventsDir, 'browserbash-results'),
            memoryDir: flags.memory === false ? undefined : projectDir(),
            log: (msg) => { if (flags.agent !== true) process.stderr.write(msg + '\n'); },
        });

        if (flags.agent !== true) {
            process.stderr.write(
                `\nSuite: ${result.passed} passed, ${result.failed} failed, ${result.timeout} timed out, ` +
                `${result.infra} infra errors, ${result.flaky} flaky in ${(result.durationMs / 1000).toFixed(1)}s\n`,
            );
        }
        process.exit(result.exitCode);
    });

program
    .command('dashboard')
    .description('Open a local web dashboard of your runs — free, no account, fully local')
    .option('--port <n>', 'port to serve on', '4477')
    .option('--no-open', 'do not open the browser automatically')
    .option('--clear', 'delete all locally stored runs and exit')
    .action(async (flags: { port?: string; open?: boolean; clear?: boolean }) => {
        if (flags.clear) {
            const n = clearRuns();
            process.stdout.write(`Cleared ${n} local run${n === 1 ? '' : 's'} from ${runsDir()}.\n`);
            return;
        }
        const port = parsePositiveInteger(flags.port ?? '4477', 'port');
        const handle = await startDashboard(port);
        process.stdout.write(`Local dashboard: ${handle.url}  (Ctrl-C to stop)\n`);
        if (flags.open !== false) openBrowser(handle.url);
        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.on(signal, () => {
                void handle.close().then(() => process.exit(0));
            });
        }
        await new Promise(() => {}); // keep the process alive
    });

program
    .command('login')
    .description('Store cloud provider credentials (non-interactive friendly for CI)')
    .requiredOption('-p, --provider <id>', 'lambdatest | browserstack')
    .requiredOption('--username <username>')
    .requiredOption('--access-key <key>')
    .action((flags: { provider: string; username: string; accessKey: string }) => {
        const config = loadConfig();
        config.credentials[flags.provider] = { username: flags.username, accessKey: flags.accessKey };
        saveConfig(config);
        process.stdout.write(`Stored ${flags.provider} credentials in ${configPath()}\n`);
    });

program
    .command('connect')
    .description('Link this CLI to your browserbash.com dashboard (runs sync after each execution)')
    .requiredOption('--key <key>', 'API key from https://browserbash.com/dashboard')
    .option('--api-base <url>', 'override dashboard URL (self-hosted)')
    .action((flags: { key: string; apiBase?: string }) => {
        if (!/^bb_[a-f0-9]{40}$/.test(flags.key)) {
            process.stderr.write('That does not look like a BrowserBash key (expected bb_<40 hex>). Generate one on your dashboard.\n');
            process.exit(2);
        }
        const config = loadConfig();
        config.apiKey = flags.key;
        if (flags.apiBase) config.apiBase = flags.apiBase;
        saveConfig(config);
        process.stdout.write(`Connected. Runs will appear on ${config.apiBase ?? 'https://browserbash.com'}/dashboard\n`);
    });

program
    .command('disconnect')
    .description('Stop syncing runs to the dashboard')
    .action(() => {
        const config = loadConfig();
        delete config.apiKey;
        delete config.apiBase;
        saveConfig(config);
        process.stdout.write('Disconnected — runs stay on this machine.\n');
    });

program
    .command('logout')
    .description('Remove stored credentials')
    .requiredOption('-p, --provider <id>')
    .action((flags: { provider: string }) => {
        const config = loadConfig();
        delete config.credentials[flags.provider];
        saveConfig(config);
        process.stdout.write(`Removed ${flags.provider} credentials\n`);
    });

program
    .command('whoami')
    .description('Show stored provider accounts')
    .action(() => {
        const config = loadConfig();
        const entries = Object.entries(config.credentials);
        if (entries.length === 0) {
            process.stdout.write('No stored credentials. Cloud providers also accept env vars (LT_*, BROWSERSTACK_*).\n');
            return;
        }
        for (const [provider, creds] of entries) {
            process.stdout.write(`${provider}: ${creds.username ?? '<no username>'}\n`);
        }
    });

program
    .command('providers')
    .description('List available browser providers')
    .action(() => {
        const config = loadConfig();
        for (const p of listProviders()) {
            const marker = p.id === config.defaultProvider ? ' (default)' : '';
            process.stdout.write(`${p.id}${marker} — ${p.description}\n`);
        }
    });

const configCmd = program.command('config').description('Show or change CLI configuration');
configCmd
    .command('show')
    .action(() => {
        const config = loadConfig();
        const redacted = {
            ...config,
            apiKey: config.apiKey ? '*****' : undefined,
            credentials: Object.fromEntries(
                Object.entries(config.credentials).map(([k, v]) => [k, { ...v, accessKey: v.accessKey ? '*****' : undefined }]),
            ),
        };
        process.stdout.write(JSON.stringify(redacted, null, 4) + '\n');
    });
configCmd
    .command('set <key> <value>')
    .description('Set defaultProvider | engine | model | headless | maxSteps | timeoutSec | cache.enabled | cache.dir')
    .action((key: string, value: string) => {
        const config = loadConfig();
        switch (key) {
            case 'defaultProvider':
                getProvider(value);
                config.defaultProvider = value;
                break;
            case 'engine':
                if (value !== 'stagehand' && value !== 'builtin') {
                    process.stderr.write('engine must be stagehand or builtin\n');
                    process.exit(2);
                }
                config.engine = value;
                break;
            case 'model': config.model = value; break;
            case 'headless': config.headless = parseBooleanConfig(value, 'headless'); break;
            case 'maxSteps': config.maxSteps = parsePositiveInteger(value, 'maxSteps'); break;
            case 'timeoutSec': config.timeoutSec = parsePositiveInteger(value, 'timeoutSec'); break;
            case 'cache.enabled': config.cache.enabled = parseBooleanConfig(value, 'cache.enabled'); break;
            case 'cache.dir': config.cache.dir = value; break;
            default:
                process.stderr.write(`Unknown config key: ${key}\n`);
                process.exit(2);
        }
        saveConfig(config);
        process.stdout.write(`Set ${key} = ${value}\n`);
    });

program
    .command('init')
    .description('Scaffold project-local .browserbash/ (variables, context) and an example test')
    .action(() => {
        const dir = projectDir();
        fs.mkdirSync(path.join(dir, 'variables'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
        const varsFile = path.join(dir, 'variables', 'default.json');
        if (!fs.existsSync(varsFile)) {
            fs.writeFileSync(varsFile, JSON.stringify({ base_url: 'https://example.com', password: { value: 'change-me', secret: true } }, null, 4) + '\n');
        }
        const exampleTest = path.join(dir, 'tests', 'smoke_test.md');
        if (!fs.existsSync(exampleTest)) {
            fs.writeFileSync(exampleTest, '# Smoke test\n\n- Open {{base_url}}\n- Verify the page title is visible\n- Store the page heading as \'heading\'\n');
        }
        // Keep machine-local, environment-specific, and secret-adjacent files
        // out of version control. The action cache is regenerated per machine
        // and is not signed, so it is local-only by default (committing it
        // safely needs the journal HMAC tracked for a later release).
        const ignoreFile = path.join(dir, '.gitignore');
        if (!fs.existsSync(ignoreFile)) {
            fs.writeFileSync(ignoreFile, 'cache/\nruns/\nResult.md\nvariables/*.local.json\n');
        }
        process.stdout.write(`Initialized ${dir}\nGlobal config lives in ${configDir()}\n`);
    });

program.parseAsync(process.argv).catch((err: Error) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(2);
});
