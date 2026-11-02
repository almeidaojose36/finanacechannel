// ElevenLabs text-to-speech with word timings, cached on disk by content hash.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API = 'https://api.elevenlabs.io/v1';

export async function synthesize(text, voice, cacheDir, opts = {}) {
  mkdirSync(cacheDir, { recursive: true });
  if (voice.engine === 'kokoro') return synthesizeKokoro(text, voice, cacheDir);
  const { previousText, nextText } = opts;
  const key = createHash('sha1')
    .update(JSON.stringify([voice.voiceId, voice.modelId, voice.settings, text]))
    .digest('hex')
    .slice(0, 16);
  const mp3 = join(cacheDir, `${key}.mp3`);
  const meta = join(cacheDir, `${key}.json`);
  if (existsSync(mp3) && existsSync(meta)) {
    return { mp3, words: JSON.parse(readFileSync(meta, 'utf8')).words, cached: true };
  }

  const headers = { 'Content-Type': 'application/json' };
  // The cloud proxy injects credentials; locally, set ELEVENLABS_API_KEY.
  if (process.env.ELEVENLABS_API_KEY) headers['xi-api-key'] = process.env.ELEVENLABS_API_KEY;

  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(`${API}/text-to-speech/${voice.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        model_id: voice.modelId,
        voice_settings: voice.settings,
        previous_text: previousText || undefined,
        next_text: nextText || undefined,
      }),
    });
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

  const data = await res.json();
  writeFileSync(mp3, Buffer.from(data.audio_base64, 'base64'));
  const words = toWords(data.alignment);
  writeFileSync(meta, JSON.stringify({ text, words }));
  return { mp3, words, cached: false };
}

// Collapse character-level alignment into words with start/end seconds.
function toWords({ characters, character_start_times_seconds: s, character_end_times_seconds: e }) {
  const words = [];
  let cur = null;
  characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
    } else if (!cur) {
      cur = { w: ch, start: s[i], end: e[i] };
    } else {
      cur.w += ch;
      cur.end = e[i];
    }
  });
  if (cur) words.push(cur);
  return words;
}

// Kokoro (open source, runs locally on CPU). channel.json voice: { "engine": "kokoro", "voiceId": "am_michael", "speed": 1.0 }
// The Python environment is taken from KOKORO_PYTHON (default /opt/kokoro-venv/bin/python).
function synthesizeKokoro(text, voice, cacheDir) {
  const key = createHash('sha1').update(JSON.stringify(['kokoro', voice.voiceId, voice.speed ?? 1, text])).digest('hex').slice(0, 16);
  const wav = join(cacheDir, `${key}.wav`), meta = join(cacheDir, `${key}.json`);
  if (existsSync(wav) && existsSync(meta)) return { mp3: wav, words: JSON.parse(readFileSync(meta, 'utf8')).words, cached: true };
  const py = process.env.KOKORO_PYTHON || '/opt/kokoro-venv/bin/python';
  const script = join(dirname(fileURLToPath(import.meta.url)), 'tts_kokoro.py');
  const r = spawnSync(py, [script, JSON.stringify({ text, voice: voice.voiceId, speed: voice.speed ?? 1, wav, json: meta })], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Kokoro failed: ${(r.stderr || '').slice(-1500)}`);
  return { mp3: wav, words: JSON.parse(readFileSync(meta, 'utf8')).words, cached: false };
}
