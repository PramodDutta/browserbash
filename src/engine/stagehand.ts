import { Stagehand } from '@browserbasehq/stagehand';
import type { Reporter } from '../output.js';
import type { RunResult, VariableValue } from '../types.js';
import { substitute } from '../variables.js';

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
}

/** Providers the Stagehand engine can drive directly. */
export const STAGEHAND_PROVIDERS = ['local', 'cdp', 'browserbase'] as const;

export function stagehandSupports(provider: string): boolean {
    return (STAGEHAND_PROVIDERS as readonly string[]).includes(provider);
}

type StagehandModelConfig = string | { modelName: string; apiKey?: string; baseURL?: string };

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
        return {
            modelName: `openai/${model.slice('openrouter/'.length)}`,
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
    const objective = substitute(options.objective, options.variables);

    const stagehand = new Stagehand({
        env: options.provider === 'browserbase' ? 'BROWSERBASE' : 'LOCAL',
        model: toStagehandModel(options.model),
        verbose: 0,
        disablePino: true,
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

    try {
        const instruction = [
            options.startUrl ? `Start by navigating to ${options.startUrl}.` : '',
            objective,
            'If the objective asks to store or extract values, end your final message with a JSON object mapping each requested name to its value.',
        ].filter(Boolean).join('\n');

        const agent = stagehand.agent();
        const timeoutMs = options.timeoutSec * 1000;

        const result = await Promise.race([
            agent.execute({ instruction, maxSteps: options.maxSteps }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('__timeout__')), timeoutMs),
            ),
        ]);

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

        return {
            status: result.success ? 'passed' : 'failed',
            summary: result.message,
            finalState: extractFinalState(result.message),
            stepsExecuted: result.actions.length,
            durationMs: Date.now() - start,
        };
    } catch (err) {
        if ((err as Error).message === '__timeout__') {
            return {
                status: 'timeout',
                summary: `Timed out after ${options.timeoutSec}s`,
                finalState: {},
                stepsExecuted: 0,
                durationMs: Date.now() - start,
            };
        }
        throw err;
    } finally {
        await stagehand.close().catch(() => undefined);
    }
}

/** Pull the trailing JSON object (store-as values) out of the agent's final message. */
function extractFinalState(message: string): Record<string, string> {
    const match = message.match(/\{[\s\S]*\}(?=[^{}]*$)/);
    if (!match) return {};
    try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([, v]) => typeof v !== 'object')
                .map(([k, v]) => [k, String(v)]),
        );
    } catch {
        return {};
    }
}
