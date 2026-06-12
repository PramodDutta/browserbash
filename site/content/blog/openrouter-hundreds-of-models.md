---
title: A/B Test Claude vs Llama on One Suite, One Flag
description: Swap --model openrouter/<vendor>/<model> to A/B test Claude vs Llama on the same markdown suite — no test changes. Includes OPENROUTER_API_KEY setup.
date: 2026-06-12
category: llm
---

Once your tests are written in plain English, the model that interprets them becomes a swappable dependency — like a browser version, except it affects reasoning instead of rendering. So which model should run your suite? With OpenRouter, that stops being a forum debate and becomes an afternoon experiment: one API key, hundreds of models, and a single `--model` flag between them. Here's how a team can A/B test Claude against Llama on the exact same markdown suite — an illustrative composite scenario with indicative numbers, not a benchmark — with every command runnable as shown.

## The question behind the nightly bill

Picture a QA team with 14 `*_test.md` files: nine short smoke flows and five longer end-to-end walks, the longest a 16-step checkout. The suite runs nightly on a Claude-class model and works. The question from engineering management is simple: would an open-weights model pass the same suite for a fraction of the cost? In a selector-based world, evaluating a new engine means a migration project. Here it means changing one flag, because the tests are English and contain nothing model-specific.

## Setup: one key for hundreds of models

Get a key at openrouter.ai/keys, export it, and reference any model as `openrouter/<vendor>/<model>`:

```bash
export OPENROUTER_API_KEY=sk-or-...

browserbash run "Open https://example.com and store the heading as 'h1'" \
  --model openrouter/anthropic/claude-sonnet-4-6

browserbash run "Open https://example.com and store the heading as 'h1'" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

That is the entire integration. If your traffic must flow through a proxy or a regional endpoint, `OPENROUTER_BASE_URL` overrides the endpoint — the model ids and commands don't change.

## The A/B harness

Run the identical suite once per model, capturing NDJSON and exit codes:

```bash
mkdir -p results
export OPENROUTER_API_KEY=sk-or-...

for model in openrouter/anthropic/claude-sonnet-4-6 openrouter/meta-llama/llama-3.3-70b-instruct; do
  tag=$(echo "$model" | tr '/' '_')
  for t in .browserbash/tests/*_test.md; do
    browserbash testmd run "$t" --agent --headless --timeout 180 --model "$model" \
      > "results/$(basename "$t" .md).$tag.ndjson"
    echo "$tag $(basename "$t") exit=$?"
  done
done
```

Exit codes are the verdicts (`0` passed, `1` failed, `2` error, `3` timeout), and each NDJSON file ends with a `run_end` event carrying `duration_ms` and `steps_executed`:

```bash
for f in results/*.ndjson; do
  tail -1 "$f" | jq -r --arg f "$f" '[$f, .status, .duration_ms, .steps_executed] | @tsv'
done
```

## What the comparison showed (illustrative)

Five reruns of the full suite per model, in this composite scenario:

| Model | Verdict | Median duration | Notes |
|---|---|---|---|
| `openrouter/anthropic/claude-sonnet-4-6` | 14/14 passed, every rerun | ~38 s/test | passed the 16-step checkout every time |
| `openrouter/meta-llama/llama-3.3-70b-instruct` | 13/14 | ~31 s/test | failed the 16-step checkout in 2 of 5 reruns |

Read carefully, this is not "Claude wins". On the nine short smoke tests, Llama matched Claude's pass rate at a fraction of the cost and slightly faster medians. The gap appeared only on the longest flow — consistent with the general guidance that smaller and cheaper models get flaky as step count grows.

So the team ships a split policy:

- **Per-PR smoke job:** the nine short tests on `openrouter/meta-llama/llama-3.3-70b-instruct` — cheap, fast, frequent.
- **Nightly full suite:** all 14 tests on `openrouter/anthropic/claude-sonnet-4-6` — maximum reliability where the flows are longest.

The two CI jobs are identical except for the `--model` argument. Test files changed for the experiment and the rollout: zero.

## Why zero test changes is the whole point

The suite encodes intent ("log in, add the backpack to the cart, verify the badge shows 1"), not implementation. Models — like browsers and grids — are runtime configuration, and configuration follows a clear precedence: flags beat environment variables, which beat `~/.browserbash/config.json` defaults. The same suite that A/B-tested two OpenRouter models can run on local Ollama tomorrow (`--model ollama/qwen3`) or on Anthropic directly (`--model claude-opus-4-8`). OpenRouter is simply the widest menu — hundreds of models behind one `OPENROUTER_API_KEY` — which makes experiments like this cheap enough to actually run.

When a candidate model fails a long test, treat it like any flake investigation: rerun for a pass rate, compare `duration_ms` and `steps_executed` against the stronger model's runs, and consider splitting the flow or raising `--timeout` and `--max-steps` before blaming the model outright.

## FAQ

### Do I need separate API keys for Anthropic and Meta models?

No — that's the point of OpenRouter. One `OPENROUTER_API_KEY` (from openrouter.ai/keys) covers every model on the platform, addressed as `openrouter/<vendor>/<model>`. You stop managing a keyring and start comparing models on merit.

### How do I find the exact model id to pass?

Browse the OpenRouter model catalog and copy the id verbatim into the flag — for example `--model openrouter/anthropic/claude-sonnet-4-6` or `--model openrouter/meta-llama/llama-3.3-70b-instruct`. The `openrouter/` prefix tells BrowserBash which backend to use; the rest must match OpenRouter's id exactly.

### A cheaper model keeps failing one long test — is it unusable?

Not necessarily. Long multi-step flows are where smaller models flake first. Before discarding it: rerun to establish a pass rate (one failure is not a verdict), give the run headroom with `--timeout` and `--max-steps`, or split the flow into two shorter `*_test.md` files. Many teams land exactly where this one did — a cheap model for short tests, a stronger one for long flows.
