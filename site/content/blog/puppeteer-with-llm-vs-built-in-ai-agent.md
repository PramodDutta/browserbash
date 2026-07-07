---
title: Puppeteer + Your Own LLM vs a Built-In AI Browser Agent
description: "Wiring Puppeteer to an LLM means prompts, retries, and parsing you own. Compare that DIY stack to a CLI with the agent loop already built in."
date: 2026-07-05
category: comparison
---

Someone on your team says the quiet part out loud in standup: "What if we skip hand-written selectors and just have an LLM drive Puppeteer for the smoke tests?" It sounds like an afternoon project. Puppeteer is already a dependency, an API key is one environment variable away, and the demo that inspired the idea looked like fifteen lines of code: screenshot the page, ask a model what to click, call `page.click()`, repeat until a confirmation banner shows up. Three weeks later that fifteen-line prototype is closer to four hundred lines of retry logic, prompt tweaks, and JSON-parsing blocks nobody wants to touch, and it still can't tell you with confidence whether last night's CI run actually passed or the model just said it did. That gap, between wiring an LLM to Puppeteer yourself and reaching for a tool where that wiring already shipped, is the real subject here. The DIY path is far bigger than the demo makes it look, and it deserves an honest inventory before a sprint gets planned around the small version.

## Why "we already have Puppeteer, let's add an LLM" is such an easy pitch

Puppeteer is already in `package.json` for a large share of teams that scrape or test with Node, so "give it a brain" feels like a small step. You've seen the demo: extract the interactive elements on a page, hand them to a model, get back an instruction to click one. For a single, well-lit, three-step happy path, that really is close to fifteen lines: navigate, ask "where's the login button," click, done. The pitch that gets greenlit in planning is almost always this demo, generalized in someone's head to "and then we do this for the whole regression suite."

What actually gets built is not "add a brain to Puppeteer." It's an agent: something that perceives a page, decides an action, executes it, checks whether the action worked, and loops until it succeeds or gives up, reliably enough to trust in CI for months across real UI changes. That's a larger project than the sprint estimate assumed, and naming it accurately saves the next sprint from the same mistake.

## What puppeteer llm automation actually requires you to build

Split the loop into its real pieces and the size stops being abstract.

**Perception.** Turn a live page into something a model can reason about: an accessibility-tree-style list of interactive elements (tag, text, a computed selector) as JSON, or a screenshot for a vision model with bounding boxes. This alone outgrows "one `page.evaluate` call" fast, once you filter hidden elements, cap the list so a 900-node page doesn't blow the context window, and decide what counts as a "stable enough" selector with no id to use.

**The decision loop.** A system prompt describes the allowed actions (click, type, select, done) and their JSON shape; you send it the perception output plus the objective and history, and parse whatever comes back. Every provider has its own tool-use format, so the prompt and its parser stay coupled to whichever one you picked on day one.

**Grounding.** The model answers in terms of the elements you showed it, "click element 14." You still have to map that back to a real, attached DOM handle at the moment you act, because the page may have re-rendered between the perception call and the action call. A surprising share of the flakiness in these loops lives right here.

**The controller.** A loop with a max-turn cap, a "the model says it's done" exit, and a decision, on every turn, for what happens when a click throws, the model names an element that no longer exists, or the response isn't valid JSON at all.

Here's a trimmed but representative skeleton of that loop, aimed at a login-and-cart flow on a practice storefront:

```javascript
// puppeteer-llm-loop.js: a first pass at "let the model drive the browser"
import puppeteer from 'puppeteer';
import OpenAI from 'openai';

const openai = new OpenAI();
const MAX_TURNS = 12;

// Perception: turn the live DOM into something a model can reason about.
// A real version of this is well past a one-liner: filter hidden elements,
// cap the list so a busy page doesn't blow the context window, and decide
// what counts as a "stable enough" selector when there's no id to use.
async function describePage(page) {
  return page.$$eval('a, button, input, select, [role]', (els) =>
    els.slice(0, 200).map((el, i) => ({
      ref: i,
      tag: el.tagName,
      text: el.innerText?.slice(0, 80) || el.getAttribute('placeholder'),
      selector: el.id ? `#${el.id}` : null,
    }))
  );
}

async function nextAction(objective, elements, history) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4.1',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT }, // your rules for click/type/done
      { role: 'user', content: JSON.stringify({ objective, elements, history }) },
    ],
  });
  return JSON.parse(res.choices[0].message.content); // { action, ref, value, done }
}

async function run(objective, startUrl) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(startUrl);

  const history = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const elements = await describePage(page);
    const action = await nextAction(objective, elements, history);
    if (action.done) break;

    const target = elements.find((e) => e.ref === action.ref);
    if (!target?.selector) {
      history.push({ turn, error: 'model referenced an element with no stable selector' });
      continue; // retry the same turn? re-describe the page? give up? you decide.
    }

    try {
      if (action.action === 'click') await page.click(target.selector);
      if (action.action === 'type') await page.type(target.selector, action.value);
      history.push({ turn, action, status: 'ok' });
    } catch (err) {
      history.push({ turn, action, status: 'error', error: String(err) }); // now write the retry policy
    }
  }

  // Did the objective actually succeed? That check is still yours to write.
  await browser.close();
}
```

That's the loop. It does not include a retry policy for a bad model response, a way to confirm the objective actually succeeded rather than the model simply reporting `done: true`, redaction for any secret that just got serialized into a JSON payload, a cache so tomorrow's identical run doesn't cost the same tokens as today's, or any CI-shaped output. Each of those is its own subsystem, invisible in the demo that got this greenlit.

## The parts of the loop nobody puts in the conference talk

- **Success detection.** The first version checks `pageText.includes('Success')`. Real forms have ambiguous confirmation states and toasts that vanish in two seconds. Without a real assertion layer, you end up asking the model "did this work?", which makes your verdict the model's opinion rather than a checked fact.
- **Retry and recovery policy.** A parse failure, a stale element reference, a click that lands on the wrong node because the page reflowed mid-turn: each needs a decision (retry, re-perceive, abort), and you are the one writing and maintaining that decision tree.
- **Secrets.** Every perception payload is a JSON blob sent to a hosted API. If a password field or a customer's PII is on that page, it goes into the payload unless you write the redaction yourself, consistently, on every call, forever.
- **Cost at scale.** There is no caching layer by default. A hundred-test suite run on every commit means a hundred times N steps of model calls, every time, even for the exact green path that hasn't changed in three months.
- **Cross-model portability.** Swap OpenAI for Anthropic for a local Ollama model and you're rewriting the tool-call schema and the parser, because each provider's function-calling shape differs enough to keep you coupled to whichever one you picked first.
- **CI-shaped output.** A clean exit code and a machine-parseable event stream is its own subsystem: you decide what a "step" event looks like, what a final verdict looks like, and wire the process exit yourself, then keep that contract stable as the loop keeps changing.

That's roughly six subsystems hiding behind what the planning meeting called "add an LLM to Puppeteer."

## What a built-in agent loop removes from that list

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) CLI from The Testing Academy that is, structurally, the thing described above, already built. Install it with `npm install -g browserbash-cli`, write an objective in plain English, and an agent drives a real Chrome step by step, perceiving, deciding, executing, and checking the result, the same loop from the skeleton above, minus everything you'd otherwise write by hand.

There are two engines under the hood. The default, `stagehand`, is the MIT-licensed framework from Browserbase. The other, `builtin`, is an in-repo Anthropic tool-use loop that drives Playwright directly. Neither is a drop-in replacement for the Puppeteer library itself: this isn't "swap an import statement," it's "stop writing the browser-driving loop at all" and describe the outcome instead.

```bash
browserbash run "Go to https://app.thetestingacademy.com/playwright/ttacart/index.html, log in as standard_user with the password tta_secret, add the 'Test.allTheThings() T-Shirt (Red)' to the cart, and verify the cart shows 1 item"
```

One line, against a real practice storefront. No perception function, no JSON schema for actions, no grounding logic, and no controller loop, because none of that is code you own anymore.

## Turning the one-off script into a version-controlled test

A single command is fine for a spot-check, but the DIY version of this doesn't stay a script either, it turns into a family of scripts with duplicated login logic and no shared format. BrowserBash's answer is `*_test.md`: a Markdown file where each list item is a step, `{{variables}}` get substituted at run time, and anything marked as a secret is masked as `*****` everywhere it appears, in stdout, the result file, and the dashboard.

```markdown
# TTACart cart smoke test

Prose above the list is ignored by the parser; only the steps below run.

Run it:

    browserbash testmd run cart_test.md --secret password=tta_secret --agent

- Open https://app.thetestingacademy.com/playwright/ttacart/index.html
- Log in as standard_user with the password "{{password}}"
- Add the "Test.allTheThings() T-Shirt (Red)" to the cart
- Open the cart
- Verify the text "Test.allTheThings() T-Shirt (Red)" is visible
```

That last line matters more than it looks. `Verify the text "..." is visible` is not the model's opinion. BrowserBash's testmd parser matches a small, explicit grammar (URL contains, title is, text visible, a named button or link visible, an element count, a stored value equals) and, when a step matches, compiles it into a real Playwright check with no model in the judgment. A pass means the condition held; a fail means it didn't, the difference between the `if (pageText.includes('Success'))` you'd write by hand, or worse, asking the model "did this work?", and an assertion checked against the DOM. Steps that don't match still fall back to the agent's judgment, and that distinction is tracked rather than hidden.

## The replay cache: the cost curve a hand-rolled loop doesn't have

The biggest gap between a DIY Puppeteer-and-LLM loop and a tool built for this is what happens on run two. In the loop sketched above, every run calls the model, every time, forever, because nothing in that skeleton remembers what happened last time. Run the same test a thousand times in CI and you pay for a thousand runs' worth of tokens even though nothing on the page changed.

BrowserBash's replay cache exists specifically against that curve. The first green run records the actions the agent took. Every following run against the same origin replays that journal directly, no model call, until something on the page stops matching, at which point it falls back to the agent and the new path gets recorded in its place. In the builtin engine those journals are HMAC-signed with a local key, so an edited or foreign journal is ignored rather than trusted, and any cached step that touched a secret is re-templatized back to `{{name}}` before it's written to disk. Building all three of those properties yourself, record-and-replay, origin-pinned invalidation, and secret-safe storage, is easy to underestimate: most DIY loops ship the first and skip the other two.

## CI, exit codes, and letting an agent validate its own work

The DIY loop's last mile is turning "the model printed some JSON" into something a pipeline can act on. Add `--agent` to a BrowserBash run and it emits NDJSON, one JSON event per line, instead of prose:

```
{"type":"step","step":2,"status":"passed","action":"click","remark":"added item to cart"}
{"type":"run_end","status":"passed","summary":"cart shows 'Test.allTheThings() T-Shirt (Red)'","duration_ms":9800}
```

and the process exits with one of four explicit, frozen codes: `0` passed, `1` failed, `2` error, `3` timeout, a split most hand-rolled loops don't bother to track, since tracking it means designing an event schema and keeping it stable.

Once there's more than one test, `run-all` runs a directory of them with memory-aware concurrency and writes a JUnit report your CI already parses, and an official GitHub Action posts the verdict as a PR comment with a table and recording links. If you'd rather an AI coding agent validate its own UI changes directly, `claude mcp add browserbash` exposes run, testmd, and run-all as MCP tools, so Claude Code or any MCP-aware agent can check its own work against a real browser without anyone hand-writing that integration. And for a suite that runs unattended on a schedule with alerts on failure, or a hard stop before a runaway loop burns real API spend, that's monitor mode and a `--budget-usd` cap on the `cost_usd` figure already in `run_end`, not a cron job and a spreadsheet you maintain by hand.

## Where hand-rolling Puppeteer and your own LLM is still the right call

None of this makes the DIY approach wrong. It's the right call in a handful of specific situations.

**You're shipping the agent as a product feature, not a test.** If LLM-driven browsing is something your customers will use inside your SaaS, you need a library you can embed and customize, not a CLI you shell out to.

**You're researching the grounding technique itself.** If the interesting work is a novel way of mapping model output to DOM elements, or a different accessibility-tree encoding, you want the primitives exposed, not abstracted behind an engine choice.

**The job is high-volume, structured extraction against a DOM that doesn't move.** Ten thousand product rows with a known, stable structure is a job for plain Puppeteer with no model in the loop. Paying for an LLM call per row when the selector never changes is waste, DIY or otherwise.

**It has to live inside one existing process.** If the loop must run in-process inside a larger Node service rather than as a separate CLI invocation, embedding is a real constraint a CLI doesn't solve for you.

Outside those cases, a hand-rolled Puppeteer-and-LLM loop mostly reinvents a smaller, less battle-tested version of an agent loop that already exists, and the six subsystems from earlier are the tax you pay to relearn it.

## Puppeteer + your own LLM vs a built-in agent, side by side

| Dimension | DIY: Puppeteer + your own LLM | Built-in: BrowserBash |
| --- | --- | --- |
| What you write | Perception, prompt, parser, grounding, controller, retries | One English objective, or a `*_test.md` file |
| Pass/fail verdict | Whatever your code, or the model, decides "done" means | Deterministic `Verify` steps compiled to real checks where the grammar matches |
| Cost on repeat runs | Full model call, every step, every run, forever | First green run records; later runs replay near-free until the UI changes |
| Secrets in the loop | You write redaction and hope it's applied everywhere | Secret-marked variables masked in every log; cached actions re-templatized |
| Cross-model support | Rewrite the schema and parser per provider | `--model` flag: Claude, OpenAI, OpenRouter, or a free local Ollama model |
| CI integration | You design the event schema and exit codes | `--agent` NDJSON plus 4 frozen exit codes, `run-all`, JUnit, an official GitHub Action |
| Best at | Embedding in a product, custom grounding research, fixed-DOM scraping | Validating your own app's UI as part of the dev and CI loop |

Read that table as a division of labor. A raw Puppeteer-plus-LLM loop is the right foundation when the agent itself is the product. For validating your own UI, most of what that loop needs already exists as a CLI you install instead of a codebase you maintain, and the [features page](https://browserbash.com/features) has the fuller rundown.

## FAQ

### Is wiring Puppeteer directly to an LLM a bad idea?

No, but it's bigger than it looks. A basic loop (extract the DOM, ask the model, click) is genuinely a short script. Making it trustworthy in CI, with real success detection, retries, secret handling, and a bounded cost curve, is closer to building a small internal tool than adding a feature to an existing script.

### What's the biggest hidden cost of a hand-rolled Puppeteer + LLM loop?

Cost and reliability compound together. Without a caching layer, every run of every test calls the model again, so a suite that runs on every commit re-pays the full token bill indefinitely. Without a real assertion layer, "pass" quietly becomes "the model said it passed" instead of a checked fact.

### Does BrowserBash use Puppeteer under the hood?

No. Its default `stagehand` engine and its `builtin` engine both drive Playwright, not Puppeteer. This isn't a drop-in replacement for the Puppeteer library, it's a separate CLI you run instead of writing and maintaining the browser-driving loop yourself.

### Can I use my own LLM instead of building the agent loop myself?

Yes. BrowserBash is bring-your-own-model: the `--model` flag points it at Claude, OpenAI, OpenRouter, or a free local Ollama model, and by default it auto-detects a local Ollama model before falling back to a hosted key. You choose the model without writing the perception or retry code around it.

### How is a `Verify` step different from asking the model if a test passed?

`Verify` steps are matched against a small, explicit grammar (URL contains, text visible, element count, and a few others) and, when matched, compiled into a real Playwright check with no model in the judgment. A step that doesn't match still falls back to the agent's opinion, and BrowserBash tracks that distinction rather than hiding it, unlike a hand-rolled `pageText.includes(...)` check or a raw "did this work?" prompt.

### Can an AI coding agent use this instead of me building the CI harness?

Yes. `claude mcp add browserbash` exposes BrowserBash's run, testmd, and run-all commands as MCP tools, so a coding agent like Claude Code can drive a real browser and check its own UI changes as part of its own loop, without anyone hand-wiring that validation step.

If you're mid-way through building the loop from the top of this article, spend twenty minutes on the built-in version before you write the retry policy: install it, point it at the flow you care about, and see how much of that six-part list you get to delete.

```bash
npm install -g browserbash-cli
```

It's free and open source, no account required to run it locally, though the [features page](https://browserbash.com/features) covers the optional cloud dashboard and run history if you want them later.
