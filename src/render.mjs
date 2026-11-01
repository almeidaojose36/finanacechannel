#!/usr/bin/env node
// Render an episode: ElevenLabs voiceover -> 3D motion-graphics frames (headless Chromium/WebGL) -> sound design -> MP4.
//
//   node src/render.mjs episodes/south-korea [--preview] [--only 0,2,3] [--workers 2]
//                       [--music path/to/bed.mp3] [--no-music] [--silent] [--metadata] [--flat]
//                       [--stills 0.3,0.6]
//   --metadata  rewrites youtube.txt only (uses cached voiceovers, renders no video)
//   --flat      uses the original 2D slide stage instead of the 3D film stage
//   --stills    writes PNG stills at the given fractions of each picked segment instead of video
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { synthesize } from './tts.mjs';
import { launchBrowser } from './browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEAD_IN = 0.5;   // seconds before the voice starts
const TAIL = 0.9;      // seconds after the voice ends
const CHAPTER_LEN = 3.2;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const VALUE_FLAGS = ['--only', '--workers', '--music', '--stills'];
const epDir = resolve(args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1])) || '');
if (!existsSync(join(epDir, 'episode.json'))) {
  console.error('usage: node src/render.mjs <episode-dir> [--preview] [--only 0,1] [--workers N] [--music file] [--no-music] [--silent] [--metadata] [--flat] [--stills 0.3,0.7]');
  process.exit(1);
}

const channel = JSON.parse(readFileSync(join(ROOT, 'channel.json'), 'utf8'));
const episode = JSON.parse(readFileSync(join(epDir, 'episode.json'), 'utf8'));
const { width: W, height: H, fps: FPS } = channel.video;
const build = join(epDir, 'build');
mkdirSync(join(build, 'segments'), { recursive: true });
const flat = flag('flat');

let picks = episode.segments.map((_, i) => i);
if (flag('preview')) picks = picks.slice(0, 4);
if (opt('only')) picks = opt('only').split(',').map(Number);
const workers = Number(opt('workers', 3));
const partial = picks.length !== episode.segments.length;

const run = (cmd, argv, input) => new Promise((ok, fail) => {
  const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}\n${err.slice(-2000)}`))));
  if (input) input(p.stdin);
});
const probe = (file) => new Promise((ok) => {
  const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('close', () => ok(parseFloat(out)));
});
const ts = (s) => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// 1. Voiceover ------------------------------------------------------------
const plan = [];
let chars = 0;
for (const i of picks) {
  const seg = episode.segments[i];
  const item = { i, seg, words: [], duration: CHAPTER_LEN, vo: null };
  if (seg.voiceover && !flag('silent')) {
    const prev = episode.segments.slice(0, i).reverse().find((s) => s.voiceover)?.voiceover;
    const next = episode.segments.slice(i + 1).find((s) => s.voiceover)?.voiceover;
    const r = await synthesize(seg.voiceover, channel.voice, join(ROOT, '.cache', 'tts'), {
      previousText: prev?.slice(-300), nextText: next?.slice(0, 300),
    });
    if (!r.cached) chars += seg.voiceover.length;
    item.vo = r.mp3; item.words = r.words;
    item.duration = LEAD_IN + (await probe(r.mp3)) + TAIL;
    console.log(`voice  #${i} ${seg.type}${seg.number ? ' ' + seg.number : ''}  ${item.duration.toFixed(1)}s${r.cached ? ' (cached)' : ''}`);
  } else if (seg.voiceover) {
    item.duration = LEAD_IN + seg.voiceover.split(/\s+/).length / 2.5 + TAIL;
  }
  plan.push(item);
}
if (chars) console.log(`ElevenLabs characters used this run: ${chars}`);

// 2. Frames -> video (silent; audio is mixed for the whole programme afterwards) ----
if (!flag('metadata')) {
  // One browser per worker: each has its own (software) GPU process, so workers really run in parallel.
  const browsers = await Promise.all(Array.from({ length: workers }, () => launchBrowser()));
  const geo = flat ? null : JSON.parse(readFileSync(join(ROOT, 'assets', 'geo', 'geo.json'), 'utf8'));
  const stagePath = flat ? 'src/stage.html' : 'src/film/stage3d.html';
  const stills = opt('stills') ? opt('stills').split(',').map(Number) : null;

  async function openStage(item, browser) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`  [page #${item.i}] ${m.text()}`); });
    page.on('pageerror', (e) => console.log(`  [page #${item.i}] ${e.message}`));
    await page.route('http://studio.local/**', (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' }[extname(file)] || 'application/octet-stream';
      route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
    });
    await page.goto(`http://studio.local/${stagePath}`);
    await page.waitForFunction(() => typeof window.init === 'function');
    const broll = item.seg.broll ? pathToFileURL(join(epDir, item.seg.broll)).href : null;
    await page.evaluate((p) => window.init(p), {
      channel, episode: { ...episode, segments: undefined }, segment: item.seg, geo,
      words: item.words, duration: item.duration, leadIn: LEAD_IN, broll,
      renderScale: channel.video.renderScale ?? 1, antialias: channel.video.antialias ?? true,
    });
    return page;
  }

  async function renderSegment(item, browser) {
    const name = `seg_${String(item.i).padStart(2, '0')}`;
    const page = await openStage(item, browser);
    item.cues = await page.evaluate(() => (window.getCues ? window.getCues() : [{ t: 0, type: 'whoosh' }]));
    if (stills) {
      for (const f of stills) {
        const t = f <= 1 ? f * item.duration : f;
        await page.evaluate((tt) => window.renderFrame(tt), t);
        await page.screenshot({ path: join(build, `still_${name}_${t.toFixed(1)}.png`) });
      }
      await page.close();
      console.log(`stills #${item.i}`);
      return;
    }
    const mp4 = join(build, 'segments', `${name}.mp4`);
    const frames = Math.round(item.duration * FPS);
    const t0 = Date.now();
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'faster', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', mp4], async (stdin) => {
      for (let f = 0; f < frames; f++) {
        await page.evaluate((t) => window.renderFrame(t), f / FPS);
        const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
        if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
        if (f && f % 240 === 0) console.log(`  #${item.i} ${f}/${frames} (${((Date.now() - t0) / f).toFixed(0)} ms/frame)`);
      }
      stdin.end();
    });
    await page.close();
    item.mp4 = mp4;
    console.log(`video  #${item.i} ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  const queue = [...plan];
  await Promise.all(browsers.map(async (browser) => {
    while (queue.length) await renderSegment(queue.shift(), browser);
  }));
  await Promise.all(browsers.map((b) => b.close()));

  if (!stills) {
    // 3. Sound design: voice + SFX cues + music bed, ducked and loudness-normalised ----
    let start = 0;
    const mixPlan = { sampleRate: 48000, leadIn: LEAD_IN, segments: [], music: flag('no-music') ? null : (opt('music') ? resolve(opt('music')) : 'generate') };
    for (const p of plan) {
      mixPlan.segments.push({ start, duration: p.duration, type: p.seg.type, vo: p.vo, cues: p.cues || [] });
      start += p.duration;
    }
    mixPlan.total = start;
    const planFile = join(build, 'mix.json');
    writeFileSync(planFile, JSON.stringify(mixPlan));
    const wav = join(build, 'mix.wav');
    await run('python3', ['-I', join(ROOT, 'src', 'audio', 'mix.py'), planFile, wav]);

    // 4. Concatenate video and mux the mixed audio ----------------------------
    const list = join(build, 'concat.txt');
    writeFileSync(list, plan.map((p) => `file '${p.mp4}'`).join('\n'));
    const finalName = `${episode.slug}${partial ? '-preview' : ''}.mp4`;
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', join(build, finalName)]);
    console.log(`\nDone: ${join(build, finalName)}  (${ts(start)})`);
  }
}

// 5. YouTube description with chapter timestamps (chapter cards fold into the next fact)
let t = 0, pendingCard = null;
const stamps = [];
for (const p of plan) {
  if (p.seg.type === 'chapter') pendingCard ??= t;
  else {
    const label = p.seg.type === 'intro' ? 'Intro' : p.seg.type === 'outro' ? 'Final thoughts' : `Fact ${p.seg.number}: ${p.seg.title}`;
    stamps.push(`${ts(pendingCard ?? t)} ${label}`); pendingCard = null;
  }
  t += p.duration;
}
const sources = [...new Set(plan.flatMap((p) => p.seg.sources || []))];
const yt = episode.youtube || {};
writeFileSync(join(build, partial ? 'youtube-preview.txt' : 'youtube.txt'), [
  `TITLE: ${episode.title}`, '', yt.descriptionIntro || '', '', 'CHAPTERS', ...stamps, '',
  'SOURCES', ...sources.map((s) => `• ${s}`), '',
  'Figures are approximate and drawn from the public sources above at the time of production.', '',
  `TAGS: ${(yt.tags || []).join(', ')}`,
].join('\n'));
if (flag('metadata')) console.log(`Done: metadata (${ts(t)})`);
