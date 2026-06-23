// Renders each slide HTML to a 1270x760 PNG using the chromium bundled with the
// `site` workspace's Playwright. Run from the `site` dir so the require resolves.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML_DIR = path.join(HERE, 'html');

const slides = [
  ['slide-1-hero.html', '01-hero.png'],
  ['slide-2-before-after.html', '02-before-after.png'],
  ['slide-3-markdown-test.html', '03-markdown-test.png'],
  ['slide-4-agent-ci.html', '04-agent-ci.png'],
  ['slide-5-free-local.html', '05-free-local.png'],
  ['slide-6-providers.html', '06-providers.png'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1270, height: 760 },
  deviceScaleFactor: 2, // crisp 2x output
});
const page = await ctx.newPage();

for (const [src, out] of slides) {
  const srcPath = path.join(HTML_DIR, src);
  if (!fs.existsSync(srcPath)) { console.error('MISSING', srcPath); continue; }
  await page.goto('file://' + srcPath, { waitUntil: 'networkidle' });
  // ensure webfonts are ready before shooting
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await page.waitForTimeout(350);
  const outPath = path.join(HERE, out);
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: 1270, height: 760 },
  });
  console.log('WROTE', outPath);
}

await browser.close();
console.log('DONE');
