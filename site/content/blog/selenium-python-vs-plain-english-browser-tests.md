---
title: Selenium with Python vs Plain-English Browser Tests
description: "For Python teams: Selenium WebDriver setup, drivers, and waits versus plain-English tests anyone can read. Compare effort and maintenance."
date: 2026-07-05
category: comparison
---

A new SDET joins the team on a Monday, and the onboarding ticket says "clone the repo, run the existing Selenium suite locally." Four hours later they're still stuck. `pip install -r requirements.txt` fails because `selenium==4.21.0` conflicts with a `urllib3` pin left over from an unrelated package. The virtualenv they built with `python3.11` doesn't match the `python3.9` image CI uses. Once the install finally resolves, Chrome auto-updated over the weekend and the first test run throws `SessionNotCreatedException: session not created: This version of ChromeDriver only supports Chrome version 124`. None of this is a bug in the application under test. It's the setup tax every Python Selenium project pays before the first assertion runs, and most QA teams have a version of this story from last quarter, not from a decade ago.

This isn't a case against Selenium. WebDriver is a real W3C standard, the `selenium` Python bindings are mature, and "Selenium Manager," shipped since Selenium 4.6, resolves driver binaries automatically far more often than it used to. But day to day, a lot of Python QA work still means managing a virtualenv, tracking a driver-adjacent dependency graph, hand-writing explicit waits, and keeping `conftest.py` fixtures in sync with a browser that updates on its own schedule. This piece is about that specific tax, code and driver management, not the Page Object Model (a different, and arguably bigger, fight covered in [a separate post](https://browserbash.com/blog/selenium-page-objects-vs-plain-english)). Here's the same login flow written both ways, and an honest look at what each approach costs you.

## The Python Selenium stack: what you're actually maintaining

A minimal, real Selenium plus pytest login test needs at least three pieces working together. First, a fixture that builds and tears down the browser:

```python
# conftest.py
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

@pytest.fixture
def driver():
    options = Options()
    options.add_argument("--headless=new")
    service = Service(ChromeDriverManager().install())
    drv = webdriver.Chrome(service=service, options=options)
    drv.implicitly_wait(5)
    yield drv
    drv.quit()
```

Then the test itself:

```python
# test_login.py
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def test_login(driver):
    driver.get("https://www.saucedemo.com")
    driver.find_element(By.ID, "user-name").send_keys("standard_user")
    driver.find_element(By.ID, "password").send_keys("secret_sauce")
    driver.find_element(By.ID, "login-button").click()
    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.CLASS_NAME, "product_label"))
    )
    assert "Products" in driver.page_source
```

And a `requirements.txt` entry for each moving part: `selenium`, `webdriver-manager`, `pytest`, plus whatever reporter you use (`pytest-html`, `allure-pytest`). That's roughly 25 lines across two files and four pinned dependencies before the first login test exists, and every one of those pins is now something you track. A `selenium` major version once removed the old `find_element_by_id`-style helpers in favor of `find_element(By.ID, ...)`, and it broke suites that upgraded blind. `webdriver-manager` needs outbound internet access to fetch a matching driver binary; a locked-down CI runner without that egress either vendors the binary in the repo or points at an internal mirror, and both of those are maintenance somebody now owns.

## The same flow as one sentence

```bash
browserbash run "Open https://www.saucedemo.com, log in as {{username}} with password {{password}}, and verify the page shows 'Products'" \
  --headless \
  --variables '{"username":"standard_user","password":{"value":"secret_sauce","secret":true}}'
```

No virtualenv to activate, no `conftest.py` fixture, no `find_element(By.ID, ...)` calls, no explicit `WebDriverWait`. The `verify` clause is the assertion: exit code `0` if "Products" showed up, `1` if it didn't, `2` if something broke before the check could run, `3` if it timed out. The password is marked `"secret": true`, so it prints as `*****` in every log line instead of the raw value. To make it something you commit and review in a pull request, the same steps become a `login_test.md`:

```markdown
# Saucedemo login

- Open https://www.saucedemo.com
- Log in as {{username}} with password {{password}}
- Verify the page shows "Products"
```

`browserbash testmd run ./login_test.md --headless` runs it and writes a `Result.md` next to the file.

One asterisk that matters for this specific comparison: BrowserBash is a Node.js CLI, installed with `npm install -g browserbash-cli`. There's no `pip install browserbash` and nothing to `import` into a test module. For a Python-only shop, that means keeping a Node runtime on your CI images, the same way plenty of Python shops already keep one around for a frontend build step. In practice it's a smaller ask than it sounds, because pytest doesn't care what produced a process exit code:

```python
import subprocess

def test_login_via_browserbash():
    result = subprocess.run(
        ["browserbash", "testmd", "run", "./login_test.md", "--headless"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout
```

That's a normal pytest node, reportable through `pytest --junit-xml` like anything else, sitting next to your existing Selenium fixtures rather than replacing the test runner.

## Driver management: the part Python teams feel most

Selenium Manager (4.6 and later) genuinely reduced the "which chromedriver build matches this Chrome" problem, but it didn't remove the underlying coupling. It automated fetching a matching binary most of the time. When it can't, an air-gapped CI runner, a corporate proxy blocking the download endpoint, a legacy pre-4.6 pin still in a repo, you're back to `webdriver-manager` cache directories, vendored binaries, or an internal mirror somebody has to maintain.

BrowserBash sidesteps the pairing itself rather than automating it. The `local` provider drives the Chrome already on your machine, `cdp` connects to any DevTools endpoint you already run (a self-hosted grid, a `browserless` container), and `browserbase`, `lambdatest`, or `browserstack` hand the same test to a hosted grid with one flag change, no capabilities file to write. None of those paths involve a separate driver binary whose version has to match the browser's, because there isn't a driver binary as its own artifact in this model. That's not "nothing to install anywhere": a browser still has to be present, locally, over CDP, or hosted, the same way Selenium needs one present. What disappears is the driver-version-matching problem as its own maintenance job.

## Explicit waits vs "wait for it to finish"

The Selenium Python pain that shows up most in code review isn't login, it's waiting for something to render. Take the classic dynamic-loading practice page:

```python
def test_dynamic_loading(driver):
    driver.get("https://the-internet.herokuapp.com/dynamic_loading/1")
    driver.find_element(By.CSS_SELECTOR, "#start button").click()
    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.ID, "finish"))
    )
    assert "Hello World" in driver.find_element(By.ID, "finish").text
```

Skip the wait, or reach for `time.sleep(2)` instead, and the test is either flaky or slow by a fixed, wrong amount. Pick the wrong helper out of `expected_conditions`, there are more than a dozen near-identical ones (`visibility_of_element_located` vs `presence_of_element_located` vs `element_to_be_clickable`), and you get a test that clicks a still-hidden element, or one that hangs waiting for a condition that was never going to fire.

```bash
browserbash run "Open https://the-internet.herokuapp.com/dynamic_loading/1, click Start, wait for the loading to finish, and verify the page says 'Hello World!'"
```

The agent's step loop already checks page state before deciding whether the objective is satisfied, so "wait for the loading to finish" is a description of intent, not a call to a specific `expected_conditions` helper you had to look up. That's a real reduction in one well-known category of Selenium flakiness. It isn't a claim that model-driven runs never mistime anything: a slow page can still confuse an agent the way it can confuse a fixed wait, which is exactly why `--timeout` and `--max-steps` exist as hard backstops rather than suggestions.

## What pytest and Python still do better

None of the above makes pytest or Selenium obsolete, and pretending otherwise would be marketing, not engineering. pytest's fixture system, `parametrize` for data-driven runs, `pytest-xdist` for parallelism, `pytest-bdd` for Gherkin-style specs, and `factory_boy` or similar for test data are a mature, deep ecosystem that a single CLI objective doesn't replace. If your API tests already live in the same repo using `requests` or `httpx`, keeping browser tests in the same language keeps everything in one mental model and one CI job. Selenium also gives you path-level determinism and pixel- or coordinate-precise control, the exact same command sequence every run, which matters for compliance suites and for anything driving a canvas or a non-standard widget by exact structure.

Speed is the other honest cost. A WebDriver command is, in practice, a matter of milliseconds. A BrowserBash step includes a model inference call, so expect seconds rather than milliseconds per step, with the exact figure depending heavily on the model and provider you pick (a local Ollama model, a fast hosted model, or a larger one chosen for a harder flow). For a wall of hundreds of regression tests gating every merge, that difference adds up fast, and raw WebDriver throughput wins outright.

## Where this fits into a Python-heavy pipeline

The realistic move isn't a rewrite, it's an added lane. Keep the pytest and Selenium regression suite exactly where it is, and point BrowserBash at the flows that generate the most "bump webdriver-manager" or "re-pin chromedriver" pull requests, usually login, checkout, and whatever page churns weekly. A folder of `*_test.md` files runs together with `run-all`, which reports the same way pytest does:

```bash
# Same CI job, two suites, one gating contract
pytest tests/ --junit-xml=reports/pytest.xml
browserbash run-all .browserbash/tests --junit reports/browserbash.xml --headless
```

Both reports are JUnit XML, so whatever already ingests pytest's output ingests this too, no new dashboard to stand up. See the full command surface on the [BrowserBash features page](https://browserbash.com/features) before deciding which flows are worth moving first, and note that neither suite has to change how it gates a merge: both still resolve to an exit code.

## Is BrowserBash a real Selenium Python alternative?

For a Python team specifically, "alternative" needs a caveat: BrowserBash isn't a Python library you `pip install` and extend the way you might extend Selenium with a custom wait helper or a page-object base class. It's a separate CLI you shell out to, which is a genuine architectural difference, not just a syntax one. Where it earns the "alternative" label is narrower and more honest: for the specific tax of driver-version pairing, virtualenv and dependency-pin upkeep, and hand-written explicit waits, a plain-English objective or a `testmd` file removes that tax for whatever flows you move to it. It doesn't remove the value of pytest's ecosystem, and it doesn't make WebDriver's determinism or raw speed irrelevant.

The pragmatic pattern for most Python QA teams looks like this: pick the three or four tests that have caused the most driver or environment pull requests in the last quarter (almost every team can name them without looking), rewrite just those as plain-English or `testmd` files, run both suites side by side in the same CI job for a sprint, and keep the deep regression wall exactly where it is. You're not migrating a framework. You're moving the specific tests that a driver-and-locator model serves worst, and gating both suites the same way you always have: by exit code.

## FAQ

### Is BrowserBash a Python library like Selenium?

No. BrowserBash is a Node.js CLI, installed with `npm install -g browserbash-cli`. There's no `pip install` and no Python import; you invoke it as a subprocess or a separate CI step. pytest can wrap it with `subprocess.run([...])` and assert on the return code, which is the most common way Python teams add it alongside an existing suite.

### Does this replace pytest fixtures and parametrize?

No. BrowserBash handles a plain-English browser flow and gives you a verdict; it doesn't replace pytest's fixture system, data-driven `parametrize`, or your API test layer. Most teams keep pytest as the test runner and either shell out to BrowserBash for specific flows or run it as a parallel CI step reporting its own JUnit XML.

### How does BrowserBash avoid the chromedriver version-matching problem?

There's no separate driver binary whose version has to track the browser's. The `local` provider drives the Chrome already installed on your machine, `cdp` connects to any DevTools endpoint, and hosted providers like `browserbase`, `lambdatest`, or `browserstack` take a single flag. A browser still has to be present somewhere, but there's no driver-binary artifact to keep paired with it.

### Do I still need to write explicit waits?

Not the way Selenium requires them. The agent's step loop checks page state before deciding an objective is satisfied, so "wait for X to appear" is part of the sentence, not a call to a specific `expected_conditions` helper. `--timeout` and `--max-steps` remain as hard backstops for genuinely slow or stuck pages.

### Is BrowserBash free like Selenium?

Yes. Both are free. Selenium and WebDriver are open source with no licensing cost; the infrastructure and engineer time to maintain them is what you actually pay. BrowserBash is free and open source under Apache-2.0, and it can run entirely against a local Ollama model with no API key and no account, so trying it costs closer to zero than a grid migration would.

### What happens if the AI agent takes a different path than my Selenium script would?

That's the real tradeoff to keep in mind. Selenium is path-deterministic: the same commands, in the same order, every run. BrowserBash is goal-deterministic: the same intended outcome, possibly a different sequence of steps to get there. `verify` steps compile to real checks rather than LLM judgment calls, and `--max-steps` plus stable exit codes keep that variability from turning into an unbounded or silently-wrong run.
