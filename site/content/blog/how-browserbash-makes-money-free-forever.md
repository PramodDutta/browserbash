---
title: How Does BrowserBash Make Money If It Is Free Forever?
description: "How BrowserBash makes money with an honest open source business model: the Apache-2.0 CLI is free forever, revenue comes from opt-in hosted extras only."
date: 2026-06-26
category: guide
---

Short answer: the BrowserBash CLI is Apache-2.0 licensed and free forever, and that is not going to change. There is no gated core, no time bomb, no "community edition" that quietly loses features so you upgrade. The thing you install with `npm install -g browserbash-cli` is the whole tool, and it stays the whole tool. Money, when it comes, comes from things you can choose to pay for and never have to: an optional cloud dashboard with a paid data-retention add-on, future team and enterprise conveniences that are opt-in, plus services, training, and sponsorship from The Testing Academy. None of those are required to run a single test.

This post exists because of a fair question. On Product Hunt, Marc Vuitton asked, bluntly, "how would you monetize it if it is free." It deserves a straight answer rather than a pitch, so this is the straight answer, including the parts that are not settled yet. If you are a senior SDET who has been burned by an open-source tool that pulled the rug once it had traction, you have every reason to be skeptical, and skepticism is the right starting posture. Let me show the actual mechanics.

## The core is Apache-2.0 and that is load-bearing

The license is the whole argument, so start there. BrowserBash is released under Apache-2.0. That license grants you the right to use, modify, and redistribute the software, including in commercial settings, and it includes an express patent grant. Critically, a license already granted cannot be retroactively revoked for the code under it. If a future version of BrowserBash ever went closed, every release published under Apache-2.0 up to that point would remain Apache-2.0 forever, and anyone could fork from that point. That is the structural reason "free forever" is a credible claim and not just a slogan: the license, not a promise on a landing page, is what protects you.

This matters because the failure mode you are worried about is real and has a name. A handful of well-known infrastructure projects relicensed once they were load-bearing for enough companies, moving from a permissive or copyleft license to a "source-available" license that restricts commercial use. Users who depended on them were left choosing between a forced commercial relationship and a community fork. Apache-2.0 on the BrowserBash CLI is a deliberate choice to make that move impossible for the part you actually run.

So the honest framing is not "trust us." It is "read the LICENSE file, and notice that the part you depend on is permissively licensed code on your own disk." Trust should be earned by structure, not asked for by vibes.

## Where the money actually comes from

If the core is free, the obvious follow-up is the one Marc asked: then what funds the work? Here is the real list, in rough order of how concrete each one is today.

### Optional cloud dashboard, with a paid data-retention add-on

BrowserBash is local-first. On the default setup, nothing leaves your machine: the browser runs locally, your model runs locally (for example via Ollama) or through your own API key, and the results stay on disk. You can view those results with a local dashboard:

```bash
browserbash dashboard
```

That local dashboard is free, and it is not a teaser version. It is the dashboard. It reads the runs already on your machine and renders them, no account, no upload, no network call required.

Separately, and only if you want it, there is an optional hosted dashboard. You opt in explicitly:

```bash
browserbash connect
browserbash run "log in and confirm the dashboard loads" --upload
```

When you pass `--upload`, that run is sent to the hosted dashboard so you can share it, link it, or look at it from another machine. Free uploaded runs are kept for 15 days. If you want them to stick around longer than that, the paid data-retention add-on extends the window, and that add-on is billed through Stripe. That is a clean, legible deal: you pay for storage and convenience that costs real money to provide, and you pay for it only when you decide the convenience is worth it. The free 15-day window covers the common case (you uploaded a run, you looked at it, you moved on) without anyone reaching for a credit card.

Note what is not happening here. The CLI is not crippled when you do not pay. The local dashboard is not crippled when you do not pay. The only thing money buys is "keep my hosted data past 15 days," which is a genuine hosting cost, not an artificial wall.

### Future team and enterprise conveniences, opt-in only

As teams adopt the tool, some will want things that only make sense at the team level: a shared run history across the org, single sign-on, role-based access to uploaded results, that category of convenience. The intended shape for these is the same as the retention add-on: opt-in paid layers that sit on top of the free CLI and never become a precondition for running tests. An engineer on a laptop with no account and no subscription should always be able to run BrowserBash against local Chrome and get a verdict. The paid team features, if and when they ship, are for the org that wants shared infrastructure, not for the individual who just wants the tool to work.

These are roadmap, not shipped, and the post says so plainly in the limits section below. Calling them revenue today would be dishonest.

### Services, training, and support from The Testing Academy

BrowserBash comes from The Testing Academy, which has an existing business teaching testing and automation. That is a legitimate and old revenue model for open-source maintainers: the software is free, and the people who built it sell their expertise around it. Workshops, structured courses, team enablement, and paid support contracts are all things a company can sell without touching the license of the tool. If your team adopts agentic browser testing and wants hands-on help standing it up in CI, that is a service, and services are a normal thing to charge for. The tool stays free; the human time does not have to be.

### Sponsorship and open-source backing

Finally, the boring but real one: sponsorship. Open-source projects that save engineers real time attract sponsors, grants, and corporate backing, and that funding can underwrite maintenance directly. It will not, on its own, fund a large team, but it is part of an honest mix rather than the whole story. Anyone who tells you sponsorship alone sustains a serious tool is usually selling something else.

## Why "free forever" is actually sustainable here

Plenty of tools promise free forever and then quietly start gating, because their cost structure forces it. The reason BrowserBash can hold the line is specific and worth understanding, because it is the part most people get wrong.

The expensive thing in AI tooling is compute. For a hosted, cloud-run agentic testing SaaS, every test a user runs spins up a browser on the vendor's infrastructure and burns model inference the vendor pays for. That is a real, per-run, marginal cost. A vendor carrying that cost has no choice: they must convert free users into paying users, or limit free usage hard, because every free run is money out the door. The business model is downstream of the cost structure.

BrowserBash inverts that. It is local-first by design. The browser runs on your machine. The model runs on your machine (Ollama) or on your own API key, which means the inference bill, if any, is yours and you control it. The marginal infrastructure cost to the project of one more person running one more test locally is, for practical purposes, near zero. Nothing is being spun up on a server somewhere on your behalf. That is the structural difference: a VC-funded hosted SaaS has to upsell to cover hosted compute, and BrowserBash does not have hosted compute in the default path at all. The only thing that costs the project real money is the optional hosted dashboard, which is exactly the thing that is paid. Costs and prices line up.

This is not a moral claim that hosted SaaS is bad. Hosted SaaS is great for teams that want zero local setup and are happy to pay for it. It is a claim about why a free tier here is durable: when your marginal cost per free user is near zero, you are not under permanent pressure to gate, so you do not.

## On lock-in: there basically isn't any

Lock-in is the other thing to interrogate, because "free" is worthless if you cannot leave. Walk the exits:

- **The license.** Apache-2.0. You can fork, modify, and self-distribute. If the project's direction ever stops serving you, the code you have is yours to keep building on.
- **The dashboard.** `browserbash dashboard` runs locally and reads your local runs. You do not need the hosted service to see your results, ever. Self-hosting your dashboard is the default, not a paid escape hatch.
- **The model.** Bring your own. Run a local model through Ollama with nothing leaving your machine, or point it at your own API key for a hosted model. You are not married to one provider, and you are certainly not married to the project's servers, because in the default path there are none in the loop. If you want a walkthrough of the fully local setup, see the [BrowserBash + Ollama local models tutorial](https://browserbash.com/blog/browserbash-ollama-local-models-tutorial).

This is what people mean, or should mean, by open-core done honestly. The core you run is free and permissively licensed and lives on your disk. The only money on the table is for hosted convenience you explicitly opt into, and even then the free local equivalent exists. You are paying for someone else to run and store things for you, not for permission to use the software. For more on the agent loop itself and how the verdicts are produced, [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained) goes deeper than this post does.

## The honest limits

A post titled the way this one is would be cheating if it only listed reasons to feel good, so here are the caveats, stated plainly.

The paid pieces today are conveniences, and there is exactly one of them that is real and shipping: the cloud dashboard data-retention add-on. Everything else in the revenue section is either a long-standing model (training, services, sponsorship) or roadmap (team features, SSO). Do not read "future team conveniences" as "available now." They are intentions, and intentions change.

The project is early. Roadmap items move, get reordered, or get cut. The commitment that is structural and durable is the one backed by the license: the open-source CLI is free forever, because Apache-2.0 makes that enforceable. The commitment about hosted extras is softer by nature, because hosted products evolve. Prices, retention windows, and which conveniences are paid versus free can change as the project learns what is actually worth charging for. If a number appears anywhere in BrowserBash marketing, treat it as the current state, not a forever guarantee, and check the [pricing page](/pricing) for what is live today.

So the precise version of "free forever" is this: it applies, without an asterisk, to the open-source CLI you install and run. It does not promise that every hosted convenience will be free or unchanged forever, because that would be a promise the project cannot honestly make about infrastructure that costs money to run. Anyone who claims otherwise about a hosted service is not being straight with you.

That is the whole model, including the uncomfortable bits. The tool is free because its cost structure lets it be, the license makes that enforceable rather than aspirational, and the money comes from people choosing to pay for hosting, expertise, or team infrastructure, never from gating the thing you actually run.

## Try it without paying anything

You can use BrowserBash end to end, today, without an account, an upload, or a card:

```bash
npm install -g browserbash-cli
browserbash run "open the homepage and confirm the login button is visible"
browserbash dashboard
```

That runs an agent against your local browser, produces a verdict, and shows it to you in a local dashboard, with nothing leaving your machine on the Ollama default. If you later want to share runs or keep them around longer, the opt-in hosted dashboard and its retention add-on are there. If you never want that, you never touch it. Browse [features](/features) for what the CLI does, and [learn](/learn) if you want the guided path in.

## FAQ

### Is the BrowserBash CLI really free, or is it free-for-now?

It is Apache-2.0 licensed, which is the real answer. Free-for-now tools are usually under a license that lets the owner relicense and gate later. Apache-2.0 cannot be retroactively revoked on code already released, so every version published under it stays free and forkable. The protection is the license itself, not a promise.

### What exactly costs money, then?

Today, one shipping thing: the optional cloud dashboard's data-retention add-on, billed via Stripe, which extends hosted run storage beyond the free 15-day window. The local dashboard (`browserbash dashboard`) is free, the CLI is free, and uploading is opt-in via `browserbash connect` and `--upload`. Future team features like shared history and SSO are planned as opt-in paid layers, but they are roadmap, not available now.

### Why can BrowserBash stay free when other AI testing tools push you to pay?

Because it is local-first, so the expensive part (browser plus model inference) runs on your machine, not on the project's servers. A hosted SaaS pays per-run compute for every free user and must upsell to cover it. BrowserBash has near-zero marginal infra cost per local user, so it is not under that pressure. See the [pricing page](/pricing) and the [FAQ](/faq) for current specifics.

### Am I locked in if I adopt it?

No. The CLI is Apache-2.0 (fork it if you ever need to), the dashboard runs locally so you never need the hosted service to see your results, and you bring your own model through Ollama or your own API key. The only thing the hosted service stores is runs you explicitly chose to upload, and even those have a free local equivalent.
