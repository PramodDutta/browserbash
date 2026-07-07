import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './config.js';

/**
 * USD per **million** tokens. Estimates for cost visibility, not billing:
 * providers change prices, and gateway/OpenRouter routes differ. Users can
 * override or extend via ~/.browserbash/pricing.json ({"model-prefix":
 * {"in": 3, "out": 15}}). Longest matching prefix wins. Unknown models
 * produce NO estimate (undefined) rather than a wrong one.
 */
const DEFAULT_PRICES: Record<string, { in: number; out: number }> = {
    'claude-opus-4': { in: 5, out: 25 },
    'claude-sonnet': { in: 3, out: 15 },
    'claude-haiku': { in: 1, out: 5 },
    'openai/gpt-4.1': { in: 2, out: 8 },
    'google/gemini-2.5-flash': { in: 0.3, out: 2.5 },
    // Local models are free by definition.
    'ollama/': { in: 0, out: 0 },
};

export function pricingPath(): string {
    return path.join(configDir(), 'pricing.json');
}

function loadPrices(): Record<string, { in: number; out: number }> {
    try {
        const raw = JSON.parse(fs.readFileSync(pricingPath(), 'utf-8')) as Record<string, { in: number; out: number }>;
        return { ...DEFAULT_PRICES, ...raw };
    } catch {
        return DEFAULT_PRICES;
    }
}

/**
 * Estimated cost in USD for a run, or undefined when the model has no known
 * price. Rounded to 6 decimals (a cheap Haiku step is fractions of a cent).
 */
export function estimateCostUsd(
    model: string,
    tokensIn: number,
    tokensOut: number,
    prices: Record<string, { in: number; out: number }> = loadPrices(),
): number | undefined {
    let best: { prefix: string; price: { in: number; out: number } } | undefined;
    for (const [prefix, price] of Object.entries(prices)) {
        if (model.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
            best = { prefix, price };
        }
    }
    if (!best) return undefined;
    const usd = (tokensIn * best.price.in + tokensOut * best.price.out) / 1_000_000;
    return Math.round(usd * 1e6) / 1e6;
}
