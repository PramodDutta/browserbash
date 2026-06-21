# BrowserBash — Production Launch Checklist

> What's needed before going to production. **Secret-free.** Updated 2026-06-18.
> Owner legend: **[you]** = Pramod's action (credentials / accounts / OAuth / payments / manual login — things the agent is not allowed to do); **[me]** = the agent can handle it.
> **Shortest path to go-live: confirm blocker #1 (one real login), then decide #2.**

## 🔴 Blockers (before real launch traffic)
- [ ] **1. Confirm ONE real login end-to-end** **[you]** — the agent cannot create accounts / type passwords / complete OAuth, so this sign-off is yours.
  - Fresh incognito → browserbash.com/sign-in → wait for the form (spinner shows while Clerk loads) → **Continue with Google** (or email) → must land on **/dashboard** (Mission Control).
  - All the code/infra around this is verified correct + hardened this session (see "Auth hardening" below). If it still fails, capture the **Network tab** of the failing request and send it.
- [ ] **2. Paid-tier decision** **[you]** — launch the data-retention paid tier now? **Yes** → Stripe **live** keys + webhook secret in Vercel + a Product/Price. **No** → confirm free-only (agent ensures no paid path is exposed). Currently no Stripe keys in prod env = free-only by default.

## 🟡 Important (ops correctness)
- [ ] **3.** Vercel → Settings → Git → **Root Directory = `site`** **[you]** — enables git auto-deploy (today every deploy is a manual `vercel --prod`).
- [ ] **4.** `CRON_SECRET` in Vercel env **[you]** — so the 15-day run-retention cleanup cron runs.
- [ ] **5.** Confirm **GA4 is collecting** (GA → Realtime while opening browserbash.com) **[you]**.
- [ ] **6.** **Clerk dashboard — verify two settings** **[you]** (belt-and-suspenders; code already forces /dashboard):
  - Paths → **after sign-in / after sign-up URL** → `/dashboard` (currently the prod instance returns the home page).
  - **Allowed redirect origins** include `https://browserbash.com` (prod silently drops non-allowlisted redirects).
- [ ] **7.** Env-var parity in Vercel Production: GA id, `pk_live`/`sk_live`, `DATABASE_URL` (Neon), Blob token, `CRON_SECRET`, Stripe (if paid) **[you]**.

## 🟢 Verify / decide
- [ ] **8.** Support email correct? Pages use `thetestingacademy@gmail.com` **[you]**.
- [ ] **9.** aleeup chat widget — right bot + color? (live site-wide, now lazy-loaded). Its `/track` endpoint throws a harmless CORS error in the console — that's aleeup's server, not ours **[you]**.
- [ ] **10.** OK with Clerk sending auth email from `@browserbash.com` (`clkmail` + DKIM records, verified) **[you]**.

## ⚪ Optional (not blockers)
- [ ] **11.** Provide an OpenRouter/Anthropic key → agent runs a real verified green BrowserBash run for the case study + live dashboard replay **[you → me]**.
- [ ] **12.** Delete the 3 empty duplicate Vercel Blob stores **[you]**.
- [ ] **13.** Embed the hero demo (`site/public/demo.mp4` / `.gif`) on the landing **[me]**.
- [ ] **14.** Launch-day content (Show HN / Product Hunt / LinkedIn / X / email) **[me drafts → you post]**.

## 🔧 Auth hardening shipped this session (why login should work now)
1. **Dashboard white-screen fixed** — `/dashboard` no longer crashes for a brand-new user with no DB rows; DB loads are non-fatal + an `error.tsx` boundary replaces any blank page with a branded recoverable screen.
2. **Auth-page spinner** — `ClerkLoading`/`ClerkLoaded` so the form area shows a spinner during Clerk's ~2s client load instead of looking blank.
3. **aleeup lazy-loaded** — the chat widget (the slowest site-wide resource) now loads ~1.5s after window load, off the critical path.
4. **Authed users redirected** — hitting `/sign-in` or `/sign-up` while logged in now sends you to `/dashboard` (was a blank "Welcome back").
5. **Auth-aware landing nav** — a logged-in user on the home page now sees **Dashboard + user menu**, not "Log in / Sign up" (was the main "login looks broken" cause).
6. **Forced redirect** — sign-in/up now use `forceRedirectUrl="/dashboard"`, so a completed login always lands on the dashboard regardless of the Clerk instance's `after_sign_in_url`.
- Verified correct by a 3-agent audit: `proxy.ts` middleware, catch-all routes, `ClerkProvider`, keys (`pk_live`), Frontend API (200), Account Portal (SSL valid), Google OAuth (in-production), email DNS — all green.

## ✅ Done + live on browserbash.com
- **Clerk production cutover** — live on prod instance (`pk_live` → `clerk.browserbash.com`), dev cap + banner gone, Google OAuth client created.
- **Tutorials section** — `/tutorials` (27 in-depth lessons covering every CLI option) + wired into nav/sitemap/llms.txt.
- **Blog at 424 articles** (282 + 142 this session: tutorials + competitor/AI-agent SEO) — **+58 computer-use/RPA/desktop-automation articles generating now** → ~482.
- GA4 · 12 marketing/legal pages · TTACart case study · aleeup widget · `/dashboard` 404→sign-in fix · Remotion hero demo · nav/button fix.
- Handoff: `progress.md` + `tools/seo/*.workflow.js` (reusable article pipelines).
