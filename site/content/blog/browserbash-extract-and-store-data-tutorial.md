---
title: Extract and store data from any page with BrowserBash
description: "A hands-on ai data extraction cli tutorial: write objectives that store named values, read final_state, and pull structured data without selectors."
date: 2026-04-03
category: tutorial
---

If you have ever written a scraper that broke the week after you shipped it because a `div` class changed, this tutorial is the antidote. By the end you will be able to point an **ai data extraction cli** at almost any page, describe in plain English the values you want, and get back clean, named, structured data — no CSS selectors, no XPath, no page objects to maintain. We will write objectives that explicitly name the values they store, read those values out of the machine-readable `final_state` object, and turn one-off runs into something a script or a CI job can consume. The whole walkthrough uses the free, fully local path, so you can follow along without a single API key and without anything leaving your machine.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You write a plain-English objective, an AI agent drives a real Chrome browser step by step, and you get back a verdict plus the structured values it extracted. The trick that makes extraction reliable is that you are not telling the agent *where* to look — you are telling it *what you want*. The agent reads the page the way a person would, finds the data, and hands it back to you in a shape you defined. That distinction is the entire reason this approach survives redesigns that would shatter a selector-based scraper.

## What you'll need

This lesson sticks to the free local stack so you owe nobody anything to complete it.

- **Node.js >= 18** — confirm with `node -v`.
- **Google Chrome** installed. The default `local` provider drives your actual Chrome, so a real browser renders the page exactly as a human would see it.
- **BrowserBash CLI**, installed globally:

```bash
npm install -g browserbash-cli
```

- **A model.** The default `--model auto` resolves in order: a local **Ollama** model first (`ollama/<model>`, free, no keys), then `ANTHROPIC_API_KEY` (resolves to `claude-opus-4-8`), then `OPENAI_API_KEY` (resolves to `openai/gpt-4.1`). If you have Ollama running, there is nothing to configure. We will use the local path throughout.
- **`jq`** for slicing JSON on the command line. Optional, but it makes reading `final_state` much nicer: `brew install jq` on macOS, or your distro's package manager on Linux.

One honest caveat before we begin: extraction quality tracks model quality. Very small local models (8B and under) are fine for grabbing a single price off a simple page, but they get flaky when you ask for ten fields across a long, paginated flow — they drop fields or hallucinate structure. The sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model when the page is genuinely gnarly. Start small, and reach for a bigger model the moment your `final_state` starts coming back incomplete.

## Step 1 — Confirm the install and your model

Before extracting anything, make sure the CLI is on your PATH and a model is reachable.

```bash
browserbash --version
```

You should see `1.3.1`. If the command is not found, your global npm bin directory probably is not on your PATH; re-run the install above and reopen your shell.

Now do a trivial run so the agent has to actually drive Chrome and report back. Pick any stable public page:

```bash
browserbash run "Go to example.com and tell me the main heading text"
```

Chrome opens, the agent navigates, reads the page, and prints a friendly summary ending in a **passed** verdict with the heading it found ("Example Domain"). If you instead get an error about no model being available, you have no Ollama model and no API key set. Start Ollama with a model pulled (for example `ollama pull qwen3`), or export an `ANTHROPIC_API_KEY`, and try again. Once this works, the browser plumbing is healthy and we can focus on extraction.

## Step 2 — Write an objective that names the value you want

Here is the single most important habit in this whole tutorial: **name your values inside the objective.** Do not say "get the price." Say "extract the price as `product_price`." When you give a value an explicit name, the agent stores it under that key, and you get predictable, addressable data instead of a sentence you have to parse.

Try it against a product-style page (swap in any real URL you care about):

```bash
browserbash run "Go to https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html, then extract the book title as 'title', the price as 'price', and whether it is in stock as 'in_stock'"
```

Watch the terminal. The agent navigates, reads the rendered page, and at the end reports a **passed** verdict plus the three values it pulled — something like `title: "A Light in the Attic"`, `price: "£51.77"`, `in_stock: true`. Notice you never told it the price lived in a `<p class="price_color">`. You described the *thing*, and the agent found it. That is structured extraction without selectors.

### Why naming beats free-text

When you ask for "the details," a model gives you prose, and prose is fragile to consume downstream. Named values do three things for you: they make the output deterministic in *shape* (the keys are yours), they let the agent self-check ("did I actually find a `price`?"), and — crucially — they become fields in the `final_state` object we read in the next step. Treat each name like a column in a table you are building.

## Step 3 — Read the structured values from `final_state`

The friendly terminal output is for humans. To get the data into a script, switch on **agent mode** with `--agent`. This makes stdout a stream of newline-delimited JSON (NDJSON): one JSON object per line. Progress lines look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`. The last line is the terminal object, and it carries everything you care about:

```json
{"type":"run_end","status":"passed","summary":"...","final_state":{"title":"A Light in the Attic","price":"£51.77","in_stock":true},"duration_ms":18342}
```

`final_state` is the payload. Every value you named in the objective shows up here as a key. Let's capture just that object with `jq`:

```bash
browserbash run "Go to https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html, then extract the book title as 'title', the price as 'price', and whether it is in stock as 'in_stock'" --agent \
  | jq -c 'select(.type=="run_end") | .final_state'
```

That filters the stream down to the single terminal line and prints the `final_state` object. From here you can pipe it into a file, a database insert, or another tool. To pull one field out:

```bash
browserbash run "Go to https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html, then extract the price as 'price'" --agent \
  | jq -r 'select(.type=="run_end") | .final_state.price'
```

You get `£51.77` on its own line — exactly what a downstream script wants. The contract is simple and worth memorizing: **you name values in the objective, they come back as keys in `final_state`, you address them with `jq`.** No HTML parsing anywhere in that loop.

### Don't forget the exit code

Agent mode also sets a process exit code so a script can branch without parsing anything: `0` passed, `1` failed, `2` error, `3` timeout. Wrap the run in a check so you never store data from a run that did not actually succeed:

```bash
if data=$(browserbash run "Go to example.com and extract the main heading as 'heading'" --agent | jq -c 'select(.type=="run_end") | .final_state'); then
  echo "Extracted: $data"
else
  echo "Run did not pass (exit $?)" >&2
fi
```

## Step 4 — Extract a list of items

Single values are the warm-up. Most real extraction is "give me every row." The same naming discipline applies — describe the collection and the fields each item should carry:

```bash
browserbash run "Go to https://books.toscrape.com/ and extract the first 10 books on the page as a list called 'books', where each item has 'title' and 'price'" --agent \
  | jq 'select(.type=="run_end") | .final_state.books'
```

`final_state.books` comes back as an array of objects, each with the `title` and `price` keys you asked for. Because you specified the shape, you can immediately map over it — turn it into CSV, load it into a spreadsheet, or diff it against yesterday's run for change monitoring. Tell the agent how many items you want ("the first 10") so it knows when to stop; open-ended "all of them" across many pages is exactly where small local models start to wobble.

If the page paginates and you want more than one screen, say so in plain English: "...visit the next two pages as well and combine the results into one list called 'books'." The agent handles the clicking. Keep the page count modest on local models and let a bigger model handle deep crawls.

## Step 5 — Save a recording of the extraction run

When an extraction is wrong, you want to see what the agent actually saw. Add `--record` to capture a screenshot plus a `.webm` session video (via the bundled ffmpeg). On the builtin engine you also get a Playwright trace.

```bash
browserbash run "Go to https://books.toscrape.com/ and extract the first 10 books as a list called 'books' with 'title' and 'price' for each" --record
```

The run behaves identically but now leaves artifacts behind that show the exact pages and state at extraction time. This is gold when a field comes back empty and you need to confirm whether the data was even on the page. Every run is also kept on disk under `~/.browserbash/runs` (secrets masked, capped at the 200 most recent), so you always have a history to look back at.

## Step 6 — Make it committable with a markdown test

One-liners are great for exploration, but for a recurring extraction you want something you can version-control and re-run. BrowserBash markdown tests (`*_test.md`) are exactly that: each list item is a step, and you can template runtime data with `{{variables}}`. Save this as `extract_book_test.md`:

```markdown
# Extract book details

- Go to https://books.toscrape.com/catalogue/{{slug}}/index.html
- Extract the book title as 'title'
- Extract the price as 'price'
- Extract whether it is in stock as 'in_stock'
```

Run it, passing the variable on the command line:

```bash
browserbash testmd run ./extract_book_test.md
```

After each run, BrowserBash writes a human-readable `Result.md` next to your test with the verdict and the values it captured — perfect for a pull-request diff or a teammate's review. Mark any sensitive variable as a secret and it is masked as `*****` in every log line, so credentials never leak into your committed results. For a deeper dive on these files, see the [BrowserBash tutorials](https://browserbash.com/tutorials) index.

## The flags that matter for extraction

You only need a handful of flags to do everything above. Here are the relevant ones, accurate to the CLI:

| Flag | What it does for extraction |
| --- | --- |
| `--agent` | Emits NDJSON; the terminal `run_end` line carries `final_state` (your named values) and sets exit codes 0/1/2/3. This is how scripts read the data. |
| `--model <id>` | Pins the model, e.g. `--model ollama/qwen3`. Reach for a bigger model when `final_state` comes back incomplete. Default is `auto`. |
| `--provider <name>` | Where the browser runs. Default `local` (your Chrome). Others: `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--engine <name>` | Who interprets the English. Default `stagehand` (extract/observe primitives); `builtin` is the in-repo Anthropic tool-use loop. |
| `--record` | Saves a screenshot + `.webm` video (and a Playwright trace on the builtin engine) so you can see what the agent extracted from. |
| `--headless` | Runs Chrome without a visible window — useful for servers and CI. |
| `--timeout <seconds>` | Caps how long the run may take before it returns a `timeout` status (exit code 3). |
| `--dashboard` | Opens the free local dashboard for this run so you can inspect steps visually. |
| `--upload` | Pushes this run to the cloud dashboard (opt-in; requires `browserbash connect` first). Without it, nothing leaves your machine. |

A note on engines: the default `stagehand` engine ships purpose-built `extract` and `observe` primitives and is self-healing, which makes it a strong default for pulling data. The `builtin` engine is automatically used for LambdaTest and BrowserStack runs. For local extraction you rarely need to touch `--engine` at all.

## Troubleshooting

**`final_state` is missing some fields you named.** This is almost always the model, not the tool. A small local model lost the thread or never found the value. First, confirm the data was actually on the page (re-run with `--record` and watch the video). If it was there, pin a bigger model: `--model ollama/qwen3` for a capable local option, or export an `ANTHROPIC_API_KEY` and let `auto` resolve to `claude-opus-4-8`. Asking for fewer fields per run also helps small models stay on track.

**The agent returns prose instead of clean keys.** You probably described *what to get* without *naming* it. Compare "get the price" (gives you a sentence) with "extract the price as 'price'" (gives you a `price` key in `final_state`). Always name every value you intend to read programmatically.

**`--record` errors about ffmpeg.** Recording uses a bundled ffmpeg to produce the `.webm`. If your environment strips bundled binaries or runs in a locked-down container, recording can fail while the extraction itself still works. Drop `--record` to get your data, and capture diagnostics another way (the run is still saved under `~/.browserbash/runs`).

**The run ends in `timeout` (exit code 3).** Long list extraction or multi-page crawls can outrun the default budget. Raise it with `--timeout 180`, and narrow the objective ("the first 10," not "all"). On a slow local model, fewer fields and fewer pages per run is the reliable path.

**A hosted or cloud provider complains about missing keys.** Cloud providers need their credentials in the environment — `browserbase` needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`; `lambdatest` needs `LT_USERNAME` and `LT_ACCESS_KEY`. For this tutorial you do not need any of them: the default `local` provider drives your own Chrome with zero keys. Only opt into a provider when you specifically need cloud browsers.

## When to use this

Reach for objective-driven extraction whenever the data lives on a page that renders for humans and you do not want to maintain selectors: price and stock monitoring, scraping a competitor's catalog into a spreadsheet, pulling structured records out of an internal admin tool, or snapshotting a dashboard's numbers on a schedule. Anywhere a traditional scraper would need constant babysitting, named-value extraction tends to just keep working through redesigns.

From here, a few natural next steps:

- Go deeper on the machine-readable output in the [agent mode and NDJSON guide](https://browserbash.com/learn) so you can wire `final_state` straight into CI.
- Browse more hands-on walkthroughs on the [BrowserBash tutorials](https://browserbash.com/tutorials) page, including markdown tests and recording.
- See what else the agent can do on the [features](https://browserbash.com/features) page, and skim real-world write-ups on the [blog](https://browserbash.com/blog).

## FAQ

### How do I extract data from a website without writing CSS selectors?

Describe the values you want in plain English and give each one a name, for example "extract the price as 'price'." BrowserBash drives a real browser, reads the rendered page the way a person would, and returns your named values as keys in a structured result. You never write or maintain a selector, so the extraction keeps working even when the page's markup changes.

### Where does BrowserBash put the extracted values?

When you run with the `--agent` flag, the final NDJSON line is a `run_end` object whose `final_state` field holds every value you named in your objective. You can pull it out with a tool like `jq` and pipe it into a file, a database, or another script. Without `--agent`, the same values are summarized in the human-readable terminal output instead.

### Can I extract a list of items, not just a single value?

Yes. Ask for a named list and describe the fields each item should carry, such as "extract the first 10 products as a list called 'products' where each has 'name' and 'price'." The list comes back as an array of objects under that name in `final_state`. Tell the agent how many items to grab so it knows when to stop, especially on smaller local models.

### Does data extraction cost anything or leave my machine?

No, not on the default setup. BrowserBash is free and open-source, and the default `local` provider uses your own Chrome while the default `auto` model resolves to a local Ollama model first. On that local path there are no API keys and nothing leaves your machine. Data only goes to the cloud if you explicitly run `browserbash connect` and add the opt-in `--upload` flag to a run.

Ready to pull clean, structured data off any page? Install the CLI and start describing what you want:

```bash
npm install -g browserbash-cli
```

No account is required to run it locally — but if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up).
