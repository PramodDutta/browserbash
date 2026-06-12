---
title: Exploratory Testing With an AI Agent, No Scripts
description: "Release week without throwaway scripts: a QA engineer runs one-shot browserbash objectives for exploratory checks and stores evidence with store-as."
date: 2026-06-12
category: case-study
---

Exploratory testing has a tooling gap. Automation gets frameworks, CI budgets, and dashboards; exploration gets a charter doc and whatever you can click through in an afternoon. The compromise most QA engineers land on is the throwaway script — twenty minutes writing Playwright to check one thing, then deleting it. BrowserBash collapses that loop: a one-shot `browserbash run` with a plain-English objective is faster to type than the script you were going to throw away anyway.

## Release week, illustrated

The scenario below is illustrative — a composite release week, framed so you can steal the workflow — but every command runs exactly as printed. Picture the lone QA engineer on a small e-commerce team. The release cuts Thursday. The charter list has 20 items: cart edge cases, pricing displays, login oddities. Historically, five of those items needed automation help, each became a 20–40 line scratch script, and all five were dead code by Friday.

## One-shot objectives instead of scratch scripts

Each charter item becomes one command. A structural check that mixes an assertion with an extraction:

```bash
browserbash run "Open https://quotes.toscrape.com, verify there are exactly 10 quotes on the first page, and store the first quote's author as 'author'" --headless
```

If the `verify` clause is false, the run fails with exit code 1 — the check is the test. A multi-step flow, with credentials kept out of the command string:

```bash
browserbash run "Open {{base_url}}, log in as {{username}} with password {{password}}, add the Sauce Labs Backpack to the cart, and store the cart badge count as 'cart_count'" \
  --headless \
  --variables '{"base_url":"https://www.saucedemo.com","username":"standard_user","password":{"value":"secret_sauce","secret":true}}'
```

And a check that needs actual reasoning over the page — the kind that is miserable to script by hand:

```bash
browserbash run "Open https://books.toscrape.com, navigate to the Travel category, store the number of books shown as 'count' and the price of the most expensive book on the page as 'max_price'" --headless --timeout 120
```

Finding a maximum means the agent reads every price on the page. Give deep checks `--timeout` headroom, and raise `--max-steps` past the default 30 when a flow is long.

## store-as is the evidence locker

The habit that makes this exploratory testing rather than casual poking: end every objective with `store ... as 'name'`. Anything phrased that way lands in the run's final state, which turns each check into a record instead of a memory. Add `--agent` and stdout becomes NDJSON you can append to a session log:

```bash
browserbash run "Open {{base_url}}, log in as {{username}} with password {{password}}, add the Sauce Labs Backpack to the cart, and store the cart badge count as 'cart_count'" \
  --agent --headless \
  --variables '{"base_url":"https://www.saucedemo.com","username":"standard_user","password":{"value":"secret_sauce","secret":true}}' \
  | tee -a release-notes.ndjson
```

The last line of every run is a `run_end` event carrying the verdict, a one-paragraph summary, the stored values, and the duration in milliseconds — paste it into the bug ticket as-is. Values marked `"secret": true` stay masked as `*****` even in NDJSON, so the log is safe to attach.

## What two afternoons produced

In the illustrative week: 14 one-shot checks across two afternoons, three real finds. A cart badge that read 2 after adding a single item when the session arrived through a promo link. A category page whose "highest price first" sort disagreed with the stored `max_price`. A login that bounced through a redirect loop on a stale session cookie. Each ticket included the exact command — rerunnable by any developer — and the `run_end` line as evidence. Scratch scripts left behind to maintain: zero.

## Promote the keepers

Two of the 14 checks were worth keeping. Graduating a one-shot into a committable test is a copy-paste:

```bash
cat > cart_badge_test.md <<'EOF'
# Cart badge smoke

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the Sauce Labs Backpack to the cart
- Verify the cart badge shows exactly 1
- Store the cart badge count as 'cart_count'
EOF

browserbash testmd run ./cart_badge_test.md --headless
```

After the run, a `Result.md` report appears next to the test file with the verdict and extracted values. The check you explored your way into on Tuesday is a reviewable regression gate by Thursday.

## FAQ

### Isn't exploratory testing supposed to be a human activity?

It still is. The charter, the hunches, and the "that number looks wrong" judgment stay human — the agent removes the typing between hunch and evidence. You steer one objective at a time, read the result, and decide what to probe next.

### How do I keep evidence from runs?

Three layers. Phrase extractions as `store ... as 'name'` so values land in the final state. Add `--agent` and append the NDJSON stream to a session log. And for promoted `*_test.md` files, every `browserbash testmd run` writes a `Result.md` next to the test.

### What about dynamic pages that change between runs?

Anchor assertions on invariants — counts, presence, relationships — and use `store` for volatile values instead of asserting exact text: store the top story title rather than insisting on what it says. For slower or deeper pages, raise `--timeout` and `--max-steps`.
