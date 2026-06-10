#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { configDir, configPath, loadConfig, projectDir, saveConfig } from './config.js';
import { listProviders } from './providers/index.js';
import { executeRun } from './runner.js';
import { runTestMd } from './testmd/runner.js';
import { EXIT_CODES, type RunStatus } from './types.js';
import { loadVariables } from './variables.js';

const program = new Command();

program
    .name('browserbash')
    .description('Vendor-independent natural-language browser automation CLI')
    .version('0.1.0');

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
}

function addRunFlags(cmd: Command): Command {
    return cmd
        .option('-p, --provider <id>', 'browser provider: local | cdp | browserbase | lambdatest | browserstack')
        .option('-e, --engine <id>', 'automation engine: stagehand (default, OSS) | builtin')
        .option('--agent', 'emit NDJSON events on stdout (for AI agents / CI)', false)
        .option('--headless', 'run without a visible browser window', false)
        .option('--max-steps <n>', 'cap agent steps', '30')
        .option('--timeout <s>', 'hard timeout in seconds', '300')
        .option('--variables <json>', 'inline variables JSON for {{key}} substitution')
        .option('--variables-file <path>', 'variables JSON file')
        .option('--cdp-endpoint <url>', 'CDP endpoint (implies/required by --provider cdp)')
        .option('--url <url>', 'start URL to open before the agent begins')
        .option('--model <id>', 'Anthropic model id override');
}

function exitWith(status: RunStatus): never {
    process.exit(EXIT_CODES[status]);
}

async function handleRunError(err: unknown, agentMode: boolean): Promise<never> {
    const message = (err as Error).message ?? String(err);
    if (agentMode) {
        process.stdout.write(JSON.stringify({ type: 'run_end', status: 'error', summary: message, final_state: {}, duration_ms: 0, steps_executed: 0 }) + '\n');
    } else {
        process.stderr.write(`Error: ${message}\n`);
    }
    exitWith('error');
}

addRunFlags(
    program
        .command('run <objective>')
        .description('Run a one-shot plain-English objective in a real browser')
        .option('--name <name>', 'run name shown on vendor dashboards / saved test recording'),
).action(async (objective: string, flags: CommonFlags) => {
    const config = loadConfig();
    try {
        const result = await executeRun({
            objective,
            provider: flags.cdpEndpoint ? 'cdp' : flags.provider ?? config.defaultProvider,
            engine: flags.engine,
            agent: flags.agent ?? false,
            headless: flags.headless ?? config.headless,
            maxSteps: Number(flags.maxSteps ?? config.maxSteps),
            timeoutSec: Number(flags.timeout ?? config.timeoutSec),
            variables: loadVariables(flags.variables, flags.variablesFile),
            cdpEndpoint: flags.cdpEndpoint,
            startUrl: flags.url,
            model: flags.model,
            name: flags.name,
        });
        exitWith(result.status);
    } catch (err) {
        await handleRunError(err, flags.agent ?? false);
    }
});

const testmd = program.command('testmd').description('Run committable *_test.md test files');
addRunFlags(
    testmd
        .command('run <path>')
        .description('Run a *_test.md file (plain-English steps, @import composition)'),
).action(async (file: string, flags: CommonFlags) => {
    const config = loadConfig();
    try {
        const result = await runTestMd(file, {
            provider: flags.cdpEndpoint ? 'cdp' : flags.provider ?? config.defaultProvider,
            engine: flags.engine,
            agent: flags.agent ?? false,
            headless: flags.headless ?? config.headless,
            maxSteps: Number(flags.maxSteps ?? config.maxSteps),
            timeoutSec: Number(flags.timeout ?? config.timeoutSec),
            variables: loadVariables(flags.variables, flags.variablesFile),
            cdpEndpoint: flags.cdpEndpoint,
            startUrl: flags.url,
            model: flags.model,
        });
        exitWith(result.status);
    } catch (err) {
        await handleRunError(err, flags.agent ?? false);
    }
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
            credentials: Object.fromEntries(
                Object.entries(config.credentials).map(([k, v]) => [k, { ...v, accessKey: v.accessKey ? '*****' : undefined }]),
            ),
        };
        process.stdout.write(JSON.stringify(redacted, null, 4) + '\n');
    });
configCmd
    .command('set <key> <value>')
    .description('Set defaultProvider | engine | model | headless | maxSteps | timeoutSec')
    .action((key: string, value: string) => {
        const config = loadConfig();
        switch (key) {
            case 'defaultProvider': config.defaultProvider = value; break;
            case 'engine':
                if (value !== 'stagehand' && value !== 'builtin') {
                    process.stderr.write('engine must be stagehand or builtin\n');
                    process.exit(2);
                }
                config.engine = value;
                break;
            case 'model': config.model = value; break;
            case 'headless': config.headless = value === 'true'; break;
            case 'maxSteps': config.maxSteps = Number(value); break;
            case 'timeoutSec': config.timeoutSec = Number(value); break;
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
        process.stdout.write(`Initialized ${dir}\nGlobal config lives in ${configDir()}\n`);
    });

program.parseAsync(process.argv).catch((err: Error) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(2);
});
