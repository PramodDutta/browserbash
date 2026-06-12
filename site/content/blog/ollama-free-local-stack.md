---
title: Zero-Budget Browser Automation with Local Ollama
description: Run a natural-language browser suite on local Ollama for $0 — auto-resolution order, model-size tradeoffs, and OLLAMA_BASE_URL for vLLM or LM Studio.
date: 2026-06-12
category: llm
---

"AI-powered testing" usually arrives with an asterisk: an API key, a metered bill, and a finance conversation before the first test runs. BrowserBash inverts that default — if Ollama is running on your machine, that's the brain it uses: free, open source, no keys. Here's what an all-local setup looks like in practice, through an illustrative startup scenario (a composite with indicative numbers — not a benchmark, not a customer story). Every command is real.

## The constraint: an AI budget of zero

Picture a three-person startup, pre-revenue. They want browser smoke tests for their web app — nine flows as `*_test.md` files — plus ad-hoc extraction jobs like "pull the pricing table off the competitor's site". Hardware on hand: one MacBook with 32 GB of RAM and a Linux box with a second-hand RTX 3090. Cloud LLM budget: zero, by decree.

This is exactly the situation BrowserBash's defaults are built for.

## The default stack is already free

The default model is `auto`, resolved in this order:

1. **Ollama running locally** → `ollama/<OLLAMA_MODEL or first installed model>` — free, open source, no keys
2. `ANTHROPIC_API_KEY` set → `claude-opus-4-8`
3. `OPENAI_API_KEY` set → `openai/gpt-4.1`
4. Otherwise: an error with setup guidance

So the free path is also the zero-config path:

```bash
ollama pull qwen3
browserbash run "Open https://example.com and store the heading as 'h1'"
```

Stagehand engine (MIT) + local Chromium + Ollama (MIT): no API keys, no cloud cost. The markdown suite runs the same way:

```bash
browserbash testmd run .browserbash/tests/signup_test.md --headless
```

To stop depending on "first installed model", pin one — persistently or per run:

```bash
export OLLAMA_MODEL=qwen3                     # pin auto-detection
browserbash run "..." --model ollama/qwen3    # or pin a single run
```

## Model size is the real tradeoff

The documentation's warning is blunt: small models (8B and under) are flaky on multi-step objectives; the Qwen3 / Llama 3.3 70B class works best.

In our illustrative setup, that plays out concretely. An 8B-class model on the MacBook handles single-page work fine — open a page, store a heading, verify a banner is visible. But on the team's twelve-step checkout test it loses the plot roughly one run in three: wandering back to the catalog mid-checkout, or "verifying" a heading that isn't the one the step asked about. Same suite pointed at a bigger Qwen3 variant served from the 3090 box, and the long flows stabilize.

The practical playbook that falls out:

- **Match model size to flow length.** Short extraction and verification objectives are fine on small models; multi-step e2e flows want the 70B class.
- **Split long flows.** A twenty-step objective on a small model fails more often than two ten-step tests. `*_test.md` files help here — each list item is one explicit, verified step, which keeps a smaller model on rails far better than one sprawling sentence.
- **Give long flows headroom** with `--timeout` (default 300 seconds) and `--max-steps` (default 30):

```bash
browserbash testmd run .browserbash/tests/checkout_test.md --headless --timeout 300 --max-steps 40
```

## One env var for vLLM, LM Studio, llama.cpp

`OLLAMA_BASE_URL` overrides the default endpoint (`http://localhost:11434/v1`), and the same `ollama/<model>` flag works against any OpenAI-compatible server — vLLM, LM Studio, llama.cpp. That's how the team uses the 3090 box without installing anything new on laptops:

```bash
export OLLAMA_BASE_URL=http://gpu-box.local:8000/v1
browserbash run "Open {{base_url}} and verify the signup button is visible" --model ollama/qwen3
```

The name after `ollama/` should match whatever model your server actually serves. The team's split: LM Studio on the MacBook for experiments, vLLM on the 3090 for the nightly suite.

## What it costs, and what it doesn't

API fees after a quarter in this scenario: zero. The real costs are honest but different — electricity, hardware they already owned, and runs that are slower than a hosted frontier model, with occasional retries on the hardest flow. When one gnarly flow keeps flaking even on the 70B class, the escape hatch is per-test rather than architectural: set `ANTHROPIC_API_KEY` and run just that one file with `--model claude-opus-4-8` while everything else stays local. And because `auto` prefers a running Ollama by design, reaching for a cloud model is always an explicit flag — never a surprise bill.

## FAQ

### Which local model should I start with?

`ollama pull qwen3` is the documented starting point. Expect models of 8B parameters and under to be flaky on multi-step objectives — they're fine for single-page extraction and verification, but the Qwen3 / Llama 3.3 70B class is the documented sweet spot for real flows.

### Does the free stack work for markdown test files too?

Yes — backend resolution is identical for `browserbash run` and `browserbash testmd run`. With Ollama running and no keys set, the whole `*_test.md` suite executes locally, and each run still writes a `Result.md` next to the test file.

### How do I point BrowserBash at vLLM or LM Studio instead of Ollama?

Set `OLLAMA_BASE_URL` to your server's OpenAI-compatible endpoint (for example `http://gpu-box.local:8000/v1`) and pass `--model ollama/<model>` with the model name your server serves. No other configuration changes — the same flag covers Ollama, vLLM, LM Studio, and llama.cpp.
