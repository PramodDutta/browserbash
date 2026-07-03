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
    /** Dashboard sync (browserbash connect) — absent means never phone home. */
    apiKey?: string;
    apiBase?: string;
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

/**
 * Merge a stored partial config over defaults, one level deep. A partial
 * nested section on disk (e.g. a hand-edited `cache` with only one key)
 * must not clobber the other keys of that section's defaults.
 */
export function mergeConfig<T extends object>(defaults: T, raw: Partial<T>): T {
    const merged = { ...(defaults as Record<string, unknown>) };
    for (const [key, value] of Object.entries(raw)) {
        if (value === undefined) continue;
        const base = (defaults as unknown as Record<string, unknown>)[key];
        if (
            base !== null && typeof base === 'object' && !Array.isArray(base) &&
            value !== null && typeof value === 'object' && !Array.isArray(value)
        ) {
            merged[key] = { ...(base as Record<string, unknown>), ...(value as Record<string, unknown>) };
        } else {
            merged[key] = value;
        }
    }
    return merged as T;
}

export function loadConfig(): BrowserBashConfig {
    const file = configPath();
    if (!fs.existsSync(file)) {
        return { ...DEFAULTS };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<BrowserBashConfig>;
        return mergeConfig(DEFAULTS, raw);
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
