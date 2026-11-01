#!/usr/bin/env node
// One-off: precompute globe land dots and a Korean-peninsula heightfield into assets/geo/geo.json.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { feature } = require('topojson-client');
const { geoContains } = await import('d3-geo');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const land = feature(require('world-atlas/land-110m.json'), 'land');
const countries = feature(require('world-atlas/countries-50m.json'), 'countries');
const byId = (id) => countries.features.find((f) => Number(f.id) === id);
const KOR = byId(410), PRK = byId(408);

// Evenly spaced land dots for the globe.
const dots = [];
const step = 1.1;
for (let lat = -58; lat <= 82; lat += step) {
  const n = Math.max(1, Math.round((360 / step) * Math.cos((lat * Math.PI) / 180)));
  for (let i = 0; i < n; i++) {
    const lon = -180 + (i / n) * 360;
    if (geoContains(land, [lon, lat])) dots.push([+lon.toFixed(2), +lat.toFixed(2)]);
  }
}

// Heightfield over the peninsula.
const box = { lon0: 124, lon1: 131.6, lat0: 33, lat1: 43.2 };
const res = 0.04;
const W = Math.round((box.lon1 - box.lon0) / res) + 1, H = Math.round((box.lat1 - box.lat0) / res) + 1;
let mask = new Float32Array(W * H), south = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const p = [box.lon0 + i * res, box.lat0 + j * res];
  const k = geoContains(KOR, p), n = !k && geoContains(PRK, p);
  mask[j * W + i] = k || n ? 1 : 0; south[j * W + i] = k ? 1 : 0;
}
// Soften coastlines.
for (let pass = 0; pass < 3; pass++) {
  const m2 = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let s = 0, c = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= W || y >= H) continue; s += mask[y * W + x]; c++;
    }
    m2[j * W + i] = s / c;
  }
  mask = m2;
}
// Deterministic fractal value noise.
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x, y) => { let s = 0, a = .5, f = 1; for (let o = 0; o < 5; o++) { s += a * Math.abs(vnoise(x * f, y * f) * 2 - 1); a *= .5; f *= 2.1; } return s; };
const heights = [];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const lon = box.lon0 + i * res, lat = box.lat0 + j * res;
  // Taebaek range hugs the east coast; northern highlands are higher.
  const ridgeLon = 128.6 + (lat - 36) * 0.18;
  const ridge = Math.exp(-((lon - ridgeLon) ** 2) / 0.35) * (lat > 35 && lat < 39.5 ? 1 : 0.4);
  const north = clamp01((lat - 38.5) / 2.5) * 0.9;
  const h = mask[j * W + i] * (0.12 + 0.55 * fbm(lon * 1.6, lat * 1.6) + 0.9 * ridge + north * fbm(lon * 2.2 + 5, lat * 2.2));
  heights.push(+(Math.max(0, h)).toFixed(3));
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Nearby coastlines for context (China / Japan / Korea), clipped to a wider box.
const wide = { lon0: 116, lon1: 142, lat0: 28, lat1: 46 };
const coast = [];
for (const f of countries.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) {
    const pts = ring.filter(([lo, la]) => lo > wide.lon0 && lo < wide.lon1 && la > wide.lat0 && la < wide.lat1);
    if (pts.length > 6) coast.push({ id: Number(f.id), pts: pts.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]) });
  }
}

writeFileSync(join(ROOT, 'assets/geo/geo.json'), JSON.stringify({ dots, terrain: { box, res, W, H, heights, south: Array.from(south) }, coast }));
console.log('dots', dots.length, 'terrain', W, 'x', H, 'coast rings', coast.length);
