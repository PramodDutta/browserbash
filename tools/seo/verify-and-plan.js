const fs = require('fs');
const BLOG = '/Users/promode/Documents/Personal_Projects/BrowserBash/browserbash-cli/site/content/blog';
const specs = JSON.parse(fs.readFileSync('/tmp/bb-specs.json', 'utf8'));
const BATCH = parseInt(process.argv[2] || '60', 10);

function check(slug) {
  const p = BLOG + '/' + slug + '.md';
  if (!fs.existsSync(p)) return { exists: false, ok: false };
  const raw = fs.readFileSync(p, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = m ? (m[1].match(/^(title|description|date|category):/gm) || []).length : 0;
  const body = m ? raw.slice(m[0].length) : raw;
  const words = body.split(/\s+/).filter(Boolean).length;
  const faq = /^## FAQ\s*$/m.test(raw);
  const ok = fm >= 4 && faq && words >= 2700;
  return { exists: true, fm, words, faq, ok };
}

const done = [], missing = [], lowq = [];
for (const s of specs) {
  const c = check(s.slug);
  if (c.exists && c.ok) done.push({ s, words: c.words });
  else { missing.push(s); if (c.exists) lowq.push({ slug: s.slug, words: c.words, fm: c.fm, faq: c.faq }); }
}
fs.writeFileSync('/tmp/bb-missing.json', JSON.stringify(missing));

// Re-arm writer script: embed just this batch of missing specs, no args/slicing.
const batch = missing.slice(0, BATCH);
let scr = fs.readFileSync('/tmp/bb-write-articles.js', 'utf8');
// Robust re-arm: replace whatever defines `specs` (SPECS+slice OR a prior array)
// up to the stable buildPrompt marker. Works on every iteration.
scr = scr.replace(
  /const (?:SPECS|specs) = [\s\S]*?\nfunction buildPrompt\(spec, date\) \{/,
  'const specs = ' + JSON.stringify(batch) + '\n\nfunction buildPrompt(spec, date) {'
);
if (!scr.includes('const specs = ')) { console.error('RE-ARM FAILED'); process.exit(3); }
fs.writeFileSync('/tmp/bb-write-articles.js', scr);

const ws = done.map((d) => d.words);
console.log('DONE(valid):', done.length, '| MISSING:', missing.length, '| exists-but-low-quality:', lowq.length);
if (ws.length) console.log('done words -> min', Math.min(...ws), 'max', Math.max(...ws), 'avg', Math.round(ws.reduce((a, b) => a + b, 0) / ws.length));
if (lowq.length) console.log('low-quality:', lowq.slice(0, 12).map((x) => `${x.slug}(w${x.words},fm${x.fm},faq${x.faq})`).join(', '));
console.log('this batch (', batch.length, '):', batch.slice(0, 10).map((s) => s.slug).join(', '), batch.length > 10 ? '...' : '');
