# BrowserBash Launch — Landing Page, Waitlist, Dashboard & CLI Hardening

**Date:** 2026-06-11 · **Launch target:** Monday 2026-06-15 · **Owner:** Pramod Dutta

## Goal

Ship browserbash.com: a light-themed, animated, SEO-optimized landing page that demos the CLI, captures a waitlist into Neon Postgres, and exposes a Clerk-protected admin dashboard. Harden the existing `browserbash-cli` with unit + e2e tests and publish it to npm so launch-day visitors can actually install it.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Domain | browserbash.com (CNAME/A records to Vercel) |
| Repo | `PramodDutta/browserbash` — CLI at root, landing page in `site/`. Force-push local history over placeholder README. Empty private `browserbash-cli` repo unused. |
| Site stack | Next.js 15 App Router, static-prerendered landing, API routes, Vercel (account `luckydutta96`), root directory `site/` |
| Theme | Light/white, dark terminal blocks for contrast. Style reference: qaskills.sh (same author) — punchy copy, prominent install command — but light where qaskills is dark. |
| Database | Neon Postgres via `@neondatabase/serverless`; stores waitlist (and any future data) |
| Auth | Clerk, dashboard only; allowlisted to Pramod's email |
| Mascot | "Bo" — pixel-art sprite, ambient + click-to-bash interactions, CSS sprite-sheet animation only |
| Try-it demo | Simulated terminal replay of real recorded CLI runs (no live cloud sandbox at launch) |
| npm | Publish `browserbash-cli` at launch; hero shows `npm install -g browserbash-cli` |
| Animation budget | No JS animation libraries. CSS keyframes + `steps()` sprites. `prefers-reduced-motion` respected. |

## Architecture

```text
browserbash/                  (repo root = existing CLI)
├── src/ dist/ docs/ examples/   # CLI unchanged
├── tests/                       # NEW — vitest
│   ├── unit/                    # parser, variables, config, llm, output, providers
│   └── e2e/                     # CLI process smoke tests (exit codes, NDJSON)
└── site/                        # NEW — Next.js app (Vercel root)
    ├── app/
    │   ├── page.tsx             # landing (static)
    │   ├── layout.tsx           # metadata, fonts, JSON-LD
    │   ├── dashboard/page.tsx   # Clerk-protected admin
    │   ├── api/waitlist/route.ts
    │   └── api/stats/route.ts
    ├── components/              # Bo, Terminal, sections
    ├── lib/                     # db.ts (Neon), validation
    └── public/                  # sprites, og.png, favicon, demo recordings (JSON)
```

## Landing page sections

1. **Nav** — Bo icon + wordmark; anchors Demo · How it works · Features · Quick start; GitHub button.
2. **Hero** — Bo ambient animation; headline ("Plain English in. Real browser out." — final copy at build); copyable install command; waitlist email form; live waitlist counter.
3. **Demo terminal** — auto-playing replay of a real recorded run; tabs for human output and `--agent` NDJSON.
4. **Try it** — visitor picks one of ~5 canned objectives, watches the real recorded output replay, copies the command to run locally.
5. **How it works** — Provider / Engine / LLM three-layer diagram; Ollama-first free-stack callout.
6. **Features grid** — OSS-first, NDJSON agent mode, markdown tests, exit codes, 5 providers, secret masking.
7. **Quick start** — install + first command + CI snippet.
8. **Footer** — GitHub, npm, Apache-2.0, "built by The Testing Academy".

## Bo mascot

Pixel-art sprite on a ~32 px logical grid. Poses: idle (2-frame breathe), walk (4-frame), bash (3-frame hammer swing at a browser-window sprite that cracks), happy. Authored as SVG pixel grid → exported PNG sprite sheets. Used in: nav icon, hero, favicon, OG image, 404 page. Interactions: ambient idle/walk loop in hero; click Bo → bash animation + window-crack overlay. All motion CSS-only; disabled under `prefers-reduced-motion`.

## Waitlist data flow

`POST /api/waitlist` `{email, name?, useCase?}` → zod validation + honeypot field + per-IP throttle → Neon `INSERT … ON CONFLICT (email) DO NOTHING` → respond with waitlist position. `GET /api/stats` → `{count}`, cached 60 s, feeds the public counter.

```sql
CREATE TABLE waitlist (
    id         SERIAL PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT,
    use_case   TEXT,
    source     TEXT DEFAULT 'landing',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Env: `DATABASE_URL` (Neon), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAILS`.

## Dashboard (`/dashboard`)

Clerk middleware; signed-in user's email must be in `ADMIN_EMAILS` allowlist, otherwise 404. Shows: total signups, 7-day trend chart, paginated table (email, name, use case, date), CSV export.

## Error handling

- API: invalid email → 400 with message; duplicate → 200 (idempotent, position returned); DB unreachable → 503, form shows retry message; honeypot filled → 200 fake-success (silent drop).
- Form: client-side validation before POST; loading + success + error states.
- CLI work changes no runtime behavior except where tests reveal bugs (fix forward, document in commits).

## SEO

Next metadata API (title, description, canonical, OG + Twitter cards), OG image featuring Bo, JSON-LD `SoftwareApplication`, generated `sitemap.xml`, `robots.txt`, `llms.txt`, semantic HTML landmarks, image dimensions set, target Lighthouse ≥ 95 in all categories.

## Testing & verification matrix

| Layer | What | How |
| --- | --- | --- |
| CLI unit | parser, variables/masking, config precedence, llm auto-resolution, providers registry, NDJSON schema | vitest, no network |
| CLI e2e | `--help`, `providers`, `init`, `config`, error-path exit codes (2), NDJSON error events | vitest spawning `node dist/index.js` |
| CLI live | one real objective against local Chrome | gated: runs only when Ollama or `ANTHROPIC_API_KEY` present |
| Publishability | `npm pack` → install tarball in temp dir → `browserbash --help` works | script + manual |
| Site API | waitlist validation, duplicate, honeypot, stats | vitest with mocked Neon |
| Site e2e | form submit → success state; counter renders; `/dashboard` redirects unauthenticated | Playwright |
| Post-deploy | real submit on browserbash.com → row in Neon → visible in dashboard; Lighthouse audit; DNS + HTTPS green | manual + scripts |

## Out of scope (post-launch)

Live cloud sandbox try-it, mini-game easter egg, blog, CLI telemetry, OpenAI-protocol builtin engine.

## Needed from Pramod (build proceeds without; required before deploy)

1. Neon `DATABASE_URL` (or `neonctl` auth to create the project)
2. Clerk app keys (publishable + secret) + admin email for allowlist
3. browserbash.com registrar (to apply DNS records)
4. npm account login for publish
