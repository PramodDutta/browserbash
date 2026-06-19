# BrowserBash — Production Launch Checklist

> What's needed before going to production. **Secret-free.** Updated 2026-06-17.
> Owner legend: **[you]** = Pramod's action (credentials/accounts/OAuth/payments/manual test — things the agent can't do); **[me]** = the agent can handle it.
> Shortest path to go-live: **blocker #2** (only one left).

## 🔴 Blockers (before real launch traffic)
- [x] **1. Clerk production cutover** ✅ DONE 2026-06-17 — live site now on the production instance (`pk_live_…` → `clerk.browserbash.com`), dev 100-user cap + dev banner gone.
  - [x] DNS verified + SSL **Issued** (Domains page: browserbash.com Verified, SSL certificates Issued)
  - [x] Google Cloud OAuth client created for prod (project `browserbash`) → custom credentials saved in Clerk → Google
  - [x] `pk_live`/`sk_live` set in Vercel Production env → redeployed (`browserbash.com` serves `pk_live_…`, Clerk script loads from `clerk.browserbash.com`)
  - [ ] Heads-up: prod is a **fresh user pool** — your dev account won't carry over, re-sign-up
- [ ] **2. One manual test sign-up** **[you]** — incognito + throwaway email → registration → dashboard works end-to-end (the agent is not allowed to create accounts / type passwords, so this sign-off is yours). Now the ONLY launch blocker left.
- [ ] **3. Paid-tier decision** **[you]** — launching the data-retention paid tier now? If **yes**: Stripe **live** keys + webhook secret in Vercel + a Product/Price configured. If **no**: confirm free-only and the agent ensures no paid path is exposed.

## 🟡 Important (ops correctness)
- [ ] **4.** Vercel → Settings → Git → **Root Directory = `site`** **[you]** — enables git auto-deploy (today every deploy is a manual `vercel --prod`)
- [ ] **5.** `CRON_SECRET` in Vercel env **[you]** — so the 15-day run-retention cleanup cron runs
- [ ] **6.** Confirm **GA4 is collecting** (GA → Realtime while opening browserbash.com) **[you]**
- [ ] **7.** Confirm **env-var parity** in Vercel Production: GA id, Clerk keys, `DATABASE_URL` (Neon), Blob token, `CRON_SECRET`, Stripe (if paid) **[you]**

## 🟢 Verify / decide
- [ ] **8.** Support email correct? Pages use `thetestingacademy@gmail.com` (privacy/terms/security/contact) **[you]**
- [ ] **9.** aleeup chat widget — right bot + color? (it's live site-wide) **[you]**
- [ ] **10.** OK with Clerk sending auth email from `@browserbash.com` (the `clkmail` + DKIM records) **[you]**

## ⚪ Optional (not blockers)
- [ ] **11.** Provide an OpenRouter/Anthropic key → agent runs a real verified green BrowserBash run for the case study + a live dashboard replay **[you → me]**
- [ ] **12.** Delete the 3 empty duplicate Vercel Blob stores **[you]**
- [ ] **13.** Embed the hero demo (`site/public/demo.mp4` / `.gif`) on the landing **[me]**
- [ ] **14.** Launch-day content (Show HN / Product Hunt / LinkedIn / X / email) **[me drafts → you post]**

## ✅ Already done + live on browserbash.com
GA4 · 12 marketing/legal pages · **220 new SEO articles (282 total, live + in sitemap)** · TTACart case study · aleeup widget · `/dashboard` 404→sign-in fix · Remotion hero demo · landing nav/button fix · auth verified (on the dev Clerk instance) · `progress.md` + `tools/seo/` handoff.
