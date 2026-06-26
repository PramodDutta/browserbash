---
title: Air-Gapped Browser Testing: Running AI QA Fully Offline
description: "Air-gapped browser testing for offline AI QA: run BrowserBash with a local Ollama model and Chrome so no test data, page content, or secrets leave the box."
date: 2026-06-26
category: security
---

Yes, you can run an AI browser-testing agent inside an air-gapped or otherwise offline network with zero data egress. The setup is a local Ollama model on the same machine, a local Chrome that the agent drives, and no cloud upload at any step. BrowserBash makes this the default rather than a special mode: its model resolver reaches for Ollama first and only contacts a hosted provider if you have set `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`. Leave those unset and every prompt, every page snapshot, and every screenshot stays on the box. That single behavior is what makes air-gapped browser testing viable here, and it is the concrete difference between BrowserBash and a cloud-only AI testing tool that has to ship your pages to an API to do anything at all.

If you work behind an air gap, on a classified network, or in any regulated environment where outbound traffic to a third-party model is not on the table, this post tells you exactly how to wire it up and where the honest limits are.

## Why "offline" is the whole point for regulated work

In most QA conversations, "runs offline" is a nice-to-have. In a regulated or air-gapped environment it is the gate you do not get past without. The reason cloud-based AI testing tools are usually a non-starter in these zones is not pricing or latency, it is that the page content they need to reason over is exactly the content you are not allowed to send anywhere: an internal admin console, a patient-records dashboard, a trading terminal, a defense logistics portal. The moment a tool POSTs a DOM snapshot or a screenshot to an external model endpoint, it has moved regulated data across a boundary, and that is the event your security team is paid to prevent.

So the useful question is not "does this tool have an offline mode," it is "what, by default, leaves the machine." With BrowserBash the answer when configured for air-gapped use is: nothing. The model runs locally through Ollama, the browser runs locally, and the dashboard is a local process. No test data, no credentials, no page content, and no screenshots cross the air-gapped network. You are not trusting a vendor's data-handling promises, because there is no network call to a vendor in the first place.

### How the model resolver decides where your data goes

This is worth being precise about, because it is the mechanism the whole guarantee rests on. BrowserBash ships with a default model setting of `auto`. When the agent needs a model, `auto` resolves in a fixed order:

1. **Ollama** (local, free, nothing leaves the machine) if it is reachable.
2. **`ANTHROPIC_API_KEY`** if that environment variable is set.
3. **`OPENROUTER_API_KEY`** if that environment variable is set.

Read that order the way a security reviewer would. The hosted providers are reached only when you opt in by setting their keys. If the air-gapped box has no `ANTHROPIC_API_KEY` and no `OPENROUTER_API_KEY` in its environment, the resolver has nowhere to escalate to. It uses local Ollama and stays there. There is no hidden fallback that "phones home" if the local model struggles, because the resolver does not invent a key you never gave it. The absence of those two variables is the control, and it is a control your provisioning team can audit in one `env | grep` and one shell-profile review.

## The offline setup checklist

Here is the end-to-end checklist for standing up air-gapped browser testing. The ordering matters because some steps require connectivity that the secure zone will not have, so you do them while you still can.

### 1. Pre-pull the Ollama model while you still have connectivity

The air-gapped box cannot download a model later, so you must bring the model in. Pull it on a connected machine (or from your organization's internal model mirror) before the hardware crosses into the secure zone:

```bash
ollama pull llama3.1:8b
```

If your secure zone has an approved internal mirror or artifact store, point Ollama at that instead so the pull happens entirely inside your network. Either way, the rule is the same: the model file is provisioned ahead of time, never fetched on demand from inside the air gap. Decide the model size against the hardware you are allowed to put in the zone, which is the real constraint and the subject of the honest-limits section below.

### 2. Do NOT set hosted-model API keys

This is the load-bearing step. Leave `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` unset on the air-gapped machine. With neither present, the `auto` resolver stays on local Ollama and there is no code path that reaches an external endpoint. Make this part of the machine's hardened baseline, not a thing an engineer remembers to do. Concretely:

- Confirm both variables are absent from the user shell profile, any service unit environment, and any CI runner config on the box.
- Audit with a quick check before each run window:

```bash
env | grep -E 'ANTHROPIC_API_KEY|OPENROUTER_API_KEY' || echo "no hosted keys set, staying local"
```

If that prints the "staying local" line, the resolver cannot escalate off-box.

### 3. Use the local dashboard only, never connect or upload

BrowserBash has a fully local dashboard that needs no account and no network:

```bash
browserbash dashboard
```

That command serves the run history and results from the local machine. It is free and it is self-contained. The cloud sync features are strictly opt-in and live behind separate, explicit commands: `browserbash connect` links the CLI to a hosted account, and `--upload` pushes a run's artifacts to that account. In an air-gapped deployment you simply never run those. No `connect`, no `--upload`, so nothing leaves the network. Treat both as disallowed commands in your runbook, the same way you would treat any other outbound-data operation.

### 4. Install the CLI from an internal registry or offline cache

The public install is one line:

```bash
npm install -g browserbash-cli
```

Inside an air gap you cannot reach the public npm registry, so source the package from your internal npm registry (Artifactory, Nexus, Verdaccio, or similar) or from an offline package cache that was populated outside the zone and carried in through your normal media-transfer process. The CLI itself is open source under Apache-2.0 and published by The Testing Academy, so it is straightforward to vendor into an internal mirror and pin to a reviewed version.

### 5. Provision Chrome and Playwright browser binaries through your offline pipeline

The agent drives a real browser, which means the browser binary has to be present locally too. BrowserBash uses your local Chrome and Playwright's browser binaries, and those downloads are normally fetched on demand from the internet, which the air gap blocks. Provision them through whatever mechanism your environment already uses for browser binaries: an internal binary mirror, a pre-baked machine image, or a controlled copy of the Playwright browser cache. The point is that browser provisioning is now your responsibility on the offline side, the same as the model. Plan for the `--headless` flag here too if these machines have no display server, since headless runs are common in locked-down environments.

### A minimal offline run

Once the five items above are in place, an actual run looks ordinary, which is the goal:

```bash
# model already pulled, no hosted keys in env, Chrome provisioned
browserbash run ./tests/login-smoke.md --headless
```

The agent loads the markdown objective, reasons with the local Ollama model, drives local Chrome, and writes the result to the local dashboard. At no point in that sequence is there an outbound request to a model API or a cloud dashboard.

## Compliance framing you can hand to security

When a security reviewer asks "what data crosses the boundary," the answer for a correctly configured BrowserBash deployment is short: none of it. Specifically:

- **Test data** stays local. The fixtures, the synthetic accounts, the seed values you drive the flow with never leave the machine.
- **Credentials** stay local. Whatever the agent types into a login form is processed by a model running on the same host.
- **Page content** stays local. The DOM snapshots and accessibility-tree representations the model reasons over are built and consumed on-box.
- **Screenshots** stay local. Any captured image is written to local storage and surfaced in the local dashboard, not uploaded.

This is the categorical difference from cloud-only AI testing tools. Those tools have to externalize the page to function, because their model lives on someone else's infrastructure. BrowserBash, configured for air-gapped use, keeps the model and the data colocated, so the data-egress surface is zero rather than "minimized." For broader guidance on keeping logins and secrets safe during agent runs, including masking and session reuse, see the companion piece on [credentials and secrets safety](https://browserbash.com/blog/ai-browser-automation-credentials-secrets-safety). If your regulatory regime is healthcare specifically, the [HIPAA-focused walkthrough](https://browserbash.com/blog/ai-testing-for-healthcare-saas-hipaa) covers PHI handling for SaaS QA in the same spirit.

This also maps cleanly onto common control language. Data residency is satisfied because data never moves. Network egress controls are satisfied because the testing workload generates none. Third-party data sharing is satisfied because there is no third party in the loop. None of that needs a special edition of the tool, it follows from the default resolver order plus the discipline of not setting hosted keys and not running the sync commands.

## Honest limits

Air-gapped AI QA is real and it works, but it is not free of trade-offs, and pretending otherwise would not serve anyone planning a secure deployment. Three limits are worth stating plainly.

**Local model quality is capped by the hardware you can put in the secure zone.** A hosted frontier model is often stronger at long, multi-step reasoning than an 8B or even a 70B model you can run locally. In an air gap you do not get to reach for that hosted model, so your effective ceiling is whatever the GPUs and memory you are permitted to install can run. That usually means choosing a model that fits the hardware and then designing your test objectives to match its strengths: clearer steps, tighter scope, less open-ended reasoning. The good news is that a lot of practical QA is exactly that shape. The honest caveat is that the most ambitious, ambiguous flows may need a larger model than your secure zone can host, and you should size hardware deliberately rather than hoping a small model stretches. The [guide to running BrowserBash on modest hardware](https://browserbash.com/blog/run-browserbash-without-a-powerful-machine) is the right starting point for that sizing conversation, and the [local-models tutorial](https://browserbash.com/blog/browserbash-ollama-local-models-tutorial) walks through where small models hold up and where they break.

**You own the offline provisioning of models and browser binaries.** In a connected setup, the model pull and the browser download "just happen." Behind an air gap they become your supply chain. You are responsible for getting the Ollama model file, the Chrome build, and the Playwright browser binaries into the zone through your approved transfer process, for verifying them, and for keeping them consistent across machines. That is genuinely more operational work than a cloud tool where the vendor handles all of it. It is the price of the data-egress guarantee, and for regulated work it is usually a price worth paying, but it is a real line item in your effort estimate, not a footnote.

**Updates require a controlled sync window.** A connected box can be updated whenever a new CLI version or model ships. An air-gapped box updates only when you open a deliberate, controlled window to bring new artifacts across the boundary, get them reviewed, and roll them out. That means you will sometimes be running a slightly older CLI or model than the public latest, by design. Build a cadence for it, pin your versions, and treat updates as a scheduled, reviewed event rather than a background process. This is normal for secure environments and entirely manageable, but it does mean you trade some immediacy for control.

None of these limits undermine the core claim. They are the predictable costs of doing AI QA with zero egress, and they are the kind of costs a regulated team is already structured to absorb.

## FAQ

### Does BrowserBash really make no network calls when configured for offline use?

For the testing path, with a local Ollama model, no `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` set, and without running `browserbash connect` or passing `--upload`, the agent's model reasoning and browser automation happen entirely on the machine, so there is no outbound call to a model API or a cloud dashboard. The cloud features exist, but they are opt-in behind explicit commands you simply do not run. As always in a hardened environment, your own egress monitoring is the final word, and it is reasonable to verify with a network capture during acceptance testing rather than taking any tool's claim on faith.

### What model should I run in an air-gapped zone?

Whichever model your permitted hardware can run comfortably while still handling your test objectives. A common starting point is an 8B-class model like `llama3.1:8b` for straightforward flows, sizing up to a larger model if the GPUs and memory in your zone allow and your objectives are more complex. The trade-off is concrete: bigger models reason better over multi-step tasks but demand more hardware, and in an air gap you cannot escape that ceiling by reaching for a hosted model. Size the hardware to the work, then write objectives that play to the model's strengths.

### How do I keep the air-gapped machine from ever using a hosted model by accident?

Do not put `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` in the machine's environment, anywhere: not the shell profile, not a service unit, not a CI config. The `auto` resolver only escalates to a hosted provider when it finds one of those keys, so their absence is the guarantee. Bake the check into your run-window procedure with a quick `env | grep` for both names, and keep the box's outbound network controls in place as defense in depth.

### Is the local dashboard free, and does it need an account?

Yes and no, respectively. `browserbash dashboard` runs locally, costs nothing, and needs no account or network connection to show your run history and results. An account and the cloud dashboard exist only for teams that opt into sync via `browserbash connect` and `--upload`, which an air-gapped deployment never uses. Everything you need to review runs offline is in the local dashboard.

## Where to go next

If you are standing up air-gapped browser testing, the practical path is: read the [local-models tutorial](https://browserbash.com/blog/browserbash-ollama-local-models-tutorial) to get comfortable with the Ollama resolver, check the [modest-hardware guide](https://browserbash.com/blog/run-browserbash-without-a-powerful-machine) to size your zone, and keep the [credentials safety](https://browserbash.com/blog/ai-browser-automation-credentials-secrets-safety) and [HIPAA](https://browserbash.com/blog/ai-testing-for-healthcare-saas-hipaa) write-ups handy for the compliance review. For the full capability list see the [features page](https://browserbash.com/features), and for hands-on scenarios see [Learn](https://browserbash.com/learn).

BrowserBash is free, open source under Apache-2.0, and built by The Testing Academy. Install it with `npm install -g browserbash-cli`, point it at a local model, and you have an AI QA agent that runs entirely inside your perimeter. For regulated and air-gapped teams, that is not a feature, it is the requirement, and it is the default.
