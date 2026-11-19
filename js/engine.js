/* ORBIT DJ v2 — audio engine
 * One AudioContext, created and resumed inside a user gesture (iOS requirement).
 * Signal flow:
 *   melody layer ┐
 *   bass layer   ├─> low-shelf EQ ─> low-pass filter ─> music level ─┬─> master ─> limiter ─> speakers
 *   drum layer   ┘                                                    └─> analyser (spectrum)
 *   rhythm pads  ─> pads level   ─> master
 *   16-pad sampler ─> sampler level ─> master
 */
(function () {
  'use strict';
  const O = window.ORBIT;
  const S = O.store;

  // Level scaling chosen from offline loudness measurements (see QA report).
  const SCALE = { music: 0.55, pads: 1.0, sampler: 1.0 };
  const DEFAULT_LEVELS = { music: 0.78, pads: 0.6, sampler: 0.6 };

  const E = (O.engine = {
    ctx: null,
    nodes: null,
    generation: 0,
    unlocked: false,
    needsRecreate: false,
    levels: Object.assign({}, DEFAULT_LEVELS, S.get('orbitV2Levels', {})),
    offsetMs: Number(S.get('orbitV2OffsetMs', 0)) || 0,
    silentSwitchFix: S.get('orbitV2SilentFix', true) !== false,
    controls: { xf: 50, lowEq: 100, filterHz: 20000 },
    lastError: ''
  });

  // ---------- creation / unlock ----------
  function setAudioSession() {
    // iOS 17+: "playback" lets Web Audio play with the ring/silent switch on.
    try {
      if (E.silentSwitchFix && navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (e) {}
  }

  // Older iOS fallback: a looping silent <audio> element moves the page into the
  // media-playback audio category, which also ignores the silent switch.
  let silentEl = null;
  function silentWavUrl() {
    const rate = 8000, n = 4000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function startSilentElement() {
    if (!O.isIOS || !E.silentSwitchFix || (navigator.audioSession && 'type' in navigator.audioSession)) return;
    try {
      if (!silentEl) {
        silentEl = document.createElement('audio');
        silentEl.setAttribute('x-webkit-airplay', 'deny');
        silentEl.preload = 'auto';
        silentEl.loop = true;
        silentEl.src = silentWavUrl();
      }
      const p = silentEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  function stopSilentElement() { try { if (silentEl) silentEl.pause(); } catch (e) {} }

  function createContext() {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) { E.lastError = 'Web Audio is not available in this browser.'; return null; }
    let c;
    try { c = new A({ latencyHint: 'interactive' }); } catch (e) { c = new A(); }
    E.ctx = c;
    E.nodes = buildGraph(c);
    E.generation++;
    drift = null;
    c.onstatechange = () => {
      O.emit('audio-state', c.state);
      if (c !== E.ctx) return;
      if (c.state !== 'running') O.emit('audio-interrupted', c.state);
    };
    applyLevels();
    applyControls(true);
    O.emit('audio-reset', E.generation);
    return c;
  }

  function buildGraph(c) {
    const master = c.createGain(); master.gain.value = 0.82;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.1;
    // Safety ceiling: linear below 0.8, soft knee above, hard stop at about -0.5 dBFS.
    // (The compressor alone lets fast transients through; this guarantees no digital clipping.)
    const ceiling = c.createWaveShaper(), n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1, a = Math.abs(x); curve[i] = a < 0.8 ? x : Math.sign(x) * (0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18)); }
    ceiling.curve = curve; ceiling.oversample = 'none';
    master.connect(limiter); limiter.connect(ceiling); ceiling.connect(c.destination);

    const music = c.createGain();
    const lowShelf = c.createBiquadFilter(); lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 230; lowShelf.gain.value = 0;
    const lowPass = c.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = 20000; lowPass.Q.value = 0.9;
    const melody = c.createGain(), bass = c.createGain(), drums = c.createGain();
    melody.connect(lowShelf); bass.connect(lowShelf); drums.connect(lowShelf);
    // Glue compressor: gentle bus compression so drums, bass and keys sit together.
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 2.5; glue.attack.value = 0.012; glue.release.value = 0.16;
    lowShelf.connect(lowPass); lowPass.connect(glue); glue.connect(music); music.connect(master);
    // Shared room reverb for the backing track (returns before the DJ EQ/filter, so sweeps affect it).
    const revIn = c.createGain(), revOut = c.createGain();
    revOut.gain.value = 0.85;
    try { const conv = c.createConvolver(); conv.buffer = makeImpulse(c, 1.9); revIn.connect(conv); conv.connect(revOut); revOut.connect(lowShelf); } catch (e) {}
    const analyser = c.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.78;
    music.connect(analyser);

    const pads = c.createGain(); pads.connect(master);
    const sampler = c.createGain(); sampler.connect(master);
    return { master, limiter, ceiling, music, lowShelf, lowPass, glue, revIn, melody, bass, drums, analyser, pads, sampler };
  }

  // Synthetic room impulse: stereo decorrelated noise, exponential decay, darker tail, short predelay.
  function makeImpulse(c, seconds) {
    const rate = c.sampleRate, len = Math.floor(rate * seconds), pre = Math.floor(rate * 0.012);
    const ir = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let seed = ch ? 99991 : 12347, lp = 0;
      for (let i = pre; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = seed / 0x3fffffff - 1, t = (i - pre) / rate;
        const k = 0.35 + 0.6 * Math.min(1, t / seconds); // more smoothing (darker) as the tail goes on
        lp += (n - lp) * (1 - k);
        d[i] = lp * Math.exp(-t / (seconds * 0.28)) * 0.55;
      }
    }
    return ir;
  }

  E.buildGraph = buildGraph;
  E.SCALE = SCALE;

  // Must be called synchronously inside a user-gesture handler.
  E.unlock = function () {
    setAudioSession();
    if (E.needsRecreate && E.ctx) {
      const old = E.ctx; E.ctx = null; E.needsRecreate = false;
      try { old.onstatechange = null; old.close().catch(() => {}); } catch (e) {}
    }
    const c = E.ctx || createContext();
    if (!c) return null;
    if (c.state !== 'running') {
      try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    }
    try { // WebKit warm-up: a 1-sample silent buffer started inside the gesture.
      const b = c.createBuffer(1, 1, c.sampleRate), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
    startSilentElement();
    E.unlocked = true;
    return c;
  };

  // Resolves true once audio is running. If iOS leaves the context stuck
  // ("interrupted"), the next gesture rebuilds it.
  E.ensureRunning = function () {
    const c = E.unlock();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const fin = ok => { if (done) return; done = true; if (!ok) E.needsRecreate = true; resolve(ok); };
      try { c.resume().then(() => fin(c.state === 'running'), () => fin(false)); } catch (e) { fin(false); }
      setTimeout(() => fin(c.state === 'running'), 1200);
    });
  };

  E.isRunning = () => !!(E.ctx && E.ctx.state === 'running');

  // Keep trying to (re)start audio on any interaction while it is not running.
  const gestureEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  function onGesture() { if (!E.ctx || E.ctx.state !== 'running' || E.needsRecreate) E.unlock(); }
  gestureEvents.forEach(t => document.addEventListener(t, onGesture, { capture: true, passive: true }));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopSilentElement(); O.emit('app-hidden'); }
    else { O.emit('app-visible'); }
  });
  window.addEventListener('pagehide', () => O.emit('app-hidden'));

  // ---------- levels and DJ controls ----------
  function applyLevels() {
    if (!E.nodes) return;
    const t = E.ctx.currentTime;
    E.nodes.music.gain.setTargetAtTime(E.levels.music * SCALE.music, t, 0.03);
    E.nodes.pads.gain.setTargetAtTime(E.levels.pads * SCALE.pads, t, 0.03);
    E.nodes.sampler.gain.setTargetAtTime(E.levels.sampler * SCALE.sampler, t, 0.03);
  }
  E.setLevel = function (name, v) {
    E.levels[name] = O.clamp(v, 0, 1);
    S.set('orbitV2Levels', E.levels);
    applyLevels();
    O.emit('levels', E.levels);
  };

  function applyControls(immediate) {
    if (!E.nodes) return;
    const n = E.nodes, t = E.ctx.currentTime, tc = immediate ? 0.001 : 0.025;
    const x = E.controls.xf / 100;
    n.melody.gain.setTargetAtTime(Math.cos(x * Math.PI / 2), t, tc);
    n.bass.gain.setTargetAtTime(Math.sin(x * Math.PI / 2), t, tc);
    n.drums.gain.setTargetAtTime(0.82, t, tc);
    n.lowShelf.gain.setTargetAtTime(20 * Math.log10(Math.max(0.06, E.controls.lowEq / 100)), t, tc);
    n.lowPass.frequency.setTargetAtTime(E.controls.filterHz, t, immediate ? 0.001 : 0.03);
  }
  E.setControl = function (name, value) { E.controls[name] = value; applyControls(false); };
  E.applyControls = () => applyControls(false);

  // ---------- clock ----------
  // ctx.currentTime advances in coarse steps on phones. We keep a smoothed mapping
  // between performance.now() and the audio clock so visuals move smoothly and
  // tap timestamps can be converted to audio time.
  let drift = null;
  E.tick = function () {
    const c = E.ctx; if (!c) return;
    const d = c.currentTime - performance.now() / 1000;
    if (drift === null || c.state !== 'running' || Math.abs(d - drift) > 0.08) drift = d;
    else drift += (d - drift) * 0.06;
  };
  E.now = function (perfMs) {
    const c = E.ctx; if (!c) return 0;
    if (drift === null || c.state !== 'running') return c.currentTime;
    const t = (perfMs === undefined ? performance.now() : perfMs) / 1000 + drift;
    return Math.min(t, c.currentTime + 0.06);
  };
  // Estimated time between scheduling a sound and it leaving the speaker.
  E.latency = function () {
    const c = E.ctx; if (!c) return 0;
    const base = Number(c.baseLatency) || 0, out = Number(c.outputLatency) || 0;
    return O.clamp(base + out, 0, 0.5);
  };
  // Audio-clock time of what the player is hearing right now (or at an input event).
  E.heard = perfMs => E.now(perfMs) - E.latency() - E.offsetMs / 1000;
  E.setOffset = function (ms) {
    E.offsetMs = Math.round(O.clamp(ms, -300, 300));
    S.set('orbitV2OffsetMs', E.offsetMs);
    O.emit('offset', E.offsetMs);
  };
  E.setSilentFix = function (on) {
    E.silentSwitchFix = !!on; S.set('orbitV2SilentFix', E.silentSwitchFix);
    if (!on) { stopSilentElement(); try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) {} }
    else setAudioSession();
  };

  E.status = function () {
    const c = E.ctx;
    return {
      state: c ? c.state : 'not started',
      sampleRate: c ? c.sampleRate : 0,
      latencyMs: Math.round(E.latency() * 1000),
      reportsOutputLatency: !!(c && Number(c.outputLatency) > 0),
      audioSession: navigator.audioSession ? navigator.audioSession.type : 'unsupported'
    };
  };

  // ---------- synthesis (pure: takes a context and destination, so tests can render offline) ----------
  const noiseCache = new WeakMap();
  function noise(c) {
    let b = noiseCache.get(c);
    if (!b) {
      b = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate);
      const d = b.getChannelData(0); let seed = 12345;
      for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
      noiseCache.set(c, b);
    }
    return b;
  }
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function cleanup(src, nodes) { src.onended = () => { try { src.disconnect(); nodes.forEach(n => n.disconnect()); } catch (e) {} }; }

  const Synth = (O.synth = {});
  // Lane sounds: 0 kick, 1 snare, 2 hat, 3 FX zap. Same roles as v1, fuller sound.
  Synth.drum = function (c, dest, lane, t, vel) {
    vel = vel === undefined ? 1 : vel;
    t = Math.max(t, c.currentTime + 0.002);
    if (lane === 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      env(g, t, 0.95 * vel, 0.003, 0.34);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4); cleanup(o, [g]);
      const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = noise(c); hp.type = 'highpass'; hp.frequency.value = 2500; env(ng, t, 0.18 * vel, 0.001, 0.016);
      n.connect(hp); hp.connect(ng); ng.connect(dest); n.start(t); n.stop(t + 0.04); cleanup(n, [hp, ng]);
    } else if (lane === 1) {
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = noise(c); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7; env(ng, t, 0.62 * vel, 0.002, 0.17);
      n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(t, 0.1); n.stop(t + 0.22); cleanup(n, [bp, ng]);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.09);
      env(g, t, 0.38 * vel, 0.002, 0.11); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.16); cleanup(o, [g]);
    } else if (lane === 2) {
      const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = noise(c); hp.type = 'highpass'; hp.frequency.value = 7200; env(ng, t, 0.34 * vel, 0.001, 0.05);
      n.connect(hp); hp.connect(ng); ng.connect(dest); n.start(t, 0.3); n.stop(t + 0.08); cleanup(n, [hp, ng]);
    } else {
      const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.2);
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 4;
      env(g, t, 0.26 * vel, 0.004, 0.26); o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.32); cleanup(o, [lp, g]);
    }
  };

  // Generic pitched voice used by the backing tracks.
  Synth.voice = function (c, dest, v) {
    const t = Math.max(v.t, c.currentTime + 0.002);
    const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = v.type || 'triangle';
    if (v.glideFrom) { o.frequency.setValueAtTime(v.glideFrom, t); o.frequency.exponentialRampToValueAtTime(v.f, t + 0.06); }
    else o.frequency.setValueAtTime(v.f, t);
    if (v.detune) o.detune.value = v.detune;
    lp.type = 'lowpass'; lp.Q.value = v.q || 0.7;
    if (v.filterEnv) { lp.frequency.setValueAtTime(v.cutoff * 3.5, t); lp.frequency.exponentialRampToValueAtTime(v.cutoff, t + v.filterEnv); }
    else lp.frequency.value = v.cutoff || 1800;
    const atk = v.attack || 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v.vol, t + atk);
    if (v.sustain) { g.gain.setTargetAtTime(v.vol * v.sustain, t + atk, v.dur * 0.25); g.gain.setTargetAtTime(0.0001, t + v.dur, 0.06); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk + 0.02, v.dur));
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + v.dur + (v.sustain ? 0.4 : 0.05));
    cleanup(o, [lp, g]);
    return o;
  };

  Synth.noiseHit = function (c, dest, t, vol, hp, dur) {
    t = Math.max(t, c.currentTime + 0.002);
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = noise(c); f.type = 'highpass'; f.frequency.value = hp; env(g, t, vol, 0.001, dur);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t, Math.random() * 0.3); n.stop(t + dur + 0.03); cleanup(n, [f, g]);
  };

  // v1 "sample mode" melodic chops for the four rhythm pads (kept from v1.1).
  const padBanks = { soul: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [7, 10, 14]], garage: [[0, 7, 12], [5, 9, 12], [3, 7, 10], [7, 11, 14]], dark: [[0, 3, 7], [0, 6, 10], [3, 6, 10], [5, 8, 12]] };
  Synth.chop = function (c, dest, bank, i, t) {
    const base = bank === 'dark' ? 49 : bank === 'garage' ? 65.406 : 55, tones = padBanks[bank][i];
    for (const s of tones) {
      Synth.voice(c, dest, { type: bank === 'soul' ? 'sine' : bank === 'garage' ? 'triangle' : 'sawtooth', f: base * 2 * Math.pow(2, s / 12), t, dur: 0.3, vol: 1.5 / tones.length, cutoff: bank === 'dark' ? 900 : bank === 'soul' ? 1900 : 2600, attack: 0.012 });
    }
  };

  // Synth fallback for the 16-pad sampler if WAV files can't be fetched/decoded.
  const fallbackDegrees = [[0], [3], [7], [10], [12], [0, 3, 7], [5, 8, 12], [24], [0, 7], [3, 10], [5, 12], [7, 14], [-12], [0, 12], [12, 19], null];
  Synth.samplerFallback = function (c, dest, bank, i, t, vol) {
    const base = bank === 'dark' ? 98 : bank === 'garage' ? 130.81 : 110;
    const deg = fallbackDegrees[i];
    if (!deg) { Synth.drum(c, dest, 3, t, vol); return; }
    for (const s of deg) Synth.voice(c, dest, { type: bank === 'dark' ? 'sawtooth' : 'triangle', f: base * Math.pow(2, s / 12), t, dur: 0.45, vol: 0.7 * vol / deg.length, cutoff: bank === 'dark' ? 1100 : 2400, attack: 0.006 });
  };

  // ---------- sampled instruments and drum kits (fall back to oscillators if a file is missing) ----------
  const FALLBACK = { ep: ['sine', 2400], sub: ['sine', 300], b808: ['sine', 300], upright: ['triangle', 900], sawbass: ['sawtooth', 600],
    pluck: ['sawtooth', 2600], organ: ['square', 2200], pad: ['sawtooth', 1400], bell: ['sine', 6000], flute: ['triangle', 3000], vox: ['sawtooth', 1200] };
  let panOK = null;
  // Play instrument `name` at MIDI note `midi`. o: { dur (s), vel, attack, release, pan, send (reverb 0-1) }
  Synth.inst = function (c, dest, name, midi, t, o) {
    o = o || {};
    t = Math.max(t, c.currentTime + 0.002);
    const dur = o.dur || 0.5, vel = o.vel === undefined ? 0.8 : o.vel, rel = o.release || 0.12;
    const roots = (window.ORBIT_SOUNDS && window.ORBIT_SOUNDS.inst[name]) || [];
    let best = null, bestD = 99;
    for (const r of roots) { const d = Math.abs(midi - r); if (d < bestD && O.assets.get('sounds/inst/' + name + '-' + r + '.wav')) { best = r; bestD = d; } }
    if (best === null) {
      const fb = FALLBACK[name] || ['triangle', 2000];
      return Synth.voice(c, dest, { type: fb[0], f: 440 * Math.pow(2, (midi - 69) / 12), t, dur, vol: 0.18 * vel, cutoff: fb[1], attack: o.attack || 0.01 });
    }
    const buf = O.assets.get('sounds/inst/' + name + '-' + best + '.wav');
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = Math.pow(2, (midi - best) / 12);
    const peak = vel * vel, atk = o.attack || 0.003, end = t + dur;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, Math.max(t + atk, end)); g.gain.setTargetAtTime(0, end, rel / 3);
    s.connect(g);
    let out = g;
    if (o.pan) {
      if (panOK === null) panOK = typeof c.createStereoPanner === 'function';
      if (panOK) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    }
    out.connect(dest);
    if (o.send && o.sendDest) { const sg = c.createGain(); sg.gain.value = o.send; out.connect(sg); sg.connect(o.sendDest); }
    s.start(t); s.stop(Math.min(t + buf.duration / s.playbackRate.value, end + rel * 2.5) + 0.02);
    s.onended = () => { try { s.disconnect(); g.disconnect(); out.disconnect(); } catch (e) {} };
    return s;
  };
  const KIT_FALLBACK_LANE = [0, 1, 2, 2, 0, 1, 1, 2, 3, 3, 3, 2, 0, 3, 3, 3];
  // Play pad `i` (0-15) of drum kit `kit`. o: { vel, tune (semitones), decay (0.1-1), pan }
  Synth.kit = function (c, dest, kit, i, t, o) {
    o = o || {};
    t = Math.max(t, c.currentTime + 0.002);
    const pads = window.ORBIT_SOUNDS && window.ORBIT_SOUNDS.kits[kit];
    const buf = pads && pads[i] ? O.assets.get(pads[i].path) : null;
    const vel = o.vel === undefined ? 1 : o.vel;
    if (!buf) { Synth.drum(c, dest, KIT_FALLBACK_LANE[i] || 0, t, vel); return null; }
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; if (o.tune) s.playbackRate.value = Math.pow(2, o.tune / 12);
    const len = buf.duration / s.playbackRate.value, decay = o.decay === undefined ? 1 : o.decay;
    g.gain.setValueAtTime(vel * vel, t);
    if (decay < 0.999) { const end = t + Math.max(0.03, len * decay); g.gain.setTargetAtTime(0, end - 0.02, 0.012); }
    s.connect(g);
    let out = g;
    if (o.pan) { if (panOK === null) panOK = typeof c.createStereoPanner === 'function'; if (panOK) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; } }
    out.connect(dest);
    s.start(t); s.stop(t + len * Math.min(1, decay) + 0.05);
    s.onended = () => { try { s.disconnect(); g.disconnect(); out.disconnect(); } catch (e) {} };
    return { src: s, gain: g, t };
  };

  // One-shot of any loaded file (fx risers, impacts).
  Synth.oneShot = function (c, dest, path, t, vel, loop) {
    const buf = O.assets.get(path); if (!buf) return null;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.loop = !!loop; g.gain.value = vel === undefined ? 1 : vel;
    s.connect(g); g.connect(dest); s.start(Math.max(t, c.currentTime + 0.002));
    if (!loop) s.onended = () => { try { s.disconnect(); g.disconnect(); } catch (e) {} };
    return { src: s, gain: g };
  };

  // Short tone used by the CUE button and the calibration clicks.
  Synth.blip = function (c, dest, t, f, vol, dur) {
    Synth.voice(c, dest, { type: 'triangle', f: f || 440, t, dur: dur || 0.32, vol: vol || 0.3, cutoff: 3000, attack: 0.02 });
  };

  // Convenience wrappers on the live context.
  E.playDrum = (lane, t, vel) => { if (E.isRunning()) Synth.drum(E.ctx, E.nodes.pads, lane, t === undefined ? E.ctx.currentTime + 0.004 : t, vel); };
  E.testSound = () => {
    if (!E.isRunning()) return false;
    const t = E.ctx.currentTime + 0.05;
    [0, 4, 7, 12].forEach((s, i) => Synth.blip(E.ctx, E.nodes.pads, t + i * 0.12, 440 * Math.pow(2, s / 12), 0.28, 0.25));
    return true;
  };
})();
