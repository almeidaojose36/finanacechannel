#!/usr/bin/env node
// Render an episode: ElevenLabs voiceover -> animated frames (headless Chromium) -> MP4.
//
//   node src/render.mjs episodes/south-korea [--preview] [--only 0,2,3] [--workers 3]
//                       [--music path/to/bed.mp3] [--silent] [--metadata]
//   --metadata rewrites youtube.txt only (uses cached voiceovers, renders no video)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { synthesize } from './tts.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LEAD_IN = 0.5;   // seconds before the voice starts
const TAIL = 0.9;      // seconds after the voice ends
const CHAPTER_LEN = 3.2;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const VALUE_FLAGS = ['--only', '--workers', '--music'];
const epDir = resolve(args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1])) || '');
if (!existsSync(join(epDir, 'episode.json'))) {
  console.error('usage: node src/render.mjs <episode-dir> [--preview] [--only 0,1] [--workers N] [--music file] [--silent]');
  process.exit(1);
}

const channel = JSON.parse(readFileSync(join(ROOT, 'channel.json'), 'utf8'));
const episode = JSON.parse(readFileSync(join(epDir, 'episode.json'), 'utf8'));
const { width: W, height: H, fps: FPS } = channel.video;
const build = join(epDir, 'build');
mkdirSync(join(build, 'segments'), { recursive: true });

let picks = episode.segments.map((_, i) => i);
if (flag('preview')) picks = picks.slice(0, 4);
if (opt('only')) picks = opt('only').split(',').map(Number);
const workers = Number(opt('workers', 3));

const run = (cmd, argv, input) => new Promise((ok, fail) => {
  const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}\n${err.slice(-2000)}`))));
  if (input) input(p.stdin);
});
const probe = (file) => new Promise((ok) => {
  const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('close', () => ok(parseFloat(out)));
});

// 1. Voiceover
const whoosh = join(ROOT, 'assets', 'whoosh.wav');
if (!existsSync(whoosh)) {
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.9:amplitude=0.6',
    '-af', 'highpass=f=400,lowpass=f=5000,afade=t=in:d=0.4:curve=exp,afade=t=out:st=0.4:d=0.5,volume=0.35', whoosh]);
}

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

const partial = picks.length !== episode.segments.length;
if (!flag('metadata')) {
// 2. Per-segment audio bed (silence + whoosh + voice), exact segment length
async function segmentAudio(item, out) {
  const argv = ['-y', '-f', 'lavfi', '-t', item.duration.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo', '-i', whoosh];
  let fc = '[1:a]volume=1[w];', mix = '[0:a][w]';
  if (item.vo) {
    argv.push('-i', item.vo);
    fc += `[2:a]aresample=44100,adelay=${LEAD_IN * 1000}|${LEAD_IN * 1000}[v];`; mix += '[v]';
  }
  const n = item.vo ? 3 : 2;
  fc += `${mix}amix=inputs=${n}:duration=first:normalize=0[a]`;
  argv.push('-filter_complex', fc, '-map', '[a]', '-c:a', 'pcm_s16le', out);
  await run('ffmpeg', argv);
}

// 3. Frames -> video
const browser = await chromium.launch();
const stageUrl = pathToFileURL(join(ROOT, 'src', 'stage.html')).href;

async function renderSegment(item) {
  const name = `seg_${String(item.i).padStart(2, '0')}`;
  const wav = join(build, 'segments', `${name}.wav`);
  const mp4 = join(build, 'segments', `${name}.mp4`);
  await segmentAudio(item, wav);

  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(stageUrl);
  const broll = item.seg.broll ? pathToFileURL(join(epDir, item.seg.broll)).href : null;
  await page.evaluate((p) => window.init(p), {
    channel, episode: { ...episode, segments: undefined }, segment: item.seg,
    words: item.words, duration: item.duration, leadIn: LEAD_IN, broll,
  });

  const frames = Math.round(item.duration * FPS);
  const t0 = Date.now();
  await run('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', mp4], async (stdin) => {
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.renderFrame(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
    }
    stdin.end();
  });
  await page.close();
  console.log(`video  #${item.i} ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return mp4;
}

const queue = [...plan], files = {};
await Promise.all(Array.from({ length: workers }, async () => {
  while (queue.length) { const item = queue.shift(); files[item.i] = await renderSegment(item); }
}));
await browser.close();

// 4. Concatenate (+ optional ducked music bed)
const list = join(build, 'concat.txt');
writeFileSync(list, plan.map((p) => `file '${files[p.i]}'`).join('\n'));
const finalName = `${episode.slug}${partial ? '-preview' : ''}.mp4`;
const joined = join(build, 'joined.mp4');
await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
// Final pass: optional ducked music bed, then loudness-normalise to YouTube's -14 LUFS.
const loud = 'loudnorm=I=-14:TP=-1.5:LRA=11';
const mixArgs = opt('music')
  ? ['-stream_loop', '-1', '-i', resolve(opt('music')), '-filter_complex',
    `[1:a]volume=0.22[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=600[d];[0:a][d]amix=inputs=2:duration=first:normalize=0,${loud}[a]`,
    '-map', '0:v', '-map', '[a]']
  : ['-af', loud];
await run('ffmpeg', ['-y', '-i', joined, ...mixArgs, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart', join(build, finalName)]);

}

// 5. YouTube description with chapter timestamps (chapter cards fold into the next fact)
let t = 0, pendingCard = null;
const stamps = [];
const ts = (s) => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
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

console.log(`\nDone: ${flag('metadata') ? 'metadata' : join(build, `${episode.slug}${partial ? '-preview' : ''}.mp4`)}  (${ts(t)})`);
