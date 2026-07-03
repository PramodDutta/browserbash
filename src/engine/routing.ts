import type Anthropic from '@anthropic-ai/sdk';

/**
 * Model-aware thinking config. The builtin loop used to hardcode
 * `thinking: { type: 'adaptive' }`, which only the reasoning-first Claude
 * models accept; Haiku 400s on it. This maps a model id to the thinking
 * config it actually supports so cheap-model routing is possible at all.
 */
export function thinkingConfigFor(model: string): Anthropic.ThinkingConfigParam | undefined {
    const id = model.toLowerCase();
    // Opus / Sonnet / the Fable-Mythos family support adaptive thinking.
    if (/(opus|sonnet|fable|mythos)/.test(id)) {
        return { type: 'adaptive' };
    }
    // Haiku supports extended thinking with an explicit budget, not adaptive.
    if (/haiku/.test(id)) {
        return { type: 'enabled', budget_tokens: 4000 };
    }
    // Anything else (gateways, unknown ids): omit thinking, let the model decide.
    return undefined;
}

export interface RoutingConfig {
    /** Cheap model for execution turns. Empty = same model everywhere. */
    executionModel: string;
    /** After a failed tool result, force the strong model for a few turns. */
    escalateOnFailure: boolean;
}

/** Turns to stay escalated on the strong model after an error. */
export const ESCALATION_TURNS = 2;

/**
 * Choose the model for a given turn. Turn 1 (planning) always uses the strong
 * model. Later turns use the execution model, unless we are inside the
 * escalation window opened by a recent failure.
 */
export function pickModel(
    strongModel: string,
    routing: RoutingConfig,
    turn: number,
    escalatedTurnsLeft: number,
): string {
    if (!routing.executionModel) return strongModel;
    if (turn <= 1) return strongModel;
    if (routing.escalateOnFailure && escalatedTurnsLeft > 0) return strongModel;
    return routing.executionModel;
}

export interface TokenUsage {
    input: number;
    output: number;
}

/** Fold one API response's usage into a running total. */
export function addUsage(total: TokenUsage, usage: Anthropic.Usage | undefined): TokenUsage {
    if (!usage) return total;
    return {
        input: total.input + (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
        output: total.output + (usage.output_tokens ?? 0),
    };
}
