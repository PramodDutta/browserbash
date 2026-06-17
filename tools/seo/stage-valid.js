const fs = require('fs');
const BLOG = '/Users/promode/Documents/Personal_Projects/BrowserBash/browserbash-cli/site/content/blog';
const specs = JSON.parse(fs.readFileSync('/tmp/bb-specs.json', 'utf8'));
const out = [];
for (const s of specs) {
  const p = BLOG + '/' + s.slug + '.md';
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = m ? (m[1].match(/^(title|description|date|category):/gm) || []).length : 0;
  const body = m ? raw.slice(m[0].length) : raw;
  const words = body.split(/\s+/).filter(Boolean).length;
  const faq = /^## FAQ\s*$/m.test(raw);
  if (fm >= 4 && faq && words >= 2700) out.push(p);
}
process.stdout.write(out.join('\n'));
