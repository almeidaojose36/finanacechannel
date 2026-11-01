#!/usr/bin/env python3
"""Sound design for an episode: narration + synthesized SFX on visual cues + a generated music bed.

    python3 src/audio/mix.py build/mix.json build/mix.wav

mix.json (written by render.mjs):
  { sampleRate, leadIn, total, music: "generate" | "<path>" | null,
    segments: [{ start, duration, type, vo, cues: [{t, type}] }] }

Everything is synthesized with numpy, so there is nothing to license.
"""
import json, subprocess, sys, wave
import numpy as np

plan = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
SR = plan['sampleRate']
N = int(plan['total'] * SR) + SR
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def env_ad(n, a, d):
    """attack/decay envelope in samples-length n (a, d in seconds)."""
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))


def onepole(x, cutoff):
    """Cheap one-pole low-pass (vectorised via exponential smoothing in blocks)."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    bs = int(min(4096, max(8, 30 / -np.log(a))))  # keeps a**-k within float range
    for i in range(0, len(x), bs):  # blocks keep the python loop short
        blk = x[i:i + bs]
        # closed form of y[n] = (1-a) x[n] + a y[n-1] inside the block
        k = np.arange(len(blk))
        w = (1 - a) * a ** (-k)
        c = np.cumsum(blk * w) * a ** k
        y[i:i + bs] = c + acc * a ** (k + 1)
        acc = y[i + len(blk) - 1]
    return y


def sweep_noise(sec, f0, f1, f2=None):
    """Noise through a low-pass whose cutoff sweeps f0 -> f1 (-> f2)."""
    n = int(sec * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    segs = 24
    cuts = np.interp(np.linspace(0, 1, segs), [0, .5, 1], [f0, f1, f2 or f0])
    for s in range(segs):
        a, b = s * n // segs, (s + 1) * n // segs
        out[a:b] = onepole(x[a:b], cuts[s])
    return out / (np.abs(out).max() + 1e-9)


def movavg(x, n):
    """Centered moving average in O(N) via cumulative sums."""
    c = np.concatenate([[0.0], np.cumsum(x)])
    i = np.arange(len(x))
    lo, hi = np.clip(i - n // 2, 0, len(x)), np.clip(i + n - n // 2, 0, len(x))
    return (c[hi] - c[lo]) / np.maximum(1, hi - lo)


def stereo(m, pan=0.0):
    l, r = np.sqrt(.5 * (1 - pan)), np.sqrt(.5 * (1 + pan))
    return np.stack([m * l, m * r])


# ------------------------------------------------------------------ SFX bank
def sfx_whoosh(sec=.75, vol=.32):
    n = int(sec * SR)
    x = sweep_noise(sec, 400, 5000, 700) * np.sin(np.linspace(0, np.pi, n)) ** 2
    pan = np.linspace(-.7, .7, n)
    return np.stack([x * np.sqrt(.5 * (1 - pan)), x * np.sqrt(.5 * (1 + pan))]) * vol


def sfx_tick():
    t = t_axis(.03)
    f = 2200 + rng.uniform(-200, 300)
    return stereo(np.sin(2 * np.pi * f * t) * np.exp(-t / .006) * .09, rng.uniform(-.3, .3))


def sfx_pop():
    t = t_axis(.14)
    f = 900 * np.exp(-t / .05) + 260
    return stereo(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .04) * .22)


def sfx_hit():
    t = t_axis(.9)
    sub = np.sin(2 * np.pi * (55 + 40 * np.exp(-t / .03)) * t) * np.exp(-t / .35)
    click = sweep_noise(.9, 3000, 800) * np.exp(-t / .02)
    return stereo(sub * .55 + click * .12)


def sfx_impact():
    t = t_axis(2.4)
    sub = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / .05)) / SR) * np.exp(-t / .9)
    body = sweep_noise(2.4, 2500, 300, 120) * np.exp(-t / .5)
    return stereo(sub * .75 + body * .22)


def sfx_rumble():
    t = t_axis(1.8)
    n = len(t)
    low = onepole(rng.standard_normal(n), 90)
    low /= np.abs(low).max() + 1e-9
    e = np.minimum(1, t / .35) * np.exp(-np.maximum(0, t - .35) / .6)
    return stereo((low * .5 + np.sin(2 * np.pi * 36 * t) * .4) * e * .45)


def sfx_riser(sec=1.6):
    t = t_axis(sec)
    n = len(t)
    noise = sweep_noise(sec, 300, 3000, 9000)
    saw = 2 * ((np.cumsum(180 + 900 * (t / sec) ** 2) / SR) % 1) - 1
    saw = onepole(saw, 2500)
    e = (t / sec) ** 2.2
    return stereo((noise * .5 + saw * .3) * e * .32)


def sfx_crash():
    t = t_axis(1.6)
    glass = rng.standard_normal(len(t))
    glass = (glass - onepole(glass, 2500)) * np.exp(-t / .35)
    glass /= np.abs(glass).max() + 1e-9
    return sfx_impact()[:, :len(t)] * .8 + stereo(glass * .18)


BANK = {
    'whoosh': lambda: sfx_whoosh(), 'whoosh_soft': lambda: sfx_whoosh(.55, .16), 'tick': sfx_tick, 'pop': sfx_pop,
    'hit': sfx_hit, 'impact': sfx_impact, 'rumble': sfx_rumble, 'riser': lambda: sfx_riser(1.6),
    'riser_short': lambda: sfx_riser(.6), 'crash': sfx_crash,
}
cache = {}


def place(buf, clip, at):
    i = int(at * SR)
    if i >= buf.shape[1] or i < 0:
        return
    j = min(buf.shape[1], i + clip.shape[1])
    buf[:, i:j] += clip[:, :j - i]


# ------------------------------------------------------------------ music bed
BPM = 92
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORDS = [  # D minor: i - VI - III - VII, two bars each
    [50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 64]]
LOOP = len(CHORDS) * 2 * BAR
LN = int(round(LOOP * SR))
lt = np.arange(LN) / SR
hz = lambda m: 440 * 2 ** ((m - 69) / 12)


def chord_at(i):
    return CHORDS[min(len(CHORDS) - 1, int(i // (2 * BAR * SR)))]


def make_pad():
    out = np.zeros((2, LN))
    for ci, ch in enumerate(CHORDS):
        a, b = int(ci * 2 * BAR * SR), int((ci + 1) * 2 * BAR * SR)
        t = np.arange(b - a) / SR
        e = np.minimum(1, t / 1.2) * np.minimum(1, (len(t) / SR - t) / .8 + .15)
        for note in ch:
            for det, pan in ((-.11, -.6), (0, 0), (.13, .6)):
                f = hz(note + det)
                v = sum(np.sin(2 * np.pi * f * k * t + k) / k ** 1.6 for k in range(1, 9))
                out[:, a:b] += stereo(v * e * .05, pan)
    return out


def make_bass():
    out = np.zeros(LN)
    step = BEAT / 2
    for k in range(int(LOOP / step)):
        i = int(k * step * SR)
        root = chord_at(i)[0] - 12
        t = np.arange(int(step * SR)) / SR
        v = np.tanh(2.2 * np.sin(2 * np.pi * hz(root) * t)) * np.exp(-t / .16) * (1 if k % 2 == 0 else .7)
        out[i:i + len(t)] += v[:LN - i] * .3
    return stereo(out)


def make_arp():
    out = np.zeros(LN)
    step = BEAT / 4
    for k in range(int(LOOP / step)):
        i = int(k * step * SR)
        ch = chord_at(i)
        note = ch[[0, 1, 2, 3, 2, 1][k % 6]] + 12
        t = np.arange(int(.5 * SR)) / SR
        v = (np.sin(2 * np.pi * hz(note) * t) + .3 * np.sin(4 * np.pi * hz(note) * t)) * np.exp(-t / .12)
        j = min(LN, i + len(t))
        out[i:j] += v[:j - i] * .07
    d = int(BEAT * .75 * SR)  # dotted-eighth echo
    l = out + .35 * np.roll(out, d)
    r = out + .35 * np.roll(out, d * 2)
    return np.stack([l, r])


def make_perc():
    out = np.zeros(LN)
    for k in range(int(LOOP / BEAT)):
        i = int(k * BEAT * SR)
        t = np.arange(int(.4 * SR)) / SR
        if k % 2 == 0:  # soft pulse on 1 and 3
            v = np.sin(2 * np.pi * (48 + 50 * np.exp(-t / .02)) * t) * np.exp(-t / .18) * .35
            out[i:i + len(t)] += v[:LN - i]
        h = int((k + .5) * BEAT * SR)  # off-beat hat
        n = rng.standard_normal(int(.05 * SR))
        n = (n - onepole(n, 6000)) * np.exp(-np.arange(len(n)) / SR / .012) * .05
        j = min(LN, h + len(n))
        out[h:j] += n[:j - h]
    return stereo(out)


def reverb(x, sec=2.6, mix=.35):
    """Circular convolution with a synthetic stereo IR: the loop's tail wraps seamlessly."""
    n = int(sec * SR)
    ir = rng.standard_normal((2, n)) * np.exp(-np.arange(n) / SR / (sec / 5))
    ir[:, 0] = 0
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    out = np.empty_like(x)
    for c in range(2):
        out[c] = np.fft.irfft(np.fft.rfft(x[c]) * np.fft.rfft(ir[c], LN), LN)
    return x * (1 - mix) + out * mix * 1.6


def music_bed(total_n):
    layers = {'pad': reverb(make_pad(), 3.2, .5), 'bass': make_bass(), 'arp': reverb(make_arp(), 2.4, .4), 'perc': reverb(make_perc(), 1.2, .15)}
    # sidechain-style pump on the pad
    pump = 1 - .35 * np.exp(-((lt % BEAT) / .12))
    layers['pad'] = layers['pad'] * pump
    reps = total_n // LN + 1
    tiled = {k: np.tile(v, reps)[:, :total_n] for k, v in layers.items()}
    # arrangement: which layers play in each segment type
    mixmap = {'intro': (1, .0, .8, 0), 'chapter': (1, 0, .3, 0), 'fact': (1, 1, .9, .8), 'outro': (1, .6, .8, .3)}
    g = {k: np.zeros(total_n) for k in layers}
    for s in plan['segments']:
        a, b = int(s['start'] * SR), int((s['start'] + s['duration']) * SR)
        lv = mixmap.get(s['type'], mixmap['fact'])
        if s['type'] == 'intro':  # build: bass and beat come in after the montage
            for k, v in zip(layers, lv):
                g[k][a:b] = v
            k8 = a + int(8 * SR)
            g['bass'][k8:b] = .8
            g['perc'][k8:b] = .5
        else:
            for k, v in zip(layers, lv):
                g[k][a:b] = v
    sm = int(.8 * SR)
    out = np.zeros((2, total_n))
    for k in layers:
        gg = movavg(g[k], sm)
        out += tiled[k] * gg
    fade = np.minimum(1, np.arange(total_n) / (2 * SR)) * np.minimum(1, (total_n - np.arange(total_n)) / (4 * SR))
    return out * fade


def load_audio(path, mono=True):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return a if mono else a.reshape(-1, 2).T


# ------------------------------------------------------------------ assemble
voice = np.zeros(N)
fx = np.zeros((2, N))
for s in plan['segments']:
    if s.get('vo'):
        v = load_audio(s['vo'])
        v = v / (np.abs(v).max() + 1e-9) * .7
        i = int((s['start'] + plan['leadIn']) * SR)
        voice[i:i + len(v)] += v[:N - i]
    for c in s['cues']:
        typ = c['type']
        if typ not in BANK:
            continue
        clip = BANK[typ]() if typ in ('tick', 'whoosh') else cache.setdefault(typ, BANK[typ]())
        place(fx, clip, s['start'] + c['t'])

music = np.zeros((2, N))
if plan.get('music') == 'generate':
    music = music_bed(N) * .55
elif plan.get('music'):
    m = load_audio(plan['music'], mono=False)
    music = np.tile(m, N // m.shape[1] + 1)[:, :N] * .35

# duck music (and a little of the SFX) under the narration
hop = SR // 100
lvl = np.sqrt(movavg(voice ** 2, hop * 4))[::hop]
duck = np.zeros_like(lvl)
g = 0.0
for i, x in enumerate(lvl):
    target = min(1.0, x / .05)
    g = g + (target - g) * (.35 if target > g else .02)  # fast attack, slow release
    duck[i] = g
duck = np.interp(np.arange(N), np.arange(len(duck)) * hop, duck)
music *= 1 - .55 * duck
fx *= 1 - .25 * duck

mix = stereo(voice) * np.sqrt(2) * .95 + music + fx * .9
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'mix: {plan["total"]:.1f}s, {sum(len(s["cues"]) for s in plan["segments"])} cues -> {OUT}')
