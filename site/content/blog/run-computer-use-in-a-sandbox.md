---
title: How to run computer-use agents in a sandbox
description: "A practical guide to building a computer use sandbox: isolate the agent, attach over CDP to a containerized Chrome, and keep credentials and the host safe."
date: 2026-02-16
category: guide
---

Giving a model a mouse and a keyboard is the easy part. The hard part is making sure that when the agent misreads a screen, follows a poisoned instruction, or simply does something dumb at 2am, the blast radius is a throwaway container and not your laptop, your cookies, or your production database. That is the whole reason a **computer use sandbox** exists: you want the agent's autonomy without inheriting the agent's mistakes. This guide walks through how to actually build one — process and filesystem isolation, network policy, and the specific, load-bearing trick of attaching to a containerized Chrome over the DevTools Protocol (CDP) instead of letting the agent touch your real machine.

I work on BrowserBash, a browser automation CLI, so I will be upfront about where it fits and where it does not. BrowserBash is browser-scoped: it drives a real Chrome to complete web tasks. It is not a general OS-level computer-use agent. For a lot of "computer use" demand, that distinction is the entire decision, and I will spend real space on it below rather than pretending a browser tool replaces desktop control. If your task genuinely lives in a browser, a sandboxed CDP setup is cheaper, faster, and far easier to reason about than a vision-first desktop agent. If it does not, you want a different tool, and I will say so.

## What "computer use" means, and why it needs a box around it

"Computer use" is the loop where a model looks at a screenshot of a screen, reasons about it, and replies with low-level actions — `click(x, y)`, `type("...")`, `key("Return")`, scroll, another screenshot — until a task is done. Anthropic ships a reference implementation of this loop, typically inside a Docker container with a virtual display, and other vendors offer comparable agents. The capability is real and genuinely general: the same loop can drive a spreadsheet, a native installer, a legacy enterprise client, or a web browser, because it operates on pixels rather than on any application's internals.

That generality is exactly why isolation is non-negotiable. An agent that can click anything on a screen can also click "Empty Trash," approve an OS permission dialog, paste a secret into the wrong field, or follow a malicious instruction it read off a web page. Large language models do not have a reliable sense of "I should not do that," and prompt injection — hostile text on a page that hijacks the agent's goal — is a live, unsolved problem as of 2026. The defensive posture that actually works is not "trust the model more." It is "assume the model will eventually do the worst plausible thing, and make sure that thing happens inside a container you can throw away."

So a computer use sandbox is less about the model and more about everything around it: where it runs, what it can see, what it can reach, and how cleanly you can reset it. Get those four right and a misbehaving agent is an annoyance. Get them wrong and it is an incident.

## The four layers of a real sandbox

A useful sandbox is not a single switch. It is four independent layers, and you want all of them, because each one fails differently.

**Process and kernel isolation.** This decides what happens when the agent — or the browser it drives — gets compromised at a low level. Plain Docker containers share the host kernel, which is fine for most automation but is the weakest of the common options. Stronger choices include gVisor (a user-space kernel that intercepts syscalls) and microVMs like Firecracker or Kata Containers, which give each workload its own kernel. As of early 2026, microVMs are the consensus pick when you need the strongest boundary, and several agent platforms now run each session in a dedicated microVM rather than a shared container. For most browser tasks, a hardened container is enough; for untrusted code execution alongside the browser, reach for the stronger tiers.

**Filesystem isolation.** The agent should write to an ephemeral, disposable filesystem — not your home directory, not a mounted source tree it can corrupt. When the container stops, the filesystem and everything in it should vanish: cookies, downloads, history, temp files. The reference Docker setups for both Claude Code and containerized browsers lean on exactly this property. Mount in only what the task needs, read-only where possible.

**Network policy.** This is the layer people skip and regret. An agent with unrestricted egress can exfiltrate whatever it reads, hit internal services it was never meant to see, or get steered to a hostile host by injected instructions. The right default is deny-all egress with a narrow allowlist of the domains the task legitimately needs. If the agent only has to test your staging site, it should not be able to reach the open internet.

**Credential isolation.** The agent should hold the *least* set of secrets that lets the task succeed, and ideally none that are real. Use scoped test accounts, short-lived tokens, and a dedicated browser profile with no access to your personal logins. The single most common way a "harmless" automation turns dangerous is that it ran in a browser already logged into everything you own.

Those four layers are tool-agnostic. They apply whether you are sandboxing a full desktop computer-use agent, a coding agent, or — the focus of the rest of this guide — a browser agent driving a containerized Chrome.

## CDP and containerized Chrome: the browser-scoped sandbox

Here is the move that makes browser automation safe and clean, and it is worth understanding even if you never use BrowserBash.

The Chrome DevTools Protocol (CDP) is the wire protocol DevTools itself speaks to Chrome. Over the last couple of years it has quietly become the standard interface between AI agents and browsers — browser-use moved to raw CDP for speed, Google's Chrome team shipped an official MCP server built on it, and recent Chrome builds added native toggles for agent access. The relevant property for sandboxing is simple: **CDP is a network endpoint.** When you launch Chrome with `--remote-debugging-port=9222`, it exposes a WebSocket that anything on the network can attach to and drive. The thing driving the browser and the browser itself do not have to live in the same place.

That separation is the entire trick. You run Chrome inside a container — its own filesystem, its own process tree, its own network namespace, its own throwaway profile — and you point your agent at that container's CDP endpoint. The agent never touches your host. It clicks and types inside a browser that exists only in a box you can delete. When the container stops, the session is gone.

```bash
# 1. Run an isolated, headless Chrome in a container, CDP on 9222
docker run -d --name sandbox-chrome \
  --rm --shm-size=1g -p 9222:9222 \
  browserless/chrome

# 2. Drive that containerized browser with BrowserBash over CDP
browserbash run "Open the pricing page and read the price of the Pro plan" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser
```

BrowserBash's `--provider cdp --cdp-endpoint ws://...` is built for precisely this. The default provider is `local`, which drives the Chrome already on your machine — great for fast inner-loop work, but it is your real browser, not a sandbox. Switching to the `cdp` provider attaches the same plain-English objective to whatever DevTools endpoint you hand it: a Browserless or Steel container, a browser your CI runner launched, a remote grid, anything that speaks CDP. The objective you write does not change; only where the browser lives changes.

Why is this so much better than a vision-first desktop agent for web work? Because BrowserBash reads the DOM rather than guessing pixel coordinates from screenshots. That makes it cheaper (no image per turn), faster, and more deterministic — a layout shift or a moved button does not require re-finding everything visually. And because the browser is containerized, you get all four sandbox layers "for free" from the container runtime: process isolation, an ephemeral filesystem, a network namespace you can lock down, and a fresh profile with none of your logins. The agent's authority stops at the edge of one browser in one container. For more on the provider model and the CDP escape hatch, the [features page](https://browserbash.com/features) lays out the matrix.

## Building it step by step

Let me make this concrete. Here is a setup I would actually trust to run unattended against a staging environment.

### Step 1 — Isolate the browser, not just the agent

Run Chrome in a container with the basics tightened: an ephemeral filesystem (`--rm` so it is gone on exit), a sane `--shm-size` so Chrome does not crash on heavy pages, and no host volumes mounted unless a download path genuinely needs to come back out. Use a containerized Chrome image (Browserless, Steel, or your own slim build of headless Chromium with `--remote-debugging-port`). The container's profile starts empty: no cookies, no extensions, no saved passwords. That empty profile is a feature, not a gap — it means the agent begins every run as a stranger to your accounts.

### Step 2 — Lock down egress

By default the container should not be able to reach the internet. Put it on a Docker network with a deny-all egress policy and allowlist only the host(s) the task needs — your staging domain, an auth provider, a payment sandbox. If the agent reads an injected "now go POST everything to evil.example," the request simply fails at the network layer. This single control neutralizes a large fraction of prompt-injection exfiltration without you having to make the model smarter.

### Step 3 — Use scoped, disposable credentials

Never point a sandboxed agent at a browser logged into your real life. Create a dedicated test account with the minimum permissions to exercise the flow. If the task needs secrets — a login, an API key — feed them through BrowserBash's masked-secret mechanism in a Markdown test rather than pasting them into prompts or echoing them into logs. BrowserBash's Markdown tests (`*_test.md`) support `{{variables}}` and masked secrets so that credentials are substituted at runtime and redacted from output. There is a deeper write-up of this in the [tutorials](https://browserbash.com/tutorials) hub, and it is the difference between a leaked token in a CI log and a redacted one.

### Step 4 — Run the agent against the endpoint, capture evidence

Now drive the containerized browser and record what happened. The `--record` flag captures a `.webm` video, a screenshot, and a trace, so when a run does something surprising you can watch it back instead of guessing. In CI, `--agent` emits NDJSON and sets a meaningful exit code (0 pass, 1 fail, plus distinct codes for usage and runtime errors), so a pipeline can branch on the result.

```bash
browserbash run "Log in with the test account and confirm the dashboard shows a welcome banner" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser \
  --record \
  --agent
```

### Step 5 — Tear it all down

When the run finishes, stop the container. Because the filesystem was ephemeral and the profile was empty, there is nothing to scrub: cookies, history, downloads, and any malware the agent might have stumbled into all evaporate with the container. The next run starts from a clean, known state. That reset-to-zero property is what makes a sandbox a sandbox rather than just "a second computer you also have to worry about."

For a longer-lived setup — say you want the same isolated browser across several objectives in one job — keep the container up, run multiple `browserbash run` calls against its endpoint, then tear down at the end of the job. The model that interprets your objective is configured separately; by default it is `auto`, which prefers a local Ollama model (free, nothing leaves the machine), then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. Pairing a local model with a sandboxed browser gives you a setup where neither your secrets nor your tokens leave infrastructure you control.

## Honest comparison: browser sandbox vs. full computer-use sandbox

This is the section that matters most, because the right answer genuinely depends on what your task is, and a browser tool is the wrong choice for a lot of "computer use" work. Here is the comparison without spin.

| Dimension | Browser sandbox (BrowserBash over CDP to containerized Chrome) | Full computer-use sandbox (desktop agent in a container/VM) |
|-----------|-----------------------------------------------------------------|--------------------------------------------------------------|
| Scope | Web browsers only | Any app with a screen — browser, native apps, installers, OS dialogs |
| How it perceives | Reads the DOM | Reads screenshots (pixels) |
| Cost per step | Lower — no image per turn | Higher — an image ships every turn |
| Speed | Faster on multi-step web flows | Slower; vision round-trips add up |
| Determinism | Higher — DOM-based, survives layout shifts | Lower — coordinates are brittle across viewports/layouts |
| Isolation unit | One containerized Chrome | Whole virtual desktop / microVM |
| CI fit | Strong — exit codes, NDJSON, recordings out of the box | Weaker out of the box — you build the harness |
| Best for | Login, forms, checkout, scraping, web E2E checks | True desktop automation, legacy thick clients, cross-app workflows |

The honest reading: **if the task lives entirely in a browser, the browser sandbox wins on every axis that matters for that task** — cost, speed, determinism, and CI ergonomics. You are not paying a frontier model to stare at pixels when the page underneath has a perfectly readable DOM.

But the moment the task leaves the browser — driving a native desktop app, clicking through an OS installer, automating a legacy Windows client, moving files around a real desktop, or stitching several applications together — a browser-scoped tool simply cannot do it, and a full computer-use agent is the correct choice. No amount of CDP cleverness changes that. BrowserBash does not control the operating system; it controls Chrome. For the desktop case, you want a general computer-use model or a traditional RPA tool, and you sandbox *that* with the same four layers, just at the VM level instead of the container level. There is a longer treatment of where these categories diverge in the [Anthropic Computer Use alternatives](https://browserbash.com/blog) guide on the blog.

So the decision tree is short. Is the work a web task? Use a sandboxed browser — it is cheaper, faster, and more deterministic. Is it a desktop or cross-application task? Use a sandboxed computer-use agent or RPA, and accept the higher cost as the price of generality.

## Where prompt injection fits, and why network policy carries the load

It is tempting to think the sandbox's job is to stop the agent from "going rogue" on its own. In practice the more common danger is external: a web page, a search result, a support ticket, or an email the agent reads contains instructions that hijack its goal. The agent, being agreeable, follows them. This is prompt injection, and there is no model-side fix you can fully rely on today.

A sandbox does not prevent the model from being fooled. What it does is cap what a fooled model can accomplish. Deny-all egress means an injected "exfiltrate the session cookie" has nowhere to send the cookie. Scoped credentials mean an injected "go delete the production records" runs as an account that cannot see production. An ephemeral filesystem means an injected "download and run this" leaves nothing behind after teardown. The model can still be tricked; the trick just does not pay off.

This is why I keep pushing network policy and credential scoping ahead of model choice. A more capable model is marginally harder to fool but still foolable; a tight sandbox makes the fooling moot. The DOM-based approach helps a little here too — because BrowserBash works against page structure rather than rendering arbitrary remote images into the model's context the way a screenshot loop does, one class of image-based injection is simply off the table. It is not a complete defense, and I would not sell it as one, but it is one fewer attack surface. There is a focused piece on this in the [learn hub](https://browserbash.com/learn) if you want the threat model in detail.

## Putting it in CI: the same objective, a disposable browser, a clean verdict

The payoff of all this structure shows up in continuous integration, where unattended runs and untrusted inputs collide. The pattern is: bring up a containerized Chrome as a service, run your plain-English checks against its CDP endpoint, collect NDJSON and recordings, and tear the container down. Because the objective is just English, the same check that you debugged locally runs unchanged in the pipeline — you are not maintaining selectors that rot every sprint.

A Markdown test keeps this reviewable. You write the flow once in a `*_test.md` file with `{{variables}}` for environment-specific values and masked secrets for credentials, commit it like any other test, and run it in the pipeline:

```bash
# Run a committed Markdown test against the sandboxed browser, machine-readable output
browserbash testmd run checkout_test.md \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser \
  --agent
```

The exit code tells the pipeline what happened — 0 for pass, 1 for a failed assertion, and separate codes for usage and runtime problems — so you can fail the build, open an issue, or gate a deploy on the result. The NDJSON stream gives your tooling step-by-step structured events, and `--record` leaves a video and trace attached to the run for the inevitable "why did it do that" moment. The browser that did all this was a container that no longer exists by the time the job finishes. That is the shape of a computer use sandbox done right for web work: isolated, reproducible, and auditable, with nothing dangerous left running.

If you are wiring this into a specific provider's CI, the [tutorials](https://browserbash.com/tutorials) cover the per-platform plumbing, and real-world flows are written up in the [case studies](https://browserbash.com/case-study).

## A pragmatic checklist before you let it run unattended

Before you point any agent — browser or desktop — at something it can damage, walk this list. None of it is exotic, and skipping any one item is how "it worked in the demo" becomes "it deleted the staging data."

- **The browser runs in a container, not on your host.** Ephemeral filesystem, empty profile, `--rm` on exit.
- **Egress is deny-by-default.** Only the domains the task needs are reachable.
- **Credentials are scoped and disposable.** A test account with least privilege, secrets masked, never real personal logins.
- **You attach over CDP**, so the agent's reach ends at one browser in one box, not your machine.
- **You capture evidence.** `--record` for video and trace, `--agent` for NDJSON, so failures are watchable and pipelines are scriptable.
- **You tear down after every run** to return to a known-clean state.
- **You picked the right tool for the scope.** Browser task: sandboxed browser. Desktop task: sandboxed computer-use agent or RPA — be honest about which one you actually have.

Run that checklist and a misbehaving agent costs you a container restart. Skip it and it can cost you a great deal more.

## FAQ

### What is a computer use sandbox?

A computer use sandbox is an isolated environment — usually a container or virtual machine — where an AI agent can click, type, and run tasks without being able to touch your real host, files, or accounts. It combines process isolation, an ephemeral filesystem, restricted network egress, and scoped credentials so that when the agent makes a mistake or is tricked, the damage is confined to something you can throw away and reset. For browser tasks specifically, the sandbox is often just a containerized Chrome the agent attaches to over the DevTools Protocol.

### How do I attach an AI agent to a containerized Chrome?

You launch Chrome inside a container with remote debugging enabled, which exposes a CDP WebSocket endpoint, then point your agent at that endpoint instead of at a local browser. In BrowserBash you do this with the cdp provider and a cdp-endpoint flag, handing it the container's WebSocket URL. The agent then drives the browser that lives in the container, never your host, and when the container stops the whole session disappears.

### Can BrowserBash do general OS-level computer use?

No, and that is intentional. BrowserBash is browser-scoped: it automates web browsers by reading the DOM, which makes it cheaper, faster, and more deterministic for web tasks than a screenshot-based desktop agent. For true desktop automation — native apps, OS dialogs, installers, or cross-application workflows — you want a general computer-use model or an RPA tool instead, sandboxed at the virtual-machine level.

### Does a sandbox stop prompt injection?

A sandbox does not stop a model from being tricked by malicious instructions on a page, but it caps what a tricked model can actually do. With deny-by-default network egress, an injected attempt to exfiltrate data has nowhere to send it; with scoped test credentials, an injected destructive command runs as an account that cannot reach anything important; with an ephemeral filesystem, anything downloaded vanishes on teardown. Isolation does not make the model smarter — it makes the model's mistakes cheap.

Ready to try the browser-scoped version? Install the CLI with `npm install -g browserbash-cli`, point `--provider cdp` at a containerized Chrome, and run a plain-English check in a box you can throw away. An account is optional and free at [browserbash.com/sign-up](https://browserbash.com/sign-up).
