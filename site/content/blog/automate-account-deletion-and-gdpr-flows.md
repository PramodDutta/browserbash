---
title: Automate Account Deletion & GDPR Flow Testing
description: "Automate account deletion testing and GDPR data-export flows in plain English, with an AI agent that drives real Chrome and records video proof for audits."
date: 2026-03-28
category: use-case
---

Most teams test the happy path religiously and the goodbye path almost never. You automate account deletion testing once, when legal asks for it, and then it sits in a drawer until the next audit. That is a problem, because the delete-my-account flow and the data-export flow are exactly the two journeys a privacy regulator will ask you to prove. They are also the two journeys nobody on the product team uses day to day, which means they rot quietly until someone notices the "Download my data" button has been silently 500-ing for three weeks. This guide walks through how to verify those GDPR flows by describing them in plain English, having an AI agent drive a real Chrome browser to carry them out, and capturing a video recording you can hand to an auditor. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command below is real and runnable.

The angle here is narrow on purpose. There are dozens of articles about testing signup and checkout. There are almost none about testing deletion, even though "the right to erasure" and "the right to data portability" are written into Article 17 and Article 20 of the GDPR and carry real fines when they fail. Off-the-shelf recorded tests from tools like Ghost Inspector can click through a deletion form, but a recorded click does not produce the thing an auditor actually wants: a timestamped, watchable artifact that shows the account was requested for deletion, the confirmation appeared, and the user could no longer log in afterward. That gap is what this piece is about.

## Why account deletion and data export are the flows you forget to test

Walk through any year-old end-to-end suite and count how many tests touch the deletion flow. The answer is usually zero or one. The reason is structural, not lazy: deletion is destructive. A test that genuinely deletes an account needs a fresh account to delete every single run, which is annoying to set up, so most teams skip it. Data export is skipped for a related reason — verifying a downloaded ZIP of personal data is awkward in a record-and-replay tool that only knows how to click and assert on text.

So these flows live in a blind spot. And blind spots on privacy features are expensive in a specific way. When a user clicks "Delete my account" and nothing happens, they do not file a bug. They file a complaint with a data protection authority, because they asked you to erase their data and you appeared to ignore them. The same is true for "Download my data": under the right to portability, a user is entitled to a machine-readable copy of what you hold, and a broken export button is a compliance failure, not a cosmetic one.

### The four things an auditor actually asks you to prove

When a GDPR audit or a Data Protection Impact Assessment lands on your desk, the requests are concrete. You will be asked to show, with evidence:

- A logged-in user can **find and trigger** the "Delete my account" path without contacting support.
- The deletion request is **confirmed back to the user** (a confirmation screen, an email, or both).
- After deletion, the **credentials no longer work** — the account is genuinely gone, not just hidden.
- A user can **request and receive an export** of their personal data in a usable format.

Three of those four are pure UI journeys an AI agent can drive and verify end to end. The fourth — the contents of the export file — needs a human or a backend check, and an honest guide says so up front rather than pretending the browser layer covers everything.

## How an AI agent automates account deletion testing differently

BrowserBash flips the usual contract. Instead of recording clicks against a brittle map of the page, you write the objective in plain English and hand it to an AI agent. The agent opens a real Chrome browser, reads the live page on every step the way a person would, decides which element matches your intent, acts, and then judges whether the goal was met. It returns a verdict — passed or failed — plus structured results. There are no selectors, no page objects, and no recording to re-capture when the settings page gets a redesign.

That last point matters more for deletion than for almost any other flow. Account settings pages are where products bury their least-loved UI. The delete button hides behind a "Danger zone" accordion, a "Manage account" tab, a second confirmation modal that makes you type the word DELETE, sometimes a re-authentication prompt. A recorded test pins itself to each of those steps and snaps the moment one moves. An agent reads "open account settings, find the option to permanently delete this account, confirm the deletion" and figures out the current layout at runtime.

Here is a full deletion journey as a single objective:

```bash
browserbash run "Log in to https://app.example.com with email {{TEST_EMAIL}} and password {{TEST_PASSWORD}}. Open account settings, find the option to permanently delete the account, and start the deletion. If a confirmation dialog appears asking to type the word DELETE or re-enter the password, do it. Verify a confirmation message appears saying the account is scheduled for or has been deleted." --record
```

The `--record` flag is doing the heavy lifting for the audit use case. It captures a screenshot and a full `.webm` session video via ffmpeg, on any engine. That video is the artifact you hand to an auditor: a watchable recording of the agent finding the delete option, confirming it, and reading back the success message. No recorded-test tool gives you that as a default output; you get a pass/fail log and maybe a final screenshot, not a continuous video of the journey.

### Verifying the account is actually gone

A confirmation message is necessary but not sufficient. The whole point of the right to erasure is that the account stops existing. So the real test has a second half: try to log back in and confirm you cannot. You can chain this as a second run that depends on the first, or describe it as one continuous objective.

```bash
browserbash run "Go to https://app.example.com/login and try to log in with email {{DELETED_EMAIL}} and password {{DELETED_PASSWORD}}. Verify that login fails and the account is not accessible — expect an error like 'account not found' or 'invalid credentials', not a successful dashboard." --record
```

If that run passes — login is correctly rejected — you have evidence that deletion did what it claimed. If it fails because the old credentials still work, you have caught a genuine, serious bug: a "deletion" that only soft-hides the account while leaving the login intact. That is precisely the kind of defect an auditor is trying to flush out, and it is invisible to a test that stops at the confirmation screen.

## Automating the GDPR data-export flow

The export side is the right-to-portability half of the same coin. The journey is usually: log in, go to privacy or account settings, click "Download my data" or "Export my information," and either get an immediate download or a "we'll email you a link" message. An agent handles the navigation and the trigger cleanly.

```bash
browserbash run "Log in to https://app.example.com with {{TEST_EMAIL}} and {{TEST_PASSWORD}}. Go to the privacy or data settings page, find the option to export or download my personal data, and request the export. Verify the page confirms the export was requested — either a download started or a message says a link will be emailed." --record
```

Here is the honest boundary. The browser agent can prove the export was *requested* and that the UI confirmed it. It cannot, on its own, open the resulting ZIP and assert that your home address and order history are inside and correctly formatted. That verification lives one layer down — a backend assertion, or a human spot-check of the downloaded file against what the user expects to be in it. Treat the agent as the front-half guard that proves the button works and the request fires, and pair it with a data-layer check for the contents. Pretending a UI agent validates the file payload would be dishonest, and it is exactly the kind of overclaim that gets a QA team burned in a real audit.

### Why video proof beats a green checkmark for compliance

There is a difference between knowing a test passed and being able to *show* a non-technical auditor that the flow works. A green checkmark in a CI log means nothing to a privacy officer or an external assessor. A 40-second `.webm` of the agent logging in, navigating to the danger zone, confirming deletion, and being locked out on the next login attempt is something they can watch and sign off on without reading any code.

If you want that evidence centralized rather than sitting in a folder on a CI runner, BrowserBash has an optional free cloud dashboard. It is strictly opt-in — you run `browserbash connect` once and add `--upload` to a run — and it gives you run history, the video recordings, and per-run replay in one place. There is no account required to run the tool at all; the dashboard is a convenience for teams that want a shared audit trail. Free uploaded runs are kept for 15 days, so for a long-term compliance archive you would still pull the artifacts down and store them yourself.

```bash
browserbash connect
browserbash run "Log in, delete the test account, and verify the confirmation appears" --record --upload
```

If you would rather nothing leave your machine, there is also a fully local dashboard — `browserbash dashboard` — that serves the same run history and recordings from localhost. For privacy-feature testing, where the whole point is data handling, a lot of teams prefer the local option on principle.

## Committing GDPR tests as living documentation

A one-off command is great for a manual check. For something a compliance auditor might ask about every year, you want the test committed next to your code, reviewable in a pull request, and runnable by anyone. BrowserBash supports markdown test files for exactly this. Each list item is a step, you can template values with `{{variables}}`, and any value you mark as secret is masked to `*****` in every log line — which matters a lot when the test logs in with real credentials.

Save this as `account_deletion_test.md`:

```bash
# Account Deletion — GDPR Right to Erasure

- Go to https://app.example.com/login
- Log in with email {{TEST_EMAIL}} and password {{TEST_PASSWORD!secret}}
- Open account settings and find the "Delete account" option
- Start the deletion and confirm it in any dialog that appears
- Verify a message confirms the account is scheduled for deletion
- Log out
- Try to log in again with the same credentials
- Verify the login is rejected and the account is no longer accessible
```

Run it with:

```bash
browserbash testmd run ./account_deletion_test.md --record
```

After the run, BrowserBash writes a human-readable `Result.md` next to the test, step by step, with the verdict. That file plus the `.webm` video is a tidy evidence package: the markdown shows the intended journey, the result shows what happened, and the video shows it happening. You can `@import` shared setup — say a common login fragment — across your erasure test, your export test, and your "deletion is permanent" test so you write the login steps once.

The secret masking is worth dwelling on for compliance work specifically. The marked `{{TEST_PASSWORD!secret}}` value never appears in the console output, the `Result.md`, or an uploaded log; it shows as `*****`. When the artifact you are producing is meant for an auditor's eyes, you do not want test credentials leaking into the very document that proves your privacy hygiene.

## Wiring deletion tests into CI without parsing prose

You do not want the only run of your deletion test to be the one a human triggers before an audit. Run it on a schedule, or on every deploy to staging, against a freshly seeded throwaway account. BrowserBash has an agent mode built for this: `--agent` emits NDJSON — one JSON event per line — on stdout instead of prose, and the process exits with a meaningful code. 0 means passed, 1 means failed, 2 is an error, 3 is a timeout. Your pipeline reads the exit code; no scraping of human-readable text.

```bash
browserbash run "Log in as the seeded test user, delete the account, verify the confirmation, then verify re-login fails" --agent --headless --record
```

The `--headless` flag keeps it quiet on a CI runner with no display, and `--record` still produces the video so a failed nightly run leaves you a recording to watch instead of a guess. For AI coding agents orchestrating this — a CI bot that decides what to do next based on the result — the NDJSON stream is structured and parseable line by line, which is the whole reason agent mode exists.

One practical note on seeding. Because deletion is destructive, the durable pattern is: create a disposable account at the start of the run (or via an API/test fixture), run the deletion journey against it, and let the run prove it is gone. That way the test is repeatable forever and never touches a real user's data.

## Where this AI approach is the better fit — and where it is not

Honesty matters more than a sales pitch, so here is the balanced read.

| Situation | Better fit |
| --- | --- |
| Settings/danger-zone UI that gets redesigned often | AI agent — adapts to layout changes without re-recording |
| You need watchable video proof for an auditor | AI agent with `--record` — continuous session video, not just a screenshot |
| You want a $0 model bill and nothing leaving your machine | AI agent on a local Ollama model + local dashboard |
| Pixel-exact assertion on a static, never-changing screen | A traditional recorded test or a hand-written Playwright assertion is fine and cheaper to run |
| Validating the *contents* of an exported data file | A backend/data-layer check, not a browser agent |
| High-volume, sub-second deterministic regression on a stable page | A coded selector-based test will be faster and more predictable |

A second honest caveat is about model choice, because it directly affects whether your deletion test is reliable. BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and auto-resolves a local Ollama install before falling back to `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`. You can genuinely run a $0 model bill on local models. But a deletion journey is a long, multi-step objective — log in, navigate a buried settings tree, handle a re-auth prompt, confirm a destructive action, then attempt a second login — and very small local models (roughly 8B and under) can get flaky on chains that long. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. OpenRouter exposes genuinely free hosted options such as `openai/gpt-oss-120b:free` if you want more horsepower without a bill, and you can bring your own Anthropic key for Claude if you already have one.

### Choosing where the browser runs

By default the agent drives your own local Chrome, which is perfect for development and for keeping everything on your machine. When you need to prove the flow works across browsers and operating systems for an audit — "does deletion work on Safari and on Windows Edge, not just my Mac Chrome?" — you can switch where the browser runs with a single `--provider` flag. It supports `cdp` for any DevTools endpoint, plus `browserbase`, `lambdatest`, and `browserstack` for cloud grids.

```bash
browserbash run "Delete the seeded test account and verify re-login is rejected" --provider lambdatest --record
```

Same plain-English objective, same recording, now executed on a cross-browser grid. For compliance evidence that has to cover more than one environment, that one flag saves you from maintaining separate scripts per browser. If you are weighing this against dedicated cross-browser platforms, the [features page](https://browserbash.com/features) and a few real [case studies](https://browserbash.com/case-study) lay out where the provider model fits.

## A realistic end-to-end deletion suite

Putting it together, a credible GDPR browser-test suite for a typical SaaS looks like three committed markdown tests plus a backend check:

1. **Erasure journey** — log in, trigger deletion, confirm, verify re-login fails. Recorded.
2. **Portability journey** — log in, request data export, confirm the request fired. Recorded.
3. **Export contents check** — a backend or human spot-check that the delivered file actually contains the user's data, correctly formatted. Not a browser test.
4. **Discoverability check** — verify a logged-in user can *reach* the delete and export options without contacting support, since "easy to find" is itself a GDPR expectation.

The first, second, and fourth are AI-agent runs with `--record`. The third is the layer the browser honestly cannot cover alone. Run the agent ones nightly against a freshly seeded account, archive the `.webm` files, and you have a standing evidence trail that takes minutes to produce instead of the half-day scramble that usually precedes an audit. The full command reference and the markdown-test format are documented in the [learn section](https://browserbash.com/learn), and the source is on [GitHub](https://github.com/PramodDutta/browserbash) under Apache-2.0 if you want to read exactly what it does before pointing it at real credentials.

If your team is already standardized on a recorded-test tool like Ghost Inspector for the rest of the suite, you do not have to rip it out. The pragmatic move is to keep recorded tests for your stable, high-traffic screens and add BrowserBash specifically for the destructive, redesign-prone, evidence-hungry flows — deletion and export — where the AI approach and the built-in video genuinely earn their place. More walkthroughs in this vein are on the [blog](https://browserbash.com/blog).

## FAQ

### How do you automate account deletion testing without deleting a real user?

Seed a disposable test account at the start of each run — via an API call, a test fixture, or a fresh signup — and point the deletion journey at that throwaway account. The agent then deletes it and verifies it is gone, so the test is repeatable forever and never touches production users' data. This is the standard pattern for any destructive flow, because the test consumes one fresh account per run by design.

### Can an AI agent prove a GDPR data export actually contains my data?

No, and you should be skeptical of any tool that claims it does at the browser layer. A browser agent can prove the export was requested and that the UI confirmed it, which covers the "the button works" half. Verifying the contents and format of the downloaded file is a backend assertion or a human spot-check, and a complete GDPR suite pairs the agent's UI journey with that data-layer check.

### What evidence does BrowserBash produce for a privacy audit?

With the `--record` flag, each run captures a screenshot and a full `.webm` session video of the agent carrying out the journey, on any engine. Markdown tests also write a human-readable `Result.md` showing each step and its verdict. Together the video, the result file, and the committed test give an auditor a watchable, timestamped record of the deletion or export flow working end to end, without needing to read any code.

### Does running these tests cost anything or require an account?

No on both counts. BrowserBash is free and open-source under Apache-2.0, runs with no account, and is Ollama-first, so it defaults to free local models with no API keys and a $0 model bill. The cloud dashboard and run uploads are strictly optional; there is also a fully local dashboard if you want nothing to leave your machine, which is a sensible default when the thing you are testing is data handling itself.

Ready to put your goodbye flows under guard? Install with `npm install -g browserbash-cli`, point it at a seeded test account, and add `--record` to get the video. If you later want a shared audit trail, an account is optional — grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
