---
title: 40 Lines of Page Objects vs. One English Sentence
description: An SDET ports a 40-line Selenium page-object login test to one BrowserBash sentence, then weighs determinism, speed, and LLM cost honestly.
date: 2026-06-12
category: comparison
---

The Page Object Model earned its place. It rescued Selenium suites from selector soup and gave a generation of SDETs a way to keep ten thousand lines of test code maintainable. It also created a permanent class of code that exists only to translate "log in" into locators. This post ports one classic page-object login test to a single BrowserBash sentence — and then spends just as long on what you give up, because the tradeoffs are real and pretending otherwise helps nobody.

## The before: 40 lines to log in

The SDET in this story is illustrative, and the timings below are typical rather than measured from any one team — but the code and commands are real. The suite under test is the classic practice app at the-internet.herokuapp.com, and the login test looks like every login test you have ever shipped:

```java
public class LoginPage {
    private final WebDriver driver;
    private final By username = By.id("username");
    private final By password = By.id("password");
    private final By submit = By.cssSelector("button[type='submit']");

    public LoginPage(WebDriver driver) { this.driver = driver; }

    public LoginPage open(String baseUrl) {
        driver.get(baseUrl + "/login");
        return this;
    }

    public SecureAreaPage loginAs(String user, String pass) {
        driver.findElement(username).sendKeys(user);
        driver.findElement(password).sendKeys(pass);
        driver.findElement(submit).click();
        return new SecureAreaPage(driver);
    }
}
```

Add the `SecureAreaPage` object, the test class, the driver factory, and the assertion, and you are at roughly 40 lines across three files before the first run. When a frontend refactor changed the submit button's markup, the locator broke, the page object needed a patch, and a green feature sat blocked for a day.

## The after: one sentence

```bash
browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, and verify the page says 'You logged into a secure area'" \
  --headless \
  --variables '{"base_url":"https://the-internet.herokuapp.com","username":"tomsmith","password":{"value":"SuperSecretPassword!","secret":true}}'
```

That command is runnable exactly as printed — the demo credentials are published on the login page itself. An AI agent drives a real Chrome browser, finds the fields the way a person would, and the `verify` clause is the assertion: if the text is missing, the run fails with exit code 1. The password is marked `"secret": true`, so every log shows `*****`. To make it committable, drop the same steps into a `login_test.md` file and run `browserbash testmd run ./login_test.md --headless` — a `Result.md` report lands next to the file.

What disappeared: the locators, both page objects, the driver factory, and the selector patch the next time the markup shifts. The agent re-reads the page on every run, and the default Stagehand engine underneath is built around self-healing automation.

## The honest tradeoffs

**Determinism.** Selenium executes the same instructions every time; when it fails, it fails identically. An LLM agent plans at run time, and two runs may take slightly different paths to the same goal. BrowserBash narrows the gap — explicit `verify` steps, a `--max-steps` cap, exit codes as the contract — but runs are goal-deterministic, not path-deterministic. If you need bit-identical execution traces, page objects still win.

**Speed.** A WebDriver click is milliseconds; every BrowserBash step includes model inference. Illustratively, the Selenium login above finishes in 6–8 seconds in CI, while the BrowserBash run typically lands in the 30–60 second range depending on model and provider. For a 12-test smoke suite that difference is irrelevant. For an 800-test regression wall, it is disqualifying — keep Selenium there.

**LLM cost.** Every step costs tokens, but you hold real levers. The default `auto` model resolution prefers a local Ollama model — free, open source, no API keys (`ollama pull qwen3`; note that small ≤8B models are flaky on multi-step objectives, while Qwen3 or Llama 3.3 70B class works best). One flag swaps brains per run: `--model openrouter/meta-llama/llama-3.3-70b-instruct` when cheap is fine, `--model openrouter/anthropic/claude-sonnet-4-6` when a flow needs more capability, or `ANTHROPIC_API_KEY` for Claude directly.

## Where each approach wins

Keep page objects for large, stable regression suites, sub-second per-test budgets, pixel-precise interactions, and anywhere a network-free deterministic run is mandatory. Reach for plain English for new coverage you need today, UIs that churn weekly, smoke and journey tests, and any test a product manager should be able to read in review.

The SDET in our scenario kept all 800 Selenium regression tests and moved 15 of the worst selector-churn victims to markdown. Both suites run in the same pipeline and gate merges the same way: by exit code.

## FAQ

### Is an LLM-driven test deterministic enough for CI?

Treat the exit code as the contract. `verify` steps fail the run with exit code 1 when an assertion is false, and `--max-steps` plus `--timeout` bound any wandering. That is solid for smoke and journey gates, but it is goal-determinism, not a drop-in replacement for trace-identical compliance suites.

### What does a run actually cost?

With the default Ollama resolution, there is no API cost — the model runs on your hardware. With hosted models, a multi-step login costs a few thousand tokens at your chosen model's rates, and `--model openrouter/<vendor>/<model>` lets you trade cost against capability per run without editing the test.

### Do I have to choose between Selenium and BrowserBash?

No. The realistic pattern is coexistence: Selenium keeps the deep regression suite, BrowserBash covers fast-moving smoke and journey flows, and both report to CI through the same pass/fail exit-code convention.
