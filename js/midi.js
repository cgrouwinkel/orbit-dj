/* ORBIT DJ — real DJ controllers over Web MIDI (prototype).
 * MIDI learn: the player moves each control once and ORBIT stores which message it sends, so any class-compliant
 * controller works without a preset. Deck, mixer and pad moves call the same deck-engine functions as the screen,
 * so lessons, gigs and Club Night count them. On the Play tab, pads 1–4 of either deck play the four lanes.
 * Web MIDI exists in Chrome, Edge and Firefox on computers; Safari and every iPhone browser have none.
 */
(function () {
  'use strict';
  const O = window.ORBIT, D = O.decks, E = O.engine, $ = O.$, $$ = O.$$, clamp = O.clamp;
  const KEY = 'orbitV44Midi';
  const DECK = ['A', 'B'], SIDE = ['LEFT', 'RIGHT'];

  // ---------- what can be mapped ----------
  // kind: btn (press / release), abs (a knob or fader, 0–1), jog (relative wheel), touch (jog top, held)
  const CONTROLS = [];
  for (let i = 0; i < 2; i++) {
    const s = SIDE[i] + ' deck', g = 'DECK ' + DECK[i];
    CONTROLS.push(
      { id: 'play' + i, deck: i, group: g, kind: 'btn', name: 'PLAY / PAUSE', ask: 'Press PLAY on the ' + s + '.' },
      { id: 'cue' + i, deck: i, group: g, kind: 'btn', name: 'CUE', ask: 'Press CUE on the ' + s + '.' },
      { id: 'sync' + i, deck: i, group: g, kind: 'btn', name: 'SYNC', ask: 'Press SYNC on the ' + s + '. No SYNC button? Tap SKIP.' },
      { id: 'loop' + i, deck: i, group: g, kind: 'btn', name: 'LOOP ON / OFF', ask: 'Press the loop button (4 BEAT, LOOP or IN) on the ' + s + '. None? SKIP.' },
      { id: 'jog' + i, deck: i, group: g, kind: 'jog', name: 'JOG WHEEL', ask: 'Spin the ' + s + '’s jog wheel slowly clockwise: first by its side, then on top. Stop when the bar fills.' },
      { id: 'touch' + i, deck: i, group: g, kind: 'touch', name: 'JOG TOUCH (scratch)', ask: 'Rest your hand on top of the ' + s + '’s jog wheel, then lift it. Wheel has no touch sensor? SKIP.' },
      { id: 'tempo' + i, deck: i, group: g, kind: 'abs', tempo: true, name: 'TEMPO FADER', ask: 'Move the ' + s + '’s tempo fader to its FASTER (+) end and leave it there.' }
    );
    for (let n = 0; n < 8; n++) CONTROLS.push({ id: 'pad' + i + '_' + n, deck: i, group: g, kind: 'btn', pad: n, name: 'PAD ' + (n + 1), ask: n ? '' : 'Press PAD 1 (top left) on the ' + s + '. Pads 2 to 8 are filled in from it.' });
  }
  for (let i = 0; i < 2; i++) {
    const s = SIDE[i].toLowerCase() + ' channel (' + DECK[i] + ')', g = 'MIXER ' + DECK[i];
    CONTROLS.push(
      { id: 'gain' + i, deck: i, group: g, kind: 'abs', ch: 'gain', name: 'TRIM / GAIN', ask: 'Turn TRIM (gain) on the ' + s + ' all the way, then back. None? SKIP.' },
      { id: 'hi' + i, deck: i, group: g, kind: 'abs', ch: 'hi', name: 'EQ HI', ask: 'Turn HI on the ' + s + '.' },
      { id: 'mid' + i, deck: i, group: g, kind: 'abs', ch: 'mid', name: 'EQ MID', ask: 'Turn MID on the ' + s + '.' },
      { id: 'low' + i, deck: i, group: g, kind: 'abs', ch: 'low', name: 'EQ LOW', ask: 'Turn LOW on the ' + s + '.' },
      { id: 'filter' + i, deck: i, group: g, kind: 'abs', ch: 'filter', name: 'FILTER / CFX', ask: 'Turn the FILTER (or CFX) knob on the ' + s + '.' },
      { id: 'fader' + i, deck: i, group: g, kind: 'abs', ch: 'fader', name: 'CHANNEL FADER', ask: 'Move the ' + s + ' fader all the way down and back up.' },
      { id: 'hp' + i, deck: i, group: g, kind: 'btn', name: 'HEADPHONE CUE', ask: 'Press the headphone CUE button on the ' + s + '.' }
    );
  }
  CONTROLS.push({ id: 'xf', group: 'MIXER', kind: 'abs', name: 'CROSSFADER', ask: 'Slide the CROSSFADER from one end to the other.' });
  const BY = Object.fromEntries(CONTROLS.map(c => [c.id, c]));
  const WIZARD = CONTROLS.filter(c => c.ask);
  const JOG_TICKS = { slow: 900, normal: 450, fast: 225 }; // messages per full turn of the wheel

  // ---------- stored mapping ----------
  const blank = () => ({ v: 1, map: {}, jog: 'normal' });
  let cfg = blank();
  try { const s = O.store.get(KEY, null); if (s && s.v === 1 && s.map) cfg = Object.assign(blank(), s); } catch (e) {}
  const save = () => O.store.set(KEY, cfg);
  let index = new Map(); // message key -> control id
  function reindex() { index = new Map(); for (const [id, b] of Object.entries(cfg.map)) for (const k of b.keys) index.set(k, id); }
  reindex();
  function bind(id, b) { // one message key belongs to one control: taking it here frees it elsewhere
    for (const [oid, ob] of Object.entries(cfg.map)) { if (oid === id) continue; ob.keys = ob.keys.filter(k => !b.keys.includes(k)); if (!ob.keys.length) delete cfg.map[oid]; }
    cfg.map[id] = b; reindex(); save(); render();
  }
  function unbind(id) { delete cfg.map[id]; reindex(); save(); render(); }
  const keyText = k => { const [t, ch, n] = k.split(':'); return (t === 'n' ? 'Note ' + n : t === 'c' ? 'CC ' + n : 'Pitch bend') + ' · ch ' + (Number(ch) + 1); };

  // ---------- reading messages ----------
  // -> { key, press (btn), v (0–1), raw } or null for clock, sensing and other system messages
  function parse(data) {
    const st = data[0], type = st & 0xf0, ch = st & 0x0f;
    if (st >= 0xf0 || data.length < 2) return null;
    if (type === 0x90 || type === 0x80) return { key: 'n:' + ch + ':' + data[1], press: type === 0x90 && data[2] > 0, v: (type === 0x90 ? data[2] : 0) / 127, raw: data[2] || 0 };
    if (type === 0xb0) return { key: 'c:' + ch + ':' + data[1], press: data[2] >= 64, v: data[2] / 127, raw: data[2] };
    if (type === 0xe0) { const r = (data[2] << 7) | data[1]; return { key: 'p:' + ch + ':0', press: r >= 8192, v: r / 16383, raw: r, bend: true }; }
    return null;
  }

  const M = (O.midi = { supported: typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function', access: null, inputs: [], last: null, CONTROLS, cfg: () => cfg, bind, unbind, parse });
  let lastAt = 0;
  function onMessage(e) {
    const m = parse(e.data); if (!m) return;
    M.last = m; lastAt = performance.now(); activity();
    if (learn.on) { learnFeed(m); return; }
    const id = index.get(m.key); if (!id) return;
    act(BY[id], cfg.map[id], m, e.timeStamp);
  }
  function attach() {
    if (!M.access) return;
    M.inputs = Array.from(M.access.inputs.values());
    M.inputs.forEach(inp => { inp.onmidimessage = onMessage; });
    render();
  }
  M.connect = async function (quiet) {
    if (!M.supported) { render(); return false; }
    E.unlock(); // the tap on CONNECT is the gesture that lets sound start
    try {
      M.access = await navigator.requestMIDIAccess({ sysex: false });
      M.access.onstatechange = ev => { const before = M.inputs.length; attach(); if (ev && ev.port && ev.port.type === 'input' && ev.port.state === 'connected' && M.inputs.length > before) O.toast('Controller connected: ' + ev.port.name); };
      attach(); cfg.auto = true; save();
      if (!quiet) O.toast(M.inputs.length ? 'Listening to ' + M.inputs.map(i => i.name).join(', ') + '.' : 'MIDI is on, but no controller is plugged in yet. Plug it in by USB.');
      return true;
    } catch (err) { if (!quiet) O.toast('MIDI access was refused. Allow MIDI devices for this site in the browser, then tap CONNECT again.'); render(); return false; }
  };
  // Reconnect on load only where the browser has already granted MIDI, so no prompt appears unasked.
  if (M.supported && cfg.auto && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'midi' }).then(p => { if (p.state === 'granted') M.connect(true); }).catch(() => {});
  }

  // ---------- doing things ----------
  const DEFAULT_TRACK = ['neon', 'glass'];
  const picked = {}; // soft takeover: an absolute control acts only once the hardware meets the value on screen
  let playHint = false;
  function audio() { if (E.isRunning()) return true; E.unlock(); E.ensureRunning().then(ok => { if (!ok) O.emit('needs-audio', 'midi'); }); return E.isRunning(); }
  function needTrack(d) {
    if (d.buf || d.loading) return !!d.buf;
    const id = D.track(DEFAULT_TRACK[d.i]) ? DEFAULT_TRACK[d.i] : (D.library ? D.library()[d.i] || {} : {}).id;
    if (id) { D.load(d.i, id); O.toast('Loading ' + (D.track(id) || {}).title + ' on deck ' + DECK[d.i] + '. Press PLAY again when it is ready.'); }
    return false;
  }
  function swVal(c) { // where the screen has this control, 0–1, in hardware terms
    if (c.id === 'xf') return D.mixer.xf;
    const d = D.decks[c.deck];
    if (c.tempo) { const x = 0.5 + d.tempo / 2; return cfg.map[c.id] && cfg.map[c.id].inv ? 1 - x : x; }
    return d.ch[c.ch];
  }
  function absVal(m) { return m.bend ? (m.raw - 8192) / 8191 / 2 + 0.5 : m.raw === 64 ? 0.5 : m.v; } // exact centre for detented knobs
  function act(c, b, m, ts) {
    const view = O.ui && O.ui.view, d = c.deck !== undefined ? D.decks[c.deck] : null;
    if (view === 'play') { // the rhythm game: pads 1–4 play the lanes; the rest of the controller rests
      if (c.pad !== undefined && c.pad < 4) { if (m.press) audio(); O.ui.lanePress(c.pad, m.press, ts); }
      else if (!playHint && (m.press || c.kind === 'abs')) { playHint = true; O.toast('On the Play tab your controller’s pads 1 to 4 play the lanes. Open the Mix tab for the decks.'); }
      return;
    }
    if (c.kind === 'abs') {
      let v = absVal(m); const sw = swVal(c);
      let q = picked[c.id];
      if (q && q.ok && Math.abs(sw - q.sent) > 0.02) q = null; // the screen (or SYNC) moved it since: pick it up again
      if (!q) q = picked[c.id] = { ok: false };
      if (!q.ok) { if (Math.abs(v - sw) <= 0.07 || (q.prev !== undefined && (q.prev - sw) * (v - sw) <= 0)) q.ok = true; else { q.prev = v; return; } }
      q.sent = v;
      if (c.id === 'xf') D.setXf(v);
      else if (c.tempo) { const x = b.inv ? 1 - v : v; D.setTempo(d, (x - 0.5) * 2); }
      else D.set(c.deck, c.ch, v);
      return;
    }
    if (c.kind === 'jog') {
      if (!d.buf) return;
      const r = m.raw, delta = b.enc === 'twos' ? (r < 64 ? r : r - 128) : r - 64, now = performance.now();
      const dt = clamp((now - (d.midiJogAt || now - 16)) / 1000, 0.004, 0.1); d.midiJogAt = now;
      if (audio()) D.jog(d, delta / JOG_TICKS[cfg.jog || 'normal'], dt);
      return;
    }
    if (c.kind === 'touch') { if (!d.buf) return; if (m.press) { if (!audio()) return; d.jogHeld = true; D.jogStart(d); } else { d.jogHeld = false; D.jogEnd(d); } return; }
    // buttons
    if (c.id === 'hp' + c.deck) { if (m.press) D.set(c.deck, 'cue', !d.ch.cue); return; }
    if (c.pad !== undefined) { if (m.press) { if (!audio() || !needTrack(d)) return; D.padDown(d, c.pad); } else D.padUp(d); return; }
    if (c.id === 'cue' + c.deck) { if (m.press) { if (audio() && needTrack(d)) D.cueDown(d); } else if (d.buf) D.cueUp(d); return; }
    if (!m.press) return;
    if (c.id === 'play' + c.deck) { if (audio() && needTrack(d)) D.toggle(d); }
    else if (c.id === 'sync' + c.deck) { if (d.buf) D.toggleSync(d); }
    else if (c.id === 'loop' + c.deck) { if (d.buf) D.loopToggle(d); }
  }

  // ---------- MIDI learn ----------
  // Buttons are taken on their first press. Knobs, faders and wheels are collected until the hardware goes quiet,
  // so the most-moved message wins and the tempo fader's last value says which end is faster.
  const learn = { on: false, id: null, wizard: false, step: 0, seen: null, timer: 0, started: 0 };
  function learnStart(id, wizard) {
    Object.assign(learn, { on: true, id, wizard: !!wizard, seen: new Map(), started: 0 });
    clearTimeout(learn.timer); render();
  }
  function learnStop() { Object.assign(learn, { on: false, id: null, wizard: false }); clearTimeout(learn.timer); render(); }
  function learnFeed(m) {
    const c = BY[learn.id]; if (!c) return;
    if (learn.wizard) { const owner = index.get(m.key); if (owner && owner !== c.id) return; } // a hand still on the last control
    if (c.kind === 'btn' || c.kind === 'touch') { if (m.press) learnDone(c, { keys: [m.key] }); return; }
    if (m.key.startsWith('n:')) return; // a knob, fader or wheel sends controller changes, not notes
    const s = learn.seen.get(m.key) || { n: 0, vals: [] }; s.n++; s.vals.push(m.raw); s.last = m; learn.seen.set(m.key, s);
    if (!learn.started) learn.started = performance.now();
    clearTimeout(learn.timer);
    const total = Array.from(learn.seen.values()).reduce((a, x) => a + x.n, 0);
    if (c.kind === 'jog' && total >= 60) { learnFinish(); return; }
    learn.timer = setTimeout(learnFinish, c.kind === 'jog' ? 900 : 700);
    render();
  }
  function learnFinish() {
    const c = BY[learn.id]; if (!c || !learn.seen.size) return;
    let ent = Array.from(learn.seen.entries()).sort((a, b) => b[1].n - a[1].n);
    // 14-bit pairs send CC n and CC n+32 together: keep the coarse one
    const nums = new Set(ent.map(([k]) => k));
    ent = ent.filter(([k]) => { const [t, ch, n] = k.split(':'); return !(t === 'c' && Number(n) >= 32 && Number(n) < 64 && nums.has('c:' + ch + ':' + (Number(n) - 32))); });
    if (c.kind === 'jog') {
      const keys = ent.filter(([, s]) => s.n >= 3).map(([k]) => k).slice(0, 3);
      const vals = ent.flatMap(([, s]) => s.vals), nearMid = vals.filter(v => Math.abs(v - 64) <= 24).length;
      learnDone(c, { keys: keys.length ? keys : [ent[0][0]], enc: nearMid >= vals.length / 2 ? 'offset' : 'twos' });
    } else {
      const [k, s] = ent[0], b = { keys: [k] };
      if (c.tempo) b.inv = absVal(s.last) < 0.5;
      learnDone(c, b);
    }
  }
  function learnDone(c, b) {
    clearTimeout(learn.timer);
    bind(c.id, b);
    if (c.pad === 0) { // pads usually send consecutive notes: fill 2–8 where they are free
      const [t, ch, n] = b.keys[0].split(':');
      for (let k = 1; k < 8; k++) { const key = t + ':' + ch + ':' + (Number(n) + k), id = 'pad' + c.deck + '_' + k; if (!index.has(key) && !cfg.map[id] && Number(n) + k < 128) cfg.map[id] = { keys: [key], auto: true }; }
      reindex(); save();
    }
    flash('Got it: ' + c.name + ' = ' + keyText(b.keys[0]) + (b.inv ? ' (reversed)' : '') + (b.enc ? ' (' + (b.enc === 'offset' ? 'centre 64' : 'signed') + ')' : ''));
    if (learn.wizard) { learn.seen = new Map(); learn.started = 0; setTimeout(() => wizardGo(learn.step + 1), 450); }
    else learnStop();
  }
  function wizardGo(i) {
    if (!learn.on) return;
    if (i >= WIZARD.length) { learnStop(); O.toast('Controller mapped: ' + Object.keys(cfg.map).length + ' controls. Open the Mix tab and play.'); return; }
    learn.step = clamp(i, 0, WIZARD.length - 1); learn.id = WIZARD[learn.step].id; learn.seen = new Map(); learn.started = 0; clearTimeout(learn.timer); render();
  }
  M.learnStart = learnStart; M.learnStop = learnStop; M.wizard = () => { learnStart(WIZARD[0].id, true); learn.step = 0; render(); }; M.learn = learn;

  // ---------- the sheet ----------
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h !== undefined) n.innerHTML = h; return n; };
  let flashMsg = '', flashAt = 0;
  function flash(t) { flashMsg = t; flashAt = performance.now(); render(); }
  function activity() { const dot = $('#midi-dot'); if (dot) { dot.classList.add('is-on'); clearTimeout(dot._t); dot._t = setTimeout(() => dot.classList.remove('is-on'), 120); } const l = $('#midi-last'); if (l && M.last) l.textContent = keyText(M.last.key) + ' = ' + M.last.raw; }
  function render() {
    const sheet = $('#ov-midi'); if (!sheet || sheet.hidden) return;
    $('#midi-unsupported').hidden = M.supported; $('#midi-main').hidden = !M.supported;
    if (!M.supported) return;
    const on = !!M.access;
    $('#midi-connect').textContent = on ? 'RECONNECT' : 'CONNECT';
    $('#midi-status').textContent = !on ? 'Not connected. Plug the controller in by USB, then tap CONNECT.' : M.inputs.length ? 'Listening to ' + M.inputs.map(i => i.name).join(', ') + '.' : 'Connected, but no controller is plugged in.';
    $$('#midi-jog [data-jog]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.jog === (cfg.jog || 'normal'))));
    const w = $('#midi-wizard'); w.hidden = !learn.on;
    if (learn.on) {
      const c = BY[learn.id], seen = learn.seen ? Array.from(learn.seen.values()).reduce((a, x) => a + x.n, 0) : 0;
      $('#midi-step').textContent = learn.wizard ? 'STEP ' + (learn.step + 1) + ' OF ' + WIZARD.length + ' · ' + c.group : 'LEARN · ' + c.group;
      $('#midi-ask').textContent = c.ask || 'Press ' + c.name + ' on the ' + SIDE[c.deck] + ' deck.';
      $('#midi-wait').textContent = !seen ? 'Waiting for your controller…' : c.kind === 'jog' ? 'Keep spinning…' : 'Got movement. Let go when you are done.';
      $('#midi-bar').style.width = (c.kind === 'jog' ? Math.min(100, seen / 60 * 100) : seen ? 100 : 0) + '%';
      $('#midi-skip').hidden = !learn.wizard; $('#midi-back').hidden = !learn.wizard || !learn.step;
    }
    const f = $('#midi-flash'); f.textContent = flashMsg; f.hidden = !flashMsg || performance.now() - flashAt > 2500;
    $('#midi-count').textContent = Object.keys(cfg.map).length + ' of ' + CONTROLS.length + ' controls mapped';
    const list = $('#midi-list'); list.replaceChildren();
    let group = '';
    for (const c of CONTROLS) {
      if (c.group !== group) { group = c.group; list.append(el('h3', 'midi-group', group)); }
      const b = cfg.map[c.id], row = el('div', 'midi-row' + (learn.on && learn.id === c.id ? ' is-learning' : ''));
      row.append(el('b', '', c.name), el('span', 'midi-key', b ? keyText(b.keys[0]) + (b.keys.length > 1 ? ' +' + (b.keys.length - 1) : '') + (b.inv ? ' · reversed' : '') + (b.auto ? ' · from pad 1' : '') : '—'));
      const lb = el('button', 'btn btn-small', learn.on && learn.id === c.id ? 'LISTENING' : 'LEARN'); lb.addEventListener('click', () => learnStart(c.id, false));
      const xb = el('button', 'btn btn-small midi-x', '×'); xb.setAttribute('aria-label', 'Clear ' + c.name); xb.disabled = !b; xb.addEventListener('click', () => unbind(c.id));
      row.append(lb, xb); list.append(row);
    }
  }
  function open() { O.ui.openOverlay('ov-midi'); render(); activity(); }
  M.open = open; M.render = render;
  $('#set-midi').addEventListener('click', open);
  $('#midi-connect').addEventListener('click', () => M.connect(false));
  $('#midi-learn-all').addEventListener('click', () => { if (!M.access) { O.toast('Tap CONNECT first.'); return; } M.wizard(); });
  $('#midi-skip').addEventListener('click', () => wizardGo(learn.step + 1));
  $('#midi-back').addEventListener('click', () => wizardGo(learn.step - 1));
  $('#midi-stop').addEventListener('click', learnStop);
  $('#midi-jog').addEventListener('click', e => { const b = e.target.closest('[data-jog]'); if (b) { cfg.jog = b.dataset.jog; save(); render(); } });
  $('#midi-clear').addEventListener('click', () => { const sure = $('#midi-clear'); if (sure.dataset.armed) { cfg.map = {}; reindex(); save(); delete sure.dataset.armed; sure.textContent = 'CLEAR ALL'; render(); } else { sure.dataset.armed = '1'; sure.textContent = 'TAP AGAIN TO CLEAR'; setTimeout(() => { delete sure.dataset.armed; sure.textContent = 'CLEAR ALL'; }, 3000); } });
  $('#midi-copy').addEventListener('click', () => { const t = JSON.stringify({ v: 1, map: cfg.map, jog: cfg.jog }); $('#midi-json').value = t; try { navigator.clipboard.writeText(t).then(() => O.toast('Mapping copied.'), () => O.toast('Select the text below to copy it.')); } catch (e) { O.toast('Select the text below to copy it.'); } });
  $('#midi-apply').addEventListener('click', () => {
    try { const s = JSON.parse($('#midi-json').value); if (!s || s.v !== 1 || typeof s.map !== 'object') throw 0; cfg.map = s.map; cfg.jog = JOG_TICKS[s.jog] ? s.jog : 'normal'; reindex(); save(); render(); O.toast('Mapping loaded: ' + Object.keys(cfg.map).length + ' controls.'); }
    catch (e) { O.toast('That is not an ORBIT mapping. Paste the text from COPY MAPPING.'); }
  });
  setInterval(() => { const f = $('#midi-flash'); if (f && !f.hidden && performance.now() - flashAt > 2500) f.hidden = true; }, 500);
  O.on('overlay-closed', id => { if (id === 'ov-midi' && learn.on) learnStop(); });
})();
