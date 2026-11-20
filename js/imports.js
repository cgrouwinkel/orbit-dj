/* ORBIT DJ — import your own audio.
 * Files stay on this device (IndexedDB); nothing is uploaded. Each file is analysed once for tempo,
 * the position of beat 1 and where its drum hits fall, so it can be beatmatched on the decks and
 * played as a Quick Play set. The grid can be corrected by hand (half / double tempo, shift the downbeat).
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, D = O.decks, G = O.game, SG = O.songs, $ = O.$;
  const IM = (O.imports = { list: [], ready: null, MAX: 12, MAX_SECONDS: 480 });
  const uid = () => 'i' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

  // ---------- storage ----------
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => { const r = indexedDB.open('orbit-dj', 1); r.onupgradeneeded = () => { r.result.createObjectStore('imports', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return dbp;
  }
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('imports', mode), q = fn(t.objectStore('imports')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }));
  IM.ready = tx('readonly', s => s.getAll()).then(rows => { IM.list = (rows || []).map(r => { const m = Object.assign({}, r); delete m.bytes; return m; }).sort((a, b) => a.added - b.added); O.emit('imports'); }).catch(() => { IM.list = []; });
  const bytesOf = id => tx('readonly', s => s.get(id)).then(r => { if (!r) throw new Error('missing'); return r.bytes; });
  const putMeta = async m => { const bytes = await bytesOf(m.id); await tx('readwrite', s => s.put(Object.assign({}, m, { bytes }))); };

  // ---------- analysis ----------
  // Returns { bpm, first (seconds of a bar-1 downbeat), onsets: { low, mid, high } as Float32Arrays at 100 Hz }.
  IM.analyse = function (buf) {
    const sr = buf.sampleRate, a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, hop = Math.round(sr / 100), n = Math.floor(a.length / hop);
    const env = { low: new Float32Array(n), mid: new Float32Array(n), high: new Float32Array(n) };
    // three one-pole bands: below ~150 Hz, 150 Hz - 4 kHz, above ~6 kHz
    const kl = 1 - Math.exp(-2 * Math.PI * 150 / sr), km = 1 - Math.exp(-2 * Math.PI * 4000 / sr), kh = 1 - Math.exp(-2 * Math.PI * 6000 / sr);
    let l = 0, m = 0, h = 0;
    for (let j = 0; j < n; j++) {
      let el = 0, em = 0, eh = 0; const i0 = j * hop;
      for (let i = i0; i < i0 + hop; i++) { const x = (a[i] + b[i]) * 0.5; l += kl * (x - l); m += km * (x - m); h += kh * (x - h); const mid = m - l, hi = x - h; el += l * l; em += mid * mid; eh += hi * hi; }
      env.low[j] = Math.sqrt(el / hop); env.mid[j] = Math.sqrt(em / hop); env.high[j] = Math.sqrt(eh / hop);
    }
    // onset strength: positive change of the log envelope
    const on = {}, flux = new Float32Array(n);
    for (const k of ['low', 'mid', 'high']) { const e = env[k], o = (on[k] = new Float32Array(n)); let mx = 1e-9; for (let j = 0; j < n; j++) if (e[j] > mx) mx = e[j]; for (let j = 1; j < n; j++) { const d = Math.log(1 + 50 * e[j] / mx) - Math.log(1 + 50 * e[j - 1] / mx); o[j] = d > 0 ? d : 0; } }
    for (let j = 0; j < n; j++) flux[j] = on.low[j] * 1.5 + on.mid[j] + on.high[j] * 0.5;
    // tempo: score every tempo from 70 to 180 BPM by how much onset energy falls on its beat grid (best phase)
    const at = t => { const x = t * 100, i = Math.floor(x); return i < 0 || i + 1 >= n ? 0 : flux[i] + (flux[i + 1] - flux[i]) * (x - i); };
    const dur = n / 100, comb = (bpm, phase, step) => { let s = 0, c = 0; const p = 60 / bpm; for (let t = phase; t < dur; t += p * (step || 1)) { s += Math.max(at(t), at(t - 0.01), at(t + 0.01)); c++; } return c ? s / c : 0; };
    const bestPhase = (bpm, res) => { const p = 60 / bpm; let best = 0, bs = -1; for (let k = 0; k < res; k++) { const ph = k * p / res, s = comb(bpm, ph); if (s > bs) { bs = s; best = ph; } } return [best, bs]; };
    let bpm = 120, score = -1;
    for (let t = 70; t <= 180; t += 0.5) { const s = bestPhase(t, 16)[1] * (t >= 85 && t <= 150 ? 1 : 0.85); if (s > score) { score = s; bpm = t; } }
    for (let pass = 0, span = 0.5, step = 0.05; pass < 2; pass++, span = 0.06, step = 0.005) { let bb = bpm, bs = -1; for (let t = bpm - span; t <= bpm + span + 1e-9; t += step) { const s = bestPhase(t, 24)[1]; if (s > bs) { bs = s; bb = t; } } bpm = bb; }
    let phase = bestPhase(bpm, 48)[0];
    // downbeat: of the four beats, the one whose bar positions carry the most low-end onsets
    const p = 60 / bpm; let first = phase, ds = -1;
    for (let k = 0; k < 4; k++) { let s = 0, c = 0; for (let t = phase + k * p; t < dur; t += 4 * p) { const j = Math.round(t * 100); if (j >= 0 && j < n) { s += Math.max(on.low[j] || 0, on.low[j - 1] || 0, on.low[j + 1] || 0); c++; } } s = c ? s / c : 0; if (s > ds) { ds = s; first = phase + k * p; } }
    while (first - 4 * p >= 0) first -= 4 * p;
    // Most produced music sits on a whole-number tempo, so a reading within 0.12 BPM of one snaps to it (a 0.06 BPM error drifts about 60 ms over two minutes).
    const whole = Math.round(bpm); if (Math.abs(bpm - whole) <= 0.12) bpm = whole;
    return { bpm: Math.round(bpm * 100) / 100, first, onsets: on, confidence: score };
  };
  // Notes for a Quick Play set: onsets snapped to the grid. Low band = kick lane, mid = snare lane, high = hat lane.
  IM.chart = function (m, on, leadIn, bars, diff) {
    const unit = 60 / m.bpm / 4, grid = diff === 'expert' ? 1 : 2, notes = [], n = on.low.length;
    const peak = (o, t) => { const j = Math.round(t * 100); let v = 0; for (let k = j - 3; k <= j + 3; k++) if (k >= 0 && k < n && o[k] > v) v = o[k]; return v; };
    const thr = {}; for (const k of ['low', 'mid', 'high']) { const v = Array.from(on[k]).filter(x => x > 0).sort((x, y) => x - y); thr[k] = v.length ? v[Math.floor(v.length * (k === 'high' ? 0.93 : 0.9))] : 1; }
    for (let s = 0; s < bars * 16; s += grid) {
      const t = m.first + s * unit, lo = peak(on.low, t) / thr.low, mi = peak(on.mid, t) / thr.mid, hi = peak(on.high, t) / thr.high;
      let lane = -1;
      if (lo >= 1 && lo >= mi * 0.8) lane = 0; else if (mi >= 1) lane = 1; else if (hi >= 1 && diff !== 'easy') lane = 2;
      if (lane < 0 || (diff === 'easy' && s % 4)) continue;
      notes.push({ t: leadIn + s * unit, lane, done: false, bar: Math.floor(s / 16) });
      if (diff === 'expert' && lane === 0 && mi >= 1.3) notes.push({ t: leadIn + s * unit, lane: 1, done: false, bar: Math.floor(s / 16) });
    }
    const glow = b => b % 8 === 1 || b % 8 === 5; notes.forEach(x => { if (glow(x.bar)) x.hype = x.bar; });
    notes.push({ t: leadIn + bars * 16 * unit, lane: 0, done: false, bar: bars, finale: true });
    return notes;
  };

  // ---------- import ----------
  const decoded = new Map(); // id -> Promise<{ buf, an }>
  function decode(id) {
    const key = E.generation + '|' + id;
    if (!decoded.has(key)) decoded.set(key, bytesOf(id).then(ab => new Promise((res, rej) => E.ctx.decodeAudioData(ab.slice(0), res, rej))).then(buf => ({ buf, an: IM.analyse(buf) })).catch(e => { decoded.delete(key); throw e; }));
    return decoded.get(key);
  }
  IM.add = async function (file) {
    if (IM.list.length >= IM.MAX) { O.toast('You can keep ' + IM.MAX + ' imported tracks. Delete one first.'); return null; }
    if (!E.isRunning()) { E.unlock(); if (!(await E.ensureRunning())) { O.emit('needs-audio', 'mix'); return null; } }
    O.toast('Reading “' + file.name + '”…');
    let bytes, buf;
    try { bytes = await file.arrayBuffer(); buf = await new Promise((res, rej) => E.ctx.decodeAudioData(bytes.slice(0), res, rej)); }
    catch (e) { O.toast('That file could not be read as audio. Try an MP3, M4A or WAV.'); return null; }
    if (buf.duration < 20) { O.toast('That clip is under 20 seconds: too short to mix or play.'); return null; }
    if (buf.duration > IM.MAX_SECONDS) { O.toast('Tracks up to 8 minutes are supported.'); return null; }
    const an = IM.analyse(buf), id = uid();
    const m = { id, name: file.name.replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 60) || 'Imported track', bpm: an.bpm, first: an.first, duration: buf.duration, added: Date.now() };
    try { await tx('readwrite', s => s.put(Object.assign({}, m, { bytes }))); }
    catch (e) { O.toast('Could not save the track on this device (storage may be full).'); return null; }
    decoded.set(E.generation + '|' + id, Promise.resolve({ buf, an }));
    IM.list.push(m); O.emit('imports');
    O.toast('Imported “' + m.name + '”: ' + m.bpm.toFixed(1) + ' BPM. If the beat marks look wrong, fix the grid in the track list.');
    return m;
  };
  IM.remove = async function (id) { await tx('readwrite', s => s.delete(id)); IM.list = IM.list.filter(m => m.id !== id); O.emit('imports'); };
  // Grid fixes: 'half' | 'double' tempo, or shift the downbeat by one beat ('shift').
  IM.fix = async function (id, what) {
    const m = IM.list.find(x => x.id === id); if (!m) return;
    if (what === 'half' && m.bpm >= 120) m.bpm = Math.round(m.bpm * 50) / 100; else if (what === 'double' && m.bpm <= 100) m.bpm = Math.round(m.bpm * 200) / 100;
    else if (what === 'shift') { const p = 60 / m.bpm; m.first += p; while (m.first - 4 * p >= 0) m.first -= 4 * p; }
    m.rev = (m.rev || 0) + 1;
    await putMeta(m); O.emit('imports');
  };

  // ---------- decks ----------
  const bars = m => Math.max(4, Math.floor((m.duration - m.first) / (240 / m.bpm)));
  IM.deckTrack = m => ({ id: 'imp:' + m.id + ':' + (m.rev || 0), title: m.name, style: 'house', sub: 'Imported · ' + Math.floor(m.duration / 60) + ':' + String(Math.round(m.duration % 60)).padStart(2, '0'), bpm: m.bpm, key: '', bars: bars(m),
    sections: [{ sec: 'track', bar: 0, bars: bars(m) }], imported: m.id, first: m.first, render: () => decode(m.id).then(r => r.buf) });
  D.imports = () => IM.list.map(IM.deckTrack);

  // ---------- Quick Play ----------
  IM.custom = m => ({ id: 'imp:' + m.id, name: m.name, style: 'house', bpm: m.bpm, rows: null, song: null, audio: { id: m.id, first: m.first }, bars: Math.min(bars(m), Math.max(8, Math.round(90 / (240 / m.bpm) / 4) * 4)),
    prepare: async function () { const r = await decode(m.id); this.audio.buffer = r.buf; this.onsets = r.an.onsets; }, chart: function (diff, leadIn) { return IM.chart(m, this.onsets, leadIn, this.bars, diff); } });
  SG.imports = () => IM.list.map(IM.custom);

  // ---------- UI: one hidden file input, opened from the track picker and Quick Play ----------
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac'; input.hidden = true; input.id = 'import-file'; document.body.append(input);
  input.addEventListener('change', async () => { const f = input.files && input.files[0]; input.value = ''; if (f) await IM.add(f); });
  IM.pick = () => { E.unlock(); input.click(); };
  document.querySelectorAll('[data-import]').forEach(b => b.addEventListener('click', IM.pick));
})();
