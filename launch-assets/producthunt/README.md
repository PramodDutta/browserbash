# BrowserBash — Product Hunt gallery images

Six gallery slides for the BrowserBash Product Hunt launch.

## Files

| PNG | Slide | What it shows |
|-----|-------|---------------|
| `01-hero.png` | Hero | "Plain English in. Real browser out." + `npm install -g browserbash-cli` |
| `02-before-after.png` | Before / After | Playwright selectors vs. one plain-English `browserbash run` line |
| `03-markdown-test.png` | Markdown tests | A `login_test.md` with `{{variables}}` + secrets masked as `*****` |
| `04-agent-ci.png` | Agent mode / CI | `--agent` NDJSON event stream + exit codes `0 passed · 1 failed · 2 error · 3 timeout` |
| `05-free-local.png` | Free & local | Ollama-first, `$0` model bill, no API keys, nothing leaves your machine |
| `06-providers.png` | Providers | One flag, any browser: local · cdp · browserbase · lambdatest · browserstack |

Each PNG is the 1270×760 brand canvas rendered at a 2× device scale, so the
actual pixel size is **2540×1520** (same 1270:760 / 5:3 aspect ratio, just
sharper). Product Hunt downscales for display; the 2× source keeps text crisp on
retina. To get exact 1270×760 files, see "Re-rendering" below and drop
`deviceScaleFactor` to `1`.

## Brand

- Orange `#ff5c1a`, dark ink `#1a1a1a`, cream bg `#fffdf9`, muted `#6b6b6b`
- Headings: Inter (bold/900). Commands: JetBrains Mono.
- Logo mark: a 46px orange square with a 5px ink border.

All product claims are real: the `.md` test format, `{{variables}}` substitution,
`*****` secret masking, the `--agent` NDJSON events (`type:"step"` / `type:"run_end"`),
the exit codes (passed 0 / failed 1 / error 2 / timeout 3), and the five
`--provider` values are taken straight from the CLI source.

## Source

The editable source for each slide is a self-contained HTML file (inline CSS,
fixed 1270×760) under `html/`. Edit those, then re-render.

## Re-rendering

The render script uses the Chromium bundled with Playwright in the `site`
workspace. Run it **from the `site` directory** so the `import 'playwright'`
resolves:

```bash
cd /Users/promode/Documents/Personal_Projects/BrowserBash/browserbash-cli/site
node ../launch-assets/producthunt/render.mjs
```

Outputs land back in `launch-assets/producthunt/` as `01-…` through `06-…`.

### Manual export (no Node)

Open any `html/slide-*.html` in Chrome, set the window/viewport to exactly
1270×760, and screenshot the slide. The layout is pixel-fixed, so a full-page
capture at that size is the whole slide with no scrolling.
