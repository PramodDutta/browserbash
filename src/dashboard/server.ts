import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { listRuns, getRun, artifactPath } from '../local-store.js';

const ART_TYPES: Record<string, string> = {
    screenshot: 'image/png',
    video: 'video/webm',
    trace: 'application/zip',
};

export interface DashboardHandle {
    url: string;
    close: () => Promise<void>;
}

/** Start the local dashboard web server. Resolves once it is listening. */
export function startDashboard(port: number): Promise<DashboardHandle> {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);

        // GET /api/runs  and  GET /api/runs/:id
        if (parts[0] === 'api' && parts[1] === 'runs') {
            res.setHeader('Content-Type', 'application/json');
            if (parts[2]) {
                const run = getRun(parts[2]);
                res.statusCode = run ? 200 : 404;
                res.end(JSON.stringify(run ?? { error: 'not found' }));
            } else {
                res.end(JSON.stringify({ runs: listRuns() }));
            }
            return;
        }

        // GET /art/:id/:kind
        if (parts[0] === 'art' && parts[1] && parts[2] && parts[2] in ART_TYPES) {
            const file = artifactPath(parts[1], parts[2] as 'screenshot' | 'video' | 'trace');
            if (!file) {
                res.statusCode = 404;
                res.end('not found');
                return;
            }
            res.setHeader('Content-Type', ART_TYPES[parts[2]]);
            fs.createReadStream(file).pipe(res);
            return;
        }

        if (url.pathname === '/' || url.pathname === '/index.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(PAGE);
            return;
        }

        res.statusCode = 404;
        res.end('not found');
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
            resolve({
                url: `http://localhost:${port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}

/** Best-effort: open a URL in the default browser. Never throws. */
export function openBrowser(url: string): void {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
        spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    } catch {
        // user can open the printed URL manually
    }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BrowserBash — local dashboard</title>
<style>
  :root { --bg:#fffdf9; --ink:#1a1a1a; --soft:#6b6b6b; --line:#e6e1d6; --accent:#ff5c1a; --term:#1c1b19; --ok:#2fbf71; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:'JetBrains Mono',ui-monospace,Menlo,monospace; background:var(--bg); color:var(--ink); }
  header { display:flex; align-items:center; gap:10px; padding:14px 20px; border-bottom:2px solid var(--ink); }
  header b { font-size:15px; } header span { color:var(--soft); font-size:12px; }
  .pill { margin-left:auto; font-size:10px; text-transform:uppercase; letter-spacing:.05em; border:2px solid var(--ink); padding:3px 8px; }
  .wrap { display:grid; grid-template-columns:320px 1fr; min-height:calc(100vh - 53px); }
  .list { border-right:2px solid var(--ink); overflow-y:auto; max-height:calc(100vh - 53px); }
  .row { padding:11px 16px; border-bottom:1px solid var(--line); cursor:pointer; }
  .row:hover, .row.on { background:#fff6ee; }
  .row .obj { font-size:12.5px; line-height:1.35; margin:3px 0; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .when { font-size:10px; color:var(--soft); }
  .badge { font-size:9px; text-transform:uppercase; border:1px solid var(--ink); padding:1px 6px; }
  .b-passed{ background:rgba(47,191,113,.22);} .b-failed{ background:rgba(255,107,107,.25);} .b-error{ background:rgba(255,200,87,.3);} .b-timeout{ background:#eee; }
  .main { padding:24px 28px; overflow-y:auto; max-height:calc(100vh - 53px); }
  .empty { color:var(--soft); font-size:13px; }
  h1 { font-size:20px; margin:0 0 4px; } .meta { color:var(--soft); font-size:12px; margin-bottom:18px; }
  .card { border:2px solid var(--ink); box-shadow:4px 4px 0 var(--line); padding:14px 16px; margin-bottom:18px; background:#fffefc; }
  .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--soft); display:block; margin-bottom:6px; }
  pre { background:var(--term); color:var(--ok); padding:12px 14px; font-size:12px; overflow-x:auto; margin:0; }
  img,video { max-width:100%; border:2px solid var(--ink); display:block; }
  a.dl { display:inline-block; font-size:11px; border:2px solid var(--ink); padding:7px 12px; color:var(--ink); text-decoration:none; box-shadow:3px 3px 0 var(--line); }
  .quote { font-size:14px; line-height:1.5; }
</style>
</head>
<body>
<header>
  <b>🔨 BrowserBash</b><span>local dashboard · ~/.browserbash/runs · private</span>
  <span class="pill">live</span>
</header>
<div class="wrap">
  <div class="list" id="list"></div>
  <div class="main" id="main"><p class="empty">Loading runs…</p></div>
</div>
<script>
let runs = [], current = null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const secs = (ms) => (ms/1000).toFixed(1) + 's';

async function load() {
  try {
    const r = await fetch('/api/runs'); const d = await r.json();
    runs = d.runs || [];
    renderList();
    if (current && !runs.find(x => x.id === current)) current = null;
    if (!current && runs[0]) select(runs[0].id);
    else if (current) renderDetail(runs.find(x => x.id === current));
  } catch (e) {}
}

function renderList() {
  const el = document.getElementById('list');
  if (!runs.length) { el.innerHTML = '<p class="empty" style="padding:16px">No runs yet. Run: <code>browserbash run "…"</code></p>'; return; }
  el.innerHTML = runs.map(r => \`
    <div class="row \${r.id===current?'on':''}" onclick="select('\${r.id}')">
      <div class="when">\${esc(r.startedAt?.replace('T',' ').slice(0,16))} · \${esc(r.provider)}</div>
      <div class="obj">\${esc(r.objective)}</div>
      <span class="badge b-\${esc(r.status)}">\${esc(r.status)}</span>
    </div>\`).join('');
}

function select(id) { current = id; renderList(); renderDetail(runs.find(x => x.id === id)); }

function renderDetail(r) {
  if (!r) return;
  const m = document.getElementById('main');
  const keys = Object.keys(r.finalState || {});
  const rec = [];
  if (r.artifacts?.video) rec.push(\`<div class="card"><span class="lbl">video</span><video controls src="/art/\${r.id}/video"></video></div>\`);
  if (r.artifacts?.screenshot) rec.push(\`<div class="card"><span class="lbl">final screenshot</span><a href="/art/\${r.id}/screenshot" target="_blank"><img src="/art/\${r.id}/screenshot" alt="screenshot"></a></div>\`);
  if (r.artifacts?.trace) rec.push(\`<div class="card"><span class="lbl">playwright trace</span><p style="font-size:12px;color:var(--soft);margin:0 0 10px">Open at trace.playwright.dev for a step-by-step timeline.</p><a class="dl" href="/art/\${r.id}/trace" download>Download trace.zip</a></div>\`);
  if (!rec.length) rec.push(\`<div class="card"><span class="lbl">recording</span><p style="font-size:12px;color:var(--soft);margin:0">No recording. Re-run with <code>--record</code> to capture a screenshot and session video.</p></div>\`);
  m.innerHTML = \`
    <span class="badge b-\${esc(r.status)}">\${esc(r.status)}</span>
    <h1>\${esc(r.objective).slice(0,90)}</h1>
    <p class="meta">\${esc(r.startedAt?.replace('T',' ').slice(0,19))} · \${secs(r.durationMs)} · \${r.stepsExecuted} steps · \${esc(r.provider)} · \${esc(r.model)}</p>
    <div class="card"><span class="lbl">objective</span><p class="quote">"\${esc(r.objective)}"</p>\${r.testUrl?\`<p style="font-size:12px;margin:10px 0 0">cloud report: <a href="\${esc(r.testUrl)}" target="_blank">\${esc(r.testUrl)}</a></p>\`:''}</div>
    \${keys.length?\`<div class="card"><span class="lbl">extracted values</span><pre>\${esc(JSON.stringify(r.finalState,null,2))}</pre></div>\`:''}
    \${rec.join('')}\`;
}

load();
setInterval(load, 4000);
</script>
</body>
</html>`;
