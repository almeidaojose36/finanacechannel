#!/usr/bin/env python3
"""Kokoro text-to-speech with word timings (open source, Apache-2.0, runs on CPU).

    python src/tts_kokoro.py '{"text": "...", "voice": "am_michael", "speed": 1.0, "wav": "out.wav", "json": "out.json"}'

Writes a 24 kHz WAV and a JSON file {"words": [{"w", "start", "end"}]} in the same shape the ElevenLabs path uses.
Needs the `kokoro` package (Python 3.10-3.12) and espeak-ng for out-of-dictionary words.
"""
import json, sys
import numpy as np
import soundfile as sf
from kokoro import KPipeline

cfg = json.loads(sys.argv[1])
lang = cfg.get('lang', cfg['voice'][0])            # 'a' American, 'b' British (voice ids start with it)
pipe = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M')
SR = 24000

audio, words, offset = [], [], 0.0
for result in pipe(cfg['text'], voice=cfg['voice'], speed=cfg.get('speed', 1.0), split_pattern=r'\n+'):
    if result.audio is None:
        continue
    chunk = result.audio.numpy() if hasattr(result.audio, 'numpy') else np.asarray(result.audio)
    for tok in result.tokens or []:
        if tok.start_ts is None or tok.end_ts is None or not tok.text.strip():
            continue
        # punctuation tokens attach to the previous word so captions read naturally
        if words and not any(ch.isalnum() for ch in tok.text):
            words[-1]['w'] += tok.text
            continue
        words.append({'w': tok.text + ('' if tok.whitespace else ''), 'start': round(offset + tok.start_ts, 3), 'end': round(offset + tok.end_ts, 3)})
    audio.append(chunk)
    offset += len(chunk) / SR

sf.write(cfg['wav'], np.concatenate(audio), SR)
with open(cfg['json'], 'w') as f:
    json.dump({'text': cfg['text'], 'words': words}, f)
print(f'kokoro: {offset:.1f}s audio, {len(words)} words')
