/* ORBIT DJ — MPC-style beat pad (replaces the v1/v2.0 16-pad sampler).
 * Kits, position velocity, step sequencer with live overdub, swing, metronome + count-in,
 * note repeat, 16 levels (chromatic), mute/solo/erase, per-pad level/tune/decay, hi-hat choke,
 * 4 pattern slots with bar-synced switching, undo, synced backing track, JSON export/import
 * (reads v1 patterns) and WAV bounce. Everything runs on the Web Audio clock.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, M = O.music, Synth = O.synth, S = O.store;
  const KITS = { dusty: 'Dusty Kit', club: 'Club Kit', midnight: 'Midnight 808', soul: 'Soul Chops', garage: 'Garage Chops', dark: 'Dark Pulse' };
  const SLOTS = ['A', 'B', 'C', 'D'];
  const CHOKE = { 2: 3 }; // closed hat (pad 3) silences open hat (pad 4) in the drum kits
  const DRUM_KITS = ['dusty', 'club', 'midnight'];
  const KEY = 'orbitV21BeatPad';

  const saved = S.get(KEY, {}) || {};
  const blankPatterns = () => SLOTS.reduce((o, s) => { o[s] = { bars: 1, events: [] }; return o; }, {});
  const BP = (O.beatpad = {
    KITS, SLOTS,
    kit: KITS[saved.kit] ? saved.kit : 'dusty',
    bpm: O.clamp(Number(saved.bpm) || 90, 60, 180),
    swing: O.clamp(Number(saved.swing) || 54, 50, 75),
    metro: saved.metro !== false,
    quant: saved.quant !== false,
    fullLevel: !!saved.fullLevel,
    patterns: saved.patterns && saved.patterns.A ? saved.patterns : blankPatterns(),
    cur: SLOTS.includes(saved.cur) ? saved.cur : 'A',
    params: saved.params || {},
    backing: !!saved.backing, backingStyle: saved.backingStyle || 'auto',
    queued: null, playing: false, rec: false, countingIn: false, origin: 0, k: 0, timer: 0, session: null,
    sel: 0, mode: 'play', mutes: new Set(), solo: null, noteRepeat: 0, levels16: false,
    held: new Map(), undoStack: [], status: 'Tap pads to play. Press PLAY to start the sequencer, REC to record.'
  });

  // ---------- persistence ----------
  let saveT = 0;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(() => S.set(KEY, { kit: BP.kit, bpm: BP.bpm, swing: BP.swing, metro: BP.metro, quant: BP.quant, fullLevel: BP.fullLevel, patterns: cleanPatterns(), cur: BP.cur, params: BP.params, backing: BP.backing, backingStyle: BP.backingStyle }), 250);
  }
  function cleanPatterns() { const o = {}; for (const s of SLOTS) o[s] = { bars: BP.patterns[s].bars, events: BP.patterns[s].events.map(e => ({ pad: e.pad, step: e.step, velocity: e.velocity, tune: e.tune || 0 })) }; return o; }
  function say(msg) { BP.status = msg; O.emit('bp-status', msg); }
  function changed(what) { persist(); O.emit('bp-change', what || 'pattern'); }

  BP.pattern = () => BP.patterns[BP.cur];
  BP.steps = () => BP.pattern().bars * 16;
  BP.unit = () => 60 / BP.bpm / 4;
  BP.swingOffset = () => (BP.swing / 100 - 0.5) * 2 * BP.unit();
  BP.padName = i => { const k = window.ORBIT_SOUNDS.kits[BP.kit]; return k && k[i] ? k[i].name : 'PAD ' + (i + 1); };
  BP.param = (i, kit) => { kit = kit || BP.kit; const p = (BP.params[kit] = BP.params[kit] || {}); return (p[i] = p[i] || { level: 1, tune: 0, decay: 1 }); };
  BP.setParam = (i, name, v) => { BP.param(i)[name] = v; changed('params'); };
  BP.loadKit = kit => O.assets.ensure(O.assets.kitPaths(kit || BP.kit), 3000);

  // ---------- sound ----------
  const lastVoice = {};
  function strike(i, t, vel, tune, dest) {
    const c = E.ctx; if (!c || c.state !== 'running') return;
    const p = BP.param(i);
    if (DRUM_KITS.includes(BP.kit) && CHOKE[i] !== undefined) { const v = lastVoice[CHOKE[i]]; if (v && v.gain) { try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, Math.max(t, c.currentTime), 0.008); } catch (e) {} } }
    const v = Synth.kit(c, dest || E.nodes.sampler, BP.kit, i, t, { vel: O.clamp(vel * p.level, 0, 1.5), tune: p.tune + (tune || 0), decay: p.decay });
    lastVoice[i] = v;
    O.emit('bp-hit', { pad: i, at: t, vel });
  }
  BP.strike = strike;

  // Velocity from where the pad is touched (top = loud), or full level.
  BP.velocityFromY = frac => (BP.fullLevel ? 1 : O.clamp(1.05 - 0.6 * frac, 0.4, 1));

  // ---------- live pad input ----------
  BP.padDown = async function (i, perfMs, vel, pointerId) {
    if (!E.isRunning()) { const ok = await E.ensureRunning(); if (!ok) { O.emit('needs-audio', 'sampler'); return; } }
    if (!O.assets.ready(O.assets.kitPaths(BP.kit))) await BP.loadKit();
    if (BP.mode === 'mute') { BP.mutes.has(i) ? BP.mutes.delete(i) : BP.mutes.add(i); say((BP.mutes.has(i) ? 'Muted ' : 'Unmuted ') + BP.padName(i)); changed('mute'); return; }
    if (BP.mode === 'solo') { BP.solo = BP.solo === i ? null : i; say(BP.solo === null ? 'Solo off' : 'Solo ' + BP.padName(i)); changed('mute'); return; }
    if (BP.mode === 'erase') { pushUndo(); const n0 = BP.pattern().events.length; BP.pattern().events = BP.pattern().events.filter(e => e.pad !== (BP.levels16 ? BP.sel : i)); say('Erased ' + (n0 - BP.pattern().events.length) + ' hits of ' + BP.padName(BP.levels16 ? BP.sel : i)); changed(); return; }
    const pad = BP.levels16 ? BP.sel : i, tune = BP.levels16 ? i - 7 : 0;
    if (!BP.levels16) { BP.sel = i; O.emit('bp-select', i); }
    vel = vel === undefined ? 1 : vel;
    const c = E.ctx;
    strike(pad, c.currentTime + 0.004, vel, tune);
    if (BP.rec && BP.playing) record(pad, perfMs, vel, tune);
    if (BP.noteRepeat) { BP.held.set(pointerId === undefined ? 'k' + i : pointerId, { pad, vel, tune, from: c.currentTime }); ensureClock(); }
  };
  BP.padUp = function (pointerId, i) { BP.held.delete(pointerId === undefined ? 'k' + i : pointerId); };

  function record(pad, perfMs, vel, tune) {
    const L = BP.steps(), unit = BP.unit();
    const pos = (E.heard(perfMs) - BP.origin) / unit;
    if (pos < -0.5) return;
    let step, abs;
    if (BP.quant) { abs = Math.round(pos); step = ((abs % L) + L) % L; }
    else { abs = Math.floor(pos); step = Math.min(L - 0.001, ((pos % L) + L) % L); }
    const ev = BP.pattern().events;
    const same = ev.find(e => e.pad === pad && Math.abs(e.step - step) < 0.5 && (e.tune || 0) === (tune || 0));
    if (same) { same.velocity = Math.max(same.velocity, vel); same._skip = abs; }
    else { if (ev.length >= 512) return; ev.push({ pad, step, velocity: +vel.toFixed(2), tune: tune || 0, _skip: abs }); }
    changed('rec');
  }

  // ---------- step editing ----------
  BP.toggleStep = function (step) {
    pushUndo();
    const ev = BP.pattern().events, pad = BP.sel;
    const at = ev.findIndex(e => e.pad === pad && Math.round(e.step) === step && !(e.tune));
    if (at < 0) ev.push({ pad, step, velocity: 0.8, tune: 0 });
    else if (ev[at].velocity < 0.95) ev[at].velocity = 1;
    else ev.splice(at, 1);
    changed();
  };
  BP.stepState = function (pad) {
    const out = new Array(BP.steps()).fill(0);
    for (const e of BP.pattern().events) if (e.pad === pad) { const s = Math.round(e.step) % out.length; out[s] = Math.max(out[s], e.velocity); }
    return out;
  };

  // ---------- undo / clear / slots ----------
  function pushUndo() { BP.undoStack.push({ slot: BP.cur, bars: BP.pattern().bars, events: JSON.parse(JSON.stringify(BP.pattern().events)) }); if (BP.undoStack.length > 30) BP.undoStack.shift(); }
  BP.undo = function () {
    const u = BP.undoStack.pop(); if (!u) { say('Nothing to undo.'); return; }
    BP.patterns[u.slot] = { bars: u.bars, events: u.events }; say('Undone.'); changed();
  };
  BP.clear = function () { pushUndo(); BP.pattern().events = []; say('Pattern ' + BP.cur + ' cleared.'); changed(); };
  BP.setBars = function (n) { pushUndo(); const p = BP.pattern(); if (n === 2 && p.bars === 1) p.events = p.events.concat(p.events.map(e => Object.assign({}, e, { step: e.step + 16, _skip: undefined }))); if (n === 1) p.events = p.events.filter(e => e.step < 16); p.bars = n; say('Pattern ' + BP.cur + ': ' + n + (n === 1 ? ' bar' : ' bars')); changed(); };
  BP.copyTo = function (slot) { BP.patterns[slot] = JSON.parse(JSON.stringify(cleanPatterns()[BP.cur])); say('Copied ' + BP.cur + ' to ' + slot + '.'); changed(); };
  BP.selectSlot = function (slot) {
    if (!SLOTS.includes(slot) || slot === BP.cur) return;
    if (BP.playing) { BP.queued = slot; say('Pattern ' + slot + ' starts on the next bar.'); O.emit('bp-change', 'queue'); }
    else { BP.cur = slot; say('Pattern ' + slot + (BP.pattern().events.length ? '' : ' (empty)')); changed('slot'); }
  };

  // ---------- settings ----------
  BP.setKit = function (kit) { if (!KITS[kit]) return; BP.kit = kit; BP.loadKit().then(() => say(KITS[kit] + ' loaded.')); changed('kit'); };
  BP.setBpm = function (bpm) {
    bpm = Math.round(O.clamp(bpm, 60, 180)); if (bpm === BP.bpm) return;
    if (BP.playing && E.ctx) { const now = E.ctx.currentTime, pos = (now - BP.origin) / BP.unit(); BP.bpm = bpm; BP.origin = now - pos * BP.unit(); BP.k = Math.ceil(pos); restartBacking(); }
    else BP.bpm = bpm;
    changed('bpm');
  };
  BP.setSwing = v => { BP.swing = Math.round(O.clamp(v, 50, 75)); changed('swing'); };
  BP.toggle = function (name) { BP[name] = !BP[name]; if (name === 'backing') { if (BP.playing) BP.backing ? restartBacking() : M.stop(); } changed(name); };
  BP.setMode = m => { BP.mode = BP.mode === m ? 'play' : m; O.emit('bp-change', 'mode'); };
  BP.setNoteRepeat = v => { BP.noteRepeat = v; BP.held.clear(); O.emit('bp-change', 'nr'); };
  BP.setLevels16 = on => { BP.levels16 = on; O.emit('bp-change', 'mode'); };
  BP.setBackingStyle = s => { BP.backingStyle = s; if (BP.playing && BP.backing) restartBacking(); changed('backing'); };
  BP.backingStyleId = () => (BP.backingStyle === 'auto' ? O.game.styleFor() : M.resolve(BP.backingStyle));

  // ---------- transport ----------
  function openSession() { const g = E.ctx.createGain(); g.connect(E.nodes.sampler); return g; }
  function closeSession(g) { if (!g) return; try { g.gain.setTargetAtTime(0, E.ctx.currentTime, 0.01); } catch (e) {} setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 200); }
  function restartBacking() {
    if (!BP.backing || !E.ctx) return;
    const id = BP.backingStyleId();
    O.assets.ensure(M.assetsFor(id), 2000);
    M.start({ style: id, bpm: BP.bpm, origin: BP.origin, mode: 'jam' });
    M.ownedByBeatPad = true;
  }

  BP.play = async function (withCountIn) {
    if (BP.playing) return;
    if (O.game.state === 'running') O.game.pause('user');
    O.game.stopDemo && O.game.stopDemo();
    if (!(await E.ensureRunning())) { O.emit('needs-audio', 'sampler'); return; }
    await BP.loadKit();
    if (BP.backing) await O.assets.ensure(M.assetsFor(BP.backingStyleId()), 2500);
    const c = E.ctx, bar = BP.unit() * 16;
    BP.origin = c.currentTime + 0.12 + (withCountIn ? bar : 0);
    BP.k = 0; BP.playing = true; BP.countingIn = !!withCountIn;
    BP.session = openSession();
    if (withCountIn) for (let i = 0; i < 4; i++) click(BP.origin - bar + i * bar / 4, i === 0);
    if (BP.backing) restartBacking(); else if (M.playing && M.mode === 'jam') M.stop();
    BP.timer = setInterval(pump, 25); pump();
    say(withCountIn ? 'Count-in… recording starts on beat 1.' : 'Playing pattern ' + BP.cur + (BP.backing ? ' with backing.' : '.'));
    O.emit('bp-transport');
  };
  BP.stop = function () {
    if (BP.timer) clearInterval(BP.timer);
    BP.timer = 0; BP.playing = false; BP.rec = false; BP.countingIn = false; BP.queued = null;
    closeSession(BP.session); BP.session = null;
    if (M.ownedByBeatPad && M.playing) M.stop();
    M.ownedByBeatPad = false;
    O.emit('bp-transport');
  };
  BP.togglePlay = () => (BP.playing ? (BP.stop(), say('Stopped.')) : BP.play(false));
  BP.toggleRec = async function () {
    if (BP.rec) { BP.rec = false; say('Recording off. Your take is in pattern ' + BP.cur + '.'); O.emit('bp-transport'); return; }
    pushUndo();
    BP.rec = true;
    if (!BP.playing) await BP.play(true); else say('Recording into pattern ' + BP.cur + ' (overdub).');
    O.emit('bp-transport');
  };
  BP.stopAll = function () { BP.stop(); BP.held.clear(); if (M.playing && M.mode === 'jam') M.stop(); };

  function click(t, accent) {
    if (!E.ctx) return;
    Synth.blip(E.ctx, BP.session || E.nodes.sampler, t, accent ? 1568 : 1046, accent ? 0.26 : 0.16, 0.05);
  }

  // Free-running clock so note repeat works while stopped.
  let freeOrigin = null;
  function ensureClock() { if (!BP.playing && freeOrigin === null && E.ctx) { freeOrigin = E.ctx.currentTime + 0.01; if (!BP.timer) BP.timer = setInterval(pump, 20); } }

  let nrNext = 0;
  function pump() {
    const c = E.ctx; if (!c || c.state !== 'running') return;
    const now = c.currentTime, ahead = now + 0.16, unit = BP.unit();
    if (BP.playing) {
      const L = BP.steps(), sw = BP.swingOffset();
      while (BP.origin + BP.k * unit < ahead) {
        const K = BP.k, base = BP.origin + K * unit;
        if (K >= 0 && base >= now - 0.01) {
          const s = K % L;
          if (s === 0 && BP.queued) { BP.cur = BP.queued; BP.queued = null; O.emit('bp-change', 'slot'); }
          if (BP.countingIn && K >= 0) { BP.countingIn = false; say('Recording into pattern ' + BP.cur + '.'); }
          const P = BP.patterns[BP.cur], Lc = P.bars * 16, sc = K % Lc;
          for (const e of P.events) {
            if (Math.floor(e.step) !== sc || e._skip === K) continue;
            if (BP.solo !== null ? e.pad !== BP.solo : BP.mutes.has(e.pad)) continue;
            const frac = e.step - Math.floor(e.step);
            strike(e.pad, base + frac * unit + (frac === 0 && sc % 2 ? sw : 0), e.velocity, e.tune || 0, BP.session);
          }
          if (BP.metro && sc % 4 === 0) click(base, sc % 16 === 0);
        }
        BP.k++;
      }
    }
    // note repeat for held pads
    if (BP.noteRepeat && BP.held.size) {
      const org = BP.playing ? BP.origin : (freeOrigin === null ? (freeOrigin = now) : freeOrigin);
      const div = BP.noteRepeat, step = 240 / BP.bpm / div; // seconds per repeat
      let n = Math.max(Math.ceil((now + 0.005 - org) / step), nrNext);
      for (; org + n * step < ahead; n++) {
        const t = org + n * step;
        for (const h of BP.held.values()) if (t > h.from + 0.02) {
          strike(h.pad, t, h.vel, h.tune, BP.session || E.nodes.sampler);
          if (BP.rec && BP.playing) recordAt(h.pad, t, h.vel, h.tune);
        }
      }
      nrNext = n;
    } else { nrNext = 0; if (!BP.playing) { freeOrigin = null; if (BP.timer && !BP.held.size) { clearInterval(BP.timer); BP.timer = 0; } } }
  }
  function recordAt(pad, t, vel, tune) {
    const L = BP.steps(), pos = (t - BP.origin) / BP.unit(), abs = Math.round(pos), step = ((abs % L) + L) % L;
    const ev = BP.pattern().events;
    if (!ev.find(e => e.pad === pad && Math.round(e.step) === step)) ev.push({ pad, step: BP.quant ? step : pos % L, velocity: vel, tune: tune || 0, _skip: abs });
    changed('rec');
  }

  BP.position = function () { // for the display: bar.beat.sixteenth and current step
    if (!BP.playing || !E.ctx) return null;
    const pos = (E.heard() - BP.origin) / BP.unit(); if (pos < 0) return { countIn: Math.ceil(-pos / 4), step: -1 };
    const L = BP.steps(), s = Math.floor(pos) % L;
    return { step: s, bar: Math.floor(s / 16) + 1, beat: Math.floor((s % 16) / 4) + 1, six: (s % 4) + 1 };
  };

  // ---------- import / export ----------
  BP.toJSON = () => ({ format: 'orbit-sampler-pattern', version: 2, bank: BP.kit, bpm: BP.bpm, swing: BP.swing, bars: BP.pattern().bars, events: cleanPatterns()[BP.cur].events });
  BP.validate = function (p) {
    if (!p || p.format !== 'orbit-sampler-pattern' || !KITS[p.bank] || !Array.isArray(p.events) || p.events.length > 512) return false;
    const bars = p.version === 2 ? p.bars : 1; if (bars !== 1 && bars !== 2) return false;
    return p.events.every(x => x && Number.isInteger(x.pad) && x.pad >= 0 && x.pad < 16 && Number.isFinite(x.step) && x.step >= 0 && x.step < bars * 16 && (x.tune === undefined || (Number.isFinite(x.tune) && Math.abs(x.tune) <= 24)));
  };
  BP.importFile = async function (f) {
    try {
      if (!f || f.size > 100000) throw new Error('Select a pattern JSON under 100 KB.');
      let p; try { p = JSON.parse(await f.text()); } catch (e) { throw new Error('That file is not valid JSON.'); }
      if (!BP.validate(p)) throw new Error('Invalid pattern.');
      pushUndo();
      BP.stop();
      BP.patterns[BP.cur] = { bars: p.version === 2 ? p.bars : 1, events: p.events.map(x => ({ pad: x.pad, step: x.step, velocity: O.clamp(Number(x.velocity) || 1, 0.1, 1), tune: x.tune || 0 })) };
      if (p.bpm) BP.bpm = Math.round(O.clamp(p.bpm, 60, 180));
      if (p.swing) BP.swing = Math.round(O.clamp(p.swing, 50, 75));
      BP.setKit(p.bank);
      say('Imported ' + p.events.length + ' hits into pattern ' + BP.cur + '.');
      changed();
    } catch (err) { say(err.message); }
  };
  async function deliver(blob, name, title) {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'downloaded';
  }
  BP.exportPattern = async function () {
    const name = 'ORBIT-' + BP.kit + '-' + BP.cur + '-' + BP.bpm + 'bpm.json';
    const r = await deliver(new Blob([JSON.stringify(BP.toJSON(), null, 2)], { type: 'application/json' }), name, 'ORBIT pattern');
    if (r !== 'cancelled') say('Pattern ' + (r === 'shared' ? 'shared' : 'saved as ' + name) + '.');
  };

  // Render the current pattern (x loops) to a 16-bit stereo WAV, optionally with the backing track.
  BP.renderBuffer = async function (loops, withBacking) {
    if (!(await E.ensureRunning())) return null;
    await BP.loadKit();
    const style = BP.backingStyleId();
    if (withBacking) await O.assets.ensure(M.assetsFor(style), 4000);
    const P = BP.pattern(), unit = BP.unit(), L = P.bars * 16, sw = BP.swingOffset(), total = L * loops, secs = total * unit + 1.6;
    const kit = BP.kit;
    return M.renderOffline(style, BP.bpm, secs, {
      musicLevel: withBacking ? E.levels.music : 0, guide: 1,
      extra: (c, nodes) => {
        nodes.sampler.gain.value = E.levels.sampler * E.SCALE.sampler;
        for (let K = 0; K < total; K++) {
          const s = K % L, base = 0.05 + K * unit;
          for (const e of P.events) {
            if (Math.floor(e.step) !== s || (BP.solo !== null ? e.pad !== BP.solo : BP.mutes.has(e.pad))) continue;
            const p = BP.param(e.pad, kit), frac = e.step - Math.floor(e.step);
            Synth.kit(c, nodes.sampler, kit, e.pad, base + frac * unit + (frac === 0 && s % 2 ? sw : 0), { vel: O.clamp(e.velocity * p.level, 0, 1.5), tune: p.tune + (e.tune || 0), decay: p.decay });
          }
        }
      }
    });
  };
  BP.encodeWav = function (buf) {
    const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate, bytes = 44 + n * ch * 2, ab = new ArrayBuffer(bytes), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, bytes - 8, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([ab], { type: 'audio/wav' });
  };
  BP.bounce = async function (withBacking) {
    if (!BP.pattern().events.length) { say('Record or program a pattern first.'); return; }
    say('Rendering WAV…');
    const loops = BP.pattern().bars === 1 ? 4 : 2;
    const buf = await BP.renderBuffer(loops, withBacking);
    if (!buf) { say('Tap again to enable audio, then bounce.'); return; }
    const name = 'ORBIT-beat-' + BP.kit + '-' + BP.bpm + 'bpm.wav';
    const r = await deliver(BP.encodeWav(buf), name, 'ORBIT beat');
    if (r !== 'cancelled') say('Bounced ' + loops * BP.pattern().bars + ' bars to ' + name + (r === 'shared' ? ' (shared).' : '.'));
  };

  // A starter beat so the pads make sense on first open (boom bap, Dusty Kit, pattern A).
  if (!saved.patterns) {
    const ev = BP.patterns.A.events;
    [[0, 0, 1], [8, 0, 0.85], [10, 0, 0.6], [4, 1, 1], [12, 1, 1]].forEach(([s, p, v]) => ev.push({ pad: p, step: s, velocity: v, tune: 0 }));
    for (let s = 0; s < 16; s += 2) ev.push({ pad: 2, step: s, velocity: s % 4 === 0 ? 0.75 : 0.55, tune: 0 });
    ev.push({ pad: 3, step: 14, velocity: 0.5, tune: 0 });
  }

  O.on('app-hidden', () => { BP.stop(); BP.held.clear(); });
  O.on('audio-interrupted', () => { if (BP.playing) BP.stop(); });
  // Prefetch the current kit's bytes (decoding waits for audio unlock).
  O.assets.prefetch(O.assets.kitPaths(BP.kit));
  O.sampler = { stopAll: BP.stopAll }; // v2.0 name used by game.js
})();
