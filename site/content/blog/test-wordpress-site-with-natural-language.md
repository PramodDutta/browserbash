---
title: How to Test a WordPress Site With Natural Language Tests
description: "Test a WordPress site with plain-English checks: login, publishing, WooCommerce, and contact forms across themes and page builders, no PHP required."
date: 2026-06-27
category: use-case
---

To test a WordPress site with natural language, you describe each flow as a plain-English objective and let an AI agent drive a real browser through it: log in to wp-admin, publish a post, submit a contact form, add a product to the cart. With BrowserBash you write the intent in a Markdown `*_test.md` file or pass it inline on the command line, and the agent finds buttons and fields by their on-screen roles and labels instead of brittle CSS selectors tied to your theme or page builder. That last part matters more on WordPress than almost anywhere else, because the rendered DOM is a moving target shaped by your theme, your block editor, and a stack of plugins you did not write. This guide shows the exact objectives for the flows that actually break: login, publishing, comment and contact forms, and WooCommerce basics, plus an honest account of where the approach struggles.

## Why WordPress is hard to test the old way

WordPress sites are assembled, not authored. A typical install layers a theme, the block editor (or a page builder like Elementor, Divi, or Beaver Builder), a contact-form plugin, an SEO plugin, a caching plugin, and often WooCommerce on top. Each of those injects its own markup, its own class names, and sometimes its own iframes and shadow roots. The "Add to cart" button on your store might be a `<button>` in one theme and an `<a class="single_add_to_cart_button">` in another. A page-builder section can wrap your form in three nested divs with hashed class names that change when you re-save the page.

Selector-based tests (the classic Playwright or Selenium approach of `page.click('.elementor-button-7a3f2')`) break the moment any of that markup shifts. A theme update, a plugin bump, or a builder re-save can silently invalidate a suite you wrote last month. You end up maintaining selectors instead of testing behavior.

Natural-language testing flips the unit of work. Your test says what a human would do ("click the Publish button", "fill in the comment with my name and email"), and the agent resolves that to a concrete element at run time by reading the page. If you have not seen the model before, the [natural-language browser automation](https://browserbash.com/blog/natural-language-browser-automation) primer covers how an objective becomes browser actions.

### How BrowserBash finds elements (and why that survives plugin churn)

BrowserBash does not match CSS classes. It reads the accessibility tree (roles, accessible names, and states) alongside the DOM, the same structure a screen reader uses. A "Publish" button is found because its accessible name is "Publish" and its role is button, not because of a class. That holds up well when an Elementor re-save renames a wrapper div, because the button's role and label usually stay the same even when the surrounding markup is regenerated.

The tool ships two engines. The default, **stagehand** (MIT, by Browserbase), observes the live DOM on each step and decides the next action from what is rendered right then. The alternate **builtin** engine runs an Anthropic tool-use loop, captures native Playwright traces, and re-derives the selector on every action from a fresh snapshot, never cached across runs. Either way the decision is made against live page state, so a run reflects the site as it renders today. This is not self-patching: nothing is saved and replayed. Each run re-derives from scratch.

It also handles iframes and Shadow DOM, which matters because page builders and embedded form services (and some block patterns) like to render inside iframes.

## Install and a first smoke check

Install the CLI globally:

```bash
npm install -g browserbash-cli
```

The fastest way to confirm your site is reachable and rendering is a one-line objective. Point it at your front page and ask the agent to verify something a visitor would see:

```bash
browserbash run "Open https://example.com and confirm the site title and main navigation menu are visible"
```

By default the model resolution is `auto`: it looks for a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which has some free models). If you run a local model, nothing leaves your machine, which is worth knowing when your test objectives include admin credentials. Small local models (8B and under) tend to get flaky on long multi-step flows, so for the harder WordPress journeys below, a 70B-class model (Qwen3, Llama 3.3) or a hosted model gives noticeably steadier runs.

For anything you will run more than once, move it into a Markdown test file instead of an inline string. That is where this approach earns its keep.

## Writing WordPress tests as Markdown files

A BrowserBash test is a Markdown file ending in `_test.md`. It has a `#` title, a list of steps (ordered or unordered), optional `@import` to compose other test files, and `{{variables}}` whose values are masked in logs when they hold secrets. The full syntax is in the [Markdown test files tutorial](https://browserbash.com/blog/markdown-test-files-tutorial), but you can get productive from the examples here.

### Test 1: Log in to wp-admin

Login is the gate for every authoring flow, so make it its own file and import it elsewhere. WordPress login lives at `/wp-login.php` with fields labeled "Username or Email Address" and "Password" and a "Log In" button. Those accessible names are stable across most themes because wp-login is rendered by core, not your theme.

```markdown
# Log in to WordPress admin

1. Go to {{base_url}}/wp-login.php
2. Fill the "Username or Email Address" field with {{wp_user}}
3. Fill the "Password" field with {{wp_pass}}
4. Click the "Log In" button
5. Confirm the WordPress dashboard is shown with a "Dashboard" heading in the admin menu
```

Save that as `login_test.md`. Pass the variables at run time so credentials never live in the file:

```bash
browserbash testmd run ./login_test.md \
  --var base_url=https://example.com \
  --var wp_user=editor@example.com \
  --var wp_pass="$WP_PASS"
```

Because `{{wp_pass}}` is a variable, its value is masked in the run logs and in the `Result.md` written for the run. Pull the real secret from an environment variable or your CI secret store rather than typing it on the command line.

### Test 2: Publish a post in the block editor

This is the flow most likely to regress after a WordPress core or Gutenberg update, and the one most painful to maintain with selectors because the block editor's markup is dense and versioned. Compose it on top of login with `@import`:

```markdown
# Publish a new blog post

@import ./login_test.md

1. Go to {{base_url}}/wp-admin/post-new.php
2. If a "Welcome to the block editor" dialog appears, close it
3. Type "Smoke test post {{run_id}}" into the post title field
4. Click into the body and type "This post was created by an automated check."
5. Click the "Publish" button in the top toolbar
6. In the publish panel that slides out, click the second "Publish" button to confirm
7. Confirm a "Post published" confirmation message appears
8. Confirm a "View Post" link is visible
```

A few WordPress-specific notes baked into those steps:

- The block editor has a two-step publish (the toolbar "Publish", then a confirmation "Publish" in the pre-publish panel). Describe both, and disambiguate with "second" so the agent does not stop at the first.
- Onboarding dialogs and "you have unsaved changes" prompts appear conditionally. Phrasing a step as "If a dialog appears, close it" lets the agent skip it when it is absent rather than failing.
- `{{run_id}}` keeps each run's post title unique, which helps when you eyeball the posts list later. Pass it as `--var run_id=$(date +%s)` or a CI build number.

Late-rendering UI is common here because the editor hydrates with JavaScript and the publish panel animates in. BrowserBash leans on Playwright's built-in auto-wait with a 15-second ceiling, so you do not script manual sleeps; the agent waits for the "Publish" control to be actionable before clicking.

### Test 3: Submit a contact form

Contact forms are the highest-value smoke check on most WordPress sites because they are the actual conversion path, and they are plugin territory (Contact Form 7, WPForms, Gravity Forms, Fluent Forms). The markup differs wildly between them, which is exactly why describing fields by their visible labels beats targeting classes. For a deeper treatment of form flows specifically, see [automating web form submission with AI](https://browserbash.com/blog/automate-web-form-submission-ai).

```markdown
# Submit the contact form

1. Go to {{base_url}}/contact/
2. Fill the "Your Name" field with "Test Visitor"
3. Fill the "Your Email" field with {{test_email}}
4. Fill the "Subject" field with "Automated smoke check"
5. Fill the "Your Message" field with "Ignore, this is an automated test."
6. Click the "Send" button
7. Confirm a success message such as "Your message has been sent" is visible
```

The label text in steps 2 through 5 is what your form actually shows visitors, so adjust it to match your plugin's defaults. If your form sits inside an iframe (some hosted form embeds do), you do not need to do anything special: the agent crosses into iframes when it reasons about the page. The honest caveat is that this test only confirms the front-end success state. It does not prove the email was delivered or the entry was stored, which is covered in the limits section below.

### Test 4: Post a comment

If comments are open, they are a small but real surface that themes and anti-spam plugins frequently disturb.

```markdown
# Leave a blog comment

1. Go to {{base_url}}/hello-world/
2. Scroll to the comment form
3. Fill the "Comment" field with "Great post, testing the comment flow."
4. Fill the "Name" field with "Test Reader"
5. Fill the "Email" field with {{test_email}}
6. Click the "Post Comment" button
7. Confirm the page shows the comment is awaiting moderation or appears below the post
```

Step 7 deliberately accepts either outcome (held for moderation or shown immediately) because that depends on your discussion settings, and a good smoke check should not assume one.

### Test 5: WooCommerce add-to-cart basics

If you run a store, the add-to-cart and checkout entry points are the flows whose breakage costs money. A focused smoke check looks like this:

```markdown
# Add a product to the cart

1. Go to {{base_url}}/shop/
2. Click on the first product in the product grid
3. On the product page, confirm a price is visible
4. Click the "Add to cart" button
5. Confirm a confirmation message like "has been added to your cart" appears
6. Go to {{base_url}}/cart/
7. Confirm the product appears as a line item with a quantity of 1
```

For a variable product (one with size or color options), add a step before "Add to cart" such as "Select the first available option for each dropdown". WooCommerce disables the add-to-cart button until variations are chosen, and Playwright auto-wait means the agent will wait for the button to become enabled rather than clicking a dead control. To smoke-test checkout without placing a real order, stop at the cart or the checkout page load and confirm the order summary renders, rather than completing payment. This is intentionally a shallow store check; it is a smoke test, not a full purchase regression.

## Running these in CI

Once your `*_test.md` files exist, wiring them into a pipeline is the payoff. Run with the `--agent` flag to emit NDJSON that a pipeline can parse step by step, and rely on the exit codes as your gate: `0` pass, `1` fail, `2` error, `3` timeout.

```bash
browserbash testmd run ./publish_post_test.md \
  --agent --headless --record \
  --var base_url=https://staging.example.com \
  --var wp_user=editor@example.com \
  --var wp_pass="$WP_PASS"
```

`--headless` runs without a visible browser, which is what you want on a build server. `--record` captures a webm video plus screenshots so that when a run fails, you can watch exactly where the block editor or the form went sideways. Every run also writes a `Result.md` summarizing what happened. If you want a UI to browse runs, `browserbash dashboard` serves a local dashboard, and an optional `--upload` opt-in pushes runs to a cloud dashboard (free runs kept for 15 days). The general pattern of gating deploys on these exit codes is covered in the [AI smoke testing guide](https://browserbash.com/blog/ai-smoke-testing-guide).

A practical CI shape for WordPress: run the login, publish, contact-form, and (if applicable) add-to-cart files against a staging clone after every deploy, and fail the job on any non-zero exit. Because the agent reads live state, you are not committed to re-recording selectors every time you update a theme or plugin on staging.

You can also choose where the browser runs via `--provider local|cdp|browserbase|lambdatest|browserstack`, which is handy when you want to check your theme across real browser builds on a grid rather than only your local Chromium.

## Honest limits: where this struggles on WordPress

This approach is genuinely good at the flows above, but it is not magic, and pretending otherwise would waste your time.

**Front-end success is not back-end proof.** A contact-form test that sees "Your message has been sent" confirms the front end behaved. It does not confirm the email left your server, that SMTP is configured, or that the entry landed in the database. For real delivery assurance you still need a mailbox check or a database assertion outside the browser. Treat the natural-language test as the front half of the story.

**Plugin-heavy and builder-heavy pages cost more tokens and more time.** A page assembled by Elementor or Divi can carry a very large DOM and accessibility tree. The agent reasons over that on each step, so a busy page-builder layout is slower and more expensive to test than a clean block-editor page, and a small local model is more likely to lose the thread on a long flow there. For those pages, a larger or hosted model pays off.

**Ambiguous labels confuse the agent.** If your theme has three elements that all read "Submit" or a builder duplicates a button in a hidden mobile menu, "click the Submit button" can land on the wrong one. The fix is to make the step more specific ("the Submit button inside the contact form") or to add an anchoring step ("scroll to the contact section first"). Vague intent produces vague targeting.

**Visual and pixel correctness is out of scope.** The agent verifies that elements exist, are actionable, and that expected text appears. It does not judge whether your theme looks right, whether a font failed to load, or whether two blocks overlap on mobile. Pair it with a dedicated visual-regression tool if layout fidelity matters.

**Captchas and aggressive anti-spam block automated runs.** A contact or comment form gated by reCAPTCHA or hCaptcha will stop the flow, by design. On staging, disable the captcha or use a test key. Do not try to defeat a captcha in production.

**Highly dynamic or animation-gated UI can still flake.** The 15-second auto-wait ceiling covers most block-editor hydration and slide-in panels, but a heavy slider, a lazy-loaded section far down the page, or a builder animation that gates interaction can occasionally need a more explicit step ("wait until the pricing table is visible, then click Buy"). When a run flakes, the `--record` video usually shows the exact frame where timing went wrong.

None of these are unique to natural-language testing; selector-based suites hit the same back-end blind spots and captcha walls. The difference is that you spend your maintenance budget on clarifying intent rather than on chasing renamed classes after every plugin update.

## Putting it together

A solid starting suite for a content WordPress site is four files: `login_test.md`, `publish_post_test.md`, `contact_form_test.md`, and (for stores) `add_to_cart_test.md`, with the authoring flows importing login via `@import`. Run them headless in CI after each staging deploy, record video, and gate on exit codes. You will catch the breakage that actually reaches users (a publish button that stopped working, a contact form that silently fails, a store page that will not add to cart) without opening a single PHP file or babysitting selectors through theme and plugin churn.

If you want to see the full flag list and provider options in one place, the [features page](https://browserbash.com/features) lays them out, and the [learn hub](https://browserbash.com/learn) collects the tutorials for going deeper. BrowserBash is free and open source (Apache-2.0) from The Testing Academy, so you can try the whole flow against a local WordPress install before pointing it at anything that matters.

## FAQ

### Do I need to know CSS selectors or PHP to test a WordPress site this way?

No. You write each test as plain-English steps describing what a visitor or editor would do, and the agent resolves those to real elements by reading the page's accessibility tree and DOM at run time. You never write a selector, and you never touch theme or plugin PHP. The main skill is phrasing steps clearly and using the visible label text your site actually shows.

### Will my tests break when I update my theme or page-builder plugin?

They are much more resilient than selector-based tests, because BrowserBash re-derives elements from live page state on every run rather than relying on saved CSS classes. A re-save that renames wrapper divs usually leaves a button's role and accessible name intact, so the test still finds it. It is not self-patching and not guaranteed immune: if an update changes the visible label or removes a control, you update that step's wording. But you are editing intent, not hunting hashed class names.

### How do I test a WooCommerce checkout without placing a real order?

Keep the smoke check shallow. Test the add-to-cart and cart flows and confirm the checkout page loads with an order summary, then stop before payment. Describe variation selection explicitly for variable products, since WooCommerce disables add-to-cart until options are chosen and the agent will wait for the button to become enabled. For full purchase regression you would use a payment gateway's test mode, which is a deliberate, separate test rather than part of a fast smoke run.

### Can I run these tests against a local WordPress install for privacy?

Yes. Point `base_url` at your local site (for example `http://localhost:8080`) and set the model to a local Ollama model so nothing leaves your machine, which is useful when your objectives include admin credentials. Keep secrets in `{{variables}}` so they are masked in logs and the `Result.md`. Note that small local models (8B and under) can get flaky on long flows like block-editor publishing, so a 70B-class local model gives steadier results for the harder journeys.
