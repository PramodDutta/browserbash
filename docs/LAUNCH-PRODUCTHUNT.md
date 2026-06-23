# BrowserBash — Product Hunt Launch Kit

> Everything to launch browserbash.com on Product Hunt. Copy is ready to paste; edit voice to taste. **No fabricated metrics** — fill brackets `[ ]` with real numbers on the day.

## 0. Pick the day
- **Best days:** Tuesday–Thursday. Avoid Mon (crowded) + Fri–Sun (low traffic).
- **Recommended: Wednesday** (mid-week sweet spot) — gives ~2 days to prep.
- **Go-live time: 12:01 AM Pacific (PT).** PH days run on PT; launching at 00:01 gives the full 24h to accumulate votes/comments. (= 12:31 PM IST.)
- A product can only be "launched" once — don't soft-publish early. Use the **Upcoming/“Notify me”** teaser page to collect pre-subscribers in the days before.

---

## 1. Pre-launch checklist (the 2–3 days before)

**Account & page**
- [ ] Maker account complete (avatar, bio, links). Add Pramod as maker; add any co-makers.
- [ ] Create the **"Upcoming" teaser** on PH now → share the "Notify me" link to your list/socials so launch-day subscribers get auto-pinged.
- [ ] Decide hunter: **self-hunt is fine.** A well-followed hunter can help but isn't required; don't delay the launch chasing one.
- [ ] Draft the full listing (section 2) inside PH's "New product" form and **save as draft**.

**Assets** (section 3 has the shot list)
- [ ] Thumbnail (240×240, the Bo logo on light bg).
- [ ] Gallery: 1 GIF + 5–7 images (1270×760 recommended).
- [ ] First/maker comment written (section 4).
- [ ] Topics chosen (section 2).

**Product readiness** (mostly ✅ done this session)
- [x] Login/signup works end-to-end → /dashboard (confirmed).
- [x] Site fast (chat widget deferred, lazy assets).
- [x] `npm install -g browserbash-cli` works from registry.
- [ ] One more smoke test the morning before: install fresh, run one objective, sign up incognito.
- [ ] Make sure GitHub repo README has a crisp top section + the install command + a GIF (first thing visitors see after PH).

**Amplification line-up** (have these queued, ready to fire)
- [ ] Email to The Testing Academy list — subject + body (section 5).
- [ ] YouTube: community post + (ideal) a 2–4 min "I built this" short on the channel.
- [ ] X/Twitter thread drafted (section 5).
- [ ] LinkedIn post drafted (section 5).
- [ ] Show HN drafted (section 5) — post **separately** the same morning.
- [ ] 10–20 friends/colleagues primed to **comment** (not just upvote — PH weights genuine comments and penalizes upvote rings). Ask them to try it and leave honest feedback.
- [ ] Relevant communities (SDET/QA Slacks, Discords, r/QualityAssurance, r/selenium) — share as "I launched", not spam.

---

## 2. The listing copy (paste into PH)

**Name:** `BrowserBash`

**Tagline** (≤60 chars — pick one):
- `Automate any browser in plain English — free & open` (51)
- `Plain-English browser automation. No selectors, no keys` (55)
- `The free, open-source AI browser automation CLI` (47)

**Topics (categories):** Developer Tools · Open Source · Artificial Intelligence · GitHub · Productivity *(pick 3–4)*

**Links:** Website `https://browserbash.com` · GitHub `https://github.com/PramodDutta/browserbash` · npm `https://www.npmjs.com/package/browserbash-cli`

**Description** (~260 chars):
> BrowserBash turns a plain-English objective into real browser actions — no selectors, no page objects. It runs on free local models via Ollama (zero API keys, nothing leaves your machine), or any cloud grid. Markdown tests, NDJSON agent mode for CI, and session recording. Apache-2.0.

---

## 3. Gallery shot list (1 GIF + 5–7 images)

You already have most of these in the repo / site.

1. **GIF — the one-command demo.** Use `site/public/demo.gif` (Remotion hero) OR a fresh terminal capture: `browserbash run "..."` → steps → ✓ PASSED. *This is the most important asset.*
2. **Hero / what-it-is** — a clean slide: "Plain English in. Real browser out." + the install command.
3. **Before/after** — the case-study split: real Playwright `e2e-checkout.spec.ts` vs the plain-English BrowserBash markdown (screenshot `/case-study`).
4. **Markdown test file** — a `login_test.md` with `{{variables}}` + a masked secret.
5. **Agent mode / CI** — NDJSON output + exit codes `0/1/2/3` (the "built for CI & AI agents" angle).
6. **Dashboard** — the local/cloud run dashboard with a recording + verdict.
7. **Providers** — one image: local Chrome · CDP · Browserbase · LambdaTest · BrowserStack (one flag).
8. **Free/local** — "Ollama-first · $0 model bill · no API keys" call-out.

Spec: gallery 1270×760, thumbnail 240×240, keep text large + legible on mobile.

---

## 4. Maker's first comment (post immediately at launch)

> Hey Product Hunt 👋 I'm Pramod — SDET, and I run The Testing Academy.
>
> I built **BrowserBash** because browser automation still means writing and *maintaining* selectors and page objects, and every new "AI testing" tool wants a login, a meter, and your data in their cloud.
>
> BrowserBash is the opposite: a **free, open-source CLI**. You write a plain-English objective —
>
> `browserbash run "Log in, add the red t-shirt to the cart, check out, and verify 'Thank you for your order!'"`
>
> — and an AI agent drives a **real** Chrome browser step by step, no selectors. It's **Ollama-first**, so it runs on free local models with **no API keys and nothing leaving your machine** (you can also point it at OpenRouter or Claude, or cloud grids like LambdaTest/BrowserStack — one flag).
>
> A few things I care about:
> - **Committable `*_test.md` tests** — plain-English steps, `{{variables}}`, secrets masked in every log line.
> - **Agent mode** (`--agent`) emits NDJSON with exit codes `0/1/2/3` — built for CI and AI coding agents, no prose parsing.
> - **`--record`** captures a video + screenshot (+ a Playwright trace) of every run.
> - A **free local dashboard** (`browserbash dashboard`) — no account needed.
>
> It's Apache-2.0, the full agent loop is in the repo, and the CLI is on npm: `npm install -g browserbash-cli`.
>
> Honest caveat: tiny local models (≤8B) get flaky on long multi-step flows — a mid-size local model (Qwen3 / Llama 3.3 70B) or a hosted model is the sweet spot for hard journeys.
>
> I'd genuinely love your feedback — what would make this a daily driver for you? Happy to answer anything here all day. 🔨

**Comment-reply prep** (have short answers ready for):
- "How is this different from Playwright/Selenium?" → no selectors, English objectives, self-healing; keep Playwright for deterministic suites, add BrowserBash for speed/flaky UIs.
- "Does it really run free?" → yes, local Ollama, $0, no keys; cloud optional.
- "Is it reliable?" → honest about model size; show the recording/trace + CI exit codes.
- "vs computer use / browser-use / Operator?" → browser-scoped, deterministic (DOM not pixels), CLI + CI-first, self-hosted.

---

## 5. Launch-day amplification (draft posts)

**Email (The Testing Academy list)**
- Subject: `I just launched BrowserBash on Product Hunt 🔨`
- Body: 3 lines on what it is (free, plain-English browser automation), one GIF, a "support the launch / try it + tell me what you think" CTA with the PH link, and the `npm install -g browserbash-cli` line.

**X/Twitter thread**
1. "After years of writing and *maintaining* selectors, I built the tool I wanted: BrowserBash. Write a browser test in plain English, run it on a free local model, $0, no API keys. Live on Product Hunt today 👇 [link]" + GIF
2. What it does (objective → real browser → verdict) + the one-liner command.
3. Markdown tests + agent mode + recording.
4. Free/open-source/Apache-2.0 + install + "feedback welcome on PH".

**LinkedIn** — same story, professional framing (QA/SDET teams cutting maintenance), GIF, PH + GitHub links.

**YouTube** — community post with the PH link + GIF; ideal: a 2–4 min "I built a free plain-English browser automation CLI" video (your channel is the single biggest off-site authority signal — see GEO report).

**Show HN** (post separately, same morning, ~8–10 AM ET):
- Title: `Show HN: BrowserBash – plain-English browser automation CLI (free, local-first)`
- Body: 1 short paragraph (what + why), the install command, "runs on free local models, no API keys, Apache-2.0, full agent loop in the repo", honest caveat about small models, and "feedback very welcome." Link the GitHub repo as the main URL (HN prefers repo/site over PH).

---

## 6. Launch-day run of show (PT)
- **00:01** — product goes live; post the maker comment immediately.
- **00:05** — email the list; X thread; LinkedIn; YouTube community post.
- **~05:00–06:00 PT** (8–9 AM ET) — post Show HN separately.
- **All day** — reply to *every* comment within minutes; thank people for trying it; collect feature requests live.
- **Don't** ask for upvotes explicitly or run an upvote group — PH demotes that. Ask for *feedback* and *support*.
- **Evening** — post a thank-you + a "what's next" reply.

## 7. Post-launch (next day)
- [ ] Thank-you post across channels + final rank.
- [ ] Turn the best feature requests into a public roadmap / GitHub issues.
- [ ] Add the PH badge to the site footer/README.
- [ ] Write a short "we launched on PH" blog post (also feeds SEO + the GEO off-site-mention gap).

---

## 8. Ties to other work
- **GEO off-site gap** (see `docs/GEO-ANALYSIS.md`): the YouTube video + Show HN + any "best browser automation 2026" listicle inclusions from this launch are exactly the cross-site brand mentions that lift the Perplexity/ChatGPT citation ceiling. The launch doubles as GEO.
- **Optional pre-launch polish:** embed `demo.mp4`/`.gif` on the landing hero (currently in `site/public/`), and confirm the GitHub README opens with the GIF + install command.
