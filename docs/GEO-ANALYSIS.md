# BrowserBash — GEO / AI-Search Readiness (2026-06-22)

How well browserbash.com is optimized to be **cited by ChatGPT, Google AI Overviews, Perplexity, and Claude**. Agent analysis (live + code) + fixes shipped.

## GEO Readiness Score: 78 → ~85 / 100

| Platform | Sub-score | Notes |
|---|---|---|
| Google AI Overviews | 82 | Full SSR, FAQPage ×472, BreadcrumbList, clean robots + sitemap. |
| ChatGPT (GPTBot/SearchBot) | 80 | All OpenAI crawlers allowed, excellent llms.txt, citable answer blocks. |
| Perplexity | 74 | Crawler allowed, comparison tables. **Ceiling = near-zero off-site brand mentions.** |

## ✅ Already excellent (no action)
- **AI crawler access** — GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, Applebot-Extended, CCBot all explicitly allowed; `*` catch-all allows the rest.
- **Server-side rendering** — homepage, articles, /tutorials all deliver full content + JSON-LD in raw HTML (AI crawlers don't run JS). No client-only content.
- **llms.txt** — strong summary + Key-facts block + structured sections (better than 95% of llms.txt in the wild).
- **Passage citability (8.5/10)** — articles open with "what is X" definitions in the first sentence, 130–365-word self-contained sections, 277/472 have comparison tables, all 472 end with a 4-Q FAQ in the citable 66–126-word band.

## ✅ Fixed + live (commit 0b50d38)
- **Person author entity (the #1 GEO gap).** Added a `Person` (#pramod) to the site `@graph` — `jobTitle`, `worksFor`, `knowsAbout`, `sameAs` — and bound it via `@id` to the Organization founder **and every one of the 472 articles' `BlogPosting.author`** (was a bare, unlinked Person). Turns an anonymous byline into a verifiable expert for E-E-A-T / AI trust.
- **llms.txt Author block** — states who builds it (Pramod Dutta / The Testing Academy) + links.

## ⏳ Highest-impact remaining

| # | Change | Type | Impact |
|---|---|---|---|
| 1 | **Complete the `Person.sameAs`** with real YouTube / LinkedIn / X URLs (only GitHub + thetestingacademy.com shipped — need the rest confirmed to avoid wrong entity links). | Code (needs your URLs) | ★★★★★ |
| 2 | **Off-site brand corroboration** — BrowserBash has ~zero third-party footprint. Get into 2–3 "best browser automation 2026" listicles + one Show HN/Reddit post + a video on the existing ~90K-sub YouTube channel. | Off-site (you) | ★★★★★ — the only lever for the Perplexity ceiling |
| 3 | **Add a literal `## What is [topic]?` H2** with a 40–55-word answer to the top ~50 pillar/comparison articles (definitions already exist in intros — just promote them under a question heading). 0/472 currently use it; it's the single most-extracted AIO pattern. | Content | ★★★★ |
| 4 | **`llms-full.txt`** enumerating all 472 articles + 27 tutorials (URL + one-liner, by category) for agents that read llms.txt to decide what to fetch. | Code | ★★★ |
| 5 | **HowTo schema** on genuinely step-structured tutorials (gate on a frontmatter flag — don't blanket-apply to prose) + a `/glossary` `DefinedTermSet`. | Code | ★★★ |

## Honest ceiling
The engineering is top-decile; the limiter is **off-site authority**. BrowserBash is new and not yet cited anywhere but its own domain. Perplexity/ChatGPT weight cross-source corroboration heavily — so #2 (listicles + a YouTube video + Show HN) is the highest-leverage move and cannot be done in code.
