---
title: Automate data entry in web apps
description: "Automate data entry web workflows with a plain-English AI agent that drives a real browser, fills forms from your data, and runs the same job on repeat."
date: 2026-06-16
category: use-case
---

If you want to automate data entry web work, the problem is almost never one form. It's the same form, three hundred times, with a different row of data each pass — a CRM you paste new leads into every Monday, a supplier portal that wants each invoice keyed by hand, an internal admin tool with no bulk import and no public API. The data already exists in a spreadsheet or a database. The web app just refuses to take it any way except one field at a time, through a human. That gap between "I have the data" and "the app only accepts it via typing" is where data-entry automation lives, and it's a surprisingly stubborn gap to close.

This guide is about repeatable form filling: not the one-off "fill this signup once" case, but the recurring job you'd happily never touch again. I'll walk through why these workflows resist normal scripting, where an AI browser agent helps and where it doesn't, and how to set up a loop with [BrowserBash](https://browserbash.com/features), a free open-source CLI, so the same objective runs over every row of your data with the values swapped in. I'll also be honest about the failure modes, because a data-entry bot that silently fat-fingers 5% of records is worse than doing it by hand.

## Why data entry into web apps is so hard to automate

On paper, data entry looks trivial. You have values; the form has fields; type the values into the fields. In practice three things conspire against you.

First, **the apps that need data entry most are the ones least built for it.** Legacy procurement systems, hospital admin panels, government portals, white-label SaaS dashboards, a vendor's order-entry screen — these rarely ship a bulk-upload button or a documented API. If they had one, you wouldn't be reading this. The absence of an import path is precisely why the work fell to humans, and why it keeps falling to humans.

Second, **the markup is hostile to scripts.** Forms are the most JavaScript-heavy part of any app. Fields render conditionally, dropdowns are custom div-based widgets instead of native `<select>`s, addresses trigger autocomplete that hijacks your typed value, validation fires on blur and rearranges the layout. A Selenium or Playwright script that pins every field to a CSS selector works the day you write it and breaks the next time someone ships a redesign. For a one-off that's annoying; for a recurring job it's a maintenance tax you pay forever.

Third, **the data is messy.** Real source data has a "State" column that's sometimes "CA" and sometimes "California," a phone number in four different formats, a notes field with line breaks the form rejects. A rigid script either crashes on the first odd row or, worse, enters garbage without noticing. Humans handle this ambiguity instinctively. Most automation can't.

So the realistic goal isn't "zero humans." It's: handle the 90% of rows that are clean, automatically and on a schedule, and surface the weird ones for a person to look at. Get that right and you've reclaimed most of the hours without pretending the messy 10% doesn't exist.

## Two ways to automate it, and why selectors lose for this job

Broadly there are two families of approach to driving a web form without a human.

**Selector-based scripting (Playwright, Selenium, Cypress, classic RPA recorders).** You identify each field by a selector — `#firstName`, `input[name="email"]`, an XPath — and the script types into it. This is fast, deterministic, and cheap to run. It's also brittle in exactly the way data-entry targets punish: the apps change, your selectors rot, and a recorded RPA macro that clicked pixel coordinates last quarter now clicks the wrong button. For a stable internal app you control, selectors are great. For a third-party portal you don't control and that redesigns on its own schedule, you're signing up for endless repair work.

**Intent-based AI agents (BrowserBash, and the broader "computer-use" category).** You describe the objective in plain English — "enter this customer record into the new-lead form and submit" — and a model looks at the live page, decides which field is the email field, types the value, and moves on. No selectors. When the layout shifts, the agent re-reads the page and adapts instead of throwing a `NoSuchElementException`. The cost is that it's slower per run and non-deterministic: the same step can resolve slightly differently twice, and a weak model can misread an ambiguous label.

Here's an honest side-by-side for the repeatable-data-entry use case specifically:

| Factor | Selector scripts (Playwright/Selenium) | AI browser agent (BrowserBash) |
| --- | --- | --- |
| Survives a UI redesign | Poor — selectors break, you rewrite | Good — agent re-reads the page each run |
| Speed per record | Fast (sub-second steps) | Slower (model reasons each step) |
| Determinism | High — same path every time | Lower — varies run to run |
| Handles messy/ambiguous input | Poor without custom code | Better — model interprets intent |
| Setup effort for a new form | High — inspect DOM, write selectors | Low — write a plain-English objective |
| Cost to run | Near zero | $0 on local models; API cost if hosted |
| Best fit | Stable apps you own | Third-party portals, changing UIs |

Neither wins outright. The decision section later gets specific. For now: if your data-entry target is a moving, selector-hostile app you don't control, the agent approach removes the maintenance that makes scripting miserable. If it's a rock-solid internal form, a plain Playwright script may be the more sensible, cheaper tool — and I'd tell you to use it.

## How BrowserBash approaches repeatable form filling

BrowserBash is a command-line tool from The Testing Academy. You install it with npm, give it a plain-English objective, and an AI agent drives a real Chrome browser step by step — no selectors, no page objects. It returns a verdict (passed/failed) plus any structured values it extracted along the way. The same engine people use for testing works for data entry, because "fill this form with these values and confirm it saved" is just a test with a payload.

Install and a first run look like this:

```bash
npm install -g browserbash-cli
browserbash run "Go to the new-lead form, enter name 'Asha Rao', email 'asha@example.com', company 'Northwind', then click Save and confirm a success message appears"
```

A few properties matter for data entry specifically.

**It drives a real browser.** Not a headless fetch, not an API guess — actual Chrome, the same rendering and JavaScript a human sees. Custom dropdowns, autocomplete widgets, and conditionally rendered fields behave the way they do for a person, which is the whole point when the app has no API.

**It runs locally and free by default.** The default model resolution is Ollama-first: if you have a local Ollama install, BrowserBash uses it (`ollama/<model>`), nothing leaves your machine, and your model bill is $0. If you've set `ANTHROPIC_API_KEY` it'll use Claude; with `OPENAI_API_KEY`, GPT-4.1; otherwise it tells you what to configure. For data entry that touches customer records or anything sensitive, the local path matters — your source rows never go to a third party.

**It keeps a record of every run.** Each run is saved on disk under `~/.browserbash/runs` (capped at 200, secrets masked). When you've entered three hundred records overnight, you want to be able to look back at which ones passed and which threw a verdict of failed. There's also an optional fully-local dashboard at `browserbash dashboard` (localhost:4477) if you'd rather browse runs in a UI than read JSON.

You don't need an account to run any of this. There's an optional cloud dashboard you can opt into later, but the default is local-only.

## Templating: the trick that turns one objective into a batch

A single `run` command fills one form once. Repeatable data entry needs the same objective applied to every row of your data with the values swapped in. BrowserBash has two ways to get there.

### Markdown tests with `{{variables}}`

BrowserBash supports committable markdown test files (named `*_test.md`) where each list item is a step and you template values with `{{variable}}` syntax. This is the cleanest way to express "the same data-entry flow, parameterized." A file might look like a numbered list of plain-English steps — navigate, type `{{name}}` into the name field, type `{{email}}` into email, click Save, confirm success — and you run it with:

```bash
browserbash testmd run ./lead_entry_test.md
```

Two features here earn their place in real data-entry work. First, `@import` composition lets you factor a shared login or setup flow into one file and reuse it across many entry scripts, so you're not pasting the same "log in to the portal" steps into every job. Second, variables you mark as secret are masked as `*****` in every log line and in the on-disk run store — so a portal password or API token used to reach the form never lands in plaintext in your logs. After each run it writes a human-readable `Result.md`, which is handy when you need to show someone what happened without making them parse machine output.

### Driving the loop from your own script

For a genuine batch — three hundred rows from a CSV or a database — you wrap BrowserBash in a small loop in whatever language you already use, feeding one record per invocation and reading the result. The flag that makes this clean is `--agent`, which switches output to NDJSON: one JSON object per line, no prose to parse. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate",...}` and the final line is a `run_end` object with a status of `passed`, `failed`, `error`, or `timeout`, plus any `final_state` the agent extracted. Exit codes mirror that: 0 passed, 1 failed, 2 error, 3 timeout.

That's the contract you build a batch around. Loop over your rows, call `browserbash run` per row with the values interpolated into the objective and `--agent` on, and branch on the exit code — append passes to a "done" file, route anything non-zero to a "needs human" queue. Because exit codes and NDJSON are stable, you never scrape prose to find out whether a record went in. The [agent mode docs](https://browserbash.com/learn) cover the event shape if you want to build richer reporting than pass/fail.

A realistic loop sketch, language-agnostic:

```bash
browserbash run "Enter customer $NAME, email $EMAIL, plan $PLAN into the signup form and click Create Account; confirm the account was created" --agent --record
```

Run that once per row from your shell or task runner, capture the exit code, and you have a batch. The `--record` flag is the next piece.

## Verification: the part most data-entry bots skip

This is where I want to slow down, because it's the difference between a tool you trust overnight and one that quietly corrupts your data.

The dangerous failure in data entry isn't a crash. A crash is loud; you see it and fix it. The dangerous failure is the silent one — the agent types into the wrong field, picks the wrong dropdown option, or submits a form that the app rejected with a validation error the bot didn't notice. The record looks entered. It isn't, or it's wrong. You find out three weeks later when a customer complains.

BrowserBash's design pushes against this in two ways. First, every objective should end with a **confirmation step** — "click Save *and confirm a success message appears*," not just "click Save." The agent's verdict then reflects whether the app actually accepted the data, not merely whether a button got clicked. Write your objectives so the success criterion is explicit and observable on the page, and a misfire shows up as a `failed` verdict instead of a false positive.

Second, **artifacts**. The `--record` flag captures a screenshot and a `.webm` session video of the run (via bundled ffmpeg); on the builtin engine it also writes a Playwright trace. For a batch that ran while you slept, the videos and screenshots are your audit trail — when a record lands in the "needs human" queue, you watch the 20-second clip instead of re-deriving what went wrong. For regulated data entry where you have to prove what was entered and when, that recording is not a nicety.

No tool removes the need to spot-check. The right mental model is: the agent does the typing and self-reports pass/fail per record; you sample the passes occasionally and review every failure. That's still a massive reduction from keying every row by hand, and it's honest about where the human stays in the loop. If you want to go deeper on getting agents to verify their own work, the [tutorials](https://browserbash.com/tutorials) walk through confirmation patterns.

## A worked example: nightly lead import into a CRM

Make it concrete. Say marketing drops a CSV of new leads each evening and someone keys them into a CRM that has no bulk import on your plan. Here's the shape of automating it.

**The data.** A CSV with columns like name, email, company, source, plan. Some rows are clean; a few have a blank company or a malformed email. You decide up front: malformed-email rows get skipped and flagged, not guessed at.

**The objective.** One parameterized data-entry flow: log in to the CRM (using secret-marked credentials so they're masked in logs), open the new-lead form, fill each field from the row, set the source dropdown, click Create, and confirm the lead appears with a success toast. Expressed as a markdown test with `{{name}}`, `{{email}}`, and friends, or inline in a `run` objective with shell variables.

**The loop.** A short script reads the CSV, skips rows failing a basic email check (routing them to a review file), and for each remaining row calls BrowserBash with `--agent` and `--record`. It reads the exit code: 0 means done, anything else appends the row plus the path to its recording into a `needs-review.csv`.

**The morning after.** You open `needs-review.csv`, find maybe a dozen rows out of three hundred — the malformed emails you skipped on purpose, plus a handful where the agent hit an unexpected modal or an ambiguous duplicate-detection prompt. You watch those clips, key them by hand in ten minutes, and you're done. The other 288 went in overnight, each with a recorded confirmation.

That's the realistic win. Not "fire the data-entry team." It's "the boring 95% happens unattended and self-verifies, and humans spend their attention only on the genuinely ambiguous rows." For internal-tool and back-office flows like this, BrowserBash's [internal-tools angle](https://browserbash.com/blog) goes further on the back-office case.

## Picking a model: the honest part

Here's where I'll be blunt, because it's the single thing that most determines whether your data-entry automation actually works.

Long multi-step form flows are hard for small models. A login plus a ten-field form plus a confirmation is a long chain of reasoning where one wrong step poisons the rest. Very small local models — roughly 8B parameters and under — are flaky on exactly this kind of long objective. They'll nail a two-field login and then lose the plot on field seven of a real form. If you test BrowserBash with a tiny model and conclude AI form filling "doesn't work," the model was the problem, not the approach.

The sweet spot for data entry that you actually depend on:

- **A mid-size local model.** A Qwen3 or Llama 3.3 70B-class model running on Ollama gives you genuine multi-step reliability while keeping everything local and your model bill at exactly $0. If your data is sensitive and your hardware can run a 70B-class model, this is the configuration to aim for.
- **A capable hosted model** for the hardest flows or when you can't run a big local model. Pin it explicitly:

```bash
browserbash run "Log in and enter the supplier invoice from row 12 into the AP form, then confirm it saved" --model claude-opus-4-8 --record
```

You can also point at OpenAI's GPT-4.1, Google's Gemini 2.5 Flash via the Stagehand engine, or any model through OpenRouter with `--model openrouter/<vendor>/<model>`. The trade is the usual one: hosted models cost money per run and your data transits a third party; local models are free and private but need real hardware to be reliable on long flows. For recurring data entry where reliability is the whole point, don't cheap out on the model — a flaky model isn't a bargain, it's a data-integrity risk. The [pricing page](https://browserbash.com/pricing) lays out that the tool itself is free; the only spend is optional hosted-model API usage.

## Where this runs: local Chrome and beyond

By default BrowserBash drives your own local Chrome (the `local` provider), which is the right call for most data-entry work — your data and credentials stay on your machine. But the provider is swappable, which matters for two scenarios.

If you're running the batch on a server or in CI with no display, you'll want it headless and possibly pointed at a remote browser. BrowserBash supports a `cdp` provider for any Chrome DevTools endpoint via `--cdp-endpoint ws://...`, plus hosted browser providers (Browserbase, LambdaTest, BrowserStack) if you need to run at scale or across environments you don't maintain. Those need their respective API keys, and LambdaTest/BrowserStack automatically use the builtin engine. For most teams automating data entry, none of that is necessary — local Chrome on the machine that already has the data is simplest and safest. Reach for remote providers only when display-less servers or scale force your hand.

On the interpretation side, BrowserBash ships two engines. The default `stagehand` engine (MIT, by Browserbase) uses act/extract/observe primitives and self-heals when the page shifts — well suited to the moving-target forms data entry tends to involve. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright, used automatically for LambdaTest/BrowserStack and worth a try if a particular form gives the default trouble. Switch with `--engine builtin`. You won't usually need to think about this; the default handles ordinary forms fine.

## When to automate data entry this way, and when not to

A balanced read, because the wrong tool wastes more time than it saves.

**Reach for an AI browser agent like BrowserBash when:**

- The target app has **no bulk import and no usable API** — the classic data-entry trap.
- The form is **selector-hostile or changes often** — third-party portals, vendor systems, white-label dashboards you don't control.
- Your source data is **somewhat messy** and benefits from a model interpreting intent rather than a script that crashes on the first odd value.
- **Privacy matters** and you can run a capable model locally, keeping customer data on your own machine for a $0 model bill.
- The volume is **meaningful but not extreme** — dozens to a few hundred records per run, where per-record latency is acceptable overnight.

**Stick with selector-based scripting (Playwright/Selenium) or proper RPA when:**

- The app is **stable and you control it** — selectors won't rot, and deterministic speed wins.
- You need **thousands of records per minute** — model-per-step latency won't keep up; a tuned script will.
- The flow demands **bit-for-bit determinism** every run, with zero tolerance for a model interpreting a field differently twice.

**And reach for neither — go fix the source — when** the app *does* have an API or a bulk-upload endpoint you overlooked. Automating the UI when a clean import path exists is doing it the hard way. Check for that first; UI automation is the answer when there's genuinely no better door.

Most teams have a mix. A reasonable pattern: agent-driven entry for the messy external portals, plain Playwright for the stable internal form, and a real import wherever an API exists. BrowserBash's job is the first bucket — the forms that defeat scripts and have no back door. If you want to see how others structure these flows, the [case studies](https://browserbash.com/case-study) cover real automation setups.

## Getting started in ten minutes

You don't need to commit to a batch pipeline to see whether this fits. Install it, point it at one real form with one real record, and watch what happens:

```bash
npm install -g browserbash-cli
browserbash run "Open the new-lead form, enter name 'Test User', email 'test@example.com', company 'Acme', click Save, and confirm a success message" --record
```

Requirements are modest: Node 18 or newer and Chrome for the local provider. If you have Ollama installed, it runs free and local out of the box; if not, set an API key and pin a model. Watch the recording, read the verdict, then parameterize the objective with `{{variables}}` in a markdown test and run it against five rows. If those five go in clean, scale to fifty. If they don't, you've learned exactly which fields confuse the agent — usually a custom dropdown or an ambiguous label — and you can sharpen the objective or step up the model before you trust it with three hundred. That incremental path, one record to five to fifty, is the safe way to roll out any data-entry automation, and it's how you find the messy-row edge cases before they find you.

## FAQ

### Can I automate data entry into a web app that has no API?

Yes — that's the main use case. When an app has no bulk import and no public API, the only way in is the UI, which is exactly what an AI browser agent drives. BrowserBash opens a real Chrome browser, reads the form, and types your values into each field the way a person would, so it works on portals and internal tools that never exposed a programmatic endpoint.

### How do I run the same form-filling flow over many rows of data?

Write the flow once as a BrowserBash markdown test using `{{variable}}` placeholders for the values, then feed it one row at a time, or wrap the `run` command in a short loop in your own script. Turn on `--agent` for clean NDJSON output and branch on the exit code (0 means the record went in, non-zero means it needs a human). That gives you a repeatable batch where only the data changes between runs.

### Is it safe to use for sensitive customer data?

It can be, if you run it locally. BrowserBash defaults to a local Ollama model and your local Chrome, so nothing leaves your machine and there's no model bill. Credentials and values you mark as secret are masked as asterisks in every log line and in the on-disk run store. Avoid the optional cloud upload for sensitive jobs and keep everything on the local path.

### Why does the agent enter the wrong value sometimes?

Usually it's the model, not the approach. Very small local models (8B and under) lose track on long multi-step forms and can misread ambiguous fields. Move to a mid-size local model like a Qwen3 or Llama 3.3 70B-class, or a capable hosted model, and reliability jumps. Also end every objective with an explicit confirmation step so a misfire surfaces as a failed verdict instead of slipping through as a false positive.

Repeatable data entry is one of the clearest wins for an AI browser agent: the data already exists, the only obstacle is a form that demands a human, and the work is identical every time except for the values. Start small, verify every record, and let the boring rows run themselves.

```bash
npm install -g browserbash-cli
```

Ready to go further? Set up the optional cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up) — though no account is needed to run any of this locally.
