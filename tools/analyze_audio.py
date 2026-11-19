#!/usr/bin/env python3
"""Spectral balance report for rendered audio (WAV, or anything ffmpeg can read).
Prints, per file: RMS and peak (dBFS), crest factor, energy per band relative to the whole signal (dB),
the share of energy above 4 kHz and 8 kHz, and the spectral centroid. Used to check that mixes are not dull.
Usage: python3 tools/analyze_audio.py file.wav [start_s end_s] ..."""
import subprocess, sys, tempfile, os
import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

BANDS = [('sub', 20, 60), ('bass', 60, 250), ('lowmid', 250, 1000), ('mid', 1000, 4000), ('high', 4000, 8000), ('air', 8000, 16000)]

def load(path):
    if not path.lower().endswith('.wav'):
        tmp = tempfile.mktemp(suffix='.wav'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, tmp], check=True); path = tmp
    sr, x = wavfile.read(path); x = x.astype(np.float64)
    x /= 32768.0 if x.dtype != np.float32 and np.abs(x).max() > 1.5 else 1.0
    return sr, (x.mean(axis=1) if x.ndim > 1 else x)

def report(x, sr):
    f, p = welch(x, sr, nperseg=8192)
    tot = p.sum() + 1e-20
    out = {n: 10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-20) for n, lo, hi in BANDS}
    rms = np.sqrt(np.mean(x ** 2)) + 1e-12; pk = np.abs(x).max() + 1e-12
    out.update(rms=20 * np.log10(rms), peak=20 * np.log10(pk), crest=20 * np.log10(pk / rms),
               above4k=100 * p[f >= 4000].sum() / tot, above8k=100 * p[f >= 8000].sum() / tot, centroid=(f * p).sum() / tot)
    return out

def fmt(name, r):
    return (f"{name:<22} rms {r['rms']:6.1f} pk {r['peak']:5.1f} crest {r['crest']:4.1f} | " + ' '.join(f"{n} {r[n]:5.1f}" for n, _, _ in BANDS) +
            f" | >4k {r['above4k']:5.2f}% >8k {r['above8k']:5.2f}% centroid {r['centroid']:5.0f} Hz")

if __name__ == '__main__':
    args = sys.argv[1:]; i = 0
    while i < len(args):
        path = args[i]; i += 1; sr, x = load(path); a, b = 0, len(x) / sr
        if i + 1 < len(args) and args[i].replace('.', '').isdigit(): a, b = float(args[i]), float(args[i + 1]); i += 2
        print(fmt(os.path.basename(path) + (f'[{a:.0f}-{b:.0f}]' if b - a < len(x) / sr - 0.5 else ''), report(x[int(a * sr):int(b * sr)], sr)))
