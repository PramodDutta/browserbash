import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ProviderCredentials {
    username?: string;
    accessKey?: string;
    [key: string]: string | undefined;
}

export interface BrowserBashConfig {
    defaultProvider: string;
    engine: 'stagehand' | 'builtin';
    model: string;
    headless: boolean;
    maxSteps: number;
    timeoutSec: number;
    credentials: Record<string, ProviderCredentials>;
}

const DEFAULTS: BrowserBashConfig = {
    defaultProvider: 'local',
    engine: 'stagehand',
    model: 'auto',
    headless: false,
    maxSteps: 30,
    timeoutSec: 300,
    credentials: {},
};

export function configDir(): string {
    return process.env.BROWSERBASH_HOME ?? path.join(os.homedir(), '.browserbash');
}

export function configPath(): string {
    return path.join(configDir(), 'config.json');
}

export function projectDir(): string {
    return path.join(process.cwd(), '.browserbash');
}

export function loadConfig(): BrowserBashConfig {
    const file = configPath();
    if (!fs.existsSync(file)) {
        return { ...DEFAULTS };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<BrowserBashConfig>;
        return { ...DEFAULTS, ...raw, credentials: { ...raw.credentials } };
    } catch {
        return { ...DEFAULTS };
    }
}

export function saveConfig(config: BrowserBashConfig): void {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 4) + '\n', 'utf-8');
}

/** Resolve credentials for a provider: env vars win over stored config. */
export function resolveCredentials(provider: string, config: BrowserBashConfig): ProviderCredentials {
    const stored = config.credentials[provider] ?? {};
    const envMap: Record<string, ProviderCredentials> = {
        lambdatest: {
            username: process.env.LT_USERNAME,
            accessKey: process.env.LT_ACCESS_KEY,
        },
        browserstack: {
            username: process.env.BROWSERSTACK_USERNAME,
            accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
        },
    };
    const fromEnv = envMap[provider] ?? {};
    return {
        ...stored,
        ...(fromEnv.username ? { username: fromEnv.username } : {}),
        ...(fromEnv.accessKey ? { accessKey: fromEnv.accessKey } : {}),
    };
}
