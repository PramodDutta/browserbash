---
title: Test How AI Agents Experience Your Site Before They Break It
description: "Test your website for AI agents the way Atlas and Comet would drive it — walk critical flows in plain English and catch agent-legibility gaps early."
date: 2026-04-07
category: use-case
---

A new kind of visitor is showing up in your analytics, and it does not move a mouse the way a person does. When you test your website for AI agents, you are checking how an autonomous browser — ChatGPT Atlas in agent mode, Perplexity's Comet, an Operator-style assistant a customer is running on your checkout — actually perceives and operates your pages. These agents do not see your carefully designed hero section. They see an accessibility tree, a DOM, and a set of affordances they have to reason about step by step. When a button is a styled `<div>` with no role, or your "Add to cart" control sits in a different spot on every product category, the agent stalls, guesses wrong, or quietly gives up. The visitor was about to buy, and your interface lost the sale to a machine that could not figure out where to click.

This is the gap agent-legibility testing exists to close. You can wait until support tickets roll in ("the AI assistant couldn't complete my order"), or you can drive your own flows the way an agent would, before launch, and find the dead ends first. This article walks through how to do exactly that, using a natural-language agent that operates a real browser, so you catch the gaps while they are cheap to fix.

## Why "agent traffic" is now a real testing surface

For two decades, web QA assumed a human on the other end: someone who scans a page visually, infers that a green pill-shaped element is clickable, tolerates a confusing layout, and brute-forces their way to checkout because they really want the thing. Agents do none of that gracefully.

Through 2025 and into 2026, agentic browsers moved from demo to daily driver. OpenAI's Atlas ships an agent mode that opens tabs, navigates sites, and completes multi-step tasks autonomously. Perplexity's Comet, which launched to consumers in July 2025 and expanded to enterprise in early 2026, runs in-page research and autonomous flows like booking and form-filling. The exact internal architecture of each is not publicly specified, and you should not assume any two agents reason identically. But the shared, observable behavior is what matters for testing: an agent reads a machine representation of your page, decides on an action, executes it, observes the result, and repeats until it believes the goal is met or it fails.

That loop is brutal on interfaces built only for human intuition. The web.dev guidance on agent-friendly UX is blunt about the failure modes: layout instability (the same control in different places across pages), hidden or "ghost" elements that obscure interactive nodes, semantic ambiguity (a `<div>` styled as a button that no agent recognizes as interactive), and targets so small they get filtered out of visual analysis. None of these break a determined human. All of them can stop an agent cold.

So "does an AI agent reach my goal state?" is now its own test surface — distinct from "does a human like it" and distinct from "do my unit tests pass." You need to actually run the flow, with an agent, and observe whether it completes.

## What agent-legibility actually means

Agent-legibility is how readable and operable your interface is to a reasoning agent driving a browser. It is related to accessibility but not identical. A useful shortcut you will see repeated by practitioners: if your site works well with a screen reader like VoiceOver or NVDA, it tends to work well with agents, because both consume the accessibility tree rather than the pixels. But agents add their own twist — they plan multi-step tasks, they reason about which of five similar buttons to press, and they can be derailed by interstitials a screen-reader user would simply tab past.

Break legibility into the things that actually trip agents:

- **Semantic clarity.** Native `<button>`, `<a>`, `<label for="...">`, and proper ARIA roles tell an agent what each element *does*. Styled `<div>`s and `<span>`s with click handlers are invisible as affordances unless you add explicit `role` and `tabindex`.
- **Layout stability.** Agents do better when the primary action lives in a predictable place across similar pages. A cart button that floats around by category forces re-reasoning every time.
- **Honest state.** A "Saved" toast, a redirect to `/dashboard`, a disabled-then-enabled submit button — these are the signals an agent uses to know it succeeded. If success is only communicated by a subtle color change with no text and no DOM change, the agent cannot confirm it.
- **Unblocked paths.** Cookie banners, age gates, "are you a robot" interstitials, surprise modals, and multi-step confirmations are where agents lose the thread. A human dismisses them on autopilot; an agent has to figure out each one is a detour, not the goal.
- **Discoverability.** Beyond the live DOM, the protocol layer matters: `llms.txt`, sitemaps, structured data, and clean metadata help agents that do reconnaissance before acting. This is the layer Cloudflare's agent-readiness work and Vercel's agent-readability spec focus on.

The point of testing is not to score these in the abstract. It is to find the one spot in *your* checkout where a real agent run dies, then fix that specific spot.

## Test the way the agent does: drive the flow in plain English

Here is the shift in approach. Static checkers and "agent-readiness scores" are useful for the protocol layer — whether you have an `llms.txt`, whether your schema validates, whether your pages server-render. They do not tell you whether an agent can actually get from your homepage to a completed order. For that, you need to *run the flow* with something that reasons over the page the way Atlas or Comet would.

That is what [BrowserBash](https://www.npmjs.com/package/browserbash-cli) does. It is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You write a plain-English objective; an AI agent drives a real Chrome browser step by step — no selectors, no page objects — and returns a verdict plus the structured values it extracted. Because the agent navigates your live interface with the same reason-act-observe loop a consumer agent uses, a passing run is meaningful evidence that an agent can complete the flow. A failing run points straight at the legibility gap.

Install it and run your first flow:

```bash
npm install -g browserbash-cli
browserbash run "Go to staging.myshop.com, open the first product, add it to the cart, proceed to checkout, and confirm the order summary shows a subtotal"
```

No account is required to run anything. You need Node 18 or newer and Chrome for the default local provider. The agent navigates, clicks, reads state, and finishes with a pass/fail verdict. If it fails on "add it to the cart," you have just reproduced — in seconds, locally — the exact wall a customer's agent would hit.

The reason this maps so well to the Atlas/Comet experience is the absence of selectors. You are not telling the tool *how* to click "Add to cart" with a CSS path you maintain; you state the *goal*, and the agent figures out the how by reading the page — which is precisely what a consumer agent does. If your agent can figure it out, theirs probably can too. If yours can't, theirs definitely won't.

## A practical agent-legibility test plan

Run these as separate objectives so each failure is isolated. Start with your revenue-critical and high-intent flows, because those are the ones agents are most likely to attempt on a user's behalf.

### 1. The primary conversion path

For most sites this is signup, checkout, or a lead form. State the whole goal in one objective and let the agent walk it end to end.

```bash
browserbash run "Sign up for a new account on staging.myapp.com using email agenttest+01@example.com and a strong password, then confirm you land on the onboarding screen" --record
```

The `--record` flag captures screenshots and a `.webm` session video so you can watch where the agent hesitated or backtracked. When the run fails, the video is usually faster than reading logs — you see the agent click the wrong element or get stuck behind a modal.

### 2. The "find and decide" path

Agents are increasingly used to compare and choose. Test whether yours can read enough structured information to make the comparison a user asked for.

```bash
browserbash run "On staging.myshop.com, find the cheapest product in the Laptops category that has at least a 4-star rating, and report its name and price"
```

This stresses agent-legibility hard. If your prices live in unlabeled spans, your ratings are background images with no text alternative, or your category filter is a custom widget with no semantic role, the agent struggles to extract and reason. The structured values it returns — or fails to return — tell you how legible your product data really is.

### 3. The interruption gauntlet

Deliberately test a page path that includes your cookie banner, a newsletter pop-up, or an age gate. A human dismisses these reflexively. Confirm an agent can too.

```bash
browserbash run "Visit staging.mysite.com, dismiss any cookie or newsletter pop-ups, navigate to the Pricing page, and report the price of the Pro plan"
```

If the agent can't get past your interstitial to read pricing, neither can a customer's agent — and you have just lost a comparison-shopping query you never knew you were in.

### 4. The honest-state check

Verify that success is actually communicated in a way an agent can detect. Contact forms are the classic offender: many show success with a color change and no text.

```bash
browserbash run "Fill out the contact form on staging.mysite.com with realistic test data, submit it, and confirm a success message is visible"
```

If this fails despite the form working for humans, your success state is invisible to agents — fix it with a real, text-bearing confirmation. This is the kind of finding that also improves your accessibility, which is the recurring theme: agent fixes are human fixes.

## Make the tests committable, not throwaway

One-shot `run` commands are great for exploration. To keep agent-legibility from regressing on every deploy, move your flows into markdown tests you can commit and run in CI.

BrowserBash reads `*_test.md` files where each list item is a step, with `{{variables}}` templating and `@import` for composing shared steps. Secret-marked variables are masked as `*****` in every log line, so you can include credentials safely. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md
```

A small `checkout_test.md` might list: navigate to the staging store, dismiss any pop-ups, open the first product, add to cart, go to checkout, fill shipping with `{{address}}`, and confirm the order summary renders a subtotal. Because the steps are plain English, a product manager can read and approve them; because they live in your repo, they version with the code that can break them.

For CI and AI coding agents, add `--agent` for NDJSON output — one JSON object per line, with `step` progress events and a terminal `run_end` event carrying `status`, `summary`, and `final_state`. Exit codes are explicit: 0 passed, 1 failed, 2 error, 3 timeout. No prose parsing, so your pipeline can gate a deploy on "an agent can still complete checkout" as a hard check.

## Choosing a model: the honest version

BrowserBash is Ollama-first. The default model is `auto`, which resolves in order: a local Ollama model first (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (claude-opus-4-8), then `OPENAI_API_KEY` (openai/gpt-4.1), otherwise it errors with guidance. On a local model your model bill is a guaranteed $0, which is the right default for running a suite of legibility checks dozens of times a day.

Now the caveat that matters, stated plainly: very small local models (8B parameters and under) are flaky on long, multi-step objectives. They lose the plot on a six-step checkout. For real agent-legibility flows, the sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hardest paths. Pin the model when you want determinism:

```bash
browserbash run "Complete the full checkout on staging.myshop.com and confirm the order confirmation page loads" --model ollama/qwen3 --timeout 180
```

There is a useful subtlety here. A weaker model failing your flow does not always mean your *site* is illegible — it can mean the model wasn't strong enough to plan the steps. To separate the two, run the flow on a capable model first to establish that it is completable at all, then drop to a smaller model. If the strong model breezes through and the small one stumbles on a specific step, that step is your legibility hot spot: it demands too much reasoning. That comparison is itself a signal.

## Where this fits next to static checkers and accessibility audits

You do not have to pick one tool. These approaches answer different questions, and a good agent-readiness program uses all three layers.

| Approach | What it checks | What it misses | Best for |
| --- | --- | --- | --- |
| Static agent-readiness scanners (Cloudflare, Vercel spec, llms.txt generators) | Protocol layer: `llms.txt`, schema, server rendering, metadata | Whether an agent can actually complete a live flow | Discovery and reconnaissance readiness |
| Accessibility audits (axe, WAVE, screen-reader testing) | Semantic HTML, ARIA, labels, contrast | Multi-step task completion and agent planning | The legibility foundation agents share with assistive tech |
| Live agent walkthroughs (BrowserBash, agent browsers) | End-to-end flow completion as an agent experiences it | Doesn't replace protocol/discovery audits | Proving an agent reaches the goal state |

Static checkers and accessibility audits are cheaper and faster, and they catch a whole class of issues before you ever run a flow. Run them first; they tell you things a single agent walkthrough never will, like whether your `llms.txt` is even present. The live walkthrough is what confirms the thing the others can only approximate — that an agent actually completes the journey. Treat them as a stack, not a competition.

Be honest about what a tool like BrowserBash is not. It is not a hosted agent-readiness dashboard with a 0–100 score, and it does not crawl your whole site to grade the protocol layer. If you want a one-number grade or a site-wide discovery audit, the dedicated scanners do that better. BrowserBash's job is the run: drive the flow, return a verdict. More on how the pieces fit is on the [BrowserBash features page](https://browserbash.com/features) and in the [tutorials](https://browserbash.com/tutorials).

## Reading the results without fooling yourself

A green verdict from one model on one run is encouraging, not conclusive. Agent behavior has natural variance — the same flow can pass on one attempt and stumble on the next if a step is genuinely ambiguous. Build a little rigor into how you read outcomes:

- **Run flaky flows two or three times.** If a step passes sometimes and fails sometimes, that intermittency *is* the finding. A robust affordance gets clicked reliably; an ambiguous one is a coin flip — and that points straight at the element that needs a clearer role, label, or position.
- **Watch the recording on failures.** With `--record` you get a `.webm` and screenshots; the builtin engine also writes a Playwright trace. Watching the agent hover, misclick, then wander tells you more than any log line about *why* the page was hard to read.
- **Use the local dashboard for history.** Run `browserbash dashboard` to open a fully local dashboard at localhost:4477 and review past runs. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you always have a trail.

```bash
browserbash dashboard
```

If you want to share runs with a teammate, `browserbash connect --key bb_...` links an optional free cloud dashboard, and `--upload` pushes a specific run (free cloud runs are kept 15 days). Both are strictly opt-in: without `--upload`, nothing leaves your machine, which matters when your staging flows include real-looking test data. Pricing for the optional cloud is on the [pricing page](https://browserbash.com/pricing), and you can create a [free account](https://browserbash.com/sign-up) if you want the shared view.

## Fixing what you find: the agent-legibility checklist

When a run fails, the fix almost always falls into one of a handful of buckets. Work them in this order, because the cheap fixes resolve a surprising share of failures.

1. **Promote real semantics.** Swap click-handling `<div>`s for `<button>` and `<a>`. Add `role` and `tabindex` where you can't change the tag. This single change recovers more agent runs than anything else.
2. **Label every input.** Add `<label for="...">` and meaningful `name`/`aria-label` so the agent knows that field is the email, not the coupon code.
3. **Make success speak.** Replace silent color-change confirmations with visible, text-bearing messages and, where appropriate, a URL change. Agents confirm success by reading state.
4. **Stabilize the primary action.** Keep "Add to cart," "Continue," and "Submit" in consistent positions and with consistent labels across similar pages.
5. **Tame interruptions.** Give cookie banners, pop-ups, and gates clearly labeled dismiss controls, and avoid stacking multiple interstitials before the main task.
6. **Mind the protocol layer.** Add or fix `llms.txt`, structured data, and clean metadata so agents that reconnoiter before acting start from solid ground.

Every one of these also helps screen-reader users, keyboard users, and your SEO. That is not a coincidence: the qualities that make a page legible to an agent are the same ones that make it legible to assistive technology and to crawlers. You are not building a separate "agent version" of your site — you are paying down legibility debt that was always there. More on the philosophy is in the [BrowserBash learn hub](https://browserbash.com/learn) and across the [blog](https://browserbash.com/blog).

## When this approach is the right call (and when it isn't)

**Reach for live agent walkthroughs when:** you have revenue-critical flows (checkout, signup, booking, lead capture) that agents are likely to attempt; you are launching a redesign and want to confirm agents still complete the journey; you are seeing reports of AI assistants failing on your site; or you want a CI gate that proves an agent can still finish checkout on every deploy. This is also the right tool when you want to reproduce the Atlas/Comet experience rather than estimate it.

**Lean on the other layers when:** you mainly need a protocol-readiness grade or a site-wide discovery audit — the dedicated scanners are built for that. And if your real problem is foundational accessibility (no semantic HTML anywhere, no ARIA), start with an accessibility audit and fix the basics first; a live agent walkthrough will just keep failing until the foundation is there.

**Be realistic about scope.** A passing agent run is strong evidence, not proof that every agent on every model will always succeed. Different agents reason differently, and the precise internals of Atlas and Comet are not publicly specified. What you get is reproducible evidence on the flows you care about, using the same general technique the consumer agents use — far better than finding out from a customer that the AI couldn't check out. The [case study page](https://browserbash.com/case-study) has more on how teams fold this into their workflow.

## FAQ

### How do I test if my website works with AI agents like ChatGPT Atlas or Comet?

The most direct way is to drive your critical flows with an agent that operates a real browser and reports whether it reached the goal. With a tool like BrowserBash you write a plain-English objective, such as completing checkout or signing up, and an AI agent navigates your live pages step by step and returns a pass/fail verdict. A passing run is strong evidence that consumer agents like Atlas or Comet can complete the same journey, because they use the same reason-act-observe approach. Failures point you straight at the element or step where the page is hard for an agent to read.

### What makes a website hard for AI agents to navigate?

The usual culprits are non-semantic markup (a styled `<div>` used as a button with no role), layout instability where the primary action moves around across similar pages, hidden or overlapping elements, unlabeled inputs, and success states communicated only by a subtle visual change with no text or URL update. Interruptions like cookie banners, pop-ups, and age gates also derail agents that have to treat each one as a detour rather than the goal. Most of these break agents while a determined human pushes through anyway, which is why they hide until you test specifically for agent-legibility.

### Is agent-legibility testing the same as accessibility testing?

They overlap heavily but are not identical. Both agents and assistive technologies like screen readers consume the accessibility tree rather than the pixels, so semantic HTML, ARIA roles, and proper labels help both — and a site that works well with VoiceOver or NVDA usually works well with agents. The difference is that agents also plan multi-step tasks and reason about which control to use, so they can be derailed by interstitials and ambiguous affordances a screen-reader user would simply tab past. Run accessibility audits to fix the foundation, then run live agent walkthroughs to confirm end-to-end task completion.

### Do I need a paid API key to test my site for AI agents?

No. BrowserBash is free and open-source, requires no account to run, and is Ollama-first, so it defaults to a local model where nothing leaves your machine and your model bill is $0. You only need Node 18 or newer and Chrome for the default local provider. The honest caveat is that very small local models (8B and under) are unreliable on long multi-step flows, so for real checkout-style journeys use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or supply an Anthropic or OpenAI key for the hardest paths.

Start testing how agents experience your site today. Install with `npm install -g browserbash-cli`, point it at a staging flow, and watch where an agent gets stuck. When you want a shared dashboard, create a free account (account optional) at [browserbash.com/sign-up](https://browserbash.com/sign-up).
