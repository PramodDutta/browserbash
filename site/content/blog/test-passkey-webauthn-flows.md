---
title: "Testing Passkey and WebAuthn Flows: What AI Automation Can and Cannot Do"
description: "An honest guide to test passkey webauthn automation: what AI browser agents can assert and where the OS-level prompt hard-stops any script."
date: 2026-05-17
category: security
---

If you have ever tried to test passkey WebAuthn automation with a browser tool, you already know the wall you hit. The moment your flow reaches the actual credential prompt, the browser hands control to the operating system, and no script, no AI agent, and no Playwright locator can touch what happens next. That is not a bug in your tooling. It is the entire security model of WebAuthn working exactly as designed. The prompt lives outside the page, outside the DOM, and outside the reach of anything running in the browser context.

This creates a strange gap for QA teams. Passkeys are rolling out fast across banking, SaaS logins, and consumer apps, yet the standard advice is either "you cannot automate this" or a pile of Chrome DevTools Protocol tricks most engineers never wire up correctly. The truth sits in between: there is a large, valuable surface you can and should automate around passkey and WebAuthn flows, and a small, sharp core that you cannot. This guide draws the line clearly, shows what an AI browser agent like [BrowserBash](https://github.com/PramodDutta/browserbash) can genuinely verify, and explains the CDP virtual authenticator approach for driving the ceremony end to end.

## Why the passkey prompt is not scriptable

WebAuthn was built to defeat phishing and credential theft. A big part of how it does that is by moving the sensitive moment out of the web page entirely. When a site calls `navigator.credentials.get()` or `navigator.credentials.create()`, the browser talks to a platform authenticator (Touch ID, Windows Hello, Android biometric) or a roaming authenticator (a YubiKey, a phone over Bluetooth). The user verification step, your fingerprint, your face, your device PIN, happens in an OS-level dialog that the page cannot see, cannot read, and cannot dismiss.

That isolation is the point. If a page could script its own passkey approval, the whole anti-phishing guarantee would collapse. So when your automation reaches that dialog, it is looking at pixels drawn by macOS, Windows, or Android, not by the DOM. A tool that drives the browser through the accessibility tree or CSS selectors has nothing to grab. Even a full desktop automation tool that clicks raw screen coordinates cannot supply a real biometric, because the sensor hardware is what the OS is waiting on.

There are three practical consequences worth stating plainly:

- **You cannot assert a real biometric.** No automated test can present an actual fingerprint or face to the platform authenticator. Any claim otherwise is either using a virtual authenticator (more below) or fabricating a result.
- **The prompt has no stable selector.** Because it is not HTML, your usual "click the button named Continue" step stops working the instant the OS dialog appears.
- **Cross-device flows add QR codes and Bluetooth.** Hybrid transport pulls in a second physical device and a proximity check that no headless CI runner can satisfy.

Knowing this up front saves you days. The goal is not to fight the OS dialog. It is to test everything around it deterministically and to simulate the ceremony itself only when you deliberately choose to, using the tools browsers give you for exactly that purpose.

## What you actually can automate around passkeys

Here is the reframe that makes passkey testing tractable. A login or registration flow is not one atomic biometric moment. It is a sequence of page states, network calls, redirects, error branches, and fallback options, and the OS prompt is one small link in that chain. Almost everything on either side of that link is normal web content an AI agent can drive and verify.

Think about a real passkey sign-in page. Before the prompt, you have an email field, a "Sign in with a passkey" button, sometimes a device-picker sheet, and copy that tells the user what to expect. After a successful ceremony, you have a redirect, a session cookie, a dashboard, and a name in the header. If the user cancels or has no passkey, you have a fallback to password, a "try another way" link, an error toast, or an enrollment nudge. Every one of those is testable.

With a plain-English objective, BrowserBash drives a real Chrome browser through these states and returns a deterministic verdict. You do not write selectors. You describe intent.

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com/login, click the 'Sign in with a passkey' button, and confirm the passkey chooser sheet appears" --agent --headless
```

That single command exercises the pre-prompt surface: the button exists, it is clickable, and the browser reaches the point where it would call `navigator.credentials.get()`. The `--agent` flag emits NDJSON so a CI job or an AI coding agent can read the structured verdict instead of parsing prose. What it will not do is approve the biometric, and it should not pretend to.

### The pre-prompt surface

The most common regressions in passkey rollouts never involve the cryptography at all. They are UI and copy problems: a missing button, a broken feature-detection check, a "Sign in with passkey" option that renders on an unsupported browser, or an enrollment banner that fails to appear for eligible users. These are exactly the checks an AI agent handles well, because they are about what the page shows and does, not about a fingerprint. You can assert that the passkey option only shows when `window.PublicKeyCredential` is available, that the fallback password field is one click away, and that the help text matches your latest copy. None of that needs a real authenticator.

### The post-prompt surface

Once a ceremony completes (whether by a real human tester, a virtual authenticator, or a saved session), the resulting state is pure web content again. Did the redirect land on the dashboard? Did the session persist across a reload? Does the account page show the newly registered passkey in the credentials list? An AI agent verifies all of it against the live UI.

### The error and fallback branches

Passkey flows have more failure modes than password flows, and users hit them constantly: no credential on this device, user cancels the prompt, the platform authenticator is disabled, the origin does not match a saved credential. Each branch should degrade gracefully, and each is a deterministic path you can test. Cancelling the OS prompt is one of the few OS interactions you can simulate cleanly through the CDP virtual authenticator, which lets you assert your "use your password instead" fallback actually works.

## Deterministic assertions instead of vibes

The danger with AI-driven testing is a test that "looks passed" because the agent narrated something plausible. For a security flow you cannot afford that. This is where BrowserBash's [deterministic Verify assertions](https://browserbash.com/features) matter. A `Verify` step compiles to a real Playwright check, not an LLM judgment call. When you write `Verify the page URL contains /dashboard`, a pass means the condition genuinely held, and a fail comes with expected-versus-actual evidence in the run output, not a hand-wave.

That distinction is everything for a passkey suite. You want the agent's flexibility to navigate a fuzzy, changing UI, and you want hard, non-negotiable checks at the points that define success. A committable `*_test.md` file lets you mix both. Here is a version 2 test that seeds a user through the API, then verifies the passkey login surface through the UI with deterministic assertions:

```markdown
<!-- passkey_login_test.md -->
---
version: 2
---

# Passkey login surface

POST https://api.example.com/test/users with body {"email": "{{email}}", "hasPasskey": true}
Expect status 201, store $.id as 'userId'

Open https://app.example.com/login and enter {{email}} into the email field
Click the 'Continue' button

Verify text "Sign in with a passkey" visible
Verify 'Sign in with a passkey' button visible
Verify 'Use your password instead' link visible
```

In a version 2 file, steps run one at a time against a single browser session. The API step seeds a user with a passkey flag deterministically, with no model involved, and the `Verify` steps compile to real checks. The plain-English step in the middle runs as an agent block that navigates the page. You get the AI's adaptability where the UI is messy and rigid guarantees where correctness is defined. One honest caveat: testmd version 2 currently runs on the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible gateway rather than a purely local Ollama model.

## The CDP virtual authenticator: driving the ceremony without a fingerprint

When you genuinely need to test the ceremony end to end in CI, the answer is not to defeat the OS prompt. It is to replace the real authenticator with a virtual one that the browser fully controls. Chrome exposes this through the Chrome DevTools Protocol under the WebAuthn domain. You enable the virtual authenticator environment, add a virtual authenticator with a chosen transport and protocol (internal for platform passkeys, USB for a simulated security key), and Chrome will satisfy `navigator.credentials.create()` and `get()` without ever drawing an OS dialog.

This is the legitimate, documented path. It is how the browser vendors themselves test WebAuthn, and it is deterministic, which is exactly what CI needs. The virtual authenticator can be configured for resident keys, user verification, and automatic user-presence, so you can script both registration and authentication ceremonies from start to finish, then inspect the credentials it holds to assert registration actually persisted.

The trade-off is honesty about scope. A virtual authenticator proves your WebAuthn wiring is correct: valid challenge options, correct client-side calls, a verification endpoint that accepts the assertion, and an established session. It does not prove that a real Touch ID sensor works, because there is no real sensor in the loop. The hardware is the OS vendor's responsibility. Your job is the integration, and the virtual authenticator tests exactly that.

### How BrowserBash fits with virtual authenticators

BrowserBash drives a real Chrome instance, and its builtin engine speaks the browser through Playwright, which exposes the same CDP WebAuthn domain. In practice you set up the virtual authenticator via a CDP session before or alongside your run, then let the plain-English agent drive the surrounding flow and assert the outcome. You can also point BrowserBash at an external browser over CDP with `--provider cdp` and a `--cdp-url`, which is handy when a separate harness has already configured the virtual authenticator on a browser endpoint and you want the agent to attach to it.

The division of labor is clean: the CDP virtual authenticator handles the cryptographic ceremony deterministically, and the AI agent handles the human-shaped part of the flow (find the button, wait for the redirect, read the dashboard, confirm the passkey shows in account settings). Neither one pretends to do the other's job.

## Reusing a real signed-in session

There is a second, simpler pattern that sidesteps the ceremony entirely for the many tests where login is a precondition rather than the thing under test. If you are testing what happens after a user is authenticated, you do not need to re-run the passkey ceremony on every single test. You need to be logged in.

BrowserBash [saved logins](https://browserbash.com/learn) let you authenticate once by hand, passkey and all, and reuse that session everywhere. You run `browserbash auth save`, a real browser opens, you complete the passkey login yourself as a human, and pressing Enter saves the session as a Playwright storageState. Every later run, test file, or monitor can attach that session with a flag.

```bash
browserbash auth save prod-user --url https://app.example.com/login

browserbash run "Open the account settings page and confirm the registered passkey is listed under Security" \
  --auth prod-user --agent --headless
```

This is the pragmatic default for most suites. Do the human-in-the-loop passkey step once, then run hundreds of downstream tests against a genuinely authenticated session without touching the OS prompt again. If a saved profile's origins do not cover the start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you from the classic "why is my authenticated test hitting the login wall" confusion.

## A realistic passkey test strategy

A mature passkey and WebAuthn test plan splits into layers, each using the right tool for its determinism level. Here is how the surfaces map to approaches.

| Layer | What you test | Automatable? | Best approach |
| --- | --- | --- | --- |
| Feature detection | Passkey option shows only on supported browsers | Yes | AI agent, `Verify` visible/not-visible |
| Pre-prompt UI | Button, chooser sheet, help copy, fallback link | Yes | AI agent plain-English run |
| The ceremony | `create()` / `get()` cryptographic round trip | Yes, simulated | CDP virtual authenticator |
| The OS biometric prompt | Real Touch ID / Windows Hello approval | No | Manual, or virtual authenticator stand-in |
| Cross-device (hybrid) | QR scan, phone over Bluetooth | No, in CI | Manual on real devices |
| Post-login state | Redirect, session, dashboard, credential list | Yes | AI agent + saved session |
| Error branches | Cancel, no credential, disabled authenticator | Mostly | Virtual authenticator + AI assertions |

The honest reading of that table: two rows are genuinely out of reach for headless automation, the real biometric and the cross-device hybrid flow. Everything else is automatable, most of it with a plain-English AI agent plus a handful of deterministic checks. If a tool claims to fully automate the biometric approval in CI without a virtual authenticator, be skeptical, because that would mean defeating the security property WebAuthn exists to provide.

### Keep the manual layer small and explicit

The manual rows do not disappear, but they shrink. You still want a human to confirm, on a real device, that Touch ID actually invokes and that a cross-device QR flow completes. Do that on a documented cadence, per release rather than per commit, as a short scripted checklist. Everything you push into automated layers is one fewer thing a tired human has to remember before a release.

## Running passkey checks continuously

Passkey flows break in production for reasons unrelated to your code: a browser update changes feature detection, an identity provider tweaks its ceremony, a config flag flips. Because the replay cache makes an always-on check nearly token-free, you can watch the passkey surface continuously and get alerted only when something actually changes state.

```bash
browserbash monitor passkey_login_test.md --every 15m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode runs on an interval and alerts only on pass-to-fail or fail-to-pass transitions, in both directions, never on every green run. So a stable passkey login page stays quiet, and the moment the "Sign in with a passkey" button stops rendering or the fallback link vanishes, your team hears about it. Slack webhook URLs get Slack formatting automatically. For a login surface that is business-critical and changes rarely, this is a low-noise way to catch silent regressions, and you can find more patterns like it in the [BrowserBash tutorials](https://browserbash.com/tutorials).

### Wiring it into CI

For pull-request gating, the same tests run in your pipeline through the GitHub Action, which installs the CLI, runs your suite, uploads JUnit and NDJSON artifacts, and posts a self-updating verdict comment on the PR. Because passkey UI checks are fast and deterministic, they make good merge gates: if a refactor removes the passkey option or breaks the password fallback, the PR goes red before it ships.

## When AI automation is the right call, and when it is not

Be balanced about this. An AI browser agent is a strong fit for the passkey surface when your UI changes often, when you want committable plain-English tests your whole team can read, and when you are validating the flows around the ceremony rather than the cryptography itself. It shines at the fuzzy, human-shaped navigation that brittle selectors struggle with, and the deterministic `Verify` layer keeps it honest at the points that matter.

It is the wrong call, or at least not the whole story, in a few cases. If your core need is proving the WebAuthn cryptographic round trip in CI, a CDP virtual authenticator is the primary tool and the AI agent is a helper around it. If you must certify that real hardware biometrics work on specific devices, that is a manual or device-farm job, and no page-driving tool changes that. And if you are testing a pure API-level WebAuthn server with no browser at all, a focused unit and integration suite is more direct than any browser automation.

The strongest setups use all three: deterministic virtual-authenticator tests for the ceremony, an AI agent for the surrounding flows and post-login state, and a thin manual checklist for real-device biometrics. BrowserBash covers the middle layer well and, because it runs a real local Chrome by default with Ollama-first local models, you can develop these tests with no API keys and nothing leaving your machine. For hard multi-step flows, a mid-size local model or a hosted model is more reliable than a very small local model, which can be flaky on long objectives.

## Common mistakes to avoid

A few patterns show up again and again when teams first tackle passkey testing, and each one is avoidable once you know it.

The first is trying to click the OS prompt with a desktop tool that drives raw pixels. It will even click something on your dev machine, but it cannot supply a real biometric and it will not run in headless CI. You are automating the wrong layer.

The second is accepting an agent's narration as a pass. If a test says "the user is now logged in" without a hard check on the resulting URL, session, or a visible dashboard element, you have a test that can lie to you. Anchor every success on a deterministic `Verify`. For a security flow, a soft pass is worse than no test.

The third is re-running the full ceremony on every test when you only needed to be logged in. Save the session once and reuse it. The fourth is testing only the happy path, since the cancel, no-credential, and fallback paths are where real users actually get stuck.

## FAQ

### Can you automate the passkey biometric prompt in a browser test?

No, not the real biometric itself. The Touch ID, Windows Hello, or Android prompt is drawn by the operating system outside the web page, so no browser automation tool, AI agent, or Playwright script can read or approve it. What you can automate is everything around it, plus the cryptographic ceremony itself through a Chrome DevTools Protocol virtual authenticator, which stands in for the real hardware deterministically in CI.

### What is a WebAuthn virtual authenticator and is it safe to use in tests?

A virtual authenticator is a software stand-in that Chrome exposes through its DevTools Protocol WebAuthn domain, letting the browser satisfy credential creation and assertion without a real sensor or OS dialog. It is the documented, vendor-supported way to test WebAuthn, and it is safe because it only exists inside your automated test session, not in production. It proves your integration is wired correctly, though it does not certify that real device hardware works, which stays a manual check.

### How does BrowserBash verify a passkey login actually succeeded?

BrowserBash uses deterministic Verify assertions that compile to real Playwright checks rather than trusting the AI agent's narration. You assert concrete conditions like the URL containing your dashboard path, a heading being visible, or a registered passkey appearing in account settings, and a pass means the condition genuinely held with expected-versus-actual evidence on failure. This gives you the agent's flexibility to navigate a changing UI while keeping the success criteria rigid and honest.

### Do I need to log in with a passkey on every test run?

No, and you should not. Use saved logins to complete the passkey ceremony by hand once, which stores the authenticated session as a Playwright storageState, then reuse that session on every downstream test with the auth flag. This lets you run hundreds of post-login tests against a genuinely authenticated session without touching the OS prompt again, which is far faster and less flaky than re-running the ceremony each time.

Passkey and WebAuthn testing is not all-or-nothing. Draw the line at the OS prompt, automate the large surface on both sides of it with plain-English tests and deterministic checks, and simulate the ceremony with a virtual authenticator when CI needs it. To try it, run `npm install -g browserbash-cli` and start writing your first passkey surface test in minutes. An account is optional, but you can [sign up here](https://browserbash.com/sign-up) if you want the free cloud dashboard and monitor alerts.
