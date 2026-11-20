/* ORBIT DJ — Mix tab interface: two decks, mixer, waveforms, lesson coach, plus the Beats tab trainer. */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, D = O.decks, SC = O.school, BP = O.beatpad, $ = O.$, $$ = O.$$, clamp = O.clamp;
  const ui = O.ui, wake = () => ui.wake();
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtTime = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const SECNAME = { mixin: 'MIX IN', intro: 'INTRO', verse: 'VERSE', build: 'BUILD', drop: 'DROP', break: 'BREAK', drop2: 'DROP 2', mixout: 'MIX OUT', outro: 'OUTRO', track: 'TRACK' };

  // ---------- custom controls: knobs and faders (relative drag, double-tap resets) ----------
  const ctls = [];
  function ctl(node, o) { // o: { kind: 'knob' | 'v' | 'h', get, set, def, label, name }
    node.classList.add('ctl', 'ctl-' + o.kind);
    node.setAttribute('role', 'slider'); node.setAttribute('aria-label', o.name || o.label || ''); node.setAttribute('aria-valuemin', '0'); node.setAttribute('aria-valuemax', '100'); node.tabIndex = 0;
    node.innerHTML = o.kind === 'knob' ? '<i class="kn-dial"><i></i></i><small>' + (o.label || '') + '</small>' : '<i class="sl-track"></i><i class="sl-thumb"></i>';
    const c = { node, o, last: null, part: node.querySelector(o.kind === 'knob' ? '.kn-dial' : '.sl-thumb') };
    let drag = null, lastTap = 0;
    node.addEventListener('pointerdown', e => {
      e.preventDefault(); const now = performance.now();
      if (now - lastTap < 300 && o.def !== undefined) { o.set(o.def); lastTap = 0; render(c); wake(); return; }
      lastTap = now;
      const r = node.getBoundingClientRect();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, v: o.get(), span: o.kind === 'knob' ? 130 : o.kind === 'v' ? Math.max(40, r.height - 26) : Math.max(40, r.width - 30) };
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      node.classList.add('is-held');
    });
    node.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = o.kind === 'h' ? (e.clientX - drag.x) / drag.span : (drag.y - e.clientY) / drag.span;
      let v = clamp(drag.v + d, 0, 1);
      if (o.def !== undefined && Math.abs(v - o.def) < 0.025) v = o.def; // small detent at the default
      o.set(v); render(c); wake();
    });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; node.classList.remove('is-held'); } };
    node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
    node.addEventListener('keydown', e => { const k = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key]; if (k) { e.preventDefault(); o.set(clamp(o.get() + k, 0, 1)); render(c); wake(); } });
    ctls.push(c); render(c);
    return c;
  }
  function render(c) {
    const v = c.o.get(); if (v === c.last) return; c.last = v;
    if (c.o.kind === 'knob') c.part.style.transform = 'rotate(' + (v * 270 - 135).toFixed(1) + 'deg)';
    else if (c.o.kind === 'v') c.part.style.bottom = 'calc(' + (v * 100).toFixed(1) + '% - ' + (v * 26).toFixed(1) + 'px)';
    else c.part.style.left = 'calc(' + (v * 100).toFixed(1) + '% - ' + (v * 30).toFixed(1) + 'px)';
    c.node.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    c.node.classList.toggle('is-off', c.o.def !== undefined && Math.abs(v - c.o.def) > 0.02);
  }
  const renderCtls = () => ctls.forEach(render);
  // press-and-hold button helper
  function hold(btn, down, up) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (err) {} btn.classList.add('is-down'); down(e); wake(); });
    const end = e => { if (!btn.classList.contains('is-down')) return; btn.classList.remove('is-down'); if (up) up(e); wake(); };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }
  const needAudio = async () => { if (E.isRunning()) return true; E.unlock(); const ok = await E.ensureRunning(); if (!ok) O.emit('needs-audio', 'mix'); return ok; };

  // ---------- decks ----------
  const dk = D.decks.map(d => {
    const root = $('#dk-' + d.i), u = { d, root, shift: false };
    root.innerHTML =
      '<div class="dk-head"><button class="dk-load" aria-label="Load a track on deck ' + d.name + '"><b>' + d.name + '</b><span class="dk-title">TAP TO LOAD</span></button><span class="dk-bpm">—</span><span class="dk-where"></span></div>' +
      '<div class="dk-prog" aria-hidden="true"><i></i></div>' +
      '<div class="dk-main">' +
        '<div class="dk-page dk-jogpage"><div class="jog" role="slider" aria-label="Jog wheel deck ' + d.name + '"><i class="jog-plate"><i></i></i><span class="jog-time">0:00</span></div>' +
          '<div class="dk-side"><button class="btn" data-a="bend+" aria-label="Nudge faster">+</button><button class="btn" data-a="bend-" aria-label="Nudge slower">−</button><button class="btn" data-a="half" aria-label="Halve loop">½</button><button class="btn" data-a="double" aria-label="Double loop">×2</button></div>' +
          '<div class="dk-tempo"><small>−</small><div class="vs"></div><small>+</small></div></div>' +
        '<div class="dk-page dk-padpage" hidden><div class="pad-modes"></div><div class="dj-pads"></div></div>' +
      '</div>' +
      '<div class="dk-transport"><button class="btn tb-cue">CUE</button><button class="btn tb-play" aria-label="Play or pause"><svg><use href="#i-play"/></svg></button><button class="btn tb-sync" aria-pressed="false">SYNC</button><button class="btn tb-loop" aria-pressed="false">LOOP<small>4</small></button><button class="btn tb-pads" aria-pressed="false">PADS</button></div>';
    const q = s => root.querySelector(s);
    Object.assign(u, { title: q('.dk-title'), bpm: q('.dk-bpm'), where: q('.dk-where'), prog: q('.dk-prog i'), jog: q('.jog'), plate: q('.jog-plate'), time: q('.jog-time'),
      jogPage: q('.dk-jogpage'), padPage: q('.dk-padpage'), modes: q('.pad-modes'), pads: q('.dj-pads'), play: q('.tb-play'), sync: q('.tb-sync'), loop: q('.tb-loop'), padsBtn: q('.tb-pads') });
    q('.dk-load').addEventListener('click', () => openTracks(d.i));
    // tempo fader: like real decks, towards you (down) is faster
    ctl(q('.vs'), { kind: 'v', name: 'Tempo deck ' + d.name, def: 0.5, get: () => 0.5 - d.tempo / 2, set: v => D.setTempo(d, (0.5 - v) * 2) });
    hold(q('.tb-cue'), () => { needAudio().then(ok => { if (ok) D.cueDown(d); }); }, () => D.cueUp(d));
    u.play.addEventListener('click', () => { E.unlock(); if (!d.buf) { openTracks(d.i); return; } D.toggle(d); });
    u.sync.addEventListener('click', () => D.toggleSync(d));
    u.loop.addEventListener('click', () => D.loopToggle(d));
    u.padsBtn.addEventListener('click', () => { showPads(u, u.padPage.hidden); });
    root.querySelectorAll('[data-a]').forEach(b => {
      const a = b.dataset.a;
      if (a === 'bend+' || a === 'bend-') hold(b, () => D.nudge(d, a === 'bend+' ? 1 : -1), () => D.nudge(d, 0));
      else b.addEventListener('click', () => D.loopScale(d, a === 'half' ? 0.5 : 2));
    });
    // jog: drag around the centre
    let jp = null;
    const ang = e => { const r = u.jog.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    u.jog.addEventListener('pointerdown', e => { e.preventDefault(); if (!d.buf) return; try { u.jog.setPointerCapture(e.pointerId); } catch (err) {} jp = { id: e.pointerId, a: ang(e), t: performance.now() }; d.jogHeld = true; D.jogStart(d); u.jog.classList.add('is-held'); wake(); });
    u.jog.addEventListener('pointermove', e => {
      if (!jp || e.pointerId !== jp.id) return;
      const a = ang(e), now = performance.now(); let da = a - jp.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const dt = (now - jp.t) / 1000; if (dt < 0.012 && Math.abs(da) < 0.05) return;
      jp.a = a; jp.t = now; D.jog(d, da / (2 * Math.PI), dt); wake();
    });
    const jend = e => { if (jp && e.pointerId === jp.id) { jp = null; d.jogHeld = false; D.jogEnd(d); u.jog.classList.remove('is-held'); wake(); } };
    u.jog.addEventListener('pointerup', jend); u.jog.addEventListener('pointercancel', jend);
    // performance pads
    Object.keys(D.PAD_MODES).forEach(m => { const b = el('button', 'btn pm', D.PAD_MODES[m].label); b.dataset.mode = m; b.addEventListener('click', () => D.setPadMode(d, m)); u.modes.append(b); });
    const del = el('button', 'btn pm pm-del', 'DEL'); del.setAttribute('aria-pressed', 'false'); del.addEventListener('click', () => { u.shift = !u.shift; renderDeck(u); }); u.modes.append(del);
    for (let n = 0; n < 8; n++) { const b = el('button', 'dj-pad'); b.dataset.n = n; hold(b, () => { needAudio().then(ok => { if (!ok) return; D.padDown(d, n, u.shift); if (u.shift) { u.shift = false; } renderDeck(u); }); }, () => D.padUp(d)); u.pads.append(b); }
    return u;
  });
  function showPads(u, on) { u.padPage.hidden = !on; u.jogPage.hidden = on; u.padsBtn.setAttribute('aria-pressed', String(on)); u.padsBtn.textContent = on ? 'JOG' : 'PADS'; }
  function renderDeck(u) {
    const d = u.d, T = d.track;
    u.title.textContent = d.loading ? 'LOADING…' : T ? T.title : 'TAP TO LOAD';
    u.root.classList.toggle('is-playing-deck', d.playing); u.root.classList.toggle('is-empty', !T);
    u.play.querySelector('use').setAttribute('href', d.playing ? '#i-pause' : '#i-play');
    u.play.classList.toggle('is-on', d.playing);
    u.sync.setAttribute('aria-pressed', String(d.sync)); u.sync.classList.toggle('is-on', d.sync);
    const looping = !!d.loop && !d.loop.roll;
    u.loop.setAttribute('aria-pressed', String(looping)); u.loop.classList.toggle('is-on', looping);
    const lb = d.loop ? d.loop.beats : d.loopBeats; u.loop.querySelector('small').textContent = lb >= 1 ? String(lb) : '1/' + Math.round(1 / lb);
    u.modes.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('is-on', b.dataset.mode === d.padMode));
    const del = u.modes.querySelector('.pm-del'); del.hidden = d.padMode !== 'hotcue'; del.classList.toggle('is-on', u.shift); del.setAttribute('aria-pressed', String(u.shift));
    u.pads.querySelectorAll('.dj-pad').forEach((b, n) => { b.textContent = D.padLabel(d, n); b.classList.toggle('is-lit', D.padLit(d, n)); b.dataset.mode = d.padMode; });
    u.bpmKey = '';
  }
  function frameDeck(u) {
    const d = u.d, T = d.track;
    if (!T) { if (u.bpmKey !== 'none') { u.bpmKey = 'none'; u.bpm.textContent = '—'; u.where.textContent = ''; u.time.textContent = '0:00'; u.prog.style.width = '0%'; } return; }
    const pos = D.heardPos(d), w = D.where(d, pos), bpm = D.bpm(d).toFixed(1), rem = fmtTime(D.remaining(d));
    const key = bpm + '|' + (w ? w.sec + w.bar + w.beat : '') + '|' + rem;
    if (key !== u.bpmKey) {
      u.bpmKey = key;
      u.bpm.textContent = bpm; u.bpm.classList.toggle('is-shift', Math.abs(d.tempo) > 0.004);
      u.where.innerHTML = w ? SECNAME[w.sec] + ' <b>' + w.phraseBar + '</b>/8·' + w.beat : '';
      u.where.classList.toggle('is-top', !!w && w.phraseBar === 8);
      u.time.textContent = '-' + rem;
      u.prog.style.width = clamp((pos - T.first) / (T.bars * 4 * T.beat) * 100, 0, 100).toFixed(1) + '%';
    }
    u.plate.style.transform = 'rotate(' + ((pos / 1.8) * 360 % 360).toFixed(1) + 'deg)';
  }
  O.on('deck', e => { renderDeck(dk[e.deck]); renderCtls(); wake(); });

  // ---------- mixer ----------
  const KNOBS = [['gain', 'GAIN'], ['hi', 'HI'], ['mid', 'MID'], ['low', 'LOW'], ['filter', 'FILTER']];
  const meters = [];
  $$('.mx-col').forEach(col => { const i = Number(col.dataset.ch), d = D.decks[i]; KNOBS.forEach(([k, label]) => { const n = el('div', 'kn'); n.dataset.knob = k; col.append(n); ctl(n, { kind: 'knob', label, name: label + ' deck ' + d.name, def: 0.5, get: () => d.ch[k], set: v => D.set(i, k, v) }); }); });
  $$('.mx-fader').forEach(col => { const i = Number(col.dataset.ch), d = D.decks[i]; const m = el('div', 'mx-meter', '<i></i>'), f = el('div', 'vs'); col.append(m, f); meters[i] = m.firstChild; ctl(f, { kind: 'v', name: 'Channel fader deck ' + d.name, get: () => d.ch.fader, set: v => D.set(i, 'fader', v) }); });
  ctl($('#mx-xfader'), { kind: 'h', name: 'Crossfader', def: 0.5, get: () => D.mixer.xf, set: v => D.setXf(v) });
  ctl($('#fx-amt'), { kind: 'knob', label: 'FX', name: 'FX amount', get: () => D.mixer.fx.amount, set: v => D.setFx({ amount: v }) });
  ctl($('#mx-vol'), { kind: 'knob', label: 'MASTER', name: 'Master volume', def: 0.8, get: () => D.mixer.master, set: v => D.setMaster(v) });
  // one button steps through the FX presets: echo at half / one / two beats, reverb, flanger
  const FX_PRESETS = [['echo', 0.5, 'ECHO ½'], ['echo', 1, 'ECHO 1'], ['echo', 2, 'ECHO 2'], ['reverb', 1, 'REVERB'], ['flanger', 1, 'FLANGE']];
  const fxIndex = () => Math.max(0, FX_PRESETS.findIndex(p => p[0] === D.mixer.fx.type && (p[0] !== 'echo' || p[1] === D.mixer.fx.beats)));
  $('#fx-type').addEventListener('click', () => { const p = FX_PRESETS[(fxIndex() + 1) % FX_PRESETS.length]; D.setFx({ type: p[0], beats: p[1] }); });
  [0, 1].forEach(i => {
    $('#fx-' + i).addEventListener('click', () => D.set(i, 'fx', !D.decks[i].ch.fx));
    $('#hp-' + i).addEventListener('click', () => { D.set(i, 'cue', !D.decks[i].ch.cue); if (D.decks[i].ch.cue && !D.mixer.split) O.toast('Headphone cue is heard in SPLIT mode: turn SPLIT on with headphones in.'); });
  });
  $('#hp-split').addEventListener('click', () => { D.setSplit(!D.mixer.split); if (D.mixer.split) O.toast('SPLIT on: left ear = cued deck, right ear = the mix. Use headphones.'); });
  function renderMixer() {
    const fx = D.mixer.fx;
    $('#fx-type').textContent = FX_PRESETS[fxIndex()][2];
    [0, 1].forEach(i => { const c = D.decks[i].ch; for (const [id, on] of [['fx-' + i, c.fx], ['hp-' + i, c.cue]]) { const b = $('#' + id); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); } });
    const s = $('#hp-split'); s.classList.toggle('is-on', D.mixer.split); s.setAttribute('aria-pressed', String(D.mixer.split));
    renderCtls();
  }
  O.on('mix', () => { renderMixer(); wake(); });
  const mm = $$('#mx-master i');
  function frameMeters() {
    [0, 1].forEach(i => { const v = D.level(i), m = meters[i]; m.style.height = clamp(v / 1.3 * 100, 0, 100).toFixed(0) + '%'; m.className = v > 1.05 ? 'red' : v > 0.8 ? 'amber' : ''; });
    const v = D.level(2); mm.forEach(m => { m.style.height = clamp(v / 1.5 * 100, 0, 100).toFixed(0) + '%'; m.className = v > 1.35 ? 'red' : v > 1.0 ? 'amber' : ''; });
  }

  // ---------- waveforms ----------
  const wv = { cv: $('#mix-wave'), ctx: null, w: 0, h: 0, dpr: 1, pal: null };
  wv.ctx = wv.cv.getContext('2d');
  function sizeWave() {
    const r = wv.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    wv.w = r.width; wv.h = r.height; wv.dpr = dpr;
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (wv.cv.width !== W || wv.cv.height !== H) { wv.cv.width = W; wv.cv.height = H; }
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    wv.pal = { a: v('--lane0'), b: v('--lane1'), bg: v('--hw-bg'), ink: v('--ink'), good: v('--good'), bad: v('--bad'), hype: v('--hype') };
  }
  function drawWave() {
    const c = wv.ctx, W = wv.w, H = wv.h, P = wv.pal; if (!W || !P) return;
    c.setTransform(wv.dpr, 0, 0, wv.dpr, 0, 0);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const cx = Math.round(W * 0.42), pps = W / 6.5, half = H / 2;
    D.decks.forEach((d, i) => {
      const y0 = i * half, mid = y0 + half / 2, col = i ? P.b : P.a, T = d.track;
      if (!T || !d.peaks) { c.fillStyle = 'rgba(255,255,255,.25)'; c.font = '700 10px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DECK ' + d.name + (d.loading ? ' · LOADING' : ' · EMPTY'), W / 2, mid); return; }
      const pos = D.heardPos(d), rate = 1 + d.tempo * D.RANGE, pk = d.peaks.pk, lo = d.peaks.lo, per = d.peaks.per, amp = half * 0.47;
      const tAt = x => pos + (x - cx) / pps * rate, xAt = t => cx + (t - pos) / rate * pps;
      if (d.loop) { const x0 = Math.max(0, xAt(d.loop.a)), x1 = Math.min(W, xAt(d.loop.b)); if (x1 > x0) { c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x0, y0 + 1, x1 - x0, half - 2); } }
      c.fillStyle = col; c.globalAlpha = 0.5;
      for (let x = 0; x < W; x += 2) { const j = Math.floor(tAt(x) * per); if (j < 0 || j >= pk.length) continue; const a = Math.min(1, pk[j] * 1.15) * amp; c.fillRect(x, mid - a, 1.5, a * 2); }
      c.globalAlpha = 1;
      for (let x = 0; x < W; x += 2) { const j = Math.floor(tAt(x) * per); if (j < 0 || j >= lo.length) continue; const a = Math.min(1, lo[j] * 1.6) * amp; c.fillRect(x, mid - a, 1.5, a * 2); }
      // beat grid: beats, bars, 8-bar phrases
      const b0 = Math.ceil((tAt(0) - T.first) / T.beat), b1 = Math.floor((tAt(W) - T.first) / T.beat);
      for (let b = Math.max(0, b0); b <= Math.min(b1, T.bars * 4); b++) {
        const x = Math.round(xAt(T.first + b * T.beat)), bar = b % 4 === 0, phrase = b % 32 === 0;
        c.fillStyle = phrase ? P.hype : bar ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.4)';
        c.fillRect(x, i ? y0 : y0 + half - (bar ? half : 7), phrase ? 2 : 1, bar ? half : 7);
        if (phrase) { const s = T.sections.find(z => z.bar === b / 4); c.font = '800 8px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = i ? 'bottom' : 'top'; c.fillText(s ? SECNAME[s.sec] : 'PHRASE', x + 4, i ? y0 + half - 2 : y0 + 2); }
      }
      const mark = (t, colr, label) => { const x = xAt(t); if (x < -6 || x > W + 6) return; c.fillStyle = colr; c.beginPath(); c.moveTo(x - 5, i ? y0 + half : y0); c.lineTo(x + 5, i ? y0 + half : y0); c.lineTo(x, i ? y0 + half - 7 : y0 + 7); c.closePath(); c.fill(); if (label) { c.font = '900 8px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = i ? 'bottom' : 'top'; c.fillText(label, x, i ? y0 + half - 8 : y0 + 8); } };
      mark(d.cue, '#ffffff', '');
      d.hot.forEach((h, n) => { if (h !== null) mark(h, P.hype, String(n + 1)); });
    });
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, half - 0.5, W, 1);
    c.fillStyle = '#fff'; c.fillRect(cx - 1, 0, 2, H);
    // beat-gap indicator on the centre line: how far B's beat is from A's
    const p = D.phaseMs();
    if (p !== null) { const ok = Math.abs(p) <= 35, x = cx + clamp(p, -200, 200) * pps / 1000; c.fillStyle = ok ? P.good : P.bad; c.beginPath(); c.arc(x, half, 4.5, 0, Math.PI * 2); c.fill(); c.font = '800 9px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(ok ? 'IN TIME' : 'B ' + Math.round(Math.abs(p)) + ' ms ' + (p > 0 ? 'LATE' : 'EARLY'), cx + 210 * pps / 1000 + 4, half); }
  }

  // ---------- track picker ----------
  let pickFor = 0;
  function openTracks(i) {
    pickFor = i; $('#tracks-title').textContent = 'LOAD A TRACK ON DECK ' + 'AB'[i];
    const list = $('#track-list'); list.replaceChildren();
    const other = D.decks[1 - i];
    D.library().forEach(T => {
      const fits = !other.track || Math.abs(D.bpm(other) / T.bpm - 1) <= D.RANGE;
      const b = el('button', 'track-row', '<b>' + esc(T.title) + '</b><span>' + esc(T.sub || O.music.STYLES[T.style].label + ' · ' + T.key) + '</span><em>' + T.bpm + ' BPM</em>' + (O.night ? O.night.tag(T) : '') + (other.track ? '<small class="' + (fits ? 'fit' : 'nofit') + '">' + (fits ? 'MIXES WITH DECK ' + other.name : 'TOO FAR FROM DECK ' + other.name) + '</small>' : ''));
      b.addEventListener('click', () => { E.unlock(); ui.closeOverlay('ov-tracks'); D.load(i, T.id); });
      list.append(b);
      if (T.imported) { // grid fixes for imported audio
        const row = el('div', 'imp-fix', '<span>' + T.bpm.toFixed(1) + ' BPM grid:</span>');
        [['half', '½ TEMPO'], ['double', '2× TEMPO'], ['shift', 'MOVE BEAT 1'], ['del', 'DELETE']].forEach(([k, label]) => { const x = el('button', 'btn btn-small', label); x.addEventListener('click', async () => { if (k === 'del') { if (!confirm('Delete this imported track from this device?')) return; await O.imports.remove(T.imported); } else await O.imports.fix(T.imported, k); openTracks(pickFor); }); row.append(x); });
        list.append(row);
      }
    });
    ui.openOverlay('ov-tracks');
  }

  // ---------- school: coach strip, lesson and gig menus, gig results ----------
  const mcStep = $('#mc-step'), mcText = $('#mc-text'), mcQuit = $('#mc-quit'), mcNext = $('#mc-next'), mcSchool = $('#mc-school');
  let coachKey = '';
  function renderCoach() {
    const a = SC.active; let step, text, quit = false, next = false, cls = '';
    if (!a) { step = 'FREE MIX'; text = 'Tap a deck title to load a track. LESSONS teach every control one at a time; GIGS score your transitions.'; }
    else if (a.loading) { step = a.kind === 'gig' ? 'GIG' : 'LESSON'; text = 'Loading tracks…'; quit = true; }
    else if (a.kind === 'lesson') {
      if (a.done) { const n = SC.nextLesson(a.def.id); step = 'LESSON COMPLETE'; text = a.def.name + ' done.' + (n ? ' Next: ' + SC.LESSONS.find(l => l.id === n).name + '.' : ' That was the last lesson. Try a gig.'); next = true; quit = true; cls = 'is-pass'; }
      else { step = (a.step + 1) + ' / ' + a.def.steps.length + ' · ' + a.def.name; text = a.note || a.def.steps[a.step].t; quit = true; }
    } else if (a.kind === 'night') { step = 'CLUB NIGHT · MIX ' + Math.min(a.n + 1, O.night.TARGET) + '/' + O.night.TARGET + ' · CROWD ' + Math.round(a.energy) + '%'; text = a.done ? 'Night over.' : O.night.hint(a); quit = true; next = !a.done && a.n > 0; cls = a.energy < 30 ? 'is-low' : ''; }
    else { step = 'GIG · ' + a.def.name; text = a.done ? 'Mix finished.' : SC.gigHint(); quit = true; next = !a.done; }
    const key = step + '|' + text + '|' + quit + next;
    if (key === coachKey) return; coachKey = key;
    mcStep.textContent = step; mcText.textContent = text; mcQuit.hidden = !quit; mcNext.hidden = !next;
    mcNext.textContent = a && a.kind === 'night' ? 'END NIGHT' : a && a.kind === 'gig' ? 'END MIX' : a && a.done && !SC.nextLesson(a.def.id) ? 'GIGS' : 'NEXT';
    $('#mix-coach').className = 'mix-coach ' + cls;
  }
  mcQuit.addEventListener('click', () => { SC.stop(); });
  mcNext.addEventListener('click', () => {
    const a = SC.active; if (!a) return;
    if (a.kind === 'night') { O.night.finish(); return; }
    if (a.kind === 'gig') { SC.finishGig(); return; }
    const n = SC.nextLesson(a.def.id); if (n) { E.unlock(); SC.startLesson(n); } else { SC.stop(); openSchool(); }
  });
  mcSchool.addEventListener('click', openSchool);
  function openSchool() {
    const L = $('#mix-lessons'), G = $('#mix-gigs'); L.replaceChildren(); G.replaceChildren();
    SC.LESSONS.forEach((l, k) => { const b = el('button', 'lesson-row' + (SC.progress.mix[l.id] ? ' is-done' : ''), '<i>' + (SC.progress.mix[l.id] ? '✓' : k + 1) + '</i><span>' + l.name + '</span>'); b.addEventListener('click', () => { E.unlock(); ui.closeOverlay('ov-school'); SC.startLesson(l.id); }); L.append(b); });
    SC.GIGS.forEach(g => { const r = SC.progress.gigs[g.id]; const b = el('button', 'gig-row', '<b>' + g.name + '</b><span>' + g.blurb + '</span><em>' + (r ? r.grade + ' · ' + r.score : 'NOT PLAYED') + '</em>'); b.addEventListener('click', () => { E.unlock(); ui.closeOverlay('ov-school'); SC.startGig(g.id); }); G.append(b); });
    const nb = SC.progress.night, nrow = el('button', 'gig-row night-row', '<b>CLUB NIGHT</b><span>You pick the tracks. Three mixes in a row; the crowd makes requests and reacts to every choice.</span><em>' + (nb ? '★'.repeat(nb.stars) + ' ' + nb.score : 'NOT PLAYED') + '</em>');
    nrow.addEventListener('click', () => { E.unlock(); ui.closeOverlay('ov-school'); O.night.start(); }); G.append(nrow);
    ui.openOverlay('ov-school');
  }
  $('#school-free').addEventListener('click', () => { SC.stop(); ui.closeOverlay('ov-school'); });
  O.on('school', a => {
    coachKey = ''; renderCoach();
    if (a && a.kind === 'lesson' && !a.loading && a.def.pads) showPads(dk[0], true);
    dk.forEach(renderDeck); renderMixer(); wake();
  });
  O.on('imports', () => { if (!$('#ov-tracks').hidden) openTracks(pickFor); });
  O.on('gig-result', r => {
    setTimeout(() => {
      $('#gig-name').textContent = (r.night ? '' : 'GIG · ') + r.name;
      const g = $('#gig-grade'); g.textContent = r.grade; g.classList.toggle('long', r.grade.length > 1);
      $('#gig-title').textContent = r.title ? r.title : r.total >= 65 ? 'CLEAN TRANSITION' : r.total >= 50 ? 'GETTING THERE' : 'KEEP PRACTISING';
      $('#gig-score').textContent = r.total + ' / 100'; $('#gig-pb').hidden = !r.best;
      const rows = r.rows || [['BEATMATCH', r.parts.beat, 35], ['PHRASING', r.parts.phrase, 20], ['BASS SWAP', r.parts.bass, 20], ['LEVELS', r.parts.levels, 10], ['FINISH', r.parts.finish, 15]];
      $('#gig-bars').innerHTML = rows.map(([n, v, w]) => '<div><span>' + n + (w ? ' <small>' + w + '%</small>' : '') + '</span><b>' + v + '</b><div class="meter"><i style="width:' + v + '%"></i></div></div>').join('');
      $('#gig-tips').innerHTML = r.tips.slice(0, 2).map(t => '<li>' + t + '</li>').join('');
      ui.openOverlay('ov-gig');
    }, 500);
  });
  $('#gig-retry').addEventListener('click', () => { const a = SC.active; ui.closeOverlay('ov-gig'); if (a) { E.unlock(); if (a.kind === 'night') O.night.start(); else SC.startGig(a.def.id); } });
  $('#gig-menu').addEventListener('click', () => { ui.closeOverlay('ov-gig'); SC.stop(); openSchool(); });

  // ---------- Beats tab trainer ----------
  const bl = $('#beat-lessons'), bpCoach = $('#bp-coach');
  function renderBeatList() {
    bl.replaceChildren();
    SC.BEAT_LESSONS.forEach((l, k) => { const b = el('button', 'lesson-row' + (SC.progress.beat[l.id] ? ' is-done' : '') + (SC.beatActive && SC.beatActive.def === l ? ' is-on' : ''), '<i>' + (SC.progress.beat[l.id] ? '✓' : k + 1) + '</i><span>' + l.name + '</span>'); b.addEventListener('click', () => { E.unlock(); SC.startBeat(l.id); }); bl.append(b); });
    $('#beat-quit').hidden = !SC.beatActive;
  }
  // beat challenges
  const bc = $('#beat-challenges');
  function renderChallenges() {
    bc.replaceChildren();
    SC.BEAT_CHALLENGES.forEach(c => { const r = SC.progress.challenges[c.id]; const b = el('button', 'lesson-row' + (r && r.stars ? ' is-done' : '') + (SC.challenge && SC.challenge.def === c ? ' is-on' : ''), '<i>' + (r ? r.stars + '★' : '?') + '</i><span>' + c.name + (r ? ' · ' + r.score + '%' : '') + '</span>'); b.addEventListener('click', () => { E.unlock(); SC.startChallenge(c.id).then(() => SC.listenChallenge()); }); bc.append(b); });
    const on = !!SC.challenge; $('#ch-actions').hidden = !on;
  }
  $('#ch-listen').addEventListener('click', () => { E.unlock(); SC.listenChallenge(); });
  $('#ch-check').addEventListener('click', () => { const r = SC.checkChallenge(); if (r) O.toast(r.score >= 100 ? 'Perfect copy! ★★★' : r.score + '% match' + (r.stars ? ' · ' + '★'.repeat(r.stars) : '') + ' · ' + r.missing + ' missing, ' + r.extra + ' extra. LISTEN again and adjust.'); });
  $('#ch-quit').addEventListener('click', () => SC.stopChallenge(true));
  let beatKey = '';
  function renderBeatCoach() {
    const ch = SC.challenge;
    if (ch) {
      bpCoach.hidden = false;
      const key = 'ch' + ch.def.id + SC.challengeMatch() + (ch.result ? ch.result.score : ''); if (key === beatKey) return; beatKey = key;
      $('#bpc-step').textContent = 'CHALLENGE · ' + ch.def.name; $('#bpc-count').textContent = ch.result ? 'LAST CHECK ' + ch.result.score + '%' : '';
      $('#bpc-text').textContent = 'Recreate the beat by ear in STEPS. ' + ch.def.hint + ' LISTEN replays it; CHECK scores your copy.';
      bpCoach.classList.toggle('is-pass', !!(ch.result && ch.result.score >= 100)); return;
    }
    const a = SC.beatActive; bpCoach.hidden = !a; if (!a) { beatKey = ''; return; }
    const st = a.def.steps[Math.min(a.step, a.def.steps.length - 1)];
    const step = a.done ? 'LESSON COMPLETE ✓' : (a.step + 1) + ' / ' + a.def.steps.length + ' · ' + a.def.name;
    const text = a.done ? 'Pick the next lesson in TRAIN.' : st.t, count = !a.done && st.count ? st.count(a.mem) : '';
    const key = step + text + count; if (key === beatKey) return; beatKey = key;
    $('#bpc-step').textContent = step; $('#bpc-text').textContent = text; $('#bpc-count').textContent = count;
    bpCoach.classList.toggle('is-pass', a.done);
  }
  O.on('beat-school', a => {
    renderBeatList(); renderChallenges(); beatKey = ''; renderBeatCoach();
    if (a && !a.done && a.step === 0) { const t = document.querySelector('[data-bptab="steps"]'); if (t) t.click(); } // show the step strip under the coach
    wake();
  });
  $('#beat-quit').addEventListener('click', () => SC.stopBeat());
  ['bp-change', 'bp-select', 'bp-transport', 'bp-hit'].forEach(ev => O.on(ev, () => { if (SC.beatActive || SC.challenge) { renderBeatCoach(); wake(); } }));
  renderBeatList(); renderChallenges();

  // ---------- view lifecycle ----------
  let hintAt = 0;
  O.mixui = {
    enter() { sizeWave(); D.preload(); dk.forEach(renderDeck); renderMixer(); coachKey = ''; renderCoach(); wake(); },
    frame() {
      dk.forEach(frameDeck); frameMeters(); drawWave();
      const now = performance.now(); if (now - hintAt > 250) { hintAt = now; renderCoach(); }
    },
    openSchool, openTracks, renderDeck
  };
  // Owner's iPhone test: sideways inside Safari there is very little height, upright is much easier to use. Say so once.
  const shortLandscape = window.matchMedia('(orientation: landscape) and (max-height: 340px)');
  const rotateTip = () => { if (shortLandscape.matches && !O.store.get('orbitV4RotateTip', false)) { O.store.set('orbitV4RotateTip', true); O.toast('Tip: on a phone, ORBIT has more room when you hold it upright.'); } };
  setTimeout(rotateTip, 1500); window.addEventListener('orientationchange', () => setTimeout(rotateTip, 600));
  window.addEventListener('resize', () => { if (ui.view === 'mix') requestAnimationFrame(() => { sizeWave(); wake(); }); });
  window.addEventListener('orientationchange', () => setTimeout(() => { if (ui.view === 'mix') { sizeWave(); wake(); } }, 260));
  O.on('theme', () => { sizeWave(); wake(); });
  dk.forEach(renderDeck); renderMixer(); renderCoach();
})();
