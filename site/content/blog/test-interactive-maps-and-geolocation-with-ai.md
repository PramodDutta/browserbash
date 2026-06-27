---
title: Testing Interactive Maps and Geolocation Features With AI
description: "Test maps geolocation features with AI by stating intent in plain English while BrowserBash sets a mock location and drives map controls by accessible name."
date: 2026-06-27
category: testing
---

To test maps geolocation features with AI, you describe what should happen in plain English (set a fake GPS position, click the store-locator search, confirm the right markers appear) and let an AI agent drive a real Chromium browser, while you grant a mocked location through the browser context so the page believes it is at coordinates you chose. BrowserBash does exactly this: it sets a mock latitude and longitude, interacts with map controls through their accessible names and roles rather than CSS classes, and returns a pass or fail verdict. The honest catch, which this article covers in full, is that the tile imagery inside most map widgets is drawn on a canvas or WebGL surface that no agent can read semantically. So you test the controls, the search, the geolocation gate, and the UI around the map, not the colored pixels of the raster itself.

That boundary is the whole game. A "map feature" is two layers stacked together. The bottom layer is the rendered tile image (roads, terrain, satellite imagery) painted by Mapbox GL, Google Maps, or Leaflet onto a canvas. The top layer is everything a human interacts with: a search box, zoom buttons, marker pins with labels, an info popup, a "use my location" button, a results list beside the map. The top layer is mostly real DOM with real accessible names; the bottom layer is opaque. AI testing wins on the top layer and is honest about the bottom one.

## What BrowserBash is, in one paragraph

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. Install it with `npm install -g browserbash-cli`, then write a plain-English objective. An AI agent drives a real Chrome or Chromium browser step by step, with no selectors, no page objects, and no waits to tune, then returns a pass/fail verdict plus structured results. By default it resolves Ollama first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY` (free hosted models exist there); run on a local model and nothing leaves your machine. There is a fuller tour on the [BrowserBash learn pages](https://browserbash.com/learn) and a capability summary on the [features page](https://browserbash.com/features).

One honest caveat: very small local models (roughly 8B and under) can get flaky on long, multi-step objectives, and map flows tend to be long. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a hosted model for the hardest flows. Keep each objective focused on one map behavior and that flakiness mostly disappears.

## How the agent sees a map widget

Map controls are testable because of how BrowserBash finds elements. It does not match CSS selectors or memorize a brittle XPath; it reads the page's accessibility tree (the roles, accessible names, and states screen readers consume) plus the DOM, and decides the next action from what is rendered at that moment. A `button "Zoom in"`, a search field labeled `Search this area`, and a marker rendered as a `button` named `Blue Bottle Coffee, 315 Linden St` are all first-class targets. The post on [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree) covers the mechanics.

This is why a map's accessibility markup determines how testable it is. A store locator with proper ARIA labels, a real results list, and named buttons is highly testable. One that paints clickable hotspots straight onto the canvas with no DOM equivalent is mostly invisible to any agent, and to screen-reader users too, so a map that is hard for BrowserBash to drive is often flagging a real accessibility gap. The agent also handles iframes and Shadow DOM with no special setup, which matters because embedded maps frequently live behind those boundaries.

## Setting a mock location

Geolocation-gated UI is the part teams dread testing manually, because you cannot move your laptop to Tokyo to check the Japan store list. When you state a location in your objective, BrowserBash grants the geolocation permission on the browser context and overrides the coordinates, so `navigator.geolocation.getCurrentPosition()` resolves to your chosen latitude and longitude with no real GPS and no permission prompt blocking the run. A geolocation objective reads like an acceptance criterion someone on your team wrote:

```bash
browserbash run "On https://shop.example.com/stores, set my location to \
latitude 40.7128, longitude -74.0060 (New York City), click the 'Use my \
location' button, and confirm the results list updates to show stores \
sorted by distance with the nearest one in Manhattan at the top." --record
```

The `--record` flag captures a screenshot and a full `.webm` session video, so when the nearest-store sort comes back wrong you can replay exactly what the browser did. Test the denial path the same way; a robust locator should degrade gracefully when permission is refused, usually falling back to a manual ZIP or city search:

```bash
browserbash run "On https://shop.example.com/stores, deny location access, \
and verify the page shows a manual search box with placeholder text \
'Enter a ZIP or city' instead of an error screen." --record
```

Both paths are pure intent. You are not wiring up a permissions API or a mock provider; you are saying what the location should be and what the page should do about it.

## A store-locator test in Markdown

For anything you run more than once, move it into a Markdown test file. BrowserBash tests are intent, not selectors: a `*_test.md` file is a title, a list of steps, plus optional `@import` composition and `{{variables}}`. Here is a store-locator flow:

```markdown
# Store locator finds the nearest open location

- Go to https://shop.example.com/stores
- Set my location to latitude {{lat}}, longitude {{lng}}
- Click the "Use my location" button
- Confirm the results panel lists at least three stores
- Confirm the top result shows a distance under 5 miles
- Click the top result's "Get directions" link
- Confirm a directions panel opens with a route summary
```

Run it with variables supplied at the command line:

```bash
browserbash testmd run ./store_locator_test.md \
  --var lat=40.7128 --var lng=-74.0060
```

Every step is a claim the agent verifies against the live DOM and accessibility tree, not a saved selector: the results panel and its contents, the distance text, the named "Get directions" link, the directions summary. All real DOM, none of it asking the agent to read the map tiles. Variables also mask in logs when they hold secrets, so an authenticated flow pulls credentials in without leaking them into CI output.

### Composing with `@import`

Most map features sit behind a login. Rather than repeat login steps in every test, factor them out and import them with `@import ./login_test.md` at the top of the file:

```markdown
# Saved address shows correct nearby stores

@import ./login_test.md

- Go to https://shop.example.com/account/stores
- Confirm the map centers on my saved home address
- Confirm a marker labeled "Home" is present
- Click the "Show nearby" button
- Confirm at least one store marker appears in the results list
```

The imported login runs first, then the map assertions follow. This keeps each file small and focused, which keeps the model on track since shorter objectives are where local models behave best. Variables passed with `--var lat=... --var lng=...` let one file cover many regions.

## Driving map controls by accessible name

The controls around and on top of a map are where AI testing shines, because you reference them the way a person describes them. Zoom and pan controls are usually named buttons: "click 'Zoom in' twice, then confirm the zoom-level indicator reads 14" works when those controls expose accessible names, which the major libraries do by default. Search-as-you-move features like Mapbox's "Search this area" are named buttons too, so the button appearing after you move the map is checkable even though the tiles underneath are not.

Markers are the subtle one. A well-built map renders each marker as a focusable element with an accessible name, so "click the marker for 'Downtown Branch' and confirm its popup shows the phone number" works. When markers are painted onto the canvas with no DOM node, the agent cannot click an individual pin, so you fall back to the results list. Autocomplete in the location search box is a search problem more than a map problem: the post on [automating search functionality testing](https://browserbash.com/blog/automate-search-functionality-testing) covers debounced inputs, suggestion dropdowns, and result assertions, and a map's "find a city" box behaves the same way.

## Handling the slow, late, and shifting parts

Maps are some of the most dynamic UI on the web: tiles stream in, markers appear after a fetch, the layout reflows when a results panel slides in. Two things keep this from becoming a flake factory. First, Playwright's built-in auto-wait. BrowserBash uses Playwright under the hood, which waits for elements to be actionable before interacting, up to a 15-second ceiling, with no manual `sleep` calls.

Second, the agent re-derives state every step. On the default `stagehand` engine (MIT, by Browserbase) it observes the live DOM each step and decides the next action from what is rendered right then; the alternative `builtin` engine (an Anthropic tool-use loop) re-derives the selector on every action from a fresh snapshot, never cached across runs. Either way, when a marker list repaints after a location change, the next step reads the new state, not a stale one. This is reading live state fresh each run, not patching a saved script. The deeper treatment is in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis), and the broader case for skipping brittle selectors is in [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors). So you do not tune waits for tile loads: assert the end state ("a marker labeled X is present," "the results list has at least three items") and let auto-wait and live-state reading absorb the timing.

## Running map tests in CI

Once a map flow passes locally, wire it into your pipeline as a headless, machine-readable run:

```bash
browserbash testmd run ./store_locator_test.md \
  --var lat=40.7128 --var lng=-74.0060 \
  --headless --agent --record
```

The `--agent` flag emits NDJSON so a CI step can parse each event, and exit codes map cleanly onto a pipeline gate: `0` pass, `1` fail, `2` error, `3` timeout. A `Result.md` is written per run, and `--record` saves the `.webm` plus screenshots so a failed nightly map check leaves you a video instead of a guess. Point the run at different infrastructure with `--provider local|cdp|browserbase|lambdatest|browserstack`, and `--upload` opts into a cloud dashboard (free runs kept 15 days); otherwise `browserbash dashboard` gives you a local one.

## Honest limits

Map testing has sharper limits than most UI testing, so be candid.

**The agent cannot read the map raster.** This is the big one. Tile imagery, satellite views, painted route polylines, and heat-map overlays live on a canvas or WebGL surface with no DOM, no text, no accessible name for "the blue road between two points." If your assertion depends on what the tiles look like, an agent reading the accessibility tree cannot verify it. Test the controls, markers-as-DOM, search, and results list instead, and treat tile-rendering correctness as a job for pixel-level visual diffing.

**Canvas-only markers are invisible.** Some maps draw pins directly on the canvas with no DOM equivalent, and those markers cannot be clicked or named by any agent. Lean on the parallel results list (canvas-only markers are an accessibility gap for real users too).

**Pan and gesture physics are approximations.** You can ask the agent to pan or zoom and assert the resulting DOM changes (a "Search this area" button appearing, a zoom indicator updating), but not pixel-precise pan offsets or momentum-scroll physics on a real touch digitizer.

**Coordinate mocking is browser-level, not network-level.** A mock location overrides what `getCurrentPosition` returns; it does not fake your IP. If a feature geolocates by IP, the override will not move it, so test those paths with a real proxy.

**Third-party tile quotas are real.** Hammering a Google Maps or Mapbox embed in a tight CI loop can hit usage quotas or trip bot defenses. Mock the provider, or test against a staging build with a test API key, so your suite does not burn your production map budget.

**Small local models drift on long flows.** A flow that logs in, sets a location, searches, sorts, opens a popup, and reads directions is a lot of steps; sub-8B local models can lose the thread. Use a 70B-class local or hosted model and split long journeys into composed `@import` pieces.

None of these are unique to BrowserBash. The canvas-opacity problem hits any tool that reasons over the DOM, including code-first Playwright, which also cannot read into a WebGL canvas.

A fair word on the alternatives: hand-written Playwright or Selenium can test these same map controls, and for a stable internal locator with clean selectors a Playwright spec is fast and rock-solid. The tradeoff is maintenance, since map widgets and third-party embeds churn their markup and selector-based tests break on class-name shifts even when behavior did not. BrowserBash trades a little per-run latency and model variability for intent-based tests that survive cosmetic DOM changes. Neither approach can read the canvas tiles, so pick BrowserBash for plain-English tests and selector resilience, hand-written Playwright for millisecond determinism on a stable target. Many teams run both.

## FAQ

### Can BrowserBash verify the actual map image is correct?

No, and no DOM-based tool can. The map tiles are drawn on a canvas or WebGL surface with no text or accessible names, so an agent reading the accessibility tree cannot tell what the imagery shows. BrowserBash verifies everything around and on top of the map that lives in the DOM: search boxes, zoom and pan buttons, marker pins exposed as elements, popups, and the results list. For pixel-level tile correctness, use visual diffing or the map provider's own test suite.

### How do I test geolocation without moving my computer?

You set a mock location in the objective, such as "set my location to latitude 40.7128, longitude -74.0060." BrowserBash grants the geolocation permission and overrides the coordinates, so `navigator.geolocation.getCurrentPosition()` resolves to those values with no real GPS and no permission prompt blocking the run. Test the denied path by saying "deny location access" and asserting the page falls back to a manual search instead of erroring.

### Can the agent click individual map markers?

Only when the marker is a real DOM element with an accessible name (a focusable `button` labeled with the place name, which the major map libraries produce by default). When markers are painted onto the canvas with no DOM node, no agent can click an individual pin, so assert against the parallel results list instead. A map that exposes markers as named elements is both more testable and more accessible to screen-reader users.

### Does mocking my location also change my IP-based region?

No. The mock overrides the browser geolocation API only. It does not change your IP, so an IP-based "you appear to be in Germany" banner will not move with it; test those through a real proxy. Browser geolocation mocking is the right tool for `getCurrentPosition`-driven UI like store locators and "near me" search.

## Where this lands

Interactive maps split cleanly into a testable shell and an untestable raster, and AI testing is at its best when you respect that line. Use BrowserBash to set a mock location, drive zoom, pan, and search controls by their accessible names, click DOM-backed markers, and assert on the results list and popups, all as plain-English intent that survives the markup churn map widgets are famous for. Send the tile imagery itself to visual diffing, where it belongs. Install with `npm install -g browserbash-cli`, write one focused store-locator objective, add `--record`, and watch the agent walk your locator the way a faraway customer would.
