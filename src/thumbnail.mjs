#!/usr/bin/env node
// Render a 1280x720 YouTube thumbnail from episode.json's "thumbnail" block.
//   node src/thumbnail.mjs episodes/south-korea [--image photo.jpg]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const epDir = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--image'));
const imgArg = args.includes('--image') ? args[args.indexOf('--image') + 1] : null;
const channel = JSON.parse(readFileSync(join(ROOT, 'channel.json'), 'utf8'));
const ep = JSON.parse(readFileSync(join(epDir, 'episode.json'), 'utf8'));
const th = ep.thumbnail;
const img = imgArg || th.image ? pathToFileURL(resolve(imgArg || join(epDir, th.image))).href : null;
const c = channel.colors;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin: 0; box-sizing: border-box; }
body { width: 1280px; height: 720px; overflow: hidden; background: ${c.navy}; font-family: 'Inter Display', Inter, sans-serif; color: ${c.parchment}; position: relative; }
.photo { position: absolute; inset: 0 0 0 0; background: ${img ? `url('${img}') center/cover` : `radial-gradient(circle at 30% 45%, #1B2B57, ${c.navy} 70%)`}; }
.photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,17,40,.15) 0%, rgba(10,17,40,.55) 48%, rgba(10,17,40,.97) 62%); }
.grid { position: absolute; inset: 0; background-image: radial-gradient(rgba(148,163,184,.25) 1.5px, transparent 1.5px); background-size: 28px 28px; opacity: ${img ? 0 : 1}; }
.chart { position: absolute; left: 40px; bottom: 60px; width: 640px; height: 420px; display: ${img ? 'none' : 'block'}; }
.stat { position: absolute; left: 60px; top: 60px; width: 640px; display: ${img ? 'none' : 'block'}; }
.stat b { display: block; font-size: 110px; font-weight: 900; color: ${c.gold}; letter-spacing: -.03em; line-height: 1; text-shadow: 0 0 40px rgba(245,166,35,.4); }
.stat span { font-size: 28px; font-weight: 700; color: #CBD5E1; letter-spacing: .04em; }
.right { position: absolute; right: 44px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; }
.kicker { display: inline-block; align-self: flex-start; background: ${c.gold}; color: ${c.navy}; font-weight: 900; font-size: 40px; padding: 6px 18px; border-radius: 8px; letter-spacing: .02em; }
.head { font-size: 76px; font-weight: 900; line-height: .98; text-transform: uppercase; margin-top: 20px; letter-spacing: -.01em; text-shadow: 0 6px 30px rgba(0,0,0,.6); }
.head em { font-style: normal; color: ${c.gold}; }
.sub { margin-top: 18px; font-size: 30px; font-weight: 800; color: ${c.emerald}; text-transform: uppercase; letter-spacing: .06em; }
</style></head><body>
<div class="photo"></div><div class="grid"></div>
<svg class="chart" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.gold}" stop-opacity=".5"/><stop offset="1" stop-color="${c.gold}" stop-opacity="0"/></linearGradient></defs>
<path d="M0 400 L90 385 L180 300 L270 230 L360 190 L450 140 L560 60 L560 420 L0 420Z" fill="url(#g)"/>
<path d="M0 400 L90 385 L180 300 L270 230 L360 190 L450 140 L560 60" fill="none" stroke="${c.gold}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M520 52 L572 52 L572 104" fill="none" stroke="${c.gold}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>
<div class="stat"><b>${esc(th.stat)}</b><span>${esc(th.statLabel)}</span></div>
<div class="right"><div class="kicker">${esc(th.kicker)}</div>
<div class="head">${esc(th.headline).replace(/(\$[\d.,]+\s?[A-Z]*)/, '<em>$1</em>')}</div>
<div class="sub">${esc(th.sub)}</div></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
mkdirSync(join(epDir, 'build'), { recursive: true });
const out = join(epDir, 'build', 'thumbnail.png');
await page.screenshot({ path: out });
await browser.close();
console.log(out);
