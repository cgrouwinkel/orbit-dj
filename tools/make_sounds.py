#!/usr/bin/env python3
"""ORBIT DJ original sound library generator.

Every sound here is synthesized from scratch (oscillators, noise, filters, FM, Karplus-Strong,
formant filters). No recordings, no third-party samples, no artist material. Deterministic seeds,
so re-running produces identical files.

Output (relative to repo root):
  sounds/kits/<kit>/<NN>-<name>.wav   3 drum kits x 16 pads   (32 kHz mono 16-bit)
  sounds/inst/<inst>-<midiRoot>.wav    sampled instruments      (32 or 22.05 kHz mono 16-bit)
  sounds/fx/<name>.wav                 vinyl bed, riser, impact
Usage: python3 tools/make_sounds.py
"""
import json, os
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'sounds')
SR = 32000
RNG = np.random.default_rng(20261118)


# ---------------------------------------------------------------- building blocks
def T(dur): return np.arange(int(dur * SR)) / SR
def noise(dur, seed=None):
    r = np.random.default_rng(seed) if seed is not None else RNG
    return r.uniform(-1, 1, int(dur * SR))
def env(dur, tau, attack=0.001):
    t = T(dur); e = np.exp(-t / tau)
    a = max(1, int(attack * SR)); e[:a] *= np.linspace(0, 1, a)
    return e
def sweep_phase(dur, f0, f1, tau):
    t = T(dur); return 2 * np.pi * (f1 * t + (f0 - f1) * tau * (1 - np.exp(-t / tau)))
def sos(kind, f, order=2):
    if kind == 'bp': return butter(order, [max(20, f[0]), min(SR / 2 - 100, f[1])], 'bandpass', fs=SR, output='sos')
    return butter(order, min(f, SR / 2 - 100), kind, fs=SR, output='sos')
def lp(x, f, o=2): return sosfilt(sos('low', f, o), x)
def hp(x, f, o=2): return sosfilt(sos('high', f, o), x)
def bp(x, lo, hi, o=2): return sosfilt(sos('bp', (lo, hi), o), x)
def sat(x, drive): return np.tanh(drive * x) / np.tanh(drive)
def crush(x, bits): q = 2 ** (bits - 1); return np.round(x * q) / q
def fit(x, n):
    return x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))
def mix(*parts):
    n = max(len(p) for p in parts); return sum(fit(p, n) for p in parts)
def fade(x, ms=8):
    n = min(len(x), int(ms / 1000 * SR)); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def trim(x, floor_db=-60):
    a = np.abs(x); thr = a.max() * 10 ** (floor_db / 20)
    idx = np.nonzero(a > thr)[0]; end = idx[-1] + int(0.01 * SR) if len(idx) else len(x)
    return fade(x[:min(len(x), end)], 6)
def svf_lowpass(x, cutoff, res=0.2):
    """Time-varying state-variable low-pass. cutoff: array (Hz) same length as x."""
    y = np.zeros_like(x); low = band = 0.0; q = 1 - res
    f = 2 * np.sin(np.pi * np.clip(cutoff, 20, SR / 6) / SR)
    for i in range(len(x)):
        low += f[i] * band; high = x[i] - low - q * band; band += f[i] * high; y[i] = low
    return y
def saw(f, dur, detune_cents=0.0, phase=0.0):
    """Band-limited saw by additive synthesis (no aliasing)."""
    t = T(dur); f = f * 2 ** (detune_cents / 1200); y = np.zeros_like(t)
    for k in range(1, int((SR / 2 - 200) // f) + 1):
        y += ((-1) ** (k + 1)) * np.sin(2 * np.pi * k * f * t + k * phase) / k
    return y * (2 / np.pi)
def square(f, dur):
    t = T(dur); y = np.zeros_like(t)
    for k in range(1, int((SR / 2 - 200) // f) + 1, 2): y += np.sin(2 * np.pi * k * f * t) / k
    return y * (4 / np.pi)
def metal(dur, freqs=(205.3, 304.4, 369.6, 522.7, 540.0, 800.0), mult=1.0):
    t = T(dur); return sum(np.sign(np.sin(2 * np.pi * f * mult * t + i)) for i, f in enumerate(freqs)) / len(freqs)
def resonator(x, f, q):
    from scipy.signal import iirpeak, lfilter
    b, a = iirpeak(f, q, fs=SR); return lfilter(b, a, x)
def norm(x, peak_db=-1.0, rms_db=None, rms_win=0.1):
    x = x - np.mean(x[: int(0.002 * SR)]) * 0
    if rms_db is not None:
        w = x[: max(1, int(rms_win * SR))]; r = np.sqrt(np.mean(w ** 2)) + 1e-12
        x = x * (10 ** (rms_db / 20) / r)
    p = np.abs(x).max() + 1e-12; lim = 10 ** (peak_db / 20)
    if p > lim: x = x * (lim / p)
    return x

def taper(x, start=0.55):
    """Smoothly fade the last part of a one-shot to silence so no tail ends abruptly."""
    n = len(x); i = int(n * start); w = np.ones(n)
    w[i:] = np.cos(np.linspace(0, np.pi / 2, n - i)) ** 2
    return x * w

def save(path, x, rate=SR):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if rate != SR:
        from math import gcd
        g = gcd(rate, SR); x = resample_poly(x, rate // g, SR // g)
    x = np.clip(x, -1, 1); wavfile.write(path, rate, (x * 32767).astype(np.int16))
    return path

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- drums
def kick(f0=150, f1=50, tau=0.04, decay=0.38, click=0.25, drive=1.6, dur=0.8, sub=0.0, sub_decay=0.6):
    body = np.sin(sweep_phase(dur, f0, f1, tau)) * env(dur, decay, 0.0015)
    if sub: body += sub * np.sin(2 * np.pi * f1 * T(dur)) * env(dur, sub_decay, 0.01)
    c = hp(noise(0.02, 1), 1800) * env(0.02, 0.004) * click
    return trim(sat(mix(body, c), drive))
def snare(body_f=(185, 330), tone=0.5, noise_amt=1.0, n_lo=1500, n_hi=8000, decay=0.17, tone_decay=0.07, dur=0.6, drive=1.5, seed=2):
    t = T(dur)
    b = sum(np.sin(2 * np.pi * f * t) for f in body_f) / len(body_f) * env(dur, tone_decay) * tone
    n = bp(noise(dur, seed), n_lo, n_hi) * env(dur, decay, 0.001) * noise_amt
    crack = hp(noise(0.012, seed + 7), 3000) * env(0.012, 0.003) * 0.6
    return trim(sat(mix(b, n * 1.1, crack), drive))
def clap(dur=0.5, lo=900, hi=2600, tail=0.13, seed=3, bursts=(0, 0.011, 0.023)):
    n = bp(noise(dur, seed), lo, hi, 2); e = np.zeros(int(dur * SR))
    for k, b in enumerate(bursts):
        i = int(b * SR); seg = env(dur - b, 0.006 if k < len(bursts) - 1 else tail, 0.0005); e[i:] += seg[: len(e) - i]
    return trim(sat(n * e * 2.5, 1.3))
def hat(decay=0.05, dur=0.5, lo=7000, bright=1.0, seed=4, metallic=0.7):
    m = metal(dur) * metallic + noise(dur, seed) * (1 - metallic)
    x = hp(bp(m, lo, 15000, 2), lo, 2) * env(dur, decay, 0.0005)
    if bright < 1: x = lp(x, 9000 * bright + 3000)
    return trim(x)
def tom(f0, f1, decay=0.3, dur=0.7, seed=5, noise_amt=0.15):
    b = np.sin(sweep_phase(dur, f0, f1, 0.06)) * env(dur, decay, 0.001)
    n = lp(noise(0.05, seed), 4000) * env(0.05, 0.01) * noise_amt
    return trim(sat(mix(b, n), 1.3))
def rim(dur=0.12):
    t = T(dur); x = (np.sin(2 * np.pi * 455 * t) * 0.6 + np.sin(2 * np.pi * 1667 * t)) * env(dur, 0.018, 0.0003)
    x += hp(noise(dur, 6), 2000) * env(dur, 0.004) * 0.6
    return trim(hp(sat(x, 2.0), 300))
def shaker(dur=0.18, seed=7):
    x = bp(noise(dur, seed), 4500, 11000, 2) * env(dur, 0.045, 0.012)
    return trim(x)
def conga(f, decay=0.18, dur=0.4):
    t = T(dur); x = (np.sin(2 * np.pi * f * t * (1 + 0.08 * np.exp(-t / 0.01))) + 0.3 * np.sin(2 * np.pi * f * 2.03 * t) * env(dur, decay * 0.4)) * env(dur, decay, 0.001)
    x = mix(x, bp(noise(0.02, 8), 1000, 5000) * env(0.02, 0.003) * 0.3)
    return trim(sat(x, 1.4))
def cowbell(dur=0.45):
    x = (square(540, dur) + square(800, dur)) * 0.5
    x = bp(x, 600, 3000, 2) * (env(dur, 0.06) * 0.7 + env(dur, 0.25) * 0.3)
    return trim(sat(x * 2, 1.5))
def cymbal(dur=1.6, decay=0.9, lo=4500, seed=9, dark=False, bell=0.0):
    r = np.random.default_rng(seed); t = T(dur)
    parts = sum(np.sin(2 * np.pi * r.uniform(2800, 11000) * t + r.uniform(0, 6)) for _ in range(46)) / 12
    x = hp(parts * 0.6 + noise(dur, seed) * 0.5, lo, 2) * env(dur, decay, 0.001)
    if bell: x += sum(np.sin(2 * np.pi * f * t) for f in (620, 1490, 2410)) / 3 * env(dur, decay * 0.6) * bell
    if dark: x = lp(x, 7000)
    return trim(x)
def impact(dur=1.4):
    t = T(dur); x = np.sin(sweep_phase(dur, 90, 38, 0.2)) * env(dur, 0.55, 0.002)
    x += lp(noise(dur, 10), 1800) * env(dur, 0.25, 0.002) * 0.7
    return trim(sat(x, 1.8))
def riser(dur=1.8):
    t = T(dur); n = noise(dur, 11)
    cut = 300 * (40 ** (t / dur))
    x = svf_lowpass(n, cut, 0.6) * (t / dur) ** 1.6
    return fade(x, 30)
def zap(dur=0.4):
    t = T(dur); x = np.sin(sweep_phase(dur, 2400, 120, 0.06)) * env(dur, 0.12, 0.001)
    return trim(sat(x, 2.0))


# ---------------------------------------------------------------- pitched voices (shared by kits and instruments)
def fm_ep(f, dur=2.6, vel=1.0):
    t = T(dur)
    idx1 = 1.6 * vel * np.exp(-t / 0.5) + 0.25
    tine = 0.35 * vel * np.sin(2 * np.pi * f * t + 1.8 * np.exp(-t / 0.05) * np.sin(2 * np.pi * 14 * f * t)) * np.exp(-t / 0.18)
    body = np.sin(2 * np.pi * f * t + idx1 * np.sin(2 * np.pi * f * t))
    amp = env(dur, 1.0 + 110 / f, 0.002)
    x = (body + tine + 0.12 * np.sin(4 * np.pi * f * t)) * amp
    return fade(lp(sat(x * 0.8, 1.4), 7000), 40)
def sub_bass(f, dur=1.6):
    t = T(dur); x = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    x *= env(dur, 1.4, 0.004)
    return fade(sat(x, 1.6), 30)
def bass_808(f, dur=1.8):
    ph = sweep_phase(dur, f * 2.2, f, 0.03); x = np.sin(ph) * env(dur, 0.9, 0.002)
    return fade(sat(x * 1.2, 2.2), 40)
def upright(f, dur=1.8, seed=12):
    n = int(SR / f); buf = lp(np.random.default_rng(seed).uniform(-1, 1, n), 1200, 1)
    out = np.zeros(int(dur * SR)); d = 0.996
    for i in range(len(out)):
        j = i % n; v = buf[j]; buf[j] = d * 0.5 * (v + buf[(j + 1) % n]); out[i] = v
    out = lp(out, 1600) + resonator(out, 110, 3) * 0.6
    return fade(sat(out * 1.6, 1.3) * env(dur, 0.9, 0.003), 30)
def saw_bass(f, dur=1.4, cut0=1800, cut1=260, tau=0.14, res=0.55):
    x = saw(f, dur) * 0.7 + np.sin(2 * np.pi * f * 0.5 * T(dur)) * 0.5
    c = cut1 + (cut0 - cut1) * np.exp(-T(dur) / tau)
    return fade(sat(svf_lowpass(x, c, res) * env(dur, 1.2, 0.003) * 1.6, 1.4), 30)
def pluck(f, dur=1.2, cut0=6000, cut1=700, tau=0.11):
    x = (saw(f, dur, -5) + saw(f, dur, 0, 1.0) + saw(f, dur, 5, 2.0)) / 3
    c = cut1 + (cut0 - cut1) * np.exp(-T(dur) / tau)
    return fade(svf_lowpass(x, c, 0.35) * env(dur, 0.45, 0.002), 30)
def organ(f, dur=1.4):
    t = T(dur); draw = {0.5: 0.5, 1: 1.0, 2: 0.8, 3: 0.55, 4: 0.45, 6: 0.25, 8: 0.2}
    x = sum(a * np.sin(2 * np.pi * f * h * t) for h, a in draw.items() if f * h < SR / 2 - 200)
    x += (0.5 * np.sin(2 * np.pi * f * 3 * t)) * np.exp(-t / 0.12)  # percussion
    x *= 1 + 0.06 * np.sin(2 * np.pi * 6.2 * t)  # leslie-ish
    a = env(dur, 6.0, 0.004)
    return fade(sat(x * a * 0.35, 1.5), 40)
def pad(f, dur=3.6):
    voices = [saw(f, dur, c, ph) for c, ph in ((-14, 0), (-6, 1.3), (0, 2.1), (7, 0.7), (15, 2.9))]
    x = sum(voices) / len(voices) + 0.4 * np.sin(2 * np.pi * f * 0.5 * T(dur))
    t = T(dur); a = np.minimum(1, t / 0.35) * np.exp(-np.maximum(0, t - 0.4) / 4.0)
    return fade(lp(x, 2600, 2) * a, 120)
def bell(f, dur=2.4):
    t = T(dur); i = 2.6 * np.exp(-t / 0.4) + 0.3
    x = np.sin(2 * np.pi * f * t + i * np.sin(2 * np.pi * f * 3.5 * t)) * env(dur, 1.2, 0.001)
    x += 0.3 * np.sin(2 * np.pi * f * 2 * t + 0.8 * np.sin(2 * np.pi * f * 1.4 * t)) * env(dur, 0.5, 0.001)
    return fade(x * 0.7, 40)
def flute(f, dur=1.8, seed=13):
    t = T(dur); vib = 1 + 0.009 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.18) / 0.3, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    x = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = bp(noise(dur, seed), f * 1.5, min(f * 4, 12000)) * 0.12
    a = np.minimum(1, t / 0.05) * np.exp(-t / 2.5)
    return fade((x + breath) * a, 50)
def vox(f, dur=1.4, vowel='a', seed=14):
    formants = {'a': ((730, 80, 1.0), (1090, 90, 0.5), (2440, 120, 0.25)), 'o': ((450, 70, 1.0), (800, 80, 0.45), (2830, 120, 0.12)),
                'u': ((325, 60, 1.0), (700, 70, 0.3), (2530, 120, 0.08)), 'e': ((530, 70, 1.0), (1840, 100, 0.45), (2480, 120, 0.25))}[vowel]
    t = T(dur); vib = 1 + 0.012 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.12) / 0.3, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    src = sum(((-1) ** (k + 1)) * np.sin(k * ph) / k for k in range(1, int(9000 // f)))
    src += noise(dur, seed) * 0.02
    y = sum(g * resonator(src, F, F / bw) for F, bw, g in formants)
    a = np.minimum(1, t / 0.04) * env(dur, 1.6, 0.001)
    return fade(sat(y * a * 2.0, 1.2), 50)
def piano(f, dur=2.6):
    """Additive piano: stretched partials, two detuned strings, faster decay up the series, soft hammer thump."""
    t = T(dur); x = np.zeros_like(t); B = 0.00035; base = 2.6 * (220.0 / f) ** 0.4
    for k in range(1, 40):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 9500: break
        amp = (0.35 + 0.65 * abs(np.sin(np.pi * k / 8.3))) / k ** 1.15
        tau = base / (1 + 0.32 * (k - 1))
        e = 0.7 * np.exp(-t / (tau * 0.28)) + 0.3 * np.exp(-t / (tau * 1.6))
        for det, ph in ((-0.0006, 0.0), (0.0007, 1.7)):
            x += 0.5 * amp * np.sin(2 * np.pi * fk * (1 + det) * t + ph * k) * e
    thump = lp(noise(dur, 31), 900) * np.exp(-t / 0.012) * 0.5
    a = np.minimum(1, t / 0.0025)
    return fade(sat((x + thump) * a * 0.9, 1.15), 40)
def guitar(f, dur=1.9, seed=21):
    """Plucked nylon-string guitar (Karplus-Strong) with pick-position comb and a little body resonance."""
    n = max(2, int(round(SR / f))); buf = lp(np.random.default_rng(seed).uniform(-1, 1, n), 3200, 1)
    buf = buf - 0.55 * np.roll(buf, max(1, n // 5))
    out = np.zeros(int(dur * SR)); d = 0.9982
    for i in range(len(out)):
        j = i % n; v = buf[j]; buf[j] = d * (0.52 * v + 0.48 * buf[(j + 1) % n]); out[i] = v
    out = out + 0.22 * resonator(out, 105, 3) + 0.18 * resonator(out, 215, 4)
    return fade(lp(out, 5200) * np.minimum(1, T(dur) / 0.002), 40)
def strings(f, dur=3.4, seed=22):
    """String ensemble: detuned saws with independent vibrato, bowed-string formants, slow attack."""
    r = np.random.default_rng(seed); t = T(dur); x = np.zeros_like(t)
    for i, c in enumerate((-17, -9, -3, 2, 8, 15)):
        vib = 1 + 0.0035 * np.sin(2 * np.pi * (4.6 + 0.35 * i) * t + r.uniform(0, 6)) * np.clip((t - 0.15) / 0.4, 0, 1)
        ph = 2 * np.pi * f * 2 ** (c / 1200) * np.cumsum(vib) / SR + r.uniform(0, 6)
        x += sum(((-1) ** (k + 1)) * np.sin(k * ph) / k for k in range(1, int(min(40, 7000 // f)) + 1))
    x = lp(x / 6, 4200, 2) + 0.35 * resonator(x / 6, 1100, 3) + 0.2 * resonator(x / 6, 2900, 4)
    a = np.minimum(1, t / 0.16) * np.minimum(1, (dur - t) / 0.5)
    return fade(hp(x, 140) * a, 60)
def lead(f, dur=1.6):
    """Bright unison lead: seven detuned saws, filter envelope, late vibrato."""
    t = T(dur); vib = 1 + 0.006 * np.sin(2 * np.pi * 5.4 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    x = np.zeros_like(t)
    for i, c in enumerate((-22, -13, -6, 0, 6, 13, 22)):
        ph = 2 * np.pi * f * 2 ** (c / 1200) * np.cumsum(vib) / SR + i * 0.9
        x += sum(((-1) ** (k + 1)) * np.sin(k * ph) / k for k in range(1, int(min(48, 9000 // f)) + 1))
    x = x / 7 + 0.1 * np.sin(np.pi * f * t)
    cut = 1400 + 5200 * np.exp(-t / 0.35)
    return fade(svf_lowpass(x, cut, 0.3) * env(dur, 1.3, 0.004), 40)
def scratch_src(dur=1.1):
    """Sustained synthetic 'aah' used as the jog-wheel scratch sample (original; not from any record)."""
    t = T(dur); f = 196 * (1 + 0.05 * np.sin(2 * np.pi * 1.1 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    src = sum(((-1) ** (k + 1)) * np.sin(k * ph) / k for k in range(1, 40)) + noise(dur, 33) * 0.05
    y = resonator(src, 760, 9) + 0.55 * resonator(src, 1150, 11) + 0.3 * resonator(src, 2500, 18) + noise(dur, 34) * 0.01
    return fade(sat(y * 2.0, 1.4) * np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.05), 20)
def stab_chord(fn, root, semis, dur=1.0):
    return sum(fn(mtof(root + s), dur) for s in semis) / len(semis)
def scratch(dur=0.55):
    src = vox(mtof(57), 1.0, 'a'); t = T(dur)
    pos = 0.18 + 0.12 * np.sin(2 * np.pi * 3.4 * t) * np.exp(-t / 0.6)  # back-and-forth record motion
    idx = np.clip((pos * SR).astype(int), 0, len(src) - 1)
    x = src[idx] * np.abs(np.cos(2 * np.pi * 3.4 * t)) ** 0.5
    return trim(hp(x, 250))


# ---------------------------------------------------------------- kits (pad 1 = bottom-left, MPC style)
KITS = {
  'dusty': [  # boom bap / lo-fi: warm, crunchy, 12-bit
    ('kick', lambda: crush(lp(kick(140, 50, 0.035, 0.22, 0.3, 1.5), 7000), 12), -10),
    ('snare', lambda: crush(lp(snare((190, 320), 0.7, 1.0, 1400, 7000, 0.1, 0.06, 0.6, 1.3), 9000), 12), -11),
    ('hat', lambda: crush(hat(0.045, bright=0.6), 12), -18),
    ('open hat', lambda: crush(hat(0.32, 0.8, bright=0.6), 12), -19),
    ('kick 2', lambda: crush(lp(kick(110, 46, 0.05, 0.45, 0.15, 1.6), 5000), 12), -11),
    ('rim', lambda: crush(rim(), 12), -14),
    ('snap', lambda: crush(clap(0.3, 1500, 3500, 0.06, 15, (0, 0.006)), 12), -14),
    ('shaker', lambda: shaker(), -21),
    ('low tom', lambda: tom(150, 95, 0.3), -12),
    ('high tom', lambda: tom(220, 150, 0.25), -12),
    ('conga', lambda: conga(330), -13),
    ('ride', lambda: lp(cymbal(1.4, 0.8, 4000, 16, False, 0.35), 9000), -20),
    ('sub', lambda: sub_bass(mtof(33), 1.3), -9),
    ('keys', lambda: stab_chord(fm_ep, 57, (0, 3, 7, 10, 14), 1.6), -12),
    ('vox ah', lambda: vox(mtof(57), 1.0, 'a'), -12),
    ('scratch', lambda: scratch(), -12),
  ],
  'club': [  # house / garage: punchy, bright
    ('kick', lambda: kick(230, 50, 0.022, 0.3, 0.35, 1.6), -9),
    ('clap', lambda: clap(), -12),
    ('hat', lambda: hat(0.035, lo=8000, metallic=0.5, seed=17), -18),
    ('open hat', lambda: hat(0.28, 0.7, 7500, metallic=0.55, seed=18), -18),
    ('kick 2', lambda: kick(180, 44, 0.03, 0.4, 0.2, 1.4, 0.9, 0.4, 0.5), -10),
    ('snare', lambda: snare((220, 340), 0.45, 1.0, 1800, 9000, 0.12, 0.05, seed=19), -12),
    ('rim', lambda: rim(), -15),
    ('shaker', lambda: shaker(seed=20), -21),
    ('conga lo', lambda: conga(220, 0.2), -13),
    ('conga hi', lambda: conga(330, 0.15), -13),
    ('cowbell', lambda: cowbell(), -17),
    ('ride', lambda: cymbal(1.5, 0.9, 5000, 21, False, 0.4), -20),
    ('bass', lambda: saw_bass(mtof(36), 0.9), -10),
    ('organ', lambda: stab_chord(organ, 60, (0, 3, 7, 10), 0.9), -12),
    ('vox oh', lambda: vox(mtof(60), 1.0, 'o'), -12),
    ('riser', lambda: riser(), -16),
  ],
  'midnight': [  # 808 / dark bass music
    ('808 kick', lambda: kick(120, 45, 0.04, 0.6, 0.2, 1.8, 1.4, 0.0), -9),
    ('snare', lambda: snare((200, 400), 0.4, 1.0, 2000, 10000, 0.13, 0.05, drive=1.8, seed=22), -11),
    ('hat', lambda: hat(0.03, lo=8500, seed=23), -18),
    ('open hat', lambda: hat(0.24, 0.6, 8000, seed=24), -18),
    ('punch kick', lambda: kick(260, 55, 0.018, 0.22, 0.4, 2.4), -9),
    ('clap', lambda: clap(0.6, 1000, 3000, 0.18, 25, (0, 0.009, 0.02, 0.032)), -12),
    ('snap', lambda: clap(0.3, 1800, 4500, 0.05, 26, (0, 0.005)), -15),
    ('perc', lambda: trim(bp(metal(0.2, mult=2.3), 2000, 9000) * env(0.2, 0.03)), -17),
    ('808 tom', lambda: tom(130, 80, 0.45, 0.9, 27, 0.05), -11),
    ('808 tom hi', lambda: tom(200, 125, 0.35, 0.8, 28, 0.05), -11),
    ('impact', lambda: impact(), -11),
    ('crash', lambda: cymbal(1.8, 1.1, 4000, 29, True), -18),
    ('808 bass', lambda: bass_808(mtof(28), 1.6), -9),
    ('dark stab', lambda: stab_chord(lambda f, d: saw_bass(f, d, 2400, 600, 0.2, 0.3), 52, (0, 3, 7, 10), 0.9), -12),
    ('vox oo', lambda: vox(mtof(52), 1.2, 'u'), -12),
    ('zap', lambda: zap(), -14),
  ],
}

# Instruments used by the backing tracks: (builder, list of MIDI roots, output rate, peak dB)
INSTRUMENTS = {
  'ep':     (lambda m: fm_ep(mtof(m)), (45, 57, 69), 22050),
  'sub':    (lambda m: sub_bass(mtof(m)), (33, 45), 22050),
  'b808':   (lambda m: bass_808(mtof(m)), (28, 40), 22050),
  'upright':(lambda m: upright(mtof(m)), (33, 45), 22050),
  'sawbass':(lambda m: saw_bass(mtof(m)), (33, 45), 22050),
  'pluck':  (lambda m: pluck(mtof(m), 1.0), (57, 69, 81), 24000),
  'organ':  (lambda m: organ(mtof(m), 1.2), (57, 69), 24000),
  'pad':    (lambda m: pad(mtof(m), 3.0), (45, 57, 69), 22050),
  'bell':   (lambda m: bell(mtof(m), 1.8), (69, 81), 24000),
  'flute':  (lambda m: flute(mtof(m), 1.5), (69, 81), 24000),
  'vox':    (lambda m: vox(mtof(m), 1.2, 'a'), (57, 69), 24000),
  'piano':  (lambda m: piano(mtof(m), 2.4), (48, 60, 72), 22050),
  'guitar': (lambda m: guitar(mtof(m), 1.8), (52, 64), 22050),
  'strings':(lambda m: strings(mtof(m), 3.4), (69, 76, 83), 22050),
  'lead':   (lambda m: lead(mtof(m), 1.5), (69, 81), 24000),
}


def miss_scratch(dur=0.22):
    """Short record-scratch 'wrong note' sound."""
    t = T(dur); f = 520 * np.exp(-t / 0.05) + 140 + 90 * np.sin(2 * np.pi * 14 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = sum(((-1) ** (k + 1)) * np.sin(k * ph) / k for k in range(1, 18)) * 0.5
    x = bp(x + noise(dur, 40) * 0.4, 700, 4200) * env(dur, 0.07, 0.003)
    return fade(sat(x * 2.2, 1.6), 15)

def crowd(dur=2.8):
    """Original synthesized crowd cheer: formant-filtered noise 'voices' plus scattered claps."""
    r = np.random.default_rng(41); t = T(dur); x = np.zeros_like(t)
    for v in range(14):
        f1, f2 = r.uniform(400, 850), r.uniform(1000, 2200)
        src = noise(dur, 100 + v)
        voice = resonator(src, f1, 6) + 0.6 * resonator(src, f2, 8)
        swell = np.clip(np.sin(np.pi * np.clip((t - r.uniform(0, 0.3)) / r.uniform(1.6, 2.6), 0, 1)), 0, 1) ** 1.5
        x += voice * swell * r.uniform(0.5, 1.0)
    for _ in range(int(dur * 22)):
        i = r.integers(0, len(t) - 400); c = bp(r.uniform(-1, 1, 400), 900, 3200) * np.exp(-np.arange(400) / 45)
        x[i:i + 400] += c * r.uniform(0.6, 1.4) * 3
    x *= np.minimum(1, t / 0.15) * np.minimum(1, (dur - t) / 0.9)
    return fade(hp(x, 180), 60)

def vinyl(dur=4.0):
    r = np.random.default_rng(30); x = lp(noise(dur, 31), 3200) * 0.012
    for _ in range(int(dur * 9)):
        i = r.integers(0, len(x) - 200); amp = r.uniform(0.05, 0.45) * (1 if r.random() < 0.85 else 2.2)
        click = hp(r.uniform(-1, 1, 60), 1500) * np.exp(-np.arange(60) / 8) * amp
        x[i:i + 60] += click
    x += np.sin(2 * np.pi * 0.55 * T(dur)) * 0.004 * lp(noise(dur, 32), 60)
    return x


def main():
    manifest = {'kits': {}, 'inst': {}, 'fx': []}
    for kit, pads in KITS.items():
        names = []
        for i, (name, fn, rms_db) in enumerate(pads):
            x = norm(taper(fn()), -1.0, rms_db)
            fname = f'{i + 1:02d}-{name.replace(" ", "-")}.wav'
            save(os.path.join(OUT, 'kits', kit, fname), x)
            names.append({'name': name.upper(), 'file': fname})
        manifest['kits'][kit] = names
    for inst, (fn, roots, rate) in INSTRUMENTS.items():
        for m in roots:
            x = norm(taper(fn(m), 0.7), -3.0)
            save(os.path.join(OUT, 'inst', f'{inst}-{m}.wav'), x, rate)
        manifest['inst'][inst] = list(roots)
    for name, x, rate in (('vinyl', vinyl(), 22050), ('riser', norm(riser(), -3), 32000), ('impact', norm(taper(impact(), 0.6), -2), 32000),
                          ('miss', norm(miss_scratch(), -4), 24000), ('crowd', norm(crowd(), -4), 22050), ('scratch', norm(scratch_src(), -3), 24000)):
        save(os.path.join(OUT, 'fx', name + '.wav'), x, rate); manifest['fx'].append(name)
    # v1 melodic chop banks stay available as beat-pad kits (same files, same pattern bank names)
    v1_names = ['ROOT', 'MINOR', 'FIFTH', 'SEVENTH', 'OCTAVE', 'STAB', 'RESPONSE', 'BELL', 'CHOP A', 'CHOP B', 'CHOP C', 'CHOP D', 'LOW', 'MID', 'HIGH', 'FX']
    js = {'kits': {k: [{'name': d['name'], 'path': f'sounds/kits/{k}/{d["file"]}'} for d in v] for k, v in manifest['kits'].items()},
          'inst': manifest['inst'], 'fx': {n: f'sounds/fx/{n}.wav' for n in manifest['fx']}}
    for bank in ('soul', 'garage', 'dark'):
        js['kits'][bank] = [{'name': v1_names[i], 'path': f'samples/{bank}-{i + 1:02d}.wav'} for i in range(16)]
    with open(os.path.join(ROOT, 'js', 'sounds-manifest.js'), 'w') as f:
        f.write('/* Generated by tools/make_sounds.py. Do not edit by hand. */\nwindow.ORBIT_SOUNDS = ' + json.dumps(js) + ';\n')
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    total = sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(OUT) for f in fs)
    print(f'wrote {sum(len(v) for v in manifest["kits"].values())} kit sounds, {sum(len(v) for v in manifest["inst"].values())} instrument samples, {len(manifest["fx"])} fx; {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
