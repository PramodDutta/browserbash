# BrowserBash — Session Progress & Handoff

> Continue-from-another-machine working doc. Updated 2026-06-15.
> **Contains NO secrets.** All keys/credentials live in Vercel env, the Clerk dashboard,
> Namecheap, and your password manager — never in this file.

---

## Project at a glance
- **Product:** BrowserBash — free, open-source (Apache-2.0) natural-language browser-automation CLI by The Testing Academy (Pramod Dutta). Plain English in → an AI agent drives a real browser → verdict out.
- **Repo:** `github.com/PramodDutta/browserbash` (PUBLIC monorepo). CLI at root; Next.js site in `site/`.
- **Live site:** https://browserbash.com — Vercel. Manual deploy: `cd site && vercel --prod --yes`.
- **CLI:** `npm install -g browserbash-cli` (v1.3.1 on npm).
- **Stack:** Next 16 (App Router, **non-standard**), Clerk (auth), Neon (Postgres), Vercel Blob (recordings), Stripe (paid data retention), GA4 (analytics).

## ⚠️ Non-obvious gotchas (read before editing)
- **Next 16 is non-standard** — see `site/AGENTS.md`; read `site/node_modules/next/dist/docs` before adding routes. **Middleware is `site/proxy.ts`, not `middleware.ts`.** Plain static Server Components with `export const metadata` are safe (mirror existing pages).
- **Git auto-deploy is OFF** (Vercel Root Directory isn't set to `site`). Deploy manually: `cd site && vercel --prod --yes`. To enable auto-deploy: Vercel → project `browserbash` → Settings → General → **Root Directory = `site`**.
- **Push to `main` + `vercel --prod` are gated by the safety classifier** each time.
- Local run: `cd site && npm run build && PORT=3939 npm run start` (dev-mode HMR stalls hydration in driven browsers, so test against `next start`).

---

## What was done this session (2026-06-15)

1. **GA4 live** — `NEXT_PUBLIC_GA_ID` in Vercel env; `@next/third-parties` `GoogleAnalytics` + `site/components/Analytics.tsx` (delegated click tracking) + `TrackEvent.tsx` (sign_up/login views). Env-gated.
2. **12 marketing + legal pages** (static, live): `/features /pricing /about /faq /contact /changelog /brand` + `/privacy /terms /cookies /security /refunds`. Shared `SiteNav` + `SiteFooter` + `site/app/marketing.css`.
3. **TTACart case study** — `/case-study` page + landing `#proof` section. Story: our production Playwright suite `github.com/PramodDutta/AdvancePlaywrightFramework1x` (tests the **TTACart** store) re-expressed as plain-English BrowserBash tests. Real `--record` capture embedded in `site/public/case-study/`. Runnable twins: `examples/ttacart_login_test.md`, `examples/ttacart_checkout_test.md`. **Honest note:** small local models (qwen3:4b / llama3.2) were too weak/flaky for a verified green run, so the page makes **no fake PASS** claim — it shows the real recording + the suite's CI-green as authority.
4. **aleeup chat widget** — site-wide `<script src="https://aleeup.com/embed.js" data-bot="…" …>` in `site/app/layout.tsx`.
5. **`/dashboard` 404 fix** — `site/proxy.ts`: logged-out `/dashboard` now **redirects to `/sign-in`** (was 404). `unauthenticatedUrl` on the `/dashboard(.*)` matcher; API routes keep bare `protect()`.
6. **Hero demo (Remotion)** — `demo-video/` project renders `site/public/demo.mp4` + `demo.gif` (1280×720, ~12s, branded terminal → ✓ PASSED). Illustrative product animation, not a screen-capture.
7. **Blog index polish** — category jump-nav (pill row of section links + counts) in `site/app/blog/page.tsx` + `blog.css`.
8. **Clerk PRODUCTION instance** — created, **cutover pending** (see below).
9. **220 SEO competitor articles** — written + pushed in batches (see below).

---

## ✅ Clerk production cutover — DONE (2026-06-17)
- The account has **multiple Clerk apps**. The dev site ran on instance **`accurate-terrapin-0`**. We productionized the `browserbash` app (dev instance `faithful-jaybird-95`) — domain `browserbash.com`.
- **All steps complete:**
  1. ✅ **5 Clerk DNS CNAMEs in Namecheap** (`clerk`→frontend-api.clerk.services, `accounts`→accounts.clerk.services, `clkmail`→mail.r4c0mfzje0x7.clerk.services, `clk._domainkey`→dkim1.…, `clk2._domainkey`→dkim2.…) — DNS **Verified**, SSL **Issued**.
  2. ✅ **Google Cloud OAuth client** created (project `browserbash`, redirect `https://clerk.browserbash.com/v1/oauth_callback`) → custom credentials saved in Clerk → Google OAuth.
  3. ✅ `pk_live`/`sk_live` set in **Vercel Production env** → redeployed `cd site && vercel --prod --yes`. **Verified live:** `browserbash.com` serves `pk_live_…` (decodes to `clerk.browserbash.com$`), Clerk script loads from `https://clerk.browserbash.com`. Dev 100-user cap + dev banner gone.
- **Remaining (your action — agent can't create accounts):** one **incognito test sign-up** at https://browserbash.com/sign-up (verify no dev banner, Google + email both work, lands on /dashboard). Note: prod is a **fresh user pool** — dev accounts don't carry over.

---

## 📝 220 SEO articles — state + how to resume
- **Goal:** 220 new ~3000-word SEO articles targeting BrowserBash competitors + adjacent searches (comparisons, alternatives, guides, use-cases, migrations). Honest brand voice (never fabricate competitor internals).
- **Format:** `site/content/blog/<slug>.md` → frontmatter (`title`, `description`, `date`, `category` ∈ `comparison|alternatives|guide|use-case|agents|ci|llm|security|case-study`) + body + `## FAQ` with 4 `### Q` (powers FAQPage schema). Auto-listed by `site/lib/blog.ts` `getPosts()` → blog index + `sitemap.ts` + `feed.xml`.
- **Status:** ~193+/220 written, valid, **committed + pushed in batches** (avg ~3,500 words each); last ~27 finishing in a background writer batch. Plus 62 pre-existing articles → **~255–282 total** on disk. **Pushed to GitHub but NOT yet deployed** to prod.
- **Pipeline (now in `tools/seo/`):**
  - `bb-specs.json` — the **220 topic specs** (slug/title/keyword/category/angle). The canonical plan.
  - `write-articles.workflow.js` — Claude Code **Workflow** script: one subagent per article, writes the `.md` directly. Embeds the current batch of specs. Run via the Workflow tool: `Workflow({ scriptPath: "…/tools/seo/write-articles.workflow.js" })`.
  - `verify-and-plan.js` — `node tools/seo/verify-and-plan.js <batchSize>` → scans `content/blog`, prints done/missing counts, and **re-arms the writer** with the next batch of missing specs.
  - `stage-valid.js` — prints absolute paths of fully-valid articles (frontmatter + `## FAQ` + ≥2700 words) for `git add` (skips half-written files).
  - ⚠️ These hardcode a macOS path (`/Users/promode/.../site/content/blog`). **Update the `BLOG` const** on a new machine.
- **Resume loop:**
  1. `node tools/seo/verify-and-plan.js 40` (re-arms next 40 missing).
  2. Run the writer Workflow (scriptPath above).
  3. On completion: `node tools/seo/stage-valid.js | tr '\n' '\0' | xargs -0 git add --` → `git commit` → `git push`.
  4. Repeat until `MISSING: 0`. (Anthropic 500s / rate-limits during the run are transient — just re-run; only missing slugs are rewritten, nothing is wasted.)
- **Then:** `cd site && npm run build` (validate all compile) → `vercel --prod --yes` → verify `https://browserbash.com/sitemap.xml` + `/blog`.

---

## 📚 Tutorials section + 142 new posts (2026-06-18) — LIVE
- **New `/tutorials` route** (`site/app/tutorials/page.tsx`): curriculum-ordered index (ItemList schema), filters `category: tutorial`. Tutorial posts render through the existing `/blog/[slug]` route (no new dynamic route — safe in non-standard Next 16). Wired into `SiteNav`, blog index `CATEGORY_ORDER`, blog navs, `sitemap.ts`, `llms.txt`, and a `--tutorial` category color in `blog.css`.
- **27 in-depth tutorials** (`category: tutorial`) covering every CLI option: install, run, all flags, stagehand vs builtin engine, every provider (local/cdp/browserbase/lambdatest/browserstack), LLM backends (ollama/openrouter/anthropic/auto), agent mode + exit codes, markdown tests, variables + masked secrets, recording (video/trace), local + cloud dashboards, GitHub Actions, Jenkins, headless/timeouts, writing objectives, extract/store, login→checkout.
- **115 SEO articles** — competitor-keyword-targeted (KaneCLI, browse.sh, browser-use, Skyvern, Playwright/Selenium/Cypress/Puppeteer comparisons + alternatives + migrations) and AI-agent/GEO/chatbot ("can ChatGPT/Claude control a browser", MCP, computer-use, agent CLIs). Researched live, deduped vs the 282 existing.
- **Totals:** blog now **424 posts** (282 → 424), 27 of them tutorials. Sitemap = **442 URLs**. All validated (frontmatter + `## FAQ`, every new post ≥2000 words, 0 invalid). `next build` green → deployed to prod → `/tutorials` + sample posts return 200.
- **Pipeline:** `tools/seo/tutorials-and-articles.workflow.js` (self-contained: 27 tutorial specs + 115 fallback specs + 4 research buckets + the 282 existing slugs embedded for dedupe). Hit a transient Anthropic server rate-limit mid-run; **resumed** via `Workflow({scriptPath, resumeFromRunId})` — research cached, only failed writes re-ran. Re-run the same way if needed.

## Remaining / next steps
- [ ] Finish last ~27 articles (resume loop above) → 220/220.
- [ ] `next build` clean → `vercel --prod --yes` to take ALL new articles **live** (currently on GitHub, not deployed).
- [ ] Clerk production cutover (DNS verify → Google OAuth → key swap) — your action.
- [ ] Optional: Vercel Root Directory = `site` (enable git auto-deploy); set `CRON_SECRET`; delete 3 empty duplicate Vercel Blob stores; embed the hero `demo.mp4`/`.gif` on the landing.

## Where the secrets live (never in git)
- Clerk `pk`/`sk` (live + test): Clerk dashboard → API keys, and Vercel env.
- `DATABASE_URL` (Neon), `CRON_SECRET`, Stripe keys, Vercel Blob token: Vercel project env.

## Repo visibility
This repo is **PUBLIC** — it's the open-source project; npm and browserbash.com depend on it, so keep it public. This file is secret-free, so it's safe to keep here. To make the repo private (not recommended — breaks OSS distribution), run it yourself: `gh repo edit PramodDutta/browserbash --visibility private` (or GitHub → Settings → Danger Zone). I can't change repo visibility — modifying a repo's access controls is a protected action.
