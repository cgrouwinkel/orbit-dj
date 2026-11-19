#!/usr/bin/env python3
"""ORBIT DJ original sound library generator.

Every sound here is synthesized from scratch (oscillators, noise, filters, FM, Karplus-Strong,
formant filters). No recordings, no third-party samples, no artist material. Deterministic seeds,
so re-running produces identical files.

Output (relative to repo root):
  sounds/kits/<kit>/<NN>-<name>.wav   3 drum kits x 16 pads   (44.1 kHz mono 16-bit)
  sounds/inst/<inst>-<midiRoot>.wav    sampled instruments      (44.1 kHz for bright sounds, 32 or 22.05 kHz for basses and pads)
  sounds/fx/<name>.wav                 vinyl bed, riser, impact, crowd, miss, scratch

v3.1: everything is generated at 44.1 kHz with full-range highs (the v2 library was generated at 32 kHz
and most instruments were stored at 22 kHz behind low-pass filters, which made every mix sound dull).
Usage: python3 tools/make_sounds.py
"""
import json, os
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'sounds')
SR = 44100
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


# ---------------------------------------------------------------- more building blocks (v3.1)
def rng(seed): return np.random.default_rng(seed)
def svf(x, cutoff, res=0.2, mode='low'):
    """Zero-delay state-variable filter, stable up to Nyquist. cutoff: Hz, scalar or array. res 0..0.97."""
    n = len(x); g = np.tan(np.pi * np.clip(np.broadcast_to(np.asarray(cutoff, float), (n,)), 20, SR * 0.45) / SR)
    k = 2 * (1 - res); a = (1 / (1 + g * (g + k))).tolist(); g = g.tolist(); xl = np.asarray(x, float).tolist()
    y = [0.0] * n; ic1 = ic2 = 0.0; low = mode == 'low'; band = mode == 'band'
    for i in range(n):
        gi = g[i]; v1 = a[i] * (ic1 + gi * (xl[i] - ic2)); v2 = ic2 + gi * v1
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        y[i] = v2 if low else v1 if band else xl[i] - k * v1 - v2
    return np.array(y)
def svf_lowpass(x, cutoff, res=0.2): return svf(x, cutoff, res, 'low')
def saw_ph(ph, fmax, tilt=1.0, kmax=None):
    """Band-limited saw from a phase array (additive). tilt > 1 darkens it."""
    K = max(1, int((SR / 2 - 600) // fmax)); K = min(K, kmax) if kmax else K
    y = np.zeros_like(ph)
    for k in range(1, K + 1): y += ((-1) ** (k + 1)) * np.sin(k * ph) / k ** tilt
    return y * (2 / np.pi)
def room(x, ms=70, level=0.2, seed=90, lo=500):
    """Short synthetic room: convolve with a burst of decaying noise."""
    from scipy.signal import fftconvolve
    n = int(ms / 1000 * SR * 4); ir = rng(seed).uniform(-1, 1, n) * np.exp(-np.arange(n) / (ms / 1000 * SR)); ir = hp(ir, lo)
    w = fftconvolve(x, ir)[: len(x) + n]; w *= np.abs(x).max() / (np.abs(w).max() + 1e-9)
    return mix(x, w * level)
def sp(x, rate=26040, bits=12):
    """Early-sampler character: sample-and-hold at 26 kHz without filtering (adds gritty top end), 12-bit."""
    n = len(x); idx = (np.floor(np.arange(n) * rate / SR) * SR / rate).astype(int)
    return crush(x[np.clip(idx, 0, n - 1)], bits)
def ott(x, amount=0.7):
    """Three-band upward compression: brings every band forward (the 'in your face' bass-music sound)."""
    out = 0
    for lo, hi, g in ((0, 220, 1.0), (220, 2500, 1.0), (2500, None, 0.8)):
        b = lp(x, hi, 4) if lo == 0 else hp(x, lo, 4) if hi is None else bp(x, lo, hi, 2)
        e = lp(np.abs(b), 25, 1) + 2e-3
        out = out + g * b / e ** amount * np.mean(e) ** amount
    return out


# ---------------------------------------------------------------- drums
def kick(f_end=50, f_start=250, t_pitch=0.03, hold=0.03, tau=0.15, click=0.5, knock=0.25, drive=2.0, dur=0.6):
    """Sine with a fast pitch drop, a held then decaying body, a beater knock and a top click, saturated for punch."""
    t = T(dur); f = f_end + (f_start - f_end) * np.exp(-t / t_pitch)
    a = np.where(t < hold, 1.0, np.exp(-(t - hold) / tau)); k = int(0.0008 * SR); a[:k] *= np.linspace(0, 1, k)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * a
    ck = hp(noise(0.008, 1), 3500) * env(0.008, 0.002) * click * 1.5
    kn = bp(noise(0.04, 2), 700, 3500) * env(0.04, 0.009) * knock * 1.6
    return trim(mix(sat(body, drive), ck, kn))
def snare(f1=190, f2=285, tone=0.6, tone_tau=0.06, noise_tau=0.14, lo=1200, hi=14000, crack=0.8, drive=1.8, dur=0.5, seed=2):
    t = T(dur); pe = np.cumsum(1 + 0.5 * np.exp(-t / 0.008)) / SR
    b = (np.sin(2 * np.pi * f1 * pe) + 0.6 * np.sin(2 * np.pi * f2 * pe)) * env(dur, tone_tau) * tone
    n = bp(noise(dur, seed), lo, hi) * (0.7 * env(dur, noise_tau, 0.0005) + 0.3 * env(dur, noise_tau * 2.5, 0.0005))
    cr = hp(noise(0.01, seed + 7), 5000) * env(0.01, 0.002) * crack
    return trim(sat(mix(b, n, cr), drive))
def clap(dur=0.45, lo=800, hi=12000, tail=0.11, seed=3, bursts=(0, 0.009, 0.019, 0.028), body=1500):
    n = noise(dur, seed); n = bp(n, lo, hi) + 0.9 * bp(n, body * 0.7, body * 1.6, 2); e = np.zeros(int(dur * SR))
    for k, b in enumerate(bursts):
        i = int(b * SR); e[i:] += fit(env(dur - b, 0.005 if k < len(bursts) - 1 else tail, 0.0004), len(e) - i)
    return trim(sat(n * e * 2.2, 1.4))
def hat(decay=0.035, dur=0.4, lo=7500, metallic=0.5, seed=4, tone=1.0):
    x = metal(dur, mult=tone) * metallic + noise(dur, seed) * (1 - metallic)
    return trim(hp(x, lo, 4) * env(dur, decay, 0.0003))
def tom(f0, f1, decay=0.3, dur=0.7, seed=5, noise_amt=0.15):
    b = np.sin(sweep_phase(dur, f0, f1, 0.06)) * env(dur, decay, 0.001)
    n = lp(noise(0.05, seed), 5000) * env(0.05, 0.01) * noise_amt
    return trim(sat(mix(b, n), 1.5))
def rim(dur=0.12):
    t = T(dur); x = (np.sin(2 * np.pi * 455 * t) * 0.6 + np.sin(2 * np.pi * 1667 * t)) * env(dur, 0.018, 0.0003)
    x += hp(noise(dur, 6), 2500) * env(dur, 0.004) * 0.8
    return trim(hp(sat(x, 2.0), 300))
def shaker(dur=0.16, seed=7):
    return trim(bp(noise(dur, seed), 5000, 16000, 2) * env(dur, 0.035, 0.008))
def tamb(dur=0.3, seed=8):
    t = T(dur); j = hp(metal(dur, mult=6.3) * 0.5 + noise(dur, seed) * 0.5, 6500, 4)
    e = env(dur, 0.06, 0.002); i = int(0.035 * SR); e[i:] += fit(env(dur, 0.09, 0.002), len(e) - i) * 0.8
    return trim(j * e)
def conga(f, decay=0.18, dur=0.4):
    t = T(dur); x = (np.sin(2 * np.pi * f * t * (1 + 0.08 * np.exp(-t / 0.01))) + 0.3 * np.sin(2 * np.pi * f * 2.03 * t) * env(dur, decay * 0.4)) * env(dur, decay, 0.001)
    x = mix(x, bp(noise(0.02, 8), 1000, 7000) * env(0.02, 0.003) * 0.4)
    return trim(sat(x, 1.5))
def cowbell(dur=0.4):
    x = (square(540, dur) + square(800, dur)) * 0.5
    x = bp(x, 600, 5000, 2) * (env(dur, 0.05) * 0.7 + env(dur, 0.2) * 0.3)
    return trim(sat(x * 2, 1.5))
def cymbal(dur=1.6, decay=0.9, lo=4000, seed=9, bell=0.0):
    r = rng(seed); t = T(dur)
    parts = sum(np.sin(2 * np.pi * r.uniform(2800, 15000) * t + r.uniform(0, 6)) for _ in range(60)) / 13
    x = hp(parts * 0.6 + noise(dur, seed) * 0.6, lo, 2) * (0.6 * env(dur, decay, 0.001) + 0.4 * env(dur, decay * 0.25, 0.001))
    if bell: x += sum(np.sin(2 * np.pi * f * t) for f in (620, 1490, 2410)) / 3 * env(dur, decay * 0.6) * bell
    return trim(x)
def impact(dur=2.0):
    t = T(dur); x = np.sin(sweep_phase(dur, 110, 36, 0.18)) * env(dur, 0.6, 0.002)
    x = sat(x * 1.5, 2.0) + hp(noise(dur, 10), 300) * (0.5 * env(dur, 0.5, 0.002) + 0.5 * env(dur, 0.08, 0.001)) * 0.6
    return trim(room(x, 120, 0.25, 91, 300))
def riser(dur=2.0):
    t = T(dur); n = noise(dur, 11); p = t / dur
    y = svf(n, 400 * (30 ** p), 0.6, 'band') * 1.5 + hp(n, 6000) * p ** 2 * 0.5
    tone = np.sin(2 * np.pi * np.cumsum(220 * 4 ** p) / SR) * 0.22 * p
    return fade((y + tone) * p ** 1.5, 30)
def zap(dur=0.4):
    x = np.sin(sweep_phase(dur, 2400, 120, 0.06)) * env(dur, 0.12, 0.001)
    return trim(sat(x, 2.0))


# ---------------------------------------------------------------- basses
def sub_bass(f, dur=1.6):
    """Sub with added harmonics (asymmetric saturation), so the bassline is still heard on phone speakers."""
    t = T(dur); x = np.sin(2 * np.pi * f * t); x = hp(np.tanh(2.2 * (x + 0.2 * x * x)), 20)
    return fade(x * env(dur, 1.4, 0.004), 30)
def bass_808(f, dur=2.4, drive=3.2, tau=1.2, click=0.3):
    """Distorted 808: pitch drop on the attack, long tail, strong 2nd and 3rd harmonics."""
    t = T(dur); ph = 2 * np.pi * np.cumsum(f * (1 + 1.6 * np.exp(-t / 0.012))) / SR
    x = np.sin(ph); x = hp(np.tanh(drive * (x + 0.18 * x * x)), 20) * env(dur, tau, 0.002)
    return fade(mix(x, hp(noise(0.004, 3), 3000) * env(0.004, 0.001) * click), 40)
def upright(f, dur=1.8, seed=12):
    n = int(SR / f); buf = lp(rng(seed).uniform(-1, 1, n), 2400, 1).tolist()
    out = [0.0] * int(dur * SR); d = 0.9965
    for i in range(len(out)):
        j = i % n; v = buf[j]; buf[j] = d * 0.5 * (v + buf[(j + 1) % n]); out[i] = v
    out = np.array(out); out = lp(out, 3200) + resonator(out, 110, 3) * 0.6
    out = mix(out, bp(noise(0.012, 13), 1500, 6000) * env(0.012, 0.003) * 0.25)
    return fade(sat(out * 1.8, 1.5) * env(dur, 0.9, 0.003), 30)
def techbass(f, dur=0.7):
    """Tech-house bass: plucky filtered saw + square over a sine sub, with a distorted mid layer."""
    t = T(dur); osc = 0.55 * saw(f, dur) + 0.4 * square(f, dur)
    y = svf(osc, 320 + 2800 * np.exp(-t / 0.06), 0.45)
    mid_layer = bp(sat(osc * 3, 1), 300, 1800) * 0.5
    x = sat(0.8 * y + 0.9 * np.sin(2 * np.pi * f * t) + mid_layer, 2.2)
    return fade(x * env(dur, 0.32, 0.002), 20)
def donk(f, dur=0.6):
    """Bouncy FM 'donk' organ bass (bass house / bassline)."""
    t = T(dur); ph = 2 * np.pi * f * np.cumsum(1 + 0.5 * np.exp(-t / 0.006)) / SR
    idx = 5.0 * np.exp(-t / 0.035) + 1.7
    x = np.sin(ph + idx * np.sin(2 * ph)) + 0.5 * np.sin(2 * ph + 0.5 * idx * np.sin(ph))
    return fade(sat(x * env(dur, 0.22, 0.001) * 0.9 + np.sin(ph) * env(dur, 0.3, 0.002) * 0.5, 2.4), 20)
def reese(f, dur=1.8):
    t = T(dur); x = saw(f, dur, -14, 0.3) + saw(f, dur, 14, 1.9) + 0.6 * saw(f * 2, dur, 5, 0.7)
    y = svf(x / 2.4, 800 + 1800 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.9 * t + 1)), 0.35)
    return fade(sat(y * 1.6 + 0.6 * np.sin(2 * np.pi * f * t), 2.0) * np.minimum(1, t / 0.006), 40)
def growl(kind, f, dur=0.7):
    """Dubstep growl basses (original FM / filter patches). 1 'yoi' vowel sweep, 2 'wub' wobble, 3 screech, 4 tearing comb."""
    t = T(dur); n = len(t)
    if kind == 1:
        idx = 2.5 + 6 * np.minimum(1, t / (dur * 0.6))
        x = sat(np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t) + 1.5 * np.sin(4 * np.pi * f * t + 0.5)), 3)
        k = [0, dur * 0.35, dur * 0.8, dur]; F1 = np.interp(t, k, [320, 900, 520, 400]); F2 = np.interp(t, k, [800, 1350, 2200, 1900])
        y = sat((svf(x, F1, 0.9, 'band') + 0.9 * svf(x, F2, 0.9, 'band') + 0.35 * svf(x, F2 * 2.2, 0.85, 'band')) * 5, 1)
    elif kind == 2:
        x = saw(f, dur, -18) + saw(f, dur, 18, 1.0) + square(f, dur) * 0.6 + saw(f * 2, dur, 7, 2.0) * 0.5
        y = sat(svf(x / 2.5, 120 + 3800 * (0.5 - 0.5 * np.cos(2 * np.pi * (3 / dur) * t)) ** 2, 0.75) * 4, 1)
    elif kind == 3:
        ph = 2 * np.pi * f * 4 * np.cumsum(1 + 0.02 * np.sin(2 * np.pi * 37 * t)) / SR
        car = np.sin(ph + 6 * np.sin(ph * 1.5 + 2 * np.sin(ph * 0.5))); F = np.interp(t, [0, dur], [1400, 3600])
        y = svf(sat(car, 2), F, 0.88, 'band') + 0.5 * svf(car, F * 1.9, 0.8, 'band') + 0.06 * car
        y = sat(y * 6, 1) * lp((np.sin(2 * np.pi * (8 / dur) * t) > -0.2).astype(float), 400, 1)
    else:
        x = sat((saw(f, dur, -25) + saw(f, dur, 25, 1.3) + saw(f * 2, dur, -12, 2.2) + saw(f * 2, dur, 12, 0.4)) / 2.5 * 3, 1)
        idx = np.arange(n) - np.interp(t, [0, dur * 0.5, dur], [0.0011, 0.0045, 0.0018]) * SR; i0 = np.floor(idx).astype(int); fr = idx - i0
        delayed = np.where(i0 >= 0, x[np.clip(i0, 0, n - 1)] * (1 - fr) + x[np.clip(i0 + 1, 0, n - 1)] * fr, 0)
        y = sat(svf(x + 0.9 * delayed, np.interp(t, [0, dur], [900, 4200]), 0.6) * 3, 1)
    y = ott(hp(y, 90), 0.75); y = np.tanh(y / (np.percentile(np.abs(y), 80) + 1e-9) * 1.3)
    return y * np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.03)


# ---------------------------------------------------------------- keys, synths, orchestral
def fm_ep(f, dur=2.6, vel=1.0):
    t = T(dur)
    idx1 = 2.8 * vel * np.exp(-t / 0.45) + 0.5
    tine = 0.55 * vel * np.sin(2 * np.pi * f * t + 1.8 * np.exp(-t / 0.05) * np.sin(2 * np.pi * 14 * f * t)) * np.exp(-t / 0.18)
    body = np.sin(2 * np.pi * f * t + idx1 * np.sin(2 * np.pi * f * t))
    x = (body + tine + 0.12 * np.sin(4 * np.pi * f * t)) * env(dur, 1.0 + 110 / f, 0.002)
    return fade(lp(sat(x * 0.9, 1.6), 11000), 40)
def piano(f, dur=2.4):
    """Bright additive piano: stretched partials up to 15 kHz, two detuned strings, hard hammer."""
    t = T(dur); x = np.zeros_like(t); B = 0.00035; base = 2.4 * (220.0 / f) ** 0.4
    for k in range(1, 70):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 15000: break
        amp = (0.4 + 0.6 * abs(np.sin(np.pi * k / 8.3))) / k ** 0.8
        tau = base / (1 + 0.3 * (k - 1))
        e = 0.7 * np.exp(-t / (tau * 0.28)) + 0.3 * np.exp(-t / (tau * 1.6))
        for det, ph in ((-0.0006, 0.0), (0.0007, 1.7)):
            x += 0.5 * amp * np.sin(2 * np.pi * fk * (1 + det) * t + ph * k) * e
    hammer = bp(noise(dur, 31), 800, 7000) * np.exp(-t / 0.008) * 0.5
    return fade(sat((x + hammer) * np.minimum(1, t / 0.0015) * 1.1, 1.9), 40)
def vibes(f, dur=1.6):
    t = T(dur); x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9) + 0.35 * np.sin(2 * np.pi * 3.98 * f * t) * np.exp(-t / 0.25) + 0.12 * np.sin(2 * np.pi * 9.9 * f * t) * np.exp(-t / 0.07)
    x *= 1 + 0.22 * np.sin(2 * np.pi * 5.4 * t)
    return fade(mix(x * np.minimum(1, t / 0.002), bp(noise(0.01, 71), 2000, 9000) * env(0.01, 0.002) * 0.25) * 0.8, 40)
def supersaw(f, dur=1.8, seed=50):
    """Seven detuned saws, full-range and bright (festival chords and leads)."""
    r = rng(seed); t = T(dur); x = np.zeros_like(t)
    for c, g in zip((-34, -21, -9, 0, 9, 21, 34), (0.6, 0.75, 0.9, 1.0, 0.9, 0.75, 0.6)): x += g * saw(f, dur, c, r.uniform(0, 6.28))
    return fade(hp(x / 4.2, 120) * np.minimum(1, t / 0.004) * (0.75 + 0.25 * np.exp(-t / 0.25)), 60)
def pluck(f, dur=0.9, cut0=10000, cut1=1500, tau=0.1):
    x = (saw(f, dur, -6) + saw(f, dur, 0, 1.0) + saw(f, dur, 6, 2.0)) / 3
    return fade(svf(x, cut1 + (cut0 - cut1) * np.exp(-T(dur) / tau), 0.3) * env(dur, 0.35, 0.002), 30)
def pad(f, dur=3.0):
    x = sum(saw(f, dur, c, ph) for c, ph in ((-14, 0), (-6, 1.3), (0, 2.1), (7, 0.7), (15, 2.9))) / 5 + 0.3 * np.sin(np.pi * f * T(dur))
    t = T(dur); a = np.minimum(1, t / 0.3) * np.exp(-np.maximum(0, t - 0.4) / 4.0)
    return fade((lp(x, 5500, 1) + 0.25 * hp(x, 5000)) * a, 120)
def bell(f, dur=1.8):
    t = T(dur); i = 3.0 * np.exp(-t / 0.4) + 0.4
    x = np.sin(2 * np.pi * f * t + i * np.sin(2 * np.pi * f * 3.5 * t)) * env(dur, 1.0, 0.001)
    x += 0.35 * np.sin(2 * np.pi * f * 2 * t + 0.8 * np.sin(2 * np.pi * f * 1.4 * t)) * env(dur, 0.5, 0.001)
    x += 0.25 * np.sin(2 * np.pi * f * 7.1 * t) * env(dur, 0.08, 0.0005)
    return fade(x * 0.7, 40)
def flute(f, dur=1.5, seed=13):
    t = T(dur); vib = 1 + 0.009 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.18) / 0.3, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    x = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.09 * np.sin(3 * ph) + 0.04 * np.sin(4 * ph)
    breath = bp(noise(dur, seed), f * 1.5, 14000) * 0.14 * (1 + 2 * np.exp(-t / 0.04))
    return fade((x + breath) * np.minimum(1, t / 0.04) * np.exp(-t / 2.5), 50)
def strings(f, dur=3.0, seed=22):
    """String section: detuned saws with independent vibrato, body formants, open top end."""
    r = rng(seed); t = T(dur); x = np.zeros_like(t)
    for i, c in enumerate((-17, -9, -3, 2, 8, 15)):
        vib = 1 + 0.0035 * np.sin(2 * np.pi * (4.6 + 0.35 * i) * t + r.uniform(0, 6)) * np.clip((t - 0.15) / 0.4, 0, 1)
        x += saw_ph(2 * np.pi * f * 2 ** (c / 1200) * np.cumsum(vib) / SR + r.uniform(0, 6), f * 1.02, 1.0, 60)
    x = lp(x / 6, 9000, 1) + 0.35 * resonator(x / 6, 1100, 3) + 0.25 * resonator(x / 6, 2900, 4)
    return fade(hp(x, 140) * np.minimum(1, t / 0.12) * np.minimum(1, (dur - t) / 0.4), 60)
def brass(f, dur=1.1, seed=60):
    """Horn section stab: three saws, a 'blat' filter opening on the attack, slight scoop up to pitch."""
    r = rng(seed); t = T(dur); x = np.zeros_like(t)
    for i, c in enumerate((-8, 0, 7)):
        bend = (1 - 0.03 * np.exp(-t / 0.035)) * (1 + 0.004 * np.sin(2 * np.pi * (5 + 0.3 * i) * t) * np.clip((t - 0.3) / 0.3, 0, 1))
        x += saw_ph(2 * np.pi * f * 2 ** (c / 1200) * np.cumsum(bend) / SR + r.uniform(0, 6), f * 1.02)
    y = svf(x / 3, 1800 + 7000 * (1 - np.exp(-t / 0.04)) * np.exp(-t / 1.6), 0.25)
    y = y + 0.4 * resonator(y, 1300, 3)
    return fade(sat(y * np.minimum(1, t / 0.02) * np.exp(-t / 2.5) * 1.5, 1.6), 50)


# ---------------------------------------------------------------- voice (formant synthesis; no recordings, no real singers)
FORMANTS = {  # (frequency, bandwidth, gain dB) x 5, tenor-ish; higher formants lifted for a present, modern sound
    'a': ((650, 80, 0), (1080, 90, -5), (2650, 120, -6), (2900, 130, -8), (3250, 140, -16)),
    'e': ((400, 70, 0), (1700, 80, -10), (2600, 100, -9), (3200, 120, -12), (3580, 120, -16)),
    'i': ((290, 40, 0), (1870, 90, -11), (2800, 100, -13), (3250, 120, -15), (3540, 120, -22)),
    'o': ((400, 40, 0), (800, 80, -8), (2600, 100, -11), (2800, 120, -12), (3000, 120, -20)),
    'u': ((350, 40, 0), (600, 60, -14), (2700, 100, -15), (2900, 120, -14), (3300, 120, -22)),
}
def sing(f, dur, path, seed=70, takes=2, scoop=-1.2, vib=0.012, breath=0.12, attack=0.02, h=0.0, fshift=1.0, vrate=5.5):
    """One sung syllable. path: [(vowel, start_fraction), ...] morphs between vowels; takes are stacked like doubled vocals;
    h > 0 adds a breathy 'h' onset of that many seconds; fshift scales the formants (above 1 = smaller, brighter voice,
    which together with a faster vibrato gives the sped-up-record sound of chipmunk soul); vrate is the vibrato rate in Hz."""
    t = T(dur); n = len(t); out = np.zeros(n)
    for k in range(takes):
        r = rng(seed + k)
        drift = 1 + 0.004 * lp(r.normal(size=n), 12, 1) * 40
        bend = 2 ** ((scoop * np.exp(-t / 0.05)) / 12) * (1 + vib * np.sin(2 * np.pi * (vrate + 0.3 * k) * t + r.uniform(0, 6)) * np.clip((t - 0.18) / 0.25, 0, 1))
        ph = 2 * np.pi * f * 2 ** (r.uniform(-8, 8) / 1200) * np.cumsum(bend * drift) / SR
        voiced = saw_ph(ph, f * 1.1, 1.15, int(15000 // f)); asp = hp(r.uniform(-1, 1, n), 2500) * (0.6 + 0.4 * np.sin(ph))
        # only a little breath goes through the narrow formant filters (noise there rings like a whistle); the rest is added as plain air
        src = voiced + 0.2 * breath * asp
        if h: src = src * np.clip((t - h * 0.6) / (h * 0.4), 0, 1) + hp(r.uniform(-1, 1, n), 1200) * 0.5 * np.clip(1 - t / h, 0, 1)
        y = np.zeros(n)
        p = t / dur
        for j, (v, a0) in enumerate(path):  # vowel j is fully reached at fraction a0; neighbours crossfade linearly
            w = np.ones(n)
            if j: w = np.minimum(w, np.clip((p - path[j - 1][1]) / max(1e-6, a0 - path[j - 1][1]), 0, 1))
            if j + 1 < len(path): w = np.minimum(w, np.clip((path[j + 1][1] - p) / max(1e-6, path[j + 1][1] - a0), 0, 1))
            # formant tuning, as trained singers do: the first formant never sits below the sung pitch (otherwise high 'oo' and 'ee' notes lose their body)
            y += w * sum(10 ** (g / 20) * resonator(src, max(F * fshift, f * 1.12) if i == 0 else F * fshift, F / bw) for i, (F, bw, g) in enumerate(FORMANTS[v]))
        out += y + 0.3 * hp(voiced, 4500) + 0.6 * breath * bp(asp, 3000, 10000)  # air that the formant bank alone removes
    out = out / takes; out = out + 1.2 * hp(out, 2500)
    a = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / 0.06)
    return fade(sat(balance(out * a * 2.2), 1.3), 30)
def balance(x, lo=0.12, hi=0.35):
    """Nudge the share of energy above 1 kHz into [lo, hi]: a vowel whose pitch lands on a formant can come out
    all fundamental (hollow) or, at high pitches, mostly breath (hiss). Deterministic, so the library stays reproducible."""
    def share(y): F = np.abs(np.fft.rfft(y)) ** 2; fr = np.fft.rfftfreq(len(y), 1 / SR); return F[fr >= 1000].sum() / (F.sum() + 1e-20)
    for g in (0.5, 1, 2, 4, 8):
        sh = share(x)
        if sh < lo: x = x + g * hp(x, 1000) * 0.5
        elif sh > hi: x = x + g * lp(x, 1000) * 0.5
        else: break
    return x
def choir(f, dur=2.6):
    return sing(f, dur, [('a', 0)], 80, 4, 0, 0.007, 0.16, 0.14) * 0.6 + sing(f, dur, [('o', 0)], 90, 3, 0, 0.006, 0.14, 0.18) * 0.5
def vox(f, dur=1.4, vowel='a', seed=14):
    """Simple three-formant voice kept for the scratch sounds."""
    formants = {'a': ((730, 80, 1.0), (1090, 90, 0.5), (2440, 120, 0.25)), 'o': ((450, 70, 1.0), (800, 80, 0.45), (2830, 120, 0.12)),
                'u': ((325, 60, 1.0), (700, 70, 0.3), (2530, 120, 0.08)), 'e': ((530, 70, 1.0), (1840, 100, 0.45), (2480, 120, 0.25))}[vowel]
    t = T(dur); vib = 1 + 0.012 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.12) / 0.3, 0, 1)
    src = saw_ph(2 * np.pi * f * np.cumsum(vib) / SR, f * 1.02, 1.0, int(9000 // f)) + noise(dur, seed) * 0.02
    y = sum(g * resonator(src, F, F / bw) for F, bw, g in formants)
    return fade(sat(y * np.minimum(1, t / 0.04) * env(dur, 1.6, 0.001) * 2.0, 1.2), 50)
VOX = {  # syllable -> (duration, vowel path, extra arguments)
    'vah': (1.4, [('a', 0)], {}), 'voh': (1.2, [('o', 0), ('u', 0.75)], {'seed': 72}), 'vee': (1.1, [('e', 0), ('i', 0.45)], {'seed': 74}),
    'vyeah': (0.9, [('i', 0), ('e', 0.12), ('a', 0.28)], {'seed': 76, 'scoop': -2.0}), 'vhey': (0.7, [('e', 0), ('i', 0.6)], {'seed': 78, 'h': 0.07}),
    # chipmunk-soul voices: as if a soul record were played fast (formants up a major third, quick vibrato)
    'chipoo': (1.6, [('u', 0), ('o', 0.5)], {'seed': 79, 'vib': 0.016, 'attack': 0.03, 'fshift': 1.26, 'vrate': 7.2, 'takes': 3}),
    'chipah': (1.6, [('a', 0)], {'seed': 81, 'vib': 0.016, 'attack': 0.02, 'fshift': 1.26, 'vrate': 7.2, 'takes': 3}),
}
def syllable(name, f):
    d, path, kw = VOX[name]; kw = dict(kw)
    if f > 500 and 'fshift' not in kw: kw['fshift'] = 1.15  # higher notes get a slightly smaller voice so they stay natural
    return sing(f, d, path, **kw)

def scratch_src(dur=1.1):
    """Sustained synthetic 'aah' used as the jog-wheel scratch sample (original; not from any record)."""
    t = T(dur); f = 196 * (1 + 0.05 * np.sin(2 * np.pi * 1.1 * t))
    src = saw_ph(2 * np.pi * np.cumsum(f) / SR, 210, 1.0, 40) + noise(dur, 33) * 0.05
    y = resonator(src, 760, 9) + 0.55 * resonator(src, 1150, 11) + 0.3 * resonator(src, 2500, 18) + noise(dur, 34) * 0.01
    return fade(sat(y * 2.0, 1.4) * np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.05), 20)
def stab_chord(fn, root, semis, dur=1.0):
    return sum(fit(fn(mtof(root + s), dur), int(dur * SR)) for s in semis) / len(semis)
def scratch(dur=0.55):
    src = vox(mtof(57), 1.0, 'a'); t = T(dur)
    pos = 0.18 + 0.12 * np.sin(2 * np.pi * 3.4 * t) * np.exp(-t / 0.6)  # back-and-forth record motion
    x = src[np.clip((pos * SR).astype(int), 0, len(src) - 1)] * np.abs(np.cos(2 * np.pi * 3.4 * t)) ** 0.5
    return trim(hp(x, 250))


# ---------------------------------------------------------------- kits (pad 1 = bottom-left, MPC style): (name, builder, RMS dB)
KITS = {
  'dusty': [  # boom bap / soul: punchy and crunchy through an early-sampler stage, not filtered dark
    ('kick', lambda: sp(kick(55, 150, 0.05, 0.05, 0.16, 0.35, 0.5, 2.6)), -8),
    ('snare', lambda: sp(room(mix(snare(180, 260, 0.9, 0.07, 0.12, 900, 12000, 1.0, 2.2), clap(0.3, 900, 9000, 0.07, 15) * 0.4), 60, 0.22)), -9),
    ('hat', lambda: sp(hat(0.04, lo=5500, metallic=0.35)), -15),
    ('open hat', lambda: sp(hat(0.22, 0.6, 5500, 0.4, 16)), -16),
    ('kick 2', lambda: sp(kick(46, 110, 0.06, 0.08, 0.3, 0.2, 0.3, 2.2, 0.9)), -8),
    ('rim', lambda: sp(rim()), -13),
    ('clap', lambda: sp(room(clap(0.4, 800, 10000, 0.1, 17), 50, 0.2)), -11),
    ('shaker', lambda: shaker(), -19),
    ('low tom', lambda: sp(tom(150, 95, 0.3)), -11),
    ('high tom', lambda: sp(tom(220, 150, 0.25)), -11),
    ('tamb', lambda: tamb(), -17),
    ('ride', lambda: cymbal(1.4, 0.6, 4000, 16, 0.35), -17),
    ('sub', lambda: sub_bass(mtof(33), 1.3), -8),
    ('keys', lambda: stab_chord(fm_ep, 57, (0, 3, 7, 10, 14), 1.6), -11),
    ('vox', lambda: syllable('chipoo', mtof(77)), -11),
    ('scratch', lambda: scratch(), -11),
  ],
  'club': [  # house / garage: tight, bright, loud
    ('kick', lambda: kick(50, 260, 0.028, 0.035, 0.13, 0.55, 0.3, 2.2, 0.5), -7),
    ('clap', lambda: room(clap(), 45, 0.18), -10),
    ('hat', lambda: hat(0.03, lo=8000, metallic=0.45, seed=17), -17),
    ('open hat', lambda: hat(0.2, 0.5, 7000, 0.5, 18), -16.5),
    ('kick 2', lambda: kick(46, 190, 0.04, 0.05, 0.2, 0.35, 0.2, 1.8, 0.7), -8),
    ('snare', lambda: snare(230, 350, 0.8, 0.04, 0.07, 2000, 14000, 1.0, 1.8, 0.35, 19), -10),
    ('rim', lambda: rim(), -13),
    ('shaker', lambda: shaker(seed=20), -18),
    ('conga lo', lambda: conga(220, 0.2), -12),
    ('conga hi', lambda: conga(330, 0.15), -12),
    ('cowbell', lambda: cowbell(), -15),
    ('ride', lambda: cymbal(1.2, 0.5, 5500, 21, 0.4), -17),
    ('bass', lambda: techbass(mtof(41), 0.7), -9),
    ('stab', lambda: stab_chord(piano, 53, (0, 3, 7, 10), 0.9), -10),
    ('vox', lambda: syllable('vhey', mtof(65)), -10),
    ('crash', lambda: cymbal(2.0, 0.8, 3500, 30), -14),
  ],
  'midnight': [  # trap and dubstep
    ('808 kick', lambda: mix(bass_808(mtof(31), 1.3, 3.2, 0.5, 0.5), kick(55, 300, 0.02, 0.02, 0.08, 0.6, 0.3, 2.4, 0.3) * 0.5), -7),
    ('snare', lambda: snare(210, 330, 0.6, 0.05, 0.11, 1800, 16000, 1.2, 2.2, 0.45, 22), -9),
    ('hat', lambda: hat(0.022, lo=8500, metallic=0.6, seed=23), -17),
    ('open hat', lambda: hat(0.26, 0.6, 8000, 0.6, 24), -17),
    ('punch kick', lambda: kick(55, 320, 0.022, 0.03, 0.12, 0.7, 0.4, 3.0, 0.45), -7),
    ('clap', lambda: room(clap(0.5, 900, 12000, 0.14, 25, (0, 0.008, 0.017, 0.027, 0.036)), 60, 0.2), -10),
    ('snap', lambda: clap(0.25, 1800, 9000, 0.05, 26, (0, 0.005)), -13),
    ('perc', lambda: trim(bp(metal(0.2, mult=2.3), 2000, 12000) * env(0.2, 0.03)), -15),
    ('big snare', lambda: room(mix(snare(195, 240, 1.2, 0.09, 0.2, 800, 14000, 1.0, 2.5, 0.7, 27), clap(0.5, 900, 12000, 0.16, 28) * 0.5), 110, 0.28), -8),
    ('808 tom', lambda: tom(130, 80, 0.45, 0.9, 27, 0.05), -10),
    ('impact', lambda: impact(), -10),
    ('crash', lambda: cymbal(2.0, 0.8, 3500, 29), -14),
    ('808 bass', lambda: bass_808(mtof(31), 1.8), -8),
    ('dark stab', lambda: stab_chord(supersaw, 55, (0, 3, 7, 10), 0.9), -11),
    ('vox', lambda: syllable('vyeah', mtof(67)), -10),
    ('growl', lambda: growl(1, mtof(31), 0.6), -9),
  ],
}

# Instruments used by the songs: (builder, MIDI roots, output rate)
INSTRUMENTS = {
  'sub':      (lambda m: sub_bass(mtof(m)), (33, 45), 22050),
  'b808':     (lambda m: bass_808(mtof(m)), (28, 40), 22050),
  'upright':  (lambda m: upright(mtof(m)), (33, 45), 32000),
  'techbass': (lambda m: techbass(mtof(m)), (29, 41), 32000),
  'donk':     (lambda m: donk(mtof(m)), (41, 53), 32000),
  'reese':    (lambda m: reese(mtof(m)), (33, 45), 32000),
  'gr1':      (lambda m: growl(1, mtof(m)), (31,), 32000),
  'gr2':      (lambda m: growl(2, mtof(m)), (31,), 32000),
  'gr3':      (lambda m: growl(3, mtof(m), 0.5), (31,), 32000),
  'gr4':      (lambda m: growl(4, mtof(m)), (31,), 32000),
  'piano':    (lambda m: piano(mtof(m)), (48, 60, 72), 44100),
  'ep':       (lambda m: fm_ep(mtof(m), 2.4), (45, 57, 69), 32000),
  'vibes':    (lambda m: vibes(mtof(m)), (69, 81), 32000),
  'supersaw': (lambda m: supersaw(mtof(m)), (57, 69, 81), 44100),
  'pluck':    (lambda m: pluck(mtof(m)), (57, 69, 81), 44100),
  'pad':      (lambda m: pad(mtof(m)), (45, 57, 69), 32000),
  'bell':     (lambda m: bell(mtof(m)), (69, 81), 44100),
  'flute':    (lambda m: flute(mtof(m)), (69, 81), 32000),
  'strings':  (lambda m: strings(mtof(m)), (57, 69, 81), 32000),
  'brass':    (lambda m: brass(mtof(m)), (57, 69), 44100),
  'choir':    (lambda m: choir(mtof(m)), (57, 69), 32000),
  'vah':      (lambda m: syllable('vah', mtof(m)), (62, 74), 44100),
  'voh':      (lambda m: syllable('voh', mtof(m)), (62, 74), 44100),
  'vee':      (lambda m: syllable('vee', mtof(m)), (62, 74), 44100),
  'vyeah':    (lambda m: syllable('vyeah', mtof(m)), (62, 74), 44100),
  'vhey':     (lambda m: syllable('vhey', mtof(m)), (62, 74), 44100),
  'chipoo':   (lambda m: syllable('chipoo', mtof(m)), (70, 78), 44100),
  'chipah':   (lambda m: syllable('chipah', mtof(m)), (70, 78), 44100),
}


def miss_scratch(dur=0.22):
    """Short record-scratch 'wrong note' sound."""
    t = T(dur); f = 520 * np.exp(-t / 0.05) + 140 + 90 * np.sin(2 * np.pi * 14 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = saw_ph(ph, 800, 1.0, 17) * 0.8
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
    r = np.random.default_rng(30); x = lp(noise(dur, 31), 6000) * 0.012
    for _ in range(int(dur * 9)):
        i = r.integers(0, len(x) - 200); amp = r.uniform(0.05, 0.45) * (1 if r.random() < 0.85 else 2.2)
        click = hp(r.uniform(-1, 1, 60), 1500) * np.exp(-np.arange(60) / 10) * amp
        x[i:i + 60] += click
    x += np.sin(2 * np.pi * 0.55 * T(dur)) * 0.004 * lp(noise(dur, 32), 60)
    return x


def main():
    import shutil
    for d in ('kits', 'inst'): shutil.rmtree(os.path.join(OUT, d), ignore_errors=True)  # rebuilt in full, so no stale files linger
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
            x = taper(fn(m), 0.7); x = x / (np.abs(x).max() + 1e-9) * 10 ** (-3.0 / 20)
            save(os.path.join(OUT, 'inst', f'{inst}-{m}.wav'), x, rate)
        manifest['inst'][inst] = list(roots)
    for name, x, rate in (('vinyl', vinyl(), 32000), ('riser', norm(riser(), -3), 44100), ('impact', norm(taper(impact(), 0.6), -2), 44100),
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
