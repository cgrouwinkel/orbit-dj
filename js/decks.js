/* ORBIT DJ — two-deck engine (Mix tab).
 * Two decks play pre-rendered original tracks (tracks/*.mp3) through a DJ mixer:
 *   deck -> trim -> 3-band EQ -> filter -> channel fader -> crossfader -> master
 * with a post-fader FX send (echo / reverb / flanger), headphone split cue, loops, hot cues,
 * loop roll with slip, beat jump, jog nudge / scrub, tempo fader (no key lock: pitch follows
 * tempo, like vinyl) and SYNC. Positions are computed from the audio clock.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, Synth = O.synth;
  const TRACKS = window.ORBIT_TRACKS || [];
  const RANGE = 0.10; // tempo fader: plus or minus 10 %
  const clamp = O.clamp, frac = x => x - Math.floor(x);
  const wrapHalf = x => { x = frac(x); return x > 0.5 ? x - 1 : x; };

  function newDeck(i) {
    return { i, name: 'AB'[i], track: null, buf: null, peaks: null, loading: false, playing: false, pos: 0, anchor: 0, rate: 1, tempo: 0, bend: 0, bendAt: 0,
      sync: false, cue: 0, hot: [null, null, null, null, null, null, null, null], loop: null, loopBeats: 4, slip: null, src: null, cueHeld: false,
      ch: { gain: 0.5, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5, fader: 1, cue: false, fx: false }, padMode: 'hotcue',
      stats: { plays: 0, cuePreview: 0, cueReturn: 0, hotJumps: 0, rolls: 0, jumps: 0, samples: 0, nudges: 0, scrubs: 0, startAt: null } };
  }
  const D = (O.decks = {
    TRACKS, RANGE, decks: [newDeck(0), newDeck(1)],
    mixer: { xf: 0.5, master: 0.8, split: false, fx: { type: 'echo', beats: 1, amount: 0.5 } },
    vinyl: false, quantize: true, syncLocked: false, g: null
  });
  // D.library() (set in songs.js) adds the player's own songs and imported audio to the built-in tracks.
  D.track = id => (D.library ? D.library() : TRACKS).find(t => t.id === id) || null;
  D.other = d => D.decks[1 - d.i];

  // ---------- mixer maths ----------
  const eqDb = v => (v >= 0.5 ? (v - 0.5) * 12 : -Math.pow((0.5 - v) / 0.5, 1.5) * 34);
  const trimGain = v => Math.pow(v * 2, 1.7);
  const faderGain = v => Math.pow(v, 1.6);
  const xfGain = (i, x) => { const y = i === 0 ? x : 1 - x; return y <= 0.5 ? 1 : Math.cos((y - 0.5) * Math.PI); };
  const lpHz = v => (v >= 0.47 ? 20000 : 20000 * Math.pow(150 / 20000, (0.47 - v) / 0.47));
  const hpHz = v => (v <= 0.53 ? 20 : 20 * Math.pow(6000 / 20, (v - 0.53) / 0.47));
  D.eqDb = eqDb; D.xfGain = xfGain;
  // How loud a deck is in the mix, 0-1 (used for "is it audible" checks).
  D.mixLevel = d => (d.playing ? Math.min(1, trimGain(d.ch.gain)) * faderGain(d.ch.fader) * xfGain(d.i, D.mixer.xf) : 0);
  D.audible = d => D.mixLevel(d) > 0.06;

  // ---------- audio graph (rebuilt whenever the engine makes a new context) ----------
  function impulse(c, secs) {
    const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let s = ch ? 7919 : 104729; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * Math.pow(1 - i / n, 2.6); } }
    return b;
  }
  function graph() {
    const c = E.ctx; if (!c || !E.nodes) return null;
    if (D.g && D.g.gen === E.generation) return D.g;
    const g = { gen: E.generation, ch: [] };
    g.sum = c.createGain(); g.sum.gain.value = 0.7;
    g.master = c.createGain(); g.sum.connect(g.master);
    g.meter = c.createAnalyser(); g.meter.fftSize = 512; g.master.connect(g.meter);
    g.cueBus = c.createGain();
    // split cue: cue in the left ear, mix in the right
    g.monoM = c.createGain(); g.monoC = c.createGain();
    for (const n of [g.monoM, g.monoC]) { n.channelCount = 1; n.channelCountMode = 'explicit'; n.channelInterpretation = 'speakers'; }
    g.merge = c.createChannelMerger(2);
    g.cueBus.connect(g.monoC); g.monoC.connect(g.merge, 0, 0); g.monoM.connect(g.merge, 0, 1);
    // FX unit
    g.fxIn = c.createGain(); g.fxOut = c.createGain(); g.fxOut.connect(g.sum);
    g.echoIn = c.createGain(); g.revIn = c.createGain(); g.flIn = c.createGain();
    g.fxIn.connect(g.echoIn); g.fxIn.connect(g.revIn); g.fxIn.connect(g.flIn);
    g.delay = c.createDelay(2.5); g.fb = c.createGain(); g.fb.gain.value = 0.55;
    g.tone = c.createBiquadFilter(); g.tone.type = 'lowpass'; g.tone.frequency.value = 3200;
    g.echoIn.connect(g.delay); g.delay.connect(g.tone); g.tone.connect(g.fb); g.fb.connect(g.delay); g.tone.connect(g.fxOut);
    try { g.conv = c.createConvolver(); g.conv.buffer = impulse(c, 2.4); g.revIn.connect(g.conv); g.conv.connect(g.fxOut); } catch (e) {}
    g.flDelay = c.createDelay(0.05); g.flDelay.delayTime.value = 0.004; g.flFb = c.createGain(); g.flFb.gain.value = 0.65;
    g.lfo = c.createOscillator(); g.lfo.frequency.value = 0.25; g.lfoAmt = c.createGain(); g.lfoAmt.gain.value = 0.0028;
    g.lfo.connect(g.lfoAmt); g.lfoAmt.connect(g.flDelay.delayTime); try { g.lfo.start(); } catch (e) {}
    g.flIn.connect(g.flDelay); g.flDelay.connect(g.flFb); g.flFb.connect(g.flDelay); g.flDelay.connect(g.fxOut);
    for (let i = 0; i < 2; i++) {
      const n = { in: c.createGain(), trim: c.createGain(), low: c.createBiquadFilter(), mid: c.createBiquadFilter(), hi: c.createBiquadFilter(),
        lp: c.createBiquadFilter(), hp: c.createBiquadFilter(), fader: c.createGain(), xf: c.createGain(), cue: c.createGain(), fx: c.createGain(), meter: c.createAnalyser() };
      n.low.type = 'lowshelf'; n.low.frequency.value = 220; n.mid.type = 'peaking'; n.mid.frequency.value = 1000; n.mid.Q.value = 0.7;
      n.hi.type = 'highshelf'; n.hi.frequency.value = 3600; n.lp.type = 'lowpass'; n.hp.type = 'highpass'; n.meter.fftSize = 512;
      n.in.connect(n.trim); n.trim.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.hi); n.hi.connect(n.lp); n.lp.connect(n.hp);
      n.hp.connect(n.fader); n.fader.connect(n.xf); n.xf.connect(g.sum); n.xf.connect(n.fx); n.fx.connect(g.fxIn);
      n.hp.connect(n.cue); n.cue.connect(g.cueBus); n.hp.connect(n.meter);
      g.ch.push(n);
    }
    D.g = g;
    route(); applyAll(true);
    return g;
  }
  function route() {
    const g = D.g; if (!g) return;
    try { g.master.disconnect(E.nodes.master); } catch (e) {}
    try { g.master.disconnect(g.monoM); } catch (e) {}
    try { g.merge.disconnect(); } catch (e) {}
    if (D.mixer.split) { g.master.connect(g.monoM); g.merge.connect(E.nodes.master); } else g.master.connect(E.nodes.master);
  }
  function setP(param, v, now, snap) { if (snap) param.value = v; else param.setTargetAtTime(v, now, 0.012); }
  function applyAll(snap) {
    const g = D.g, c = E.ctx; if (!g || !c) return;
    const t = c.currentTime, fx = D.mixer.fx;
    D.decks.forEach(d => {
      const n = g.ch[d.i], k = d.ch;
      setP(n.trim.gain, trimGain(k.gain), t, snap); setP(n.low.gain, eqDb(k.low), t, snap); setP(n.mid.gain, eqDb(k.mid), t, snap); setP(n.hi.gain, eqDb(k.hi), t, snap);
      setP(n.lp.frequency, lpHz(k.filter), t, snap); setP(n.hp.frequency, hpHz(k.filter), t, snap);
      const q = Math.abs(k.filter - 0.5) > 0.03 ? 2.2 : 0.7; setP(n.lp.Q, q, t, snap); setP(n.hp.Q, q, t, snap);
      setP(n.fader.gain, faderGain(k.fader), t, snap); setP(n.xf.gain, xfGain(d.i, D.mixer.xf), t, snap);
      setP(n.cue.gain, k.cue ? 1 : 0, t, snap); setP(n.fx.gain, k.fx ? fx.amount : 0, t, snap);
    });
    setP(g.master.gain, Math.pow(D.mixer.master / 0.8, 1.6), t, snap);
    setP(g.echoIn.gain, fx.type === 'echo' ? 1 : 0, t, snap); setP(g.revIn.gain, fx.type === 'reverb' ? 0.9 : 0, t, snap); setP(g.flIn.gain, fx.type === 'flanger' ? 0.9 : 0, t, snap);
    setP(g.delay.delayTime, clamp(fx.beats * 60 / D.masterBpm(), 0.03, 2.4), t, snap);
  }
  D.apply = () => applyAll(false);

  // ---------- mixer controls ----------
  D.set = function (i, name, v) { const d = D.decks[i]; d.ch[name] = typeof v === 'boolean' ? v : clamp(v, 0, 1); applyAll(false); O.emit('mix', { deck: i, name }); };
  D.setXf = v => { D.mixer.xf = clamp(v, 0, 1); applyAll(false); O.emit('mix', { name: 'xf' }); };
  D.setMaster = v => { D.mixer.master = clamp(v, 0, 1); applyAll(false); O.emit('mix', { name: 'master' }); };
  D.setSplit = on => { D.mixer.split = !!on; graph(); route(); O.emit('mix', { name: 'split' }); };
  D.setFx = o => { Object.assign(D.mixer.fx, o); applyAll(false); O.emit('mix', { name: 'fx' }); };
  D.level = function (i) { // 0-1 peak of a channel (i = 0/1) or the master (i = 2)
    const g = D.g; if (!g || !E.isRunning()) return 0;
    const an = i === 2 ? g.meter : g.ch[i].meter;
    if (!D._buf || D._buf.length !== an.fftSize) D._buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(D._buf);
    let p = 0; for (let k = 0; k < D._buf.length; k++) { const a = Math.abs(D._buf[k]); if (a > p) p = a; }
    return p;
  };

  // ---------- loading ----------
  const bytes = new Map(), decoded = new Map();
  D.fetchTrack = function (id) {
    if (!bytes.has(id)) { const T = D.track(id); const emb = (window.ORBIT_EMBEDDED_TRACKS || {})[T.file]; bytes.set(id, fetch(emb ? 'data:audio/mpeg;base64,' + emb : T.file).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).catch(e => { bytes.delete(id); throw e; })); }
    return bytes.get(id);
  };
  function decodeTrack(id) {
    const key = E.generation + '|' + id;
    const T = D.track(id);
    if (T && T.render && !decoded.has(key)) decoded.set(key, T.render().then(analyse).catch(e => { decoded.delete(key); throw e; })); // built in the browser
    if (!decoded.has(key)) decoded.set(key, D.fetchTrack(id).then(ab => new Promise((res, rej) => E.ctx.decodeAudioData(ab.slice(0), res, rej))).then(analyse).catch(e => { decoded.delete(key); throw e; }));
    return decoded.get(key);
  }
  // Find beat 1 (MP3 decoders add different amounts of leading silence) and build the waveform.
  function analyse(buf) {
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, rate = buf.sampleRate;
    let first = 0; for (let i = 0; i < Math.min(a.length, rate * 2); i++) { if (Math.abs(a[i]) > 0.03 || Math.abs(b[i]) > 0.03) { first = i; break; } }
    const per = 150, step = rate / per, n = Math.floor(a.length / step), pk = new Float32Array(n), lo = new Float32Array(n);
    let lp = 0; const k = 1 - Math.exp(-2 * Math.PI * 160 / rate);
    for (let j = 0; j < n; j++) {
      let p = 0, l = 0; const i0 = Math.floor(j * step), i1 = Math.floor((j + 1) * step);
      for (let i = i0; i < i1; i += 2) { const x = (a[i] + b[i]) * 0.5; lp += k * 2 * (x - lp); const ax = Math.abs(x), al = Math.abs(lp); if (ax > p) p = ax; if (al > l) l = al; }
      pk[j] = p; lo[j] = l;
    }
    return { buf, first: first / rate, peaks: { per, pk, lo } };
  }
  D.load = async function (i, id) {
    const d = D.decks[i], T = D.track(id); if (!T) return false;
    if (!(await E.ensureRunning())) { O.emit('needs-audio', 'mix'); return false; }
    graph();
    if (d.playing) D.pause(d);
    d.loading = true; d.wanted = id; O.emit('deck', { deck: i, type: 'loading' });
    try {
      const r = await decodeTrack(id);
      if (d.wanted !== id) return false;
      d.track = Object.assign({}, T, { first: T.imported ? T.first : r.first, beat: 60 / T.bpm }); // imported audio: beat 1 comes from the tempo analysis
      d.buf = r.buf; d.peaks = r.peaks;
      d.pos = d.cue = r.first; d.hot = d.hot.map(() => null); d.loop = null; d.loopBeats = 4; d.slip = null; d.tempo = 0; d.bend = 0; d.sync = false; d.rate = 1;
      d.stats = { plays: 0, cuePreview: 0, cueReturn: 0, hotJumps: 0, rolls: 0, jumps: 0, samples: 0, nudges: 0, scrubs: 0, startAt: null };
      return true;
    } catch (e) { O.toast('Could not load the track. Check your connection and try again.'); return false; }
    finally { d.loading = false; O.emit('deck', { deck: i, type: 'loaded' }); }
  };
  // Fetch only the two lesson tracks ahead of time; the rest load when picked (each is about 2.5 MB).
  D.preload = () => { ['neon', 'glass'].forEach(id => { if (D.track(id)) D.fetchTrack(id).catch(() => {}); }); O.assets.prefetch(SAMPLER.map(s => s.path).filter(Boolean)); };

  // ---------- time ----------
  D.posOf = function (d, t) {
    if (!d.playing || !E.ctx) return d.pos;
    let p = d.pos + Math.max(0, (t === undefined ? E.ctx.currentTime : t) - d.anchor) * d.rate;
    if (d.loop && p >= d.loop.b) p = d.loop.a + (p - d.loop.a) % (d.loop.b - d.loop.a);
    return p;
  };
  D.heardPos = d => D.posOf(d, E.ctx ? E.ctx.currentTime - E.latency() : undefined);
  D.bpm = d => (d.track ? d.track.bpm * (1 + d.tempo * RANGE) : 0);
  D.masterBpm = () => { const a = D.decks.find(d => d.playing && d.track) || D.decks.find(d => d.track); return a ? D.bpm(a) : 120; };
  D.beatOf = (d, pos) => (d.track ? ((pos === undefined ? D.posOf(d) : pos) - d.track.first) / d.track.beat : 0);
  D.remaining = d => (d.track ? Math.max(0, d.track.first + d.track.bars * 4 * d.track.beat - D.posOf(d)) / Math.max(0.01, 1 + d.tempo * RANGE) : 0);
  // Where the deck is in its song: { sec, bar (1-based in section), bars, beat (1-4), phraseBar (1-8) }
  D.where = function (d, pos) {
    if (!d.track) return null;
    const b = Math.max(0, D.beatOf(d, pos)), bar = Math.floor(b / 4);
    let s = d.track.sections[0]; for (const x of d.track.sections) if (bar >= x.bar) s = x;
    return { sec: s.sec, bar: bar - s.bar + 1, bars: s.bars, beat: Math.floor(b % 4) + 1, phraseBar: (bar % 8) + 1, songBar: bar };
  };
  // Timing gap between the two decks' beats in milliseconds (B relative to A; + means B is late). null unless both play.
  D.phaseMs = function () {
    const [a, b] = D.decks; if (!a.playing || !b.playing || !a.track || !b.track) return null;
    const t = E.ctx.currentTime;
    return -wrapHalf(D.beatOf(b, D.posOf(b, t)) - D.beatOf(a, D.posOf(a, t))) * 60000 / D.bpm(a);
  };

  // ---------- transport ----------
  function killSrc(d, t) {
    const s = d.src; if (!s) return; d.src = null;
    try { s.g.gain.cancelScheduledValues(t); s.g.gain.setTargetAtTime(0, t, 0.003); s.node.stop(t + 0.03); } catch (e) {}
    setTimeout(() => { try { s.node.disconnect(); s.g.disconnect(); } catch (e) {} }, 120);
  }
  // keep: the deck is already running and must stay in phase, so skip ahead by the few ms of scheduling delay.
  function startSrc(d, delay, keep) {
    const g = graph(), c = E.ctx; if (!g || !d.buf) return;
    const t = c.currentTime + 0.006 + (delay || 0);
    if (keep) { d.pos += 0.006 * d.rate; if (d.loop && d.pos >= d.loop.b) d.pos = d.loop.a + (d.pos - d.loop.a) % (d.loop.b - d.loop.a); }
    killSrc(d, t - 0.004);
    const node = c.createBufferSource(), sg = c.createGain();
    node.buffer = d.buf; node.playbackRate.value = d.rate;
    if (d.loop) { node.loop = true; node.loopStart = d.loop.a; node.loopEnd = d.loop.b; }
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(1, t + 0.004);
    node.connect(sg); sg.connect(g.ch[d.i].in);
    node.start(t, clamp(d.pos, 0, d.buf.duration - 0.01));
    d.src = { node, g: sg }; d.anchor = t;
  }
  function rebase(d) { if (d.playing) { const t = E.ctx.currentTime; d.pos = D.posOf(d, t); d.anchor = Math.max(d.anchor, t); } }
  function applyRate(d) {
    rebase(d);
    d.rate = (1 + d.tempo * RANGE) * (1 + d.bend);
    if (d.playing && d.src) { try { d.src.node.playbackRate.setValueAtTime(d.rate, E.ctx.currentTime); } catch (e) {} }
    if (D.g) applyAll(false);
  }
  D.play = function (d) {
    if (!d.buf || d.playing || !E.isRunning()) return false;
    if (d.pos >= d.buf.duration - 0.2) d.pos = d.cue;
    // With SYNC on, a start is quantized: it lands on the other deck's nearest beat.
    const o = D.other(d); let delay = 0;
    if (d.sync && o.playing && o.track) { const adj = wrapHalf(D.beatOf(o) - D.beatOf(d, d.pos)) * d.track.beat; if (adj < 0) delay = -adj / d.rate; else d.pos += adj; }
    d.playing = true; startSrc(d, delay);
    d.stats.plays++; d.stats.startAt = { pos: d.pos, at: d.anchor };
    O.emit('deck', { deck: d.i, type: 'play' });
    return true;
  };
  D.pause = function (d) {
    if (!d.playing) return;
    d.pos = D.posOf(d); d.playing = false; d.slip = null; d.bend = 0; d.rate = 1 + d.tempo * RANGE;
    killSrc(d, E.ctx.currentTime);
    O.emit('deck', { deck: d.i, type: 'pause' });
  };
  D.toggle = async function (d) {
    if (!d.buf) return false;
    if (!(await E.ensureRunning())) { O.emit('needs-audio', 'mix'); return false; }
    d.playing ? D.pause(d) : D.play(d);
    return true;
  };
  D.seek = function (d, p, keep) {
    if (!d.buf) return;
    d.pos = clamp(p, 0, d.buf.duration - 0.05);
    if (d.playing) startSrc(d, 0, keep);
    O.emit('deck', { deck: d.i, type: 'seek' });
  };
  const snap = (d, p, grid) => { const g = d.track.beat * (grid || 1); return d.track.first + Math.round((p - d.track.first) / g) * g; };

  // CUE (CDJ style): playing -> back to the cue point and stop; stopped at the cue -> play while held;
  // stopped elsewhere -> set the cue point here (snapped to the beat).
  D.cueDown = function (d) {
    if (!d.buf || !E.isRunning()) return;
    if (d.playing) { D.pause(d); d.pos = d.cue; d.stats.cueReturn++; O.emit('deck', { deck: d.i, type: 'cue' }); return; }
    if (Math.abs(d.pos - d.cue) < 0.03) { d.cueHeld = true; D.play(d); return; }
    d.cue = D.quantize ? Math.max(d.track.first, snap(d, d.pos)) : d.pos; d.pos = d.cue;
    O.emit('deck', { deck: d.i, type: 'cue-set' });
  };
  D.cueUp = function (d) {
    if (!d.cueHeld) return; d.cueHeld = false;
    if (d.playing) { D.pause(d); d.pos = d.cue; d.stats.cuePreview++; O.emit('deck', { deck: d.i, type: 'cue' }); }
  };

  // ---------- tempo, nudge, sync ----------
  D.setTempo = function (d, v, fromSync) {
    if (!fromSync && d.sync) d.sync = false; // moving the fader by hand lets go of SYNC
    d.tempo = clamp(v, -1, 1); applyRate(d);
    const o = D.other(d); if (o.sync && o.track && d.track) follow(o);
    O.emit('deck', { deck: d.i, type: 'tempo' });
  };
  function follow(d) { const o = D.other(d); d.tempo = clamp((D.bpm(o) / d.track.bpm - 1) / RANGE, -1, 1); applyRate(d); O.emit('deck', { deck: d.i, type: 'tempo' }); }
  D.canSync = function (d) { const o = D.other(d); return !!(d.track && o.track && Math.abs(D.bpm(o) / d.track.bpm - 1) <= RANGE + 1e-6); };
  D.toggleSync = function (d) {
    if (d.sync) { d.sync = false; O.emit('deck', { deck: d.i, type: 'sync' }); return true; }
    if (D.syncLocked) { O.toast('No SYNC at this gig. Match the tempo by hand.'); return false; }
    const o = D.other(d);
    if (!d.track || !o.track) { O.toast('Load a track on both decks first.'); return false; }
    if (!D.canSync(d)) { O.toast('These tempos are more than 10% apart. Pick a closer track.'); return false; }
    d.sync = true; follow(d);
    if (o.playing && d.playing) D.seek(d, D.posOf(d) + wrapHalf(D.beatOf(o) - D.beatOf(d)) * d.track.beat, true);
    O.emit('deck', { deck: d.i, type: 'sync' });
    return true;
  };
  D.nudge = function (d, dir) { d.bendHeld = !!dir; D.bendTo(d, dir * 0.06); }; // the + and − buttons, held
  D.bendTo = function (d, amount) { // temporary speed change while a nudge button or the jog is held
    if (!d.playing) return;
    if (amount && !d.bend) d.stats.nudges++;
    d.bend = clamp(amount, -0.3, 0.3); d.bendAt = performance.now(); applyRate(d);
  };

  // ---------- jog wheel ----------
  // turns: fraction of a revolution since the last call; dt: seconds since the last call.
  D.jog = function (d, turns, dt) {
    if (!d.buf) return;
    if (d.playing && !d.jogScrub) { D.bendTo(d, clamp(turns / Math.max(dt, 0.008) * 0.22, -0.16, 0.16)); return; }
    const dp = turns * 1.8, p0 = d.pos; // one turn of the platter = 1.8 s of music
    d.pos = clamp(d.pos + dp, 0, d.buf.duration - 0.05);
    grain(d, p0, d.pos - p0, dt);
    O.emit('deck', { deck: d.i, type: 'scrub' });
  };
  D.jogStart = function (d) { d.jogScrub = false; if (d.playing && D.vinyl) { d.jogResume = true; D.pause(d); d.jogScrub = true; } else if (!d.playing) { d.jogScrub = true; d.stats.scrubs++; } };
  D.jogEnd = function (d) { if (d.bend) D.bendTo(d, 0); if (d.jogResume) { d.jogResume = false; D.play(d); } d.jogScrub = false; };
  function grain(d, p0, dp, dt) {
    const g = graph(), c = E.ctx; if (!g || !E.isRunning() || Math.abs(dp) < 0.002) return;
    const len = Math.min(0.3, Math.abs(dp)), rate = clamp(len / clamp(dt, 0.02, 0.12), 0.25, 4), t = c.currentTime + 0.003;
    const src = c.createBufferSource(), sg = c.createGain();
    if (dp > 0) src.buffer = d.buf;
    else { // backwards: a short reversed copy
      const n = Math.max(8, Math.floor(len * d.buf.sampleRate)), i0 = Math.max(0, Math.floor(p0 * d.buf.sampleRate) - n), rb = c.createBuffer(d.buf.numberOfChannels, n, d.buf.sampleRate);
      for (let ch = 0; ch < d.buf.numberOfChannels; ch++) { const s = d.buf.getChannelData(ch), o = rb.getChannelData(ch); for (let k = 0; k < n; k++) o[k] = s[i0 + n - 1 - k] || 0; }
      src.buffer = rb;
    }
    src.playbackRate.value = rate;
    const dur = len / rate;
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(1, t + 0.004); sg.gain.setValueAtTime(1, t + Math.max(0.006, dur - 0.006)); sg.gain.linearRampToValueAtTime(0, t + dur + 0.004);
    src.connect(sg); sg.connect(g.ch[d.i].in);
    if (dp > 0) src.start(t, clamp(p0, 0, d.buf.duration - len), len); else src.start(t);
    src.onended = () => { try { src.disconnect(); sg.disconnect(); } catch (e) {} };
  }

  // ---------- loops, roll, jump, hot cues ----------
  D.loopOn = function (d, beats) {
    if (!d.buf) return;
    if (beats) d.loopBeats = beats;
    const len = d.loopBeats * d.track.beat, p = D.posOf(d);
    let a = d.loopBeats >= 1 ? snap(d, p) : d.track.first + Math.floor((p - d.track.first) / len) * len;
    a = Math.max(d.track.first, a);
    if (a + len > d.buf.duration - 0.1) return;
    d.pos = p; d.loop = { a, b: a + len, beats: d.loopBeats };
    if (d.playing) startSrc(d, 0, true);
    O.emit('deck', { deck: d.i, type: 'loop' });
  };
  D.loopOff = function (d) { if (!d.loop) return; d.pos = D.posOf(d); d.loop = null; if (d.playing) startSrc(d, 0, true); O.emit('deck', { deck: d.i, type: 'loop' }); };
  D.loopToggle = d => (d.loop ? D.loopOff(d) : D.loopOn(d));
  D.loopScale = function (d, f) {
    const beats = clamp(d.loopBeats * f, 1 / 8, 32); d.loopBeats = beats;
    if (d.loop) {
      let p = D.posOf(d); const len = beats * d.track.beat;
      if (d.loop.a + len > d.buf.duration - 0.1) return;
      d.loop = { a: d.loop.a, b: d.loop.a + len, beats };
      if (p >= d.loop.b) p = d.loop.a + (p - d.loop.a) % len;
      d.pos = p; if (d.playing) startSrc(d, 0, true);
    }
    O.emit('deck', { deck: d.i, type: 'loop' });
  };
  D.rollStart = function (d, beats) {
    if (!d.playing || d.slip) return;
    const t = E.ctx.currentTime, p = D.posOf(d, t), len = beats * d.track.beat;
    d.slip = { pos: p, at: t, keep: d.loop, keepBeats: d.loopBeats };
    const a = Math.max(d.track.first, d.track.first + Math.floor((p - d.track.first) / len) * len);
    d.pos = p; d.loop = { a, b: a + len, beats, roll: true }; startSrc(d, 0, true);
    d.stats.rolls++; O.emit('deck', { deck: d.i, type: 'roll' });
  };
  D.rollEnd = function (d) {
    const s = d.slip; if (!s) return; d.slip = null;
    d.loop = s.keep || null;
    if (d.playing) D.seek(d, s.pos + (E.ctx.currentTime - s.at) * d.rate, true); // slip: land where the track would have been
    O.emit('deck', { deck: d.i, type: 'roll' });
  };
  D.jump = function (d, beats) {
    if (!d.buf) return;
    const by = beats * d.track.beat;
    if (d.loop) d.loop = { a: d.loop.a + by, b: d.loop.b + by, beats: d.loop.beats };
    d.stats.jumps++; D.seek(d, Math.max(d.track.first, D.posOf(d) + by), true);
  };
  D.hot = function (d, n, clear) {
    if (!d.buf) return;
    if (clear) { d.hot[n] = null; O.emit('deck', { deck: d.i, type: 'hot' }); return; }
    if (d.hot[n] === null) { const p = D.posOf(d); d.hot[n] = D.quantize ? Math.max(d.track.first, snap(d, p)) : p; O.emit('deck', { deck: d.i, type: 'hot' }); return; }
    d.stats.hotJumps++; D.seek(d, d.hot[n]); if (!d.playing) D.play(d);
  };

  // ---------- sampler pads (shared one-shots through the master) ----------
  const fx = n => O.assets.fxPath(n), kit = (k, i) => (O.assets.kitPaths(k) || [])[i];
  const SAMPLER = [
    { name: 'IMPACT', path: fx('impact'), vel: 0.8 }, { name: 'CROWD', path: fx('crowd'), vel: 0.7 }, { name: 'RISER', path: fx('riser'), vel: 0.6 }, { name: 'SCRATCH', path: fx('scratch'), vel: 0.9 },
    { name: 'CLAP', path: kit('club', 1), vel: 0.9 }, { name: 'GROWL', path: kit('midnight', 15), vel: 0.8 }, { name: 'VOX', path: kit('club', 14), vel: 0.8 }, { name: 'CRASH', path: kit('midnight', 11), vel: 0.7 }
  ];
  D.SAMPLER = SAMPLER;
  D.sample = function (d, n) {
    const s = SAMPLER[n]; if (!s || !E.isRunning()) return;
    O.assets.ensure([s.path], 1500).then(() => { if (E.isRunning()) Synth.oneShot(E.ctx, E.nodes.pads, s.path, E.ctx.currentTime + 0.004, s.vel); });
    d.stats.samples++; d.stats['s' + n] = 1; O.emit('deck', { deck: d.i, type: 'sample' });
  };

  // Performance pads: 8 per deck, behaviour depends on the pad mode.
  const PAD_MODES = {
    hotcue: { label: 'HOT CUE', pads: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'CUE ' + n) },
    loop: { label: 'LOOP', sizes: [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32] },
    roll: { label: 'ROLL', sizes: [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8] },
    jump: { label: 'JUMP', sizes: [-1, 1, -4, 4, -8, 8, -16, 16] },
    sampler: { label: 'SAMPLER', pads: SAMPLER.map(s => s.name) }
  };
  D.PAD_MODES = PAD_MODES;
  const beatsLabel = b => (b >= 1 ? String(b) : '1/' + Math.round(1 / b));
  D.padLabel = function (d, n) {
    const m = d.padMode, P = PAD_MODES[m];
    if (m === 'hotcue') return d.hot[n] === null ? 'SET ' + (n + 1) : 'CUE ' + (n + 1);
    if (m === 'jump') return (P.sizes[n] > 0 ? '+' : '−') + Math.abs(P.sizes[n]);
    return P.sizes ? beatsLabel(P.sizes[n]) : P.pads[n];
  };
  D.padLit = function (d, n) {
    const m = d.padMode;
    return m === 'hotcue' ? d.hot[n] !== null : m === 'loop' ? !!(d.loop && !d.loop.roll && Math.abs(d.loop.beats - PAD_MODES.loop.sizes[n]) < 1e-6) : false;
  };
  D.padDown = function (d, n, shift) {
    const m = d.padMode;
    if (m === 'hotcue') D.hot(d, n, shift);
    else if (m === 'loop') { const b = PAD_MODES.loop.sizes[n]; if (d.loop && Math.abs(d.loop.beats - b) < 1e-6) D.loopOff(d); else { if (d.loop) D.loopOff(d); D.loopOn(d, b); } }
    else if (m === 'roll') D.rollStart(d, PAD_MODES.roll.sizes[n]);
    else if (m === 'jump') D.jump(d, PAD_MODES.jump.sizes[n]);
    else if (m === 'sampler') D.sample(d, n);
  };
  D.padUp = function (d) { if (d.padMode === 'roll' || d.slip) D.rollEnd(d); };
  D.setPadMode = function (d, m) { if (PAD_MODES[m]) { if (d.slip) D.rollEnd(d); d.padMode = m; O.emit('deck', { deck: d.i, type: 'padmode' }); } };

  // ---------- housekeeping ----------
  D.tick = function () {
    if (!E.ctx) return;
    for (const d of D.decks) {
      if (!d.playing) continue;
      if (d.bend && !d.jogHeld && !d.bendHeld && performance.now() - d.bendAt > 140) D.bendTo(d, 0); // jog stopped moving
      if (!d.loop && D.posOf(d) >= d.buf.duration - 0.06) { D.pause(d); d.pos = d.buf.duration - 0.06; O.emit('deck', { deck: d.i, type: 'end' }); }
    }
  };
  D.stopAll = function () { D.decks.forEach(d => { if (d.playing) D.pause(d); }); };
  D.anyPlaying = () => D.decks.some(d => d.playing);
  D.reset = function () { // back to a neutral mixer
    D.decks.forEach(d => { Object.assign(d.ch, { gain: 0.5, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5, fader: 1, cue: false, fx: false }); });
    Object.assign(D.mixer, { xf: 0.5 }); Object.assign(D.mixer.fx, { amount: 0.5 });
    if (D.mixer.split) D.setSplit(false);
    applyAll(false); O.emit('mix', { name: 'reset' });
  };
  O.on('audio-reset', () => { // new audio context: old nodes and buffers are gone
    D.g = null;
    D.decks.forEach(d => { d.playing = false; d.src = null; d.slip = null; if (d.track) { const id = d.track.id, pos = d.pos; d.buf = null; D.load(d.i, id).then(ok => { if (ok) d.pos = pos; }); } });
  });
  O.on('audio-interrupted', () => D.stopAll());
  O.on('app-hidden', () => D.stopAll());
})();
