---
title: Anthropic computer use tool: a developer guide
description: "A developer's guide to Anthropic computer use: the agentic tool loop, screenshot/click actions, model support, safety, and a browser-scoped alternative."
date: 2026-02-19
category: agents
---

If you have watched a Claude model take a screenshot, move a cursor, click a button, and type into a field on its own, you have seen the Anthropic computer use tool at work. It is a beta capability that lets Claude perceive a screen as pixels and act on it with mouse and keyboard, the same way a person would. This guide is for developers who want to understand what is actually happening under the hood: the tool loop that drives each step, the action vocabulary the model emits, which models support which tool versions, and the safety machinery you inherit when you wire it up. I will also draw an honest parallel to BrowserBash, whose builtin engine runs an Anthropic-style tool-use loop but stays deliberately scoped to the browser. Knowing where each one fits will save you money and grief.

Let me be clear about scope up front, because it shapes every recommendation below. Anthropic computer use is general: it can drive a desktop, open a native app, manipulate a file manager, and click through a web page, all through one screenshot-and-coordinate interface. BrowserBash is browser-scoped: it automates web browsers and nothing else. That difference is the whole point of this article.

## What the Anthropic computer use tool actually is

Computer use is exposed through the Claude API as a special tool type. You declare it in the `tools` array of a Messages request, the same place you would declare any function tool, but instead of a JSON schema you describe a display. The tool tells Claude that it can see a screen of a given pixel width and height, and that it can act on that screen. From the model's point of view, the world is a sequence of screenshots, and its job is to emit actions that move that world toward the goal you gave it in the user prompt.

The tool provides four kinds of capability: screenshot capture so Claude can see the screen, mouse control for clicking and dragging and moving the cursor, keyboard input for typing and shortcuts, and general desktop automation across any application. Anthropic reports state-of-the-art results among single-agent systems on WebArena, a benchmark for autonomous web navigation across real websites, a useful signal that the approach holds up on multi-step browser tasks. The mental model that matters: Claude has no API into the apps it controls. It has eyes and hands. It looks at pixels and emits coordinates, and your code turns those coordinates into real clicks.

That last sentence is the crux of computer use, and it is where most of the engineering work lives.

## The tool loop, step by step

The core of Anthropic computer use is what the documentation calls the agent loop: a cycle where Claude requests a tool action, your application runs it, and you return the result to Claude so it can decide the next action. Nothing about this is magic. It is a `while` loop you write.

Here is the loop in plain terms:

1. You send a Messages request with the user's goal, the computer tool definition, and the beta header.
2. Claude responds. If the response contains a `tool_use` block, Claude wants you to do something: take a screenshot, click at `[500, 300]`, type a string, press a key.
3. Your code executes that action against the real environment. For a screenshot, you capture the display. For a click, you move the cursor and press the button. For typing, you send keystrokes.
4. You append a `tool_result` block to the conversation. For a screenshot action, that result is a fresh image of the screen. For most other actions, the result is whatever changed, usually another screenshot you take to show the new state.
5. You send the updated conversation back to Claude, and the loop repeats until Claude stops requesting actions and returns a final text answer.

The pieces around this loop matter. Anthropic's reference implementation runs against a Linux desktop in Docker: a virtual X11 display server such as Xvfb renders the screen, a lightweight window manager gives it something to interact with, and tool code translates Claude's abstract requests ("move mouse", "take screenshot") into real operations. You do not have to use Docker or X11, but you do have to provide all of those pieces: something that renders a screen, something that executes actions, and the loop that ferries messages back and forth.

One practical detail that bites people: when you build the user turn's content, put the instruction text before the screenshot image. Anthropic's guidance is explicit that describing the target before the image is processed improves click accuracy. Small ordering decision, measurable effect.

## The action vocabulary

When Claude drives a computer, it emits actions from a fixed set, and the set depends on the tool version you declare. Knowing the vocabulary helps you reason about what the model can and cannot express.

The basic actions, available on every version, are `screenshot` (capture the display), `left_click` at a coordinate, `type` for a text string, `key` for a key or combination such as `ctrl+s`, and `mouse_move` to reposition the cursor.

The `computer_20250124` version, available on all models that support computer use, adds a richer set: `scroll` with direction and amount, `left_click_drag` between two points, `right_click` and `middle_click`, `double_click` and `triple_click`, fine-grained `left_mouse_down` and `left_mouse_up` for when a single click event is not enough, `hold_key` to keep a key down for a duration in seconds, and `wait` to pause between actions.

The newest version, `computer_20251124`, is available on Claude Opus 4.8, Claude Opus 4.7, Claude Opus 4.6, Claude Sonnet 4.6, and Claude Opus 4.5. It includes everything from the prior version and adds `zoom`, which lets Claude view a specific region of the screen at full resolution. Zoom requires `enable_zoom: true` in the tool definition and takes a `region` parameter with `[x1, y1, x2, y2]` corners. This exists because screenshots get downscaled and small text — file names in a sidebar, tab titles, status-bar text, line numbers, button labels — can become illegible. With zoom on, Claude can ask to inspect a region instead of guessing.

Each action is a `tool_use` block with an `action` field and, where relevant, a `coordinate`. A click looks like `{"action": "left_click", "coordinate": [500, 300]}`. Typing looks like `{"action": "type", "text": "Hello, world!"}`. Your executor reads the action, performs it, and reports back.

## The three tools that ship together

Computer use is usually deployed alongside two companion tools, and in the official examples all three are declared together. They are separate tool types, but they compose into one automation surface.

The computer tool itself is `computer_20251124` (or the older `computer_20250124`), declared with a `display_width_px` and `display_height_px` — the examples use `1024` and `768`. The text editor tool is `text_editor_20250728`, named `str_replace_based_edit_tool`, which lets Claude view and edit files through string replacement rather than blind overwrites. The bash tool is `bash_20250124`, which gives Claude a shell. Together they let an agent see the screen, edit files, and run commands, which covers a lot of real desktop work. You declare them in a single request:

```json
{
  "tools": [
    {"type": "computer_20251124", "name": "computer", "display_width_px": 1024, "display_height_px": 768},
    {"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"},
    {"type": "bash_20250124", "name": "bash"}
  ]
}
```

This composition is part of why computer use is genuinely general. The model is not boxed into a browser. It can drop to a shell, edit a config file, and go back to clicking. That power makes it the right tool for OS-level work, and it is also what makes it heavier and harder to make deterministic than a browser-only approach.

## Model support and beta headers as of 2026

Computer use is a beta feature, which means you must send an `anthropic-beta` header, and the correct value depends on the model. Getting this wrong is one of the most common reasons a first integration returns an error, so it is worth pinning down.

| Beta header | Tool version | Supported models (as of 2026) |
| --- | --- | --- |
| `computer-use-2025-11-24` | `computer_20251124` | Claude Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5 |
| `computer-use-2025-01-24` | `computer_20250124` | Claude Sonnet 4.5, Haiku 4.5, Opus 4.1 (deprecated), Sonnet 4 and Opus 4 (retired except on some platforms) |

Model choice affects more than features. Anthropic notes that Claude Sonnet 4.6 is more mechanically precise at clicking than Claude Opus 4.6 and is more robust when screenshots require heavy downscaling, while Claude Opus 4.7 narrows that gap with click precision roughly comparable to Sonnet 4.6 and a higher resolution limit that means less downscaling. There is a real per-model trade-off between precision, resolution headroom, and cost. The beta surface and the model lineup move quickly, so treat the table above as a 2026 snapshot and check the current docs before you ship; exact future versions are not publicly specified.

## Screenshots, coordinates, and the resolution problem

The single most underestimated part of building on Anthropic computer use is coordinate handling. Claude sees a screenshot, reasons about it, and emits pixel coordinates. If the screenshot it saw is a different size from the display you are controlling, the coordinates will be off even when the reasoning is perfect.

The API constrains the analysis image, so the screenshot Claude sees can be smaller than your real screen. Anthropic trained the model to count pixels from reference points such as screen edges and known UI elements, which helps, but you still have to resize and remap coordinates correctly between what the model saw and what you click. Get this wrong and the model clicks the right idea at the wrong place.

Resolution choice feeds directly into accuracy. Anthropic's troubleshooting guidance suggests 1024x768 or 1280x720 for general desktop tasks, and 1280x800 or 1366x768 for web applications, with 1280x720 as a baseline to try when accuracy is consistently poor. Higher resolutions can help legibility but demand careful coordinate scaling. There is also a cost dimension: long agent loops accumulate screenshots fast, roughly 1,000 to 1,800 input tokens each, so an agent that takes a screenshot after every action burns context and money quickly. Prompt caching and bounding how many screenshots you keep in context become real concerns at scale.

This is the architectural fork in the road. Computer use reads pixels. That is what makes it universal — any app that renders to a screen can be driven. It is also what makes it comparatively expensive, slower, and harder to make perfectly repeatable, because pixels shift, fonts render differently, and downscaling loses detail.

## Safety: prompt injection is the headline risk

Anthropic is direct about the risks, and you should be too. When Claude is reading screens and clicking, it can encounter content that tries to hijack it. The docs state plainly that in some circumstances Claude will follow commands found in content even when they conflict with the user's instructions — instructions hidden on a webpage or inside an image can override what you asked for. Take precautions to isolate Claude from sensitive data and actions.

There is built-in defense. Anthropic trained the model to resist prompt injection and added classifiers that automatically run on prompts during computer use. When those classifiers spot a likely injection in a screenshot, they steer the model to ask for user confirmation before the next action. That human-in-the-loop pause is good for most cases and awkward for fully unattended ones, and you can contact support to opt out if you must run without a human.

Anthropic's recommendations are worth following: avoid giving the model access to sensitive accounts; ask a human to confirm decisions with real-world consequences such as accepting cookies, completing financial transactions, or agreeing to terms of service; and if the model must log in, pass credentials inside XML tags such as `<robot_credentials>` and review the prompt-injection guidance first, because logging in raises the stakes if an injection succeeds. Two more reliability notes: Claude sometimes assumes an action worked without checking, so prompting it to screenshot and verify after each step helps; and dropdowns and scrollbars can be fiddly with the mouse, so nudging it toward keyboard shortcuts often works better.

## Where BrowserBash fits: an Anthropic-style loop, browser only

Here is the honest parallel. BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it with `npm install -g browserbash-cli` and run `browserbash`. You give it a plain-English objective and an AI agent drives a real Chrome or Chromium step by step, no selectors, and returns a verdict plus structured values.

Under the hood, BrowserBash ships two engines. The default is `stagehand` (MIT). The other is the `builtin` engine, which runs an Anthropic tool-use loop — the same request, `tool_use`, execute, `tool_result`, repeat cycle described above. So if you have understood the computer use loop in this article, you already understand the shape of what BrowserBash's builtin engine does. The crucial difference is what the tools point at. Anthropic computer use points at a screen and emits pixel coordinates. BrowserBash points at a browser and works against the DOM. It is not taking screenshots and counting pixels to find a button; it is reasoning over page structure to act on the right element. That makes it cheaper, faster, and more deterministic for browser tasks — and completely unable to do anything outside a browser, by design.

A single BrowserBash command replaces the loop you would otherwise hand-build:

```bash
browserbash run "Go to the demo store, add the first product to the cart, start checkout, and confirm the cart subtotal is shown"
```

That one objective navigates, decides what to click, types where needed, copes with the page changing under it, and returns a pass/fail verdict plus any values it extracted. For CI, the agent mode emits NDJSON with clean exit codes, and you can capture a session recording:

```bash
browserbash run "Log in, open billing, and confirm the plan name and next invoice date" --agent --record
```

You can also point the same objective at different browser backends with `--provider` — `local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack` — without rewriting the test. None of that is OS-level computer use. It is browser-scoped on purpose. See the [features page](https://browserbash.com/features) for the full surface and the [tutorials](https://browserbash.com/tutorials) for end-to-end walkthroughs.

### The model story, and why it can cost you nothing

One more contrast worth drawing. Anthropic computer use runs on Anthropic's hosted Claude models, billed per token, and as covered above the screenshots in a long loop add up. BrowserBash is Ollama-first. Its default mode is `auto`, which prefers a local Ollama model, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. With a capable local model, your browser automation bill is zero and nothing leaves your machine. It also supports OpenRouter and Anthropic directly when you want a hosted model.

The honest caveat: tiny local models, roughly 8B and under, get flaky on long multi-step runs. The sweet spot is a Qwen3 or Llama 3.3 70B-class model, or a hosted model, when the task has many steps. The [learn section](https://browserbash.com/learn) covers model selection in more depth.

## Repeatable browser tests with markdown

For anything you run more than once, hand-writing prompts gets old. BrowserBash supports markdown test files named `*_test.md` with `{{variables}}` and masked secrets, so a flow becomes a checked-in artifact rather than a one-off command. You author the steps and expectations in plain English, pass values at runtime, and keep credentials out of logs:

```bash
browserbash testmd run checkout_test.md --var store_url=https://shop.example.com --var coupon=SAVE10
```

This is the part of BrowserBash that maps cleanly onto how QA and SDET teams already work: a suite of readable tests, variables for environments, masked secrets, NDJSON for the pipeline, and optional recordings for evidence. It is what an Anthropic-style tool loop looks like when you constrain it to the browser and wrap it in a test harness. For real-world examples, the [case studies](https://browserbash.com/case-study) show the pattern in production-style flows.

## Anthropic computer use vs BrowserBash: an honest comparison

Both run an agentic tool loop. The difference is scope and substrate, and being clear about it tells you which to reach for.

| Dimension | Anthropic computer use | BrowserBash (builtin engine) |
| --- | --- | --- |
| Scope | Whole computer: desktop, native apps, files, shell, browser | Web browser only |
| How it perceives | Screenshots, pixel coordinates | DOM / page structure |
| Loop | Agent loop you build around the Claude API | Built-in loop, runs from one CLI command |
| Models | Hosted Claude (Opus/Sonnet, per-token) | Ollama-first `auto`, plus OpenRouter and Anthropic |
| Determinism | Lower: pixels shift, downscaling loses detail | Higher: structure-based, CI-friendly |
| Typical cost | Per-token, screenshots add up in long loops | $0 with a local model; hosted optional |
| Best at | OS-level and cross-app automation, RPA-style work | Browser flows: login, checkout, forms, data extraction, smoke tests |
| Setup | VM/container, display server, action executor, loop code | `npm install -g browserbash-cli` |

### When to choose Anthropic computer use

Reach for Anthropic computer use when the task genuinely lives outside the browser, or spans the browser and the OS. Driving a native desktop application, manipulating files in a system file manager, running shell commands as part of a workflow, automating a legacy thick-client app, or stitching together several unrelated applications — this is what general computer use and RPA-style tools are for, and where a browser-only tool cannot help you. If your automation has to click a button in a desktop app that has no web version, computer use wins, full stop. Just be honest about whether you are paying the pixel-coordinate and per-token cost for capability you actually need.

### When to choose BrowserBash

Reach for BrowserBash when the task lives in a browser, which is most web QA and a great deal of web automation. Logging into a web app, completing a checkout, filling and submitting forms, extracting structured values from pages, running smoke tests in CI — BrowserBash is cheaper (free local models), faster (no screenshot round-trips), more deterministic (DOM-based, not pixel-based), and friendlier to pipelines (NDJSON, exit codes, markdown tests). You do not build the loop; you install a CLI and write objectives. If the task never leaves Chrome, paying for general computer use is overkill, and a browser-scoped tool will be more reliable for the money. For teams that want both local runs and a shared view, BrowserBash also offers an optional cloud dashboard; you can start free at the [sign-up page](https://browserbash.com/sign-up).

## FAQ

### What is the Anthropic computer use tool?

It is a beta capability in the Claude API that lets a Claude model see a screen through screenshots and control it with mouse and keyboard actions. You declare a computer tool with a display size, and Claude emits actions like screenshot, click, type, and key, which your application executes in a real or virtual environment. It is designed for general desktop automation across any application, not just web pages.

### How does the computer use agent loop work?

You send the user's goal plus the tool definition to the Claude API, and Claude replies with a tool-use request such as a click or a screenshot. Your code performs that action, captures the result (usually a fresh screenshot), and returns it to Claude as a tool result. That request-execute-return cycle repeats until Claude stops requesting actions and gives a final answer, which is why it is called the agent loop.

### Is the Anthropic computer use tool safe to run unattended?

It carries real risk, mainly from prompt injection, because Claude can follow instructions hidden in on-screen content even when they conflict with yours. Anthropic trained the model to resist this and added classifiers that pause for human confirmation when they detect a likely injection. For unattended use you should isolate it from sensitive data and accounts, require confirmation for consequential actions, and review Anthropic's prompt-injection guidance before granting any credentials.

### Can BrowserBash replace Anthropic computer use?

Only for browser tasks. BrowserBash runs an Anthropic-style tool-use loop in its builtin engine but is scoped to web browsers and works against the DOM rather than screen pixels, which makes it cheaper, faster, and more deterministic for web flows. For OS-level or cross-application automation outside the browser, general computer use or an RPA tool is the right fit; BrowserBash cannot drive a native desktop app.

Browser task, not a desktop one? Install the CLI and hand it an objective.

```bash
npm install -g browserbash-cli
```

It is free and open source, runs on local models for a $0 bill, and an account is optional — create one at https://browserbash.com/sign-up if you want the cloud dashboard.
