#!/usr/bin/env node
/**
 * Renders og.png (1200×630) and app/icon.png (512×512) using
 * playwright-core + system Chrome. Run: node scripts/render-assets.mjs
 */
import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');

const PALETTE = {
    D: '#16130f', O: '#ff5c1a', A: '#d8430b', W: '#ffffff',
    B: '#16130f', M: '#9aa3ad', H: '#8a5a2b',
};

const BODY = [
    '.......AA.......',
    '.......DD.......',
    '...DDDDDDDDDD...',
    '..DOOOOOOOOOOD..',
    '.DOOOOOOOOOOOOD.',
    '.DOOWWOOOOWWOOD.',
    '.DOOWBOOOOWBOOD.',
    '.DOOOOOOOOOOOOD.',
    '.DOODDDDDDDOOOD.',
    '.DOOOOOOOOOOOOD.',
    '..DOOOOOOOOOOD..',
    '...DDDDDDDDDD...',
    '....DOD..DOD....',
    '...DDDD..DDDD...',
];

const HAMMER = [
    '.DDDD.',
    'DMMMMD',
    'DMMMMD',
    'DMMMMD',
    '.DDDD.',
    '..HH..',
    '..HH..',
    '..HH..',
];

function rects(rows, ox = 0, oy = 0) {
    let out = '';
    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const c = row[x];
            if (c === '.') continue;
            out += `<rect x="${x + ox}" y="${y + oy}" width="1" height="1" fill="${PALETTE[c]}"/>`;
        }
    });
    return out;
}

const boSvg = (size) => `
<svg viewBox="0 0 21 14" width="${(size / 14) * 21}" height="${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    ${rects(BODY)}
    <g transform="translate(14.2, 1.6) rotate(24, 3, 8)">${rects(HAMMER)}</g>
</svg>`;

const og = `<!doctype html><html><head><style>
    @font-face { font-family: x; src: local('Helvetica'); }
    * { margin: 0; box-sizing: border-box; }
    body {
        width: 1200px; height: 630px; overflow: hidden;
        background: #fffdf9;
        background-image: linear-gradient(#e8e1d6 1px, transparent 1px), linear-gradient(90deg, #e8e1d6 1px, transparent 1px);
        background-size: 40px 40px;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        display: flex; align-items: center; justify-content: space-between; padding: 0 70px;
    }
    .txt h1 { font-size: 62px; line-height: 1.05; letter-spacing: -1.5px; color: #16130f; font-weight: 800; }
    .txt h1 .o { color: #ff5c1a; text-shadow: 4px 4px 0 #16130f; }
    .cmd {
        margin-top: 30px; display: inline-block; background: #14110d; color: #f2ece2;
        font-family: Menlo, monospace; font-size: 21px; padding: 16px 22px;
        border: 3px solid #16130f; box-shadow: 8px 8px 0 #16130f; white-space: nowrap;
    }
    .cmd .p { color: #ff5c1a; font-weight: 700; }
    .sub { margin-top: 24px; font-size: 22px; color: #6b6258; }
    .bo { flex-shrink: 0; }
</style></head><body>
    <div class="txt">
        <h1>Plain English in.<br/><span class="o">Real browser</span> out.</h1>
        <div class="cmd"><span class="p">$</span> npm install -g browserbash-cli</div>
        <div class="sub">Open-source natural-language browser automation</div>
    </div>
    <div class="bo">${boSvg(300)}</div>
</body></html>`;

const icon = `<!doctype html><html><head><style>
    * { margin: 0; }
    body { width: 512px; height: 512px; background: #fffdf9; display: flex; align-items: center; justify-content: center; overflow: hidden; }
</style></head><body>${boSvg(420)}</body></html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og);
await page.screenshot({ path: join(site, 'public', 'og.png') });

await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(icon);
await page.screenshot({ path: join(site, 'app', 'icon.png') });

await browser.close();
console.log('wrote public/og.png and app/icon.png');
