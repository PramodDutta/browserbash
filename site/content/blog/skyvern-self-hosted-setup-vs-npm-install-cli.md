---
title: Skyvern Self-Hosted Setup vs an npm-Install CLI
description: "Standing up Skyvern means Docker, a database, and services; a CLI is one npm install. Compare setup time, dependencies, and local-run friction."
date: 2026-07-05
category: comparison
---

Say you are the one QA engineer on a small team, and Thursday afternoon someone in Slack asks: can we get an automated check on the new signup flow before Friday's release? You have heard AI browser agents can do this without anyone writing CSS selectors, so you go looking. Skyvern shows up near the top of every "AI browser automation" list, and it is genuinely impressive: vision-based reasoning, a workflow builder, native CAPTCHA and 2FA handling. You decide to self-host it so nothing touches a third-party cloud, and two hours later you have Docker Desktop running a Postgres container, a `.env` file you have edited twice because you missed a key, and a UI at `localhost:8080` you are still learning to navigate, without having run a single check yet. Meanwhile, someone on another team ran `npm install -g browserbash-cli` and had a pass/fail verdict on a comparable flow before your Postgres container finished accepting connections.

That is not Skyvern being badly engineered. It is two different products answering two different questions, and this article is about the one axis where they diverge the most: how much you have to stand up before you can run your first automated check.

## What self-hosting Skyvern actually involves

Skyvern is open source under AGPL-3.0, and its own documentation treats self-hosting as a first-class path, not an afterthought. There are two documented routes in.

The pip route: `pip install "skyvern[all]"`, which needs Python 3.11, 3.12, or 3.13. On Windows, the project's own setup notes add Rust and VS Code with C++ dev tools and the Windows SDK to that list, since part of the stack compiles native dependencies. Once installed, `skyvern quickstart` provisions a local SQLite database at `~/.skyvern/data.db` by default, or Postgres with `--postgres`, or an existing database via `--database-string`.

The Docker route: clone the repository, copy `.env.example` to `.env`, add your LLM provider's API key to that file, then run `docker compose up -d`. That brings up the API server, the UI, and a bundled Postgres service together, and the UI becomes reachable at `http://localhost:8080`.

Either way, once it is running, Skyvern is not a command you run and forget. It is a service: `skyvern run server` and `skyvern run ui` are separate long-lived processes (or `skyvern run all` for both together), with their own `skyvern status` and `skyvern stop server` / `skyvern stop ui` / `skyvern stop all` commands to manage them. That is appropriate for what Skyvern is: a workflow builder and an API with persistent run history, meant to be hit by more than one caller over time. It is just not a five-second install, and it was never trying to be.

## What one npm install actually gets you

BrowserBash, the free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, takes the opposite bet on form factor. There is one install command, and it is the same on macOS, Linux, and Windows because it is just Node:

```bash
npm install -g browserbash-cli
```

Node 18 or newer and a system Chrome install are the only prerequisites. The default `local` provider drives that existing Chrome directly (a stable-channel Playwright launch, no separate browser download to manage). There is no `.env` file you must create, no database to provision, no server process to start and later remember to stop. The command you run to automate something is the same command you run to see whether it worked:

```bash
browserbash run "Go to the staging signup page, create an account with test@example.com, and confirm the welcome screen shows that email back to the user"
```

That single line does the whole job. An AI agent reads the page, decides what to click and type, and hands back a pass or fail verdict plus any values you asked it to extract. Model calls are Ollama-first if you have a local model running, so this can be a $0, nothing-leaves-your-machine run with no API key at all; without Ollama, `auto` checks `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then `OPENROUTER_API_KEY`, in that order, before failing with setup guidance instead of guessing. The full model and engine story lives on the [BrowserBash features page](https://browserbash.com/features).

When the command exits, there is no process left running, no port occupied, no container to `docker compose down` before you close your laptop. Your machine looks exactly like it did before you started, except for a JSON run record on disk.

## Counting the actual steps, not a stopwatch

Timing claims are easy to fake and hard to trust, so instead of a stopwatch number, here is the honest version: the discrete steps each project's own documentation puts between you and your first check.

| Step | Skyvern (Docker Compose path) | BrowserBash |
| --- | --- | --- |
| 1 | Install Docker Desktop | Install Node 18+ (already on most dev machines) |
| 2 | Clone the Skyvern repository | `npm install -g browserbash-cli` |
| 3 | `cp .env.example .env` | *(nothing further required)* |
| 4 | Edit `.env` with an LLM API key | |
| 5 | `docker compose up -d`, wait for Postgres, the API, and the UI to come up healthy | |
| 6 | Open `localhost:8080` and learn the workflow builder | `browserbash run "<objective>"` |
| 7 | Build or describe your first task in the UI | Read the pass/fail verdict in the terminal |

That table is not a dig at Skyvern's design, it is a description of what "self-hosted platform" means by definition. A database, a server, and a UI have to exist and agree with each other before step one of your actual test run. A CLI skips that friction by not having those parts at all.

## Why the gap exists

This difference is architectural, not a matter of one team trying harder than the other. Skyvern's workflow builder, its REST API, and its persistent run history need somewhere to live, and a database plus a server process is the correct way to build that. If five people on an ops team need to see the same automation history, trigger runs from a script, and edit a flow visually, that is the shape you want: a service other things call into.

BrowserBash was designed around a narrower question: can one command drop into a test suite or a CI job and hand back a verdict? A process that starts, does its work, and exits with a status code answers that, the same way `eslint` or `jest` do not run a database either. Run history still exists (`~/.browserbash/runs`, capped and secret-masked), it is just files instead of a service, because nothing needs to query it except you.

## The costs that show up after day one

Setup friction is only half of the deployment-friction story. A self-hosted service keeps costing you attention long after the first `docker compose up -d`.

- **Upgrades.** A new Skyvern release typically means pulling new images and re-running migrations against your Postgres data, the normal cost of any stateful service.
- **Idle footprint.** The API server, the UI, and Postgres keep consuming RAM and disk whether or not anyone is actively testing anything, unless someone remembers to stop them.
- **CI is a different problem entirely.** Standing up a multi-container stack inside an ephemeral CI runner (wait for Postgres to accept connections, wait for the API to report healthy, only then call it) is real infrastructure work, even with Docker Compose doing the heavy lifting.

BrowserBash's CI story is a version bump and a run, because there is no service to keep alive between builds:

```bash
browserbash run "Log in with {{user}}/{{pass}} and confirm the dashboard loads without errors" \
  --agent --headless --timeout 120
```

`--agent` emits NDJSON, one JSON object per line, so a pipeline reads structured `step` events and a final `run_end` event instead of scraping a UI or polling an API for status. Exit codes map straight to CI pass/fail: `0` passed, `1` failed, `2` error, `3` timeout. There is no server to keep warm between builds and no database to back up, because the run's state lived for exactly as long as the process did.

## Where Skyvern's heavier footprint earns its keep

None of this makes BrowserBash "better" in general, it makes it lighter for a specific job. Skyvern's extra weight buys real things a CLI does not: a workflow builder non-engineer teammates can operate without opening a terminal, a persistent, queryable run history shared across a team by default, a REST API other systems can call without a wrapper, and, per Skyvern's own documentation, native handling for CAPTCHAs and 2FA flows that a plain CLI leaves entirely to you. If the job is unattended production automation, pulling invoices from a vendor portal every morning, say, run by an ops team rather than a single engineer, that always-on service is the right shape, and self-hosting it keeps that data off Skyvern's managed cloud in the process.

## Where the CLI model wins

BrowserBash's bet pays off for a narrower, very common job: verifying that something in a browser still works, as a step in a process a developer already owns.

Committable, plain-English tests live in the repo next to the code they check:

```markdown
# Signup smoke test

- Open https://staging.example.com/signup
- Fill in the signup form with test+{{run_id}}@example.com and a valid password
- Submit the form
- Verify the URL contains '/welcome'
- Verify the text 'Check your email to confirm your account' is visible
```

The two `Verify` lines above compile to real, deterministic Playwright checks, no model judgment call involved, so a pass means the condition was actually true on the page, not that an LLM felt good about a screenshot. Run the file with:

```bash
browserbash testmd run signup_smoke_test.md
```

and it writes a plain `Result.md` you can attach to a pull request. There is no separate service to authenticate against to see that result, because the terminal you already have open is the interface. Teams that have put BrowserBash's MCP server in front of an AI coding agent (`claude mcp add browserbash`) get the same story one level up: the agent calls a tool, gets a structured verdict back, and there was never a database in the loop. More of this pattern is covered on [browserbash.com](https://browserbash.com).

## Honest limits on both sides

Neither model is free of trade-offs.

Skyvern self-hosted is genuinely more setup than "one command," full stop: Docker Desktop or a Python 3.11-3.13 environment (plus, on Windows, Rust and C++ build tools), a database, a `.env` file, and two long-running processes to keep healthy. AGPL-3.0 is also a copyleft license, worth a conversation with whoever owns licensing if you are embedding the self-hosted server into something you distribute.

BrowserBash's trade-off is the mirror image. Because there is no server, there is no shared, always-on service for a team to hit from multiple tools without each of them installing the CLI, no built-in visual workflow builder for non-engineers, and no native CAPTCHA or 2FA handling out of the box. Small local Ollama models (roughly 8B parameters and under) also get flaky on long, multi-step objectives, so the free-and-local path has a real quality floor tied to model size, not just installation convenience.

## Picking by the actual question you have

If your real question is "how do I get a shared automation platform with a UI my ops team can run," budget the afternoon for Docker Compose, Postgres, and a `.env` file, because that is a real service and it deserves a real setup. If your real question is "how do I get one command that tells me pass or fail before I merge," the honest answer is that the setup is the install:

```bash
npm install -g browserbash-cli
```

No account, no database, and no Docker required to start.

## FAQ

### Do I need Docker to self-host Skyvern?

Not strictly. Skyvern also documents a pip-based path (`pip install "skyvern[all]"` plus `skyvern quickstart`) that defaults to a local SQLite database instead of Postgres, or accepts `--postgres` for a local Postgres instance. Docker Compose is the more common route because it bundles the API server, the UI, and the database together in one command, but either path ends with a server and a UI running as long-lived processes, not a single one-shot command.

### Can I run BrowserBash with zero setup beyond the install?

Yes, for the core CLI. `npm install -g browserbash-cli` plus Node 18 or newer is the entire requirement to run your first objective. There is no `.env` file, database, or server to start. Model calls default to a local Ollama install if one is running, or fall back to whichever hosted API key you have set as an environment variable, with a clear error if neither is present.

### Is self-hosting Skyvern actually free?

The software is open source under AGPL-3.0, and self-hosting avoids Skyvern's managed cloud usage charges, but you still need infrastructure (Docker and Postgres, or Python plus a database) and you pay your own LLM provider for model calls, since a self-hosted setup brings its own API key. It is free of Skyvern's cloud bill, not free of running a service.

### Is BrowserBash actually free with no hidden hosted costs?

Yes, for the CLI and everything that runs on your machine: both engines, every provider, the replay cache, `run-all`, the local dashboard, and NDJSON output are all part of the free, open-source install. The only cost that can appear is your own model provider's bill, and only if you point `--model` at a paid API instead of a local Ollama model. On the default local-Ollama path, that cost is $0.

### Which one fits a CI test gate better?

For a per-PR check, a single CLI command with clean exit codes (`0` passed, `1` failed, `2` error, `3` timeout) and NDJSON via `--agent` is simpler to wire into a pipeline than authenticating against a server and polling it for a result. Skyvern's API and webhook model fits scheduled, longer-running production jobs well; it was not built around the "one command is the gate" pattern a CLI gives you by default.

### Can I use both Skyvern and BrowserBash in the same stack?

Yes. They solve different problems well enough that plenty of teams could run both: Skyvern self-hosted for unattended production automation against third-party portals, and BrowserBash as the lightweight, git-committed test gate that runs on every pull request without anyone standing up a service for it.
