import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Stagehand } from '@browserbasehq/stagehand';
import type { Reporter } from '../output.js';
import type { CacheVerdict, RunArtifacts, RunCacheOptions, RunResult, VariableValue } from '../types.js';
import { substitute } from '../variables.js';
import { startScreencast, type CdpSession, type ScreencastRecorder } from './screencast.js';

export interface StagehandRunOptions {
    objective: string;
    provider: string;
    headless: boolean;
    reporter: Reporter;
    maxSteps: number;
    timeoutSec: number;
    variables: Record<string, VariableValue>;
    model: string;
    cdpEndpoint?: string;
    startUrl?: string;
    record?: boolean;
    name?: string;
    cache?: RunCacheOptions;
}

/**
 * Rewrite BrowserBash {{name}} placeholders to Stagehand's %name% syntax so
 * the objective can be passed with a variables map instead of substituted
 * values. Keeps secret values out of cache keys and cache files, and lets
 * one cache entry serve every variable value.
 */
export function toStagehandPlaceholders(text: string): string {
    return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, '%$1%');
}

/**
 * Per-test cache directory name: readable slug from the test name plus a
 * short hash of the TEMPLATED objective (pre-substitution, so secrets never
 * influence the key and edits to the test invalidate it).
 */
export function cacheSlug(name: string | undefined, templatedObjective: string): string {
    const base = (name ?? 'run')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'run';
    const hash = createHash('sha256').update(templatedObjective).digest('hex').slice(0, 8);
    return `${base}-${hash}`;
}

/** Providers the Stagehand engine can drive directly. */
export const STAGEHAND_PROVIDERS = ['local', 'cdp', 'browserbase'] as const;

export function stagehandSupports(provider: string): boolean {
    return (STAGEHAND_PROVIDERS as readonly string[]).includes(provider);
}

type StagehandModelConfig =
    | string
    | { modelName: string; apiKey?: string; baseURL?: string; reasoningEffort?: string };

/**
 * Map model ids to Stagehand's model configuration.
 *
 * Open-source / local path: `ollama/<model>` routes through Ollama's
 * OpenAI-compatible endpoint (default http://localhost:11434/v1, override
 * with OLLAMA_BASE_URL). Works the same for any OpenAI-compatible server
 * (vLLM, LM Studio, llama.cpp) — point OLLAMA_BASE_URL at it.
 *
 * Hosted multi-model path: `openrouter/<vendor>/<model>` routes through
 * OpenRouter's OpenAI-compatible endpoint. Needs OPENROUTER_API_KEY.
 */
export function toStagehandModel(model: string): StagehandModelConfig {
    if (model.startsWith('ollama/')) {
        return {
            modelName: `openai/${model.slice('ollama/'.length)}`,
            baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
            apiKey: process.env.OLLAMA_API_KEY ?? 'ollama',
            // Thinking models (qwen3.5 etc.) burn Stagehand's whole per-action
            // budget on chain-of-thought before emitting an action, so every
            // click/type times out. Ollama honors reasoning_effort on its
            // OpenAI-compatible endpoint and non-thinking models ignore it.
            reasoningEffort: process.env.OLLAMA_REASONING_EFFORT ?? 'none',
        };
    }
    if (model.startsWith('openrouter/')) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error(
                `Model '${model}' needs OPENROUTER_API_KEY. Get one at https://openrouter.ai/keys, ` +
                'then: export OPENROUTER_API_KEY=sk-or-...',
            );
        }
        // The 'groq' AI-SDK provider is a plain OpenAI-compatible chat-completions
        // client honoring baseURL — unlike 'openai/...', which routes to the
        // Responses API that OpenRouter's beta endpoint rejects for most models.
        return {
            modelName: `groq/${model.slice('openrouter/'.length)}`,
            baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
            apiKey,
        };
    }
    if (model.includes('/')) return model;
    if (model.startsWith('claude')) return `anthropic/${model}`;
    if (model.startsWith('gpt') || model.startsWith('o')) return `openai/${model}`;
    if (model.startsWith('gemini')) return `google/${model}`;
    return model;
}

/**
 * Default engine: Stagehand (https://www.stagehand.dev) — open-source (MIT)
 * AI browser automation by Browserbase. Runs the objective via its
 * autonomous agent; step events are replayed from the action trace.
 */
export async function runStagehandAgent(options: StagehandRunOptions): Promise<RunResult> {
    const start = Date.now();

    // Local OpenAI-compatible models (Ollama, OpenRouter) need two deviations
    // from Stagehand defaults, both applied together: the dom agent mode (the
    // hybrid default routes openai/* ids to the CUA client on the Responses
    // API), and excludeTools for screenshot (experimental, hence the
    // experimental/disableAPI constructor flags).
    const isOpenAiCompat =
        options.model.startsWith('ollama/') || options.model.startsWith('openrouter/');

    // Cache gate. Stagehand's variables passthrough (the thing that keeps
    // secret values out of cache keys and files) is not supported on the CUA
    // agent used for hosted models, so a hosted-model run WITH variables must
    // not cache: its instruction would carry substituted secrets to disk.
    const hasVariables = Object.keys(options.variables).length > 0;
    const cacheUsable = (options.cache?.enabled ?? false) && (isOpenAiCompat || !hasVariables);
    if (options.cache?.enabled && !cacheUsable) {
        options.reporter.info('Cache off for this run: hosted-model agents cannot take variables without writing substituted values into the cache.');
    }
    const passVariables = cacheUsable && hasVariables;
    const objective = passVariables
        ? toStagehandPlaceholders(options.objective)
        : substitute(options.objective, options.variables);

    const cacheDir = cacheUsable
        ? resolve(options.cache!.dir, 'stagehand', cacheSlug(options.name, options.objective))
        : undefined;
    if (cacheDir && options.cache!.refresh) {
        rmSync(cacheDir, { recursive: true, force: true });
        options.reporter.info('Cache entry wiped (--refresh-cache)');
    }

    const stagehand = new Stagehand({
        env: options.provider === 'browserbase' ? 'BROWSERBASE' : 'LOCAL',
        model: toStagehandModel(options.model),
        verbose: 0,
        disablePino: true,
        ...(cacheDir ? { cacheDir } : {}),
        ...(isOpenAiCompat ? { experimental: true, disableAPI: true } : {}),
        ...(options.provider === 'browserbase'
            ? {
                  apiKey: process.env.BROWSERBASE_API_KEY,
                  projectId: process.env.BROWSERBASE_PROJECT_ID,
              }
            : {
                  localBrowserLaunchOptions: {
                      headless: options.headless,
                      ...(options.provider === 'cdp' && options.cdpEndpoint
                          ? { cdpUrl: options.cdpEndpoint }
                          : {}),
                  },
              }),
    });

    if (options.provider === 'browserbase' && !process.env.BROWSERBASE_API_KEY) {
        throw new Error('browserbase provider requires BROWSERBASE_API_KEY (and BROWSERBASE_PROJECT_ID)');
    }
    if (options.provider === 'cdp' && !options.cdpEndpoint) {
        throw new Error('cdp provider requires --cdp-endpoint <url>');
    }

    await stagehand.init();
    options.reporter.info('Engine: stagehand (MIT, stagehand.dev)');

    const artifacts: RunArtifacts = {};
    const artifactDir = options.record ? mkdtempSync(join(tmpdir(), 'bb-rec-')) : '';

    // Tap Stagehand's own CDP session for a session video (best-effort — a
    // missing ffmpeg or capture hiccup just means no video, never a failed run).
    let recorder: ScreencastRecorder | undefined;
    if (options.record) {
        try {
            const active = (stagehand.context as unknown as {
                activePage(): { mainSession?: CdpSession } | undefined;
            }).activePage();
            if (active?.mainSession) {
                recorder = await startScreencast(active.mainSession, artifactDir);
                options.reporter.info('Recording session video (--record)');
            }
        } catch {
            // no video; the final screenshot below still works
        }
    }

    async function capture(): Promise<void> {
        if (!options.record) return;
        // Stop + encode the video first, while the browser is still open.
        if (recorder) {
            const rec = recorder;
            recorder = undefined;
            try {
                const video = await rec.stop();
                if (video) {
                    artifacts.video = video;
                    options.reporter.info('Captured session video (--record)');
                }
            } catch {
                // video is best-effort
            }
        }
        try {
            const path = join(artifactDir, 'screenshot.png');
            const page = (stagehand.context as unknown as {
                activePage(): { screenshot(o: { path: string }): Promise<unknown> } | undefined;
                pages(): Array<{ screenshot(o: { path: string }): Promise<unknown> }>;
            });
            const target = page.activePage() ?? page.pages()[0];
            if (!target) throw new Error('no page');
            await target.screenshot({ path });
            artifacts.screenshot = path;
            options.reporter.info('Captured final screenshot (--record)');
        } catch {
            options.reporter.info('Screenshot capture skipped (page unavailable)');
        }
    }

    try {
        const instruction = [
            options.startUrl ? `Start by navigating to ${options.startUrl}.` : '',
            objective,
            'If the objective asks to store or extract values, end your final message with a JSON object mapping each requested name to its value.',
        ].filter(Boolean).join('\n');

        const agent = isOpenAiCompat ? stagehand.agent({ mode: 'dom' }) : stagehand.agent();
        const timeoutMs = options.timeoutSec * 1000;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const result = await Promise.race([
            agent.execute({
                instruction,
                maxSteps: options.maxSteps,
                // The dom toolset still includes screenshot, whose tool result is
                // an image part. Text-only local models reject that with a 400
                // (Ollama: "model does not support multimodal requests"), killing
                // the run whenever the model happens to call it.
                ...(isOpenAiCompat ? { excludeTools: ['screenshot'] } : {}),
                // Values arrive via the variables channel, never inlined into
                // the instruction, so the cache and any logs stay secret-free.
                ...(passVariables
                    ? {
                          variables: Object.fromEntries(
                              Object.entries(options.variables).map(([k, v]) => [k, v.value]),
                          ),
                      }
                    : {}),
            }),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error('__timeout__')), timeoutMs);
            }),
        ]).finally(() => {
            if (timeout) clearTimeout(timeout);
        });

        // Replay detection: a cache hit executes recorded steps without the
        // model, so usage is absent or zero while actions still happened.
        const usage = (result as { usage?: { input_tokens?: number } }).usage;
        const cacheVerdict: CacheVerdict = !cacheUsable
            ? 'off'
            : result.actions.length > 0 && (!usage || (usage.input_tokens ?? 0) === 0)
              ? 'hit'
              : 'miss';

        let step = 0;
        for (const action of result.actions) {
            step += 1;
            options.reporter.step({
                type: 'step',
                step,
                status: 'passed',
                action: action.type,
                remark: String(action.action ?? action.instruction ?? action.reasoning ?? '').slice(0, 200),
            });
        }

        await capture();
        return {
            status: result.success ? 'passed' : 'failed',
            summary: result.message,
            finalState: extractFinalState(result.message, objective),
            stepsExecuted: result.actions.length,
            durationMs: Date.now() - start,
            artifacts: options.record ? artifacts : undefined,
            cache: cacheVerdict,
        };
    } catch (err) {
        await capture();
        if ((err as Error).message === '__timeout__') {
            return {
                status: 'timeout',
                summary: `Timed out after ${options.timeoutSec}s`,
                finalState: {},
                stepsExecuted: 0,
                durationMs: Date.now() - start,
                artifacts: options.record ? artifacts : undefined,
                cache: cacheUsable ? 'miss' : 'off',
            };
        }
        throw err;
    } finally {
        await stagehand.close().catch(() => undefined);
    }
}

/** Pull the trailing JSON object (store-as values) out of the agent's final message. */
export function extractFinalState(message: string, objective = ''): Record<string, string> {
    const match = message.match(/\{[\s\S]*\}(?=[^{}]*$)/);
    if (match) {
        try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        const state = Object.fromEntries(
            Object.entries(parsed)
                .filter(([, v]) => typeof v !== 'object')
                .map(([k, v]) => [k, String(v)])
                .filter(([, v]) => !isPlaceholder(v)),
        );
        if (Object.keys(state).length > 0) return state;
        } catch {
            // Fall through to summary-based extraction below.
        }
    }
    return extractStoredValuesFromSummary(message, objective);
}

function extractStoredValuesFromSummary(message: string, objective: string): Record<string, string> {
    const keys = Array.from(objective.matchAll(/\bas\s+['"]([^'"]+)['"]/gi), (m) => m[1]);
    const state: Record<string, string> = {};

    for (const key of keys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const beforeStored = new RegExp(`\\(([^()]{1,160})\\)[^.]{0,240}\\bstored\\b[^.]{0,120}\\bas\\s+['"]${escapedKey}['"]`, 'i');
        const afterStored = new RegExp(`\\bstored\\b[^.]{0,120}\\bas\\s+['"]${escapedKey}['"][^.]{0,240}\\(([^()]{1,160})\\)`, 'i');
        const beforeKeyMention = new RegExp(`\\(([^()]{1,160})\\)[\\s\\S]{0,320}['"]${escapedKey}['"]`, 'i');
        const explicitAssignment = new RegExp(`['"]?${escapedKey}['"]?\\s*[:=]\\s*['"]([^'"]{1,240})['"]`, 'i');

        const value = message.match(beforeStored)?.[1]
            ?? message.match(afterStored)?.[1]
            ?? message.match(beforeKeyMention)?.[1]
            ?? message.match(explicitAssignment)?.[1];
        if (value && !isPlaceholder(value)) {
            state[key] = value.trim();
        }
    }

    return state;
}

function isPlaceholder(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === '...' || normalized === 'the title text' || normalized === 'value';
}
