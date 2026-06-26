---
title: "Testing Salesforce and ServiceNow: Shadow-DOM-Heavy Apps"
description: "Test Salesforce automation and ServiceNow shadow DOM testing without brittle selectors. Intent-based browser tests that pierce Shadow DOM and iframes."
date: 2026-06-26
category: use-case
---

Short answer: enterprise platforms like Salesforce (built on Lightning Web Components) and ServiceNow are automation nightmares because the things selectors depend on (stable IDs, flat DOM, predictable class names) barely exist on these apps. IDs are auto-generated and regenerate per session, controls live several layers deep inside Shadow DOM, and large chunks of the page render inside iframes. Intent-based testing helps because you stop pointing at the DOM and start describing what a user does. With BrowserBash you write an objective like "open the new Case form and set Priority to High," and the agent reads the page's accessibility tree and live DOM to find that control by its role and visible label, piercing Shadow DOM and crossing iframe boundaries that snap a selector-based script in half. That does not make these apps easy. They are the hardest target there is. But the failure mode shifts from "my selector rotted overnight" to "the agent has to actually find the control a human would click."

This post explains why selectors are so brutal on Salesforce and ServiceNow, how an intent-based approach sidesteps the worst of it, the practical patterns that make runs reliable, and an honest account of where this approach still struggles.

## Why selectors rot on Salesforce and ServiceNow

If you have automated a Lightning org or a ServiceNow instance with Selenium, Playwright, or Cypress, you already know the pain. Here is what is actually happening under the hood, and why classic locators decay so fast.

### Auto-generated IDs that change per session

Salesforce Lightning and ServiceNow both generate element IDs at render time. You inspect a field, copy its `id`, write `#input-42` into your test, and it passes today. Tomorrow the same field renders as `#input-87` because the framework re-keyed the component tree, or because a different set of components loaded first, or simply because it is a new session. The ID was never a contract. It was an implementation detail you borrowed, and the framework is under no obligation to keep it stable.

This is not occasional drift. On Lightning Web Components the generated identifiers are expected to change, and Salesforce's own guidance steers you away from depending on them. So any locator strategy anchored to IDs is building on sand.

### Deeply nested Shadow DOM

Lightning Web Components render inside shadow roots. A single field on a record page can sit inside a custom element, which sits inside another custom element, each with its own shadow boundary. A normal CSS selector or XPath query stops at the first shadow root. It cannot see inside. That is the entire point of Shadow DOM, it encapsulates internals so the outside world cannot reach in.

To reach a control with Playwright or Selenium you end up chaining shadow-root traversals, hand-writing the path through each boundary. The moment Salesforce reorganizes a component, restructures the nesting, or ships a new version of a base component, your hand-built path through the shadow tree breaks. You are maintaining a map of someone else's internal architecture, and they redraw the map on their release schedule, not yours.

### iframes everywhere

ServiceNow is notorious here. Classic UI loads the main content area inside an iframe (the `gsft_main` frame is a familiar sight to anyone who has automated it), and modern interfaces still embed framed content for many surfaces. Salesforce has its own framed regions, especially around Visualforce pages, embedded apps, and canvas components.

A selector that does not first switch into the correct frame simply does not find the element, because the element lives in a separate document. So your script becomes a sequence of "switch to frame, do thing, switch back," and every one of those frame switches is another place to get the timing wrong or target the wrong frame after a layout change.

### Layouts that change with configuration

The final twist is that these are configurable platforms. An admin adds a required field, reorders a section, enables a new Lightning component, changes a form layout, or installs a managed package. None of that is a code change you control, but all of it can move or rename the thing your selector was pointing at. Two orgs running the same Salesforce edition can have meaningfully different DOM on the same standard object. A test hard-coded to one org's layout is fragile by construction.

Put these four together (regenerating IDs, nested Shadow DOM, iframes, config-driven layout) and you get the defining experience of enterprise test automation: scripts that pass in the demo and rot within weeks.

## How BrowserBash sidesteps the worst of it

BrowserBash does not ask you for a selector. You give it an objective in plain language, and the agent figures out how to satisfy it by looking at the page the way assistive technology does.

### Find by role and label, not by CSS

When the agent needs to act, it reads the page's accessibility tree alongside the live DOM. The accessibility tree is the same structure a screen reader consumes: it exposes each control's role (button, textbox, combobox, link) and its accessible name (the visible label, the `aria-label`, the associated `<label>` text). The agent matches your intent against that. "Set Priority to High" becomes "find the combobox whose accessible name is Priority, open it, choose the option named High."

This matters on enterprise apps specifically because the accessible name is far more stable than the generated ID. Salesforce and ServiceNow both invest in accessibility, so a field that users see as "Priority" generally carries that label in the accessibility tree even as the underlying `id` churns from session to session. You are matching on the thing that is meant to stay constant (what the control is and what it is called) instead of the thing that is meant to change.

### Piercing Shadow DOM and crossing iframes

Because the agent works from the accessibility tree and a live snapshot of the page rather than a single document query, Shadow DOM boundaries and iframe boundaries are part of the terrain it already traverses, not walls it has to be told about in advance. A control nested three shadow roots deep inside a Lightning component, or a field living inside ServiceNow's main content iframe, is reachable without you hand-writing the traversal path. This is exactly the class of problem that breaks selector-based scripts, and it is worth understanding in detail. We go deep on the mechanics in [the iframe and Shadow DOM deep dive](/blog/iframe-and-shadow-dom-ai-browser-testing), and on how the element-finding works generally in [how BrowserBash finds elements with the accessibility tree](/blog/how-browserbash-finds-elements-accessibility-tree).

### Re-derived from a fresh snapshot every action

Here is the part that addresses the per-session ID problem head on. BrowserBash does not record a selector once and replay it. Before each action it takes a fresh snapshot of the page and re-derives how to reach the target from what is on screen right now. So when Salesforce hands you `#input-42` today and `#input-87` tomorrow, it does not matter, because nothing was pinned to either value. The agent looks again, finds the Priority combobox by what it is, and acts.

Be precise about what that is and is not. It is re-derivation from a current snapshot, the agent re-solves the lookup each time. It is not self-healing, and this post will not claim it is. There is no stored locator quietly repairing itself in the background. The agent simply does not store the brittle locator in the first place, so there is nothing to heal.

## Practical patterns that make enterprise runs reliable

Intent-based testing removes the selector tax, but you still have to write good objectives. On heavy platforms the difference between a reliable run and a flaky one is mostly in how you scope and phrase the work.

### Use the labels users actually see

Write objectives in the vocabulary of the UI. "Click the New button," "open the Cases tab," "set the Account Name field to Acme Corp," "choose Status equals Closed." Those visible strings are what the agent matches against in the accessibility tree, and they are the same words your manual testers and business users already use. Avoid leaking implementation language (API field names like `Priority__c`, internal table names) into the objective unless that text is genuinely visible on screen. Describe the screen, not the schema.

### Assert on record state, not on the DOM

The strongest assertions on these apps are about business outcome, not markup. Instead of checking that some element exists, assert "the case shows Status Closed," "the opportunity stage reads Closed Won," "an incident number is displayed and starts with INC." These read like acceptance criteria, they survive layout changes, and they tell you the thing that actually matters: did the platform record the right state. A DOM-shaped assertion can pass while the record is wrong, and can fail while the record is fine. An outcome assertion tracks the truth.

### Scope one screen at a time

Resist the urge to write one giant objective that drives lead creation, conversion, opportunity edits, and a report check in a single breath. Long multi-screen flows compound risk: more navigation, more places for a slow render to throw off timing, more ambiguity for the model to resolve. Keep each objective scoped to roughly one screen or one logical step, and chain them. "Create the lead" then "convert the lead to an opportunity" then "set the opportunity amount." Smaller objectives are easier for the agent to satisfy reliably and far easier for you to debug when one step fails, because you know exactly which step it was.

### Compose login with @import and mask secrets with variables

You do not want to re-describe the org login at the top of every test, and you definitely do not want credentials pasted into each file. BrowserBash lets you factor the login into its own reusable piece and pull it in with `@import`, so every enterprise test starts from an authenticated session without repeating the steps. Credentials go in as `{{variables}}`, which keeps the secret values out of your test text and masks them in output and logs. A Salesforce or ServiceNow login flow is the canonical thing to extract this way. The full pattern is in [reuse a login session across browser tests](/blog/reuse-login-session-across-browser-tests).

A sketch of how this reads in practice:

```
# salesforce-login.bb
go to https://login.salesforce.com
type {{SF_USERNAME}} into the Username field
type {{SF_PASSWORD}} into the Password field
click the Log In to Sandbox button
expect the App Launcher to be visible
```

```
# create-case.bb
@import salesforce-login.bb
open the Service Console app
click the New button to start a new Case
set the Subject field to "Login page returns 500"
set Priority to High
set Status to New
click Save
expect the case to show Status New and Priority High
```

The login lives in one file, the secrets are masked, and the test itself reads like a description of what a support agent does.

## Worked example objectives

To make this concrete, here are the kinds of objectives that fit each platform. Treat them as starting points to adapt to your org, not copy-paste guarantees, because your layout and config are yours.

### Salesforce: lead to opportunity

This is the classic high-value flow, and a good first pilot because it touches creation, conversion, and edit.

- `open the Leads tab and click New`
- `fill First Name with "Dana", Last Name with "Reyes", Company with "Northwind Traders", then click Save`
- `on the lead record, click Convert, choose to create a new opportunity, and confirm the conversion`
- `expect a converted confirmation and a link to the new opportunity`
- `open the opportunity, set Stage to "Proposal/Price Quote", set Amount to 25000, and click Save`
- `expect the opportunity to show Stage Proposal/Price Quote and Amount $25,000.00`

Run those as separate scoped objectives rather than one block. If conversion is the step that breaks in your org, you will see it immediately.

### ServiceNow: incident creation

Incident creation is the equivalent high-value flow on ServiceNow, and it exercises the framed UI and the reference fields that make this platform hard.

- `open Incident then Create New`
- `set Caller to "Abel Tuter"`
- `set Short description to "VPN drops every few minutes from home office"`
- `set Impact to 2 - Medium and Urgency to 2 - Medium`
- `click Submit`
- `expect an incident number starting with INC to be displayed`

The reference field (Caller) is exactly the sort of control that needs the agent to open a lookup, match by visible name, and select, the kind of interaction that is awkward to script with frame switches and generated IDs.

## Honest limits: this is the hardest target there is

Everything above is real, but it would be dishonest to pretend enterprise apps are now easy. They are the most demanding target you can point a browser agent at, and a few limits are worth stating plainly so you can plan around them.

**Unlabeled and custom controls still resist every tool.** The whole approach rests on controls having an accessible name and role. When a Lightning component or a ServiceNow widget ships an icon-only button with no accessible label, a custom canvas-rendered chart, a drag-and-drop builder, or a pixel-painted control with no semantics, there is nothing in the accessibility tree to match against. That is not a BrowserBash gap specifically, it defeats selector tools and intent-based tools alike, because the information a human relies on (or that assistive tech would expose) simply is not in the page. These are the spots where you may still need a human in the loop.

**Runs are slower and pricier on heavy pages.** Salesforce and ServiceNow pages are large, script-heavy, and slow to settle. Reading a full snapshot of a dense record page and reasoning over it costs more time and more tokens than the same operation on a lean app. A flow that is near-instant on a simple form can take meaningfully longer here, and if you are using a hosted model you will feel that in the bill. Budget for it. Keep objectives scoped partly for reliability and partly to keep each model call working over a smaller, cheaper slice of the page.

**A capable model is not optional.** This is the firmest caveat. Small local models (roughly 8B parameters and under) are workable for simple, well-labeled pages, but they get flaky fast on complicated enterprise flows where the agent has to disambiguate similar labels, navigate framed and shadowed structure, and recover when a page is mid-render. For Salesforce and ServiceNow you want a genuinely capable model: a 70B-class local model if you are running your own, or a strong hosted model. Trying to drive a lead-to-opportunity conversion with an underpowered model is the fastest way to conclude the whole approach does not work, when the real problem was the engine. We lay out the choices in [AI model tradeoffs for browser testing](/blog/ai-model-tradeoffs-for-browser-testing).

**Pilot before you scale.** Do not try to convert a thousand legacy selector tests at once. Pick one high-value flow (lead-to-opportunity on Salesforce, incident creation on ServiceNow), get it reliable across a few runs and a couple of orgs or instances, learn how your particular configuration behaves, and only then expand. The teams that succeed with this treat it as a pilot first and a rollout second.

## Getting started

BrowserBash is a free, open-source CLI under the Apache-2.0 license from The Testing Academy. Install it with:

```
npm install -g browserbash-cli
```

From there, point it at a sandbox or a developer instance, not production, and start with a single scoped objective on a flow you know well. Factor your login into an `@import` file, pass credentials as `{{variables}}`, pick a capable model, and assert on record state. Browse the full capability set on the [features](/features) page, and work through the guides on [learn](/learn).

## FAQ

### Does BrowserBash really handle Salesforce Shadow DOM and ServiceNow iframes?

Yes, in the sense that it does not rely on a single document query that stops at the first boundary. The agent works from the accessibility tree and a live page snapshot, so controls nested inside Lightning Web Component shadow roots, or living inside ServiceNow's main content iframe, are reachable without you hand-writing the traversal. The honest qualifier is that the control still needs to be exposed with a role and an accessible name. If a custom widget renders to canvas or ships an unlabeled button, no tool can reach what is not represented.

### Will this fix my flaky selector tests by self-healing them?

No, and it is worth being precise. BrowserBash does not self-heal stored selectors. It avoids the problem differently: it does not store a brittle locator at all. Before each action it re-derives how to reach the target from a fresh snapshot of the current page, so a Salesforce ID that changes from `#input-42` to `#input-87` between sessions never matters, because nothing was pinned to it. That is re-derivation from current state, not a stored locator quietly repairing itself.

### What model do I need for Salesforce and ServiceNow?

A capable one. Small local models around 8B parameters and under tend to be flaky on these complex flows, where the agent must disambiguate similar labels and navigate framed, shadowed structure. Use a 70B-class local model or a strong hosted model for enterprise work. The model is the single biggest lever on whether a hard flow runs reliably, more than any prompt tweak, so do not under-resource it.

### Where should I start, and how do I keep credentials safe?

Start with one high-value flow on a sandbox or developer instance: lead-to-opportunity for Salesforce, incident creation for ServiceNow. Put the org login in its own file and pull it in with `@import` so you do not repeat it, and pass usernames and passwords as `{{variables}}`, which keeps the values out of your test text and masks them in logs and output. Get that one flow reliable across a few runs before you expand to anything else.
