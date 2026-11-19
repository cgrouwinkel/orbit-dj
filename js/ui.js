/* ORBIT DJ v2 — interface controller: views, highway renderer, controls, overlays. */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, M = O.music, G = O.game, BP = O.beatpad, S = O.store, $ = O.$, $$ = O.$$;
  const LANE_KEYS = ['f', 'j', 'k', 'l'], PAD_KEYS = 'zxcvasdfqwer1234'; // MPC layout: bottom row = pads 1-4
  let view = 'play';
  let travel = Number(S.get('orbitV2Speed', 2.2)) || 2.2;

  // ---------- small helpers ----------
  const fmtScore = n => String(n).padStart(6, '0');
  const pct = v => Math.round(v * 100) + '%';
  const hzFromPos = p => Math.round(200 * Math.pow(100, p / 1000));
  const posFromHz = hz => Math.round(Math.log(hz / 200) / Math.log(100) * 1000);
  const fmtHz = hz => (hz >= 19000 ? 'OPEN' : hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : hz + ' Hz');
  function starsHTML(n) { let h = ''; for (let i = 0; i < 3; i++) h += '<svg class="' + (i < n ? 'on' : '') + '"><use href="#i-star"/></svg>'; return h; }
  function setRadio(group, attr, value) { $$('[' + attr + ']', group).forEach(b => b.setAttribute('aria-checked', String(b.getAttribute(attr) === String(value)))); }

  // ---------- views ----------
  function showView(name) {
    if (name === view) return;
    if (view === 'play' && G.state === 'running') { G.pause('user'); O.toast('Set paused'); }
    view = name;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tab').forEach(t => { const on = t.dataset.view === name; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); });
    if (name === 'career') renderCareer();
    if (name === 'settings') renderSettings();
    if (name === 'pads') { renderBP(); BP.loadKit(); }
    requestAnimationFrame(() => { resizeCanvases(); wake(); });
  }
  $$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

  // ---------- HUD ----------
  function renderHUD() {
    $('#hud-score').textContent = fmtScore(G.score);
    $('#hud-combo').textContent = G.combo;
    $('#hud-mult').textContent = '×' + G.multiplier();
    const a = G.accuracy();
    $('#hud-acc').textContent = a === null ? '—' : Math.round(a * 100) + '%';
    const st = G.liveStars();
    const c = G.counts; $('#ls-perfect').textContent = c.perfect; $('#ls-great').textContent = c.great; $('#ls-good').textContent = c.good; $('#ls-miss').textContent = c.miss; $('#ls-off').textContent = c.off; $('#ls-max').textContent = G.maxCombo;
    $('#hud-stars').innerHTML = starsHTML(st);
    $('#hud-stars').setAttribute('aria-label', st + ' of 3 stars');
  }
  function renderNowPlaying() {
    const v = G.VENUES[G.stage];
    $('#np-venue').textContent = 'VENUE ' + String(G.stage + 1).padStart(2, '0') + ' · ' + v.name + ' · ' + v.bpm + ' BPM';
    $('#np-song').textContent = v.song;
  }

  // ---------- highway renderer ----------
  const hw = { cv: $('#highway'), ctx: null, w: 0, h: 0, dpr: 1, pal: null, flash: [0, 0, 0, 0], sparks: [] };
  hw.ctx = hw.cv.getContext('2d');
  function readPalette() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    hw.pal = { lanes: [v('--lane0'), v('--lane1'), v('--lane2'), v('--lane3')], bg: v('--hw-bg'), lane: v('--hw-lane'), laneAlt: v('--hw-lane-alt'), sep: v('--hw-sep'), beat: v('--hw-beat'), bar: v('--hw-bar'), hit: v('--hw-hit'), glow: v('--hw-glow'),
      good: v('--good'), great: v('--great'), ok: v('--ok'), bad: v('--bad'), aero: document.documentElement.classList.contains('theme-aero') };
  }
  function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w: r.width, h: r.height, dpr };
  }
  function resizeCanvases() {
    const a = sizeCanvas(hw.cv); hw.w = a.w; hw.h = a.h; hw.dpr = a.dpr;
    sizeCanvas(spec.cv);
    if (lcd.cv.offsetParent) sizeCanvas(lcd.cv);
    drawHighway(); drawSpectrum(); if (view === 'pads') drawLCD(true);
  }
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function drawHighway() {
    const c = hw.ctx, W = hw.w, H = hw.h, P = hw.pal; if (!W || !P) return;
    c.setTransform(hw.dpr, 0, 0, hw.dpr, 0, 0);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const reduce = O.reducedMotion();
    const hitY = H - 18, topY = 2, k = 1.6, vy = (topY * (1 + k) - hitY) / k;
    const yAt = p => vy + (hitY - vy) / (1 + k * p), sAt = p => 1 / (1 + k * p);
    const margin = 4, bw = W - margin * 2, cx = W / 2;
    const xAt = (e, p) => cx + (e / 4 - 0.5) * bw * sAt(p);
    const pBottom = -((H - hitY) / (hitY - vy)) * (1 / k) - 0.02; // p where y reaches the canvas bottom
    const running = G.state === 'running' || G.state === 'paused' || G.state === 'finished';
    const now = running ? G.songTime() : 0, nowMs = performance.now();

    // lanes
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(xAt(i, 1), topY); c.lineTo(xAt(i + 1, 1), topY); c.lineTo(xAt(i + 1, pBottom), H); c.lineTo(xAt(i, pBottom), H); c.closePath();
      c.fillStyle = i % 2 ? P.laneAlt : P.lane; c.fill();
      const g = c.createLinearGradient(0, hitY, 0, hitY - H * 0.45);
      const f = Math.max(0, 1 - (nowMs - hw.flash[i]) / 220);
      g.addColorStop(0, hexA(P.lanes[i], 0.10 + f * 0.45)); g.addColorStop(1, hexA(P.lanes[i], 0));
      c.fillStyle = g; c.fill();
    }
    // separators
    c.lineWidth = 1; c.strokeStyle = P.sep;
    for (let e = 0; e <= 4; e++) { c.beginPath(); c.moveTo(xAt(e, 1), topY); c.lineTo(xAt(e, pBottom), H); c.stroke(); }
    if (!P.aero) { // grunge: worn stripe down the centre of each lane
      c.strokeStyle = 'rgba(255,255,255,.035)'; c.setLineDash([10, 14]);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo((xAt(i, 1) + xAt(i + 1, 1)) / 2, topY); c.lineTo((xAt(i, pBottom) + xAt(i + 1, pBottom)) / 2, H); c.stroke(); }
      c.setLineDash([]);
    }
    // beat + bar lines scroll with the music
    const beat = 60 / G.bpm();
    if (running) {
      const j0 = Math.ceil((now - G.leadIn) / beat - 0.05);
      for (let j = Math.max(j0, -4); ; j++) {
        const tb = G.leadIn + j * beat, p = (tb - now) / travel;
        if (p > 1) break; if (p < pBottom) continue;
        const y = yAt(p);
        c.strokeStyle = j % 4 === 0 ? P.bar : P.beat; c.lineWidth = j % 4 === 0 ? 2 : 1;
        c.beginPath(); c.moveTo(xAt(0, p), y); c.lineTo(xAt(4, p), y); c.stroke();
      }
    } else {
      c.strokeStyle = P.beat; c.lineWidth = 1;
      for (const p of [0.18, 0.4, 0.66, 0.92]) { const y = yAt(p); c.beginPath(); c.moveTo(xAt(0, p), y); c.lineTo(xAt(4, p), y); c.stroke(); }
    }
    // hit line + lane targets
    c.save();
    if (!reduce) { c.shadowColor = P.glow; c.shadowBlur = 14; }
    c.strokeStyle = P.hit; c.lineWidth = 3;
    c.beginPath(); c.moveTo(xAt(0, 0), hitY); c.lineTo(xAt(4, 0), hitY); c.stroke();
    c.restore();
    for (let i = 0; i < 4; i++) {
      const x0 = xAt(i, 0), x1 = xAt(i + 1, 0), w = (x1 - x0) * 0.78, x = (x0 + x1) / 2 - w / 2;
      const f = Math.max(0, 1 - (nowMs - hw.flash[i]) / 160);
      rr(c, x, hitY - 8, w, 16, P.aero ? 8 : 3);
      c.fillStyle = hexA(P.lanes[i], 0.12 + f * 0.7); c.fill();
      c.lineWidth = 2; c.strokeStyle = P.lanes[i]; c.stroke();
    }
    // notes
    if (running) {
      for (const n of G.notes) {
        const until = n.t - now;
        if (until > travel) break;
        if (n.hit) continue;
        if (until < -0.3) continue;
        const p = until / travel; if (p < pBottom) continue;
        const s = sAt(p), y = yAt(p), x0 = xAt(n.lane, p), x1 = xAt(n.lane + 1, p);
        const w = (x1 - x0) * 0.8, h = Math.max(7, 20 * s), x = (x0 + x1) / 2 - w / 2;
        const col = P.lanes[n.lane];
        c.globalAlpha = n.done ? 0.28 : 1;
        if (P.aero) {
          rr(c, x, y - h / 2, w, h, h / 2);
          const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, hexA(col, 0.65));
          c.fillStyle = g; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
        } else {
          rr(c, x, y - h / 2, w, h, 3);
          c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = '#000'; c.stroke();
          c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 3, y - h / 2 + 2, w - 6, Math.max(2, h * 0.18));
        }
        if (s > 0.5 && !n.done) {
          c.fillStyle = P.aero ? '#023' : '#0b0a0e';
          c.font = '900 ' + Math.round(9 + 6 * s) + 'px ' + 'system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(G.LANES[n.lane].name[0], x + w / 2, y + 1);
        }
        c.globalAlpha = 1;
      }
    }
    // hit sparks
    if (!reduce) {
      hw.sparks = hw.sparks.filter(sp => nowMs - sp.t < 320);
      for (const sp of hw.sparks) {
        const a = 1 - (nowMs - sp.t) / 320, x0 = xAt(sp.lane, 0), x1 = xAt(sp.lane + 1, 0), r = (x1 - x0) * (0.35 + (1 - a) * 0.5);
        c.strokeStyle = hexA(sp.col, a); c.lineWidth = 3 * a + 1;
        c.beginPath(); c.ellipse((x0 + x1) / 2, hitY, r, r * 0.42, 0, 0, Math.PI * 2); c.stroke();
      }
    }
  }
  function hexA(col, a) {
    col = (col || '#ffffff').trim();
    if (col[0] === '#') {
      let h = col.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + O.clamp(a, 0, 1).toFixed(3) + ')';
    }
    return col;
  }

  // ---------- spectrum ----------
  const spec = { cv: $('#spectrum'), ctx: null, bins: null };
  spec.ctx = spec.cv.getContext('2d');
  function drawSpectrum() {
    const cv = spec.cv, c = spec.ctx; if (!cv.width || cv.offsetParent === null) return;
    const W = cv.width, H = cv.height, P = hw.pal || {};
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const live = M.playing && E.nodes && E.isRunning();
    const n = 28, gap = Math.max(1, W / n * 0.22), bw = W / n - gap;
    if (live) {
      const an = E.nodes.analyser;
      if (!spec.bins || spec.bins.length !== an.frequencyBinCount) spec.bins = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(spec.bins);
    }
    for (let i = 0; i < n; i++) {
      let v = 0.04;
      if (live) {
        const lo = Math.floor(Math.pow(i / n, 1.8) * (spec.bins.length - 1)), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, 1.8) * (spec.bins.length - 1)));
        let m = 0; for (let j = lo; j < hi; j++) m = Math.max(m, spec.bins[j]);
        v = Math.max(0.04, m / 255);
      }
      const h = v * (H - 4), x = i * (bw + gap) + gap / 2;
      const lanes = P.lanes || ['#c6ff1a', '#ff2d87', '#24e2ff', '#ff8a1f'];
      c.fillStyle = i < n * 0.3 ? lanes[0] : i < n * 0.72 ? lanes[3] : lanes[2];
      c.globalAlpha = live ? 0.95 : 0.35;
      c.fillRect(x, H - 2 - h, bw, h);
    }
    c.globalAlpha = 1;
  }

  // ---------- stage message (idle / countdown / paused) ----------
  let stageKey = '';
  function setStage(key, html) { if (key === stageKey) return; stageKey = key; $('#stage-msg').innerHTML = html; }
  function updateStageMsg() {
    const v = G.VENUES[G.stage], first = !S.get('orbitV2FirstSetDone', false);
    if (G.state === 'idle') {
      setStage('idle' + G.stage, '<div class="title">' + v.name + '</div><div class="sub">' + (first ? 'Tap START SET. When a note hits the line, tap its lane or pad.' : v.tag + ' Tap START SET.') + '</div>');
    } else if (G.state === 'running') {
      const now = G.songTime(), beat = 60 / G.bpm();
      if (now < G.leadIn) {
        const n = Math.ceil((G.leadIn - now) / beat - 0.02);
        if (n <= 4 && n >= 1) setStage('cd' + n, '<div class="big">' + n + '</div><div class="sub">' + (first ? 'Notes are coming. Tap when they touch the line.' : 'Count it in…') + '</div>');
        else setStage('pre', '<div class="title">GET READY</div>');
      } else if (now < G.leadIn + beat) setStage('go', '<div class="big">GO!</div>');
      else setStage('', '');
    } else if (G.state === 'paused') {
      const why = { background: 'Paused when you left the app.', audio: 'Sound was interrupted by your phone.', user: 'Press RESUME when you’re ready.' }[G.pauseReason] || 'Press RESUME when you’re ready.';
      setStage('paused' + G.pauseReason, '<div class="title">PAUSED</div><div class="sub">' + why + '</div>');
    } else if (G.state === 'finished') setStage('done', '<div class="title">SET COMPLETE</div>');
  }

  // ---------- judgement popup ----------
  const judgeEl = $('#judgment');
  O.on('judge', j => {
    const text = { perfect: 'PERFECT!', great: 'GREAT!', good: 'GOOD', miss: 'MISS', off: 'OFF BEAT' }[j.kind];
    judgeEl.className = 'judgment ' + j.kind;
    judgeEl.querySelector('b').textContent = text;
    let small = '';
    if (j.kind === 'perfect' || j.kind === 'great' || j.kind === 'good') {
      const ms = Math.round(j.err * 1000);
      small = Math.abs(ms) <= 20 ? 'ON THE BEAT' : Math.abs(ms) + ' MS ' + (ms < 0 ? 'EARLY' : 'LATE');
      hw.sparks.push({ lane: j.lane, t: performance.now(), col: j.kind === 'perfect' ? hw.pal.good : j.kind === 'great' ? hw.pal.great : hw.pal.ok });
    }
    judgeEl.querySelector('small').textContent = small;
    try { judgeEl.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    if (judgeEl.animate) judgeEl.animate(O.reducedMotion() ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }] : [{ transform: 'scale(1.35)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 650, fill: 'forwards', easing: 'ease-out' });
    wake();
  });

  // ---------- lane pads + highway touch ----------
  const lanePads = $('#lane-pads');
  G.LANES.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'lane-pad'; b.style.setProperty('--c', 'var(--lane' + i + ')');
    b.innerHTML = l.name + '<small>' + l.key.toUpperCase() + '</small>';
    b.setAttribute('aria-label', l.name + ' pad (key ' + l.key.toUpperCase() + ')');
    lanePads.append(b);
  });
  function padDown(i) { hw.flash[i] = performance.now(); const b = lanePads.children[i]; b.classList.add('is-down'); wake(); }
  function padUp(i) { lanePads.children[i].classList.remove('is-down'); }
  function laneHit(i, e) { padDown(i); G.tap(i, O.eventTime(e)); }
  const activePointers = new Map();
  lanePads.addEventListener('pointerdown', e => {
    const b = e.target.closest('.lane-pad'); if (!b) return;
    e.preventDefault();
    const i = Array.prototype.indexOf.call(lanePads.children, b);
    activePointers.set(e.pointerId, i); laneHit(i, e);
  });
  hw.cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = hw.cv.getBoundingClientRect(), i = O.clamp(Math.floor((e.clientX - r.left) / r.width * 4), 0, 3);
    activePointers.set(e.pointerId, i); laneHit(i, e);
  });
  const release = e => { if (activePointers.has(e.pointerId)) { padUp(activePointers.get(e.pointerId)); activePointers.delete(e.pointerId); } };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => { lanePads.addEventListener(t, release); hw.cv.addEventListener(t, release); });
  lanePads.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- transport ----------
  const btnStart = $('#btn-start');
  function primaryAction() {
    G.stopDemo();
    if (G.state === 'running') return G.pause('user');
    if (G.state === 'paused') return G.resume();
    return G.start();
  }
  btnStart.addEventListener('click', primaryAction);
  $('#btn-stop').addEventListener('click', () => { G.stop(); });
  $('#btn-retry').addEventListener('click', () => { G.stopDemo(); G.start(); });
  function renderTransport() {
    const st = G.state;
    document.documentElement.classList.toggle('is-playing', st === 'running' || st === 'paused');
    $('#start-label').textContent = st === 'running' ? 'PAUSE' : st === 'paused' ? 'RESUME' : st === 'finished' ? 'PLAY AGAIN' : 'START SET';
    btnStart.querySelector('use').setAttribute('href', st === 'running' ? '#i-pause' : '#i-play');
    btnStart.classList.toggle('is-running', st === 'running');
    $('#btn-stop').disabled = !(st === 'running' || st === 'paused');
    $('#deck-label').textContent = st === 'running' ? 'PAUSE' : 'PLAY';
    $('#btn-deck use').setAttribute('href', st === 'running' ? '#i-pause' : '#i-play');
  }
  $$('.seg-diff').forEach(seg => seg.addEventListener('click', e => { const b = e.target.closest('[data-diff]'); if (b) G.setDifficulty(b.dataset.diff); }));
  function renderDifficulty() { $$('.seg-diff').forEach(seg => setRadio(seg, 'data-diff', G.difficulty)); }
  const styleSel = $('#style-select'), setStyleSel = $('#set-style');
  [styleSel, setStyleSel].forEach(s => s.addEventListener('change', () => G.setStyle(s.value)));
  function renderStyle() { styleSel.value = G.styleChoice; setStyleSel.value = G.styleChoice; }

  // level faders (several copies stay in sync)
  function renderLevels() {
    $$('[data-level]').forEach(inp => { if (document.activeElement !== inp) inp.value = Math.round(E.levels[inp.dataset.level] * 100); });
    $$('[data-level-out]').forEach(o => { o.textContent = pct(E.levels[o.dataset.levelOut]); });
  }
  $$('[data-level]').forEach(inp => inp.addEventListener('input', () => { E.setLevel(inp.dataset.level, Number(inp.value) / 100); }));

  // ---------- range enhancement: grab anywhere on the track, double-tap EQ/filter to reset ----------
  function enhanceRange(input) {
    let active = null, lastTap = 0;
    const setFromX = x => {
      const r = input.getBoundingClientRect(), pad = 13;
      const frac = O.clamp((x - r.left - pad) / Math.max(1, r.width - pad * 2), 0, 1);
      const min = Number(input.min), max = Number(input.max), step = Number(input.step) || 1;
      const v = Math.round((min + frac * (max - min)) / step) * step;
      if (Number(input.value) !== v) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    input.addEventListener('pointerdown', e => {
      e.preventDefault();
      const t = performance.now();
      if (input.dataset.default !== undefined && input.id !== 'xf' && t - lastTap < 280) {
        input.value = input.dataset.default; input.dispatchEvent(new Event('input', { bubbles: true })); lastTap = 0; return;
      }
      lastTap = t; active = e.pointerId;
      try { input.setPointerCapture(e.pointerId); } catch (err) {}
      try { input.focus({ preventScroll: true }); } catch (err) {}
      setFromX(e.clientX);
    });
    input.addEventListener('pointermove', e => { if (e.pointerId === active) setFromX(e.clientX); });
    const end = e => { if (e.pointerId === active) { active = null; input.dispatchEvent(new Event('change', { bubbles: true })); } };
    input.addEventListener('pointerup', end); input.addEventListener('pointercancel', end);
    input.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  }
  $$('input[type=range]').forEach(enhanceRange);

  // ---------- mixer ----------
  const xf = $('#xf'), eq = $('#low-eq'), filt = $('#filter');
  xf.addEventListener('input', () => { const v = Number(xf.value); G.controlInput('xf', v); renderFaderOuts(); wake(); });
  eq.addEventListener('input', () => { G.controlInput('lowEq', Number(eq.value)); renderFaderOuts(); });
  filt.addEventListener('input', () => { const hz = Number(filt.value) >= 995 ? 20000 : hzFromPos(Number(filt.value)); G.controlInput('filterHz', hz); renderFaderOuts(); });
  function renderFaderOuts() {
    const x = E.controls.xf;
    $('#xf-out').textContent = x <= 15 ? 'MELODY' : x >= 85 ? 'BASS' : x >= 45 && x <= 55 ? 'CENTER' : x < 50 ? 'MELODY SIDE' : 'BASS SIDE';
    $('#eq-out').textContent = Math.round(E.controls.lowEq) + '%';
    $('#filter-out').textContent = fmtHz(E.controls.filterHz);
    xf.closest('.fader').classList.toggle('is-moved', Math.abs(x - 50) > 5);
    eq.closest('.fader').classList.toggle('is-moved', Math.abs(E.controls.lowEq - 100) > 3);
    filt.closest('.fader').classList.toggle('is-moved', E.controls.filterHz < 19000);
  }
  function syncFaders() { xf.value = E.controls.xf; eq.value = E.controls.lowEq; filt.value = E.controls.filterHz >= 19000 ? 1000 : posFromHz(E.controls.filterHz); renderFaderOuts(); }
  $('#btn-cue').addEventListener('click', () => { G.cue(); const b = $('#btn-cue'); b.classList.add('is-flash'); setTimeout(() => b.classList.remove('is-flash'), 350); });
  $('#btn-deck').addEventListener('click', primaryAction);
  $('#btn-brief').addEventListener('click', () => openBrief(G.stage));

  const NEXT_UNLOCK = ['CUE, PLAY and CROSSFADER unlock at HOUSE PARTY', 'LOW EQ unlocks at UNDERGROUND CLUB', 'FILTER unlocks at MAIN STAGE', ''];
  function renderMixer() {
    const ctrls = G.controlsFor();
    $$('#mixer [data-ctrl]').forEach(el => { el.hidden = !ctrls.includes(el.dataset.ctrl); });
    $('#unlock-tag').textContent = 'LEVEL ' + (G.stage + 1);
    $('#teaser').hidden = !NEXT_UNLOCK[G.stage];
    $('#teaser-text').textContent = NEXT_UNLOCK[G.stage];
    renderChallenge();
  }
  function renderChallenge() {
    const ch = G.challenge; if (!ch) return;
    $('#ch-points').textContent = ch.points + ' / 300';
    $('#ch-fill').style.width = (ch.points / 3) + '%';
    $('#ch-task').textContent = G.challengeText();
  }
  O.on('challenge', renderChallenge);
  O.on('feedback', msg => { $('#ctrl-feedback').textContent = msg; });
  O.on('award', label => {
    $('#ctrl-feedback').textContent = '+100 · ' + label;
    const box = $('#challenge'); box.classList.remove('is-award'); void box.offsetWidth; box.classList.add('is-award');
  });

  // ---------- beat pad ----------
  const padGrid = $('#mpc-pads');
  const VISUAL_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]; // pad 1 bottom-left, like an MPC
  const padEls = [];
  VISUAL_ORDER.forEach(i => {
    const b = document.createElement('button');
    b.className = 'mpc-pad'; b.dataset.pad = i; b.style.setProperty('--c', 'var(--lane' + Math.floor(i / 4) + ')');
    b.innerHTML = '<span class="pad-num">' + (i + 1) + '</span><span class="pad-key">' + PAD_KEYS[i].toUpperCase() + '</span><b class="pad-name"></b><i class="pad-vel"></i><em class="pad-flag"></em>';
    padGrid.append(b); padEls[i] = b;
  });
  padGrid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.mpc-pad'); if (!b) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
    const r = b.getBoundingClientRect(), vel = BP.velocityFromY((e.clientY - r.top) / r.height);
    b.classList.add('is-down');
    BP.padDown(Number(b.dataset.pad), O.eventTime(e), vel, e.pointerId);
  });
  const padRelease = e => { const b = e.target.closest('.mpc-pad'); if (b) b.classList.remove('is-down'); BP.padUp(e.pointerId); };
  ['pointerup', 'pointercancel'].forEach(t => padGrid.addEventListener(t, padRelease));
  padGrid.addEventListener('contextmenu', e => e.preventDefault());
  O.on('bp-hit', h => {
    const el = padEls[h.pad]; if (!el || !E.ctx) return;
    const delay = Math.max(0, (h.at - E.ctx.currentTime + E.latency()) * 1000);
    setTimeout(() => { el.style.setProperty('--v', Math.round(h.vel * 100) + '%'); el.classList.add('is-hit'); setTimeout(() => el.classList.remove('is-hit'), 110); }, delay);
  });

  // LCD selects + transport
  const kitSel = $('#bp-kit'), styleSelBP = $('#bp-style');
  Object.entries(BP.KITS).forEach(([k, label]) => { const o = document.createElement('option'); o.value = k; o.textContent = label.toUpperCase(); kitSel.append(o); });
  [['auto', 'Match venue']].concat(M.list().map(x => [x.id, x.label])).forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; styleSelBP.append(o); });
  kitSel.addEventListener('change', () => BP.setKit(kitSel.value));
  styleSelBP.addEventListener('change', () => BP.setBackingStyle(styleSelBP.value));
  $('#bp-play').addEventListener('click', () => BP.togglePlay());
  $('#bp-rec').addEventListener('click', () => BP.toggleRec());
  let bpmHold = 0;
  const bpmStep = d => { BP.setBpm(BP.bpm + d); };
  [['#bp-bpm-dn', -1], ['#bp-bpm-up', 1]].forEach(([id, d]) => {
    const b = $(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); bpmStep(d); let n = 0; bpmHold = setInterval(() => bpmStep(d * (++n > 8 ? 5 : 1)), 180); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => clearInterval(bpmHold)));
  });
  const NR = [0, 8, 16, 32];
  $('#bp-nr').addEventListener('click', () => BP.setNoteRepeat(NR[(NR.indexOf(BP.noteRepeat) + 1) % NR.length]));
  $('#bp-full').addEventListener('click', () => BP.toggle('fullLevel'));
  // tabs
  $$('[data-bptab]').forEach(t => t.addEventListener('click', () => {
    $$('[data-bptab]').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    $$('[data-bppanel]').forEach(p => { p.hidden = p.dataset.bppanel !== t.dataset.bptab; });
  }));
  // steps panel
  const slots = $('#bp-slots');
  BP.SLOTS.forEach(sl => { const b = document.createElement('button'); b.className = 'slot'; b.dataset.slot = sl; b.setAttribute('role', 'radio'); b.textContent = sl; slots.append(b); });
  slots.addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (b) BP.selectSlot(b.dataset.slot); });
  const strip = $('#step-strip');
  for (let i = 0; i < 16; i++) { const b = document.createElement('button'); b.className = 'step'; b.dataset.step = i; b.setAttribute('aria-label', 'Step ' + (i + 1)); strip.append(b); }
  let stepPage = 0;
  strip.addEventListener('click', e => { const b = e.target.closest('.step'); if (b) { BP.toggleStep(stepPage * 16 + Number(b.dataset.step)); } });
  $('#bp-len').addEventListener('click', () => { BP.setBars(BP.pattern().bars === 1 ? 2 : 1); stepPage = 0; });
  $('#bp-page').addEventListener('click', () => { stepPage = stepPage ? 0 : 1; renderBP(); });
  $('#bp-undo').addEventListener('click', () => BP.undo());
  $('#bp-clear').addEventListener('click', () => BP.clear());
  $('#bp-copy').addEventListener('click', () => { const next = BP.SLOTS[(BP.SLOTS.indexOf(BP.cur) + 1) % 4]; BP.copyTo(next); });
  // pad panel
  const padIn = { level: $('#pad-level'), tune: $('#pad-tune'), decay: $('#pad-decay') };
  padIn.level.addEventListener('input', () => { BP.setParam(BP.sel, 'level', Number(padIn.level.value) / 100); renderPadPanel(); });
  padIn.tune.addEventListener('input', () => { BP.setParam(BP.sel, 'tune', Number(padIn.tune.value)); renderPadPanel(); });
  padIn.decay.addEventListener('input', () => { BP.setParam(BP.sel, 'decay', Number(padIn.decay.value) / 100); renderPadPanel(); });
  $('#pad-mute').addEventListener('click', () => { BP.mutes.has(BP.sel) ? BP.mutes.delete(BP.sel) : BP.mutes.add(BP.sel); O.emit('bp-change', 'mute'); });
  $('#pad-solo').addEventListener('click', () => { BP.solo = BP.solo === BP.sel ? null : BP.sel; O.emit('bp-change', 'mute'); });
  // modes panel
  $$('[data-bpmode]').forEach(b => b.addEventListener('click', () => BP.setMode(b.dataset.bpmode)));
  $('#bp-16').addEventListener('click', () => BP.setLevels16(!BP.levels16));
  $('#bp-metro').addEventListener('click', () => BP.toggle('metro'));
  $('#bp-quant').addEventListener('click', () => BP.toggle('quant'));
  $('#bp-swing').addEventListener('input', e => BP.setSwing(Number(e.target.value)));
  $('#bp-backing').addEventListener('click', () => BP.toggle('backing'));
  // file panel
  $('#bp-export').addEventListener('click', () => BP.exportPattern());
  $('#bp-import').addEventListener('change', e => { BP.importFile(e.target.files[0]).finally(() => { e.target.value = ''; }); });
  $('#bp-bounce').addEventListener('click', () => BP.bounce($('#bp-bounce-backing').checked));

  function renderPadPanel() {
    const p = BP.param(BP.sel), name = 'PAD ' + (BP.sel + 1) + ' · ' + BP.padName(BP.sel);
    $('#pad-name').textContent = name; $('#steps-pad').textContent = name;
    if (document.activeElement !== padIn.level) padIn.level.value = Math.round(p.level * 100);
    if (document.activeElement !== padIn.tune) padIn.tune.value = p.tune;
    if (document.activeElement !== padIn.decay) padIn.decay.value = Math.round(p.decay * 100);
    $('#pad-level-out').textContent = Math.round(p.level * 100) + '%';
    $('#pad-tune-out').textContent = (p.tune > 0 ? '+' : '') + p.tune + ' st';
    $('#pad-decay-out').textContent = Math.round(p.decay * 100) + '%';
    $('#pad-mute').classList.toggle('is-on', BP.mutes.has(BP.sel));
    $('#pad-solo').classList.toggle('is-on', BP.solo === BP.sel);
  }
  function renderSteps() {
    const st = BP.stepState(BP.sel), bars = BP.pattern().bars;
    if (stepPage >= bars) stepPage = 0;
    for (let i = 0; i < 16; i++) { const v = st[stepPage * 16 + i] || 0, el = strip.children[i]; el.classList.toggle('on', v > 0); el.classList.toggle('accent', v >= 0.95); }
    $('#bp-page').hidden = bars === 1; $('#bp-page').textContent = 'BAR ' + (stepPage + 1);
    $('#bp-len').textContent = bars + (bars === 1 ? ' BAR' : ' BARS');
    $('#bp-copy').textContent = 'COPY → ' + BP.SLOTS[(BP.SLOTS.indexOf(BP.cur) + 1) % 4];
  }
  function renderBP() {
    kitSel.value = BP.kit; styleSelBP.value = BP.backingStyle;
    for (let i = 0; i < 16; i++) {
      const el = padEls[i], used = BP.pattern().events.some(e => e.pad === i);
      el.querySelector('.pad-name').textContent = BP.levels16 ? (i - 7 > 0 ? '+' : '') + (i - 7) : BP.padName(i);
      el.classList.toggle('is-sel', i === BP.sel && !BP.levels16);
      el.classList.toggle('is-muted', BP.solo !== null ? BP.solo !== i : BP.mutes.has(i));
      el.classList.toggle('has-notes', used);
      el.querySelector('.pad-flag').textContent = BP.solo === i ? 'S' : BP.mutes.has(i) ? 'M' : '';
    }
    padGrid.dataset.mode = BP.levels16 ? 'levels' : BP.mode;
    $('#lcd-pat').textContent = 'PTN ' + BP.cur + (BP.queued ? '→' + BP.queued : '') + ' · ' + BP.pattern().bars + (BP.pattern().bars === 1 ? ' BAR' : ' BARS') + ' · SW ' + BP.swing + '%';
    $('#bp-status').textContent = BP.status;
    $('#bp-bpm').textContent = BP.bpm;
    $('#bp-play').classList.toggle('is-on', BP.playing);
    $('#bp-play span').textContent = BP.playing ? 'STOP' : 'PLAY';
    $('#bp-play use').setAttribute('href', BP.playing ? '#i-pause' : '#i-play');
    $('#bp-rec').classList.toggle('is-on', BP.rec);
    $('#bp-rec').classList.toggle('is-armed', BP.rec && BP.countingIn);
    $('#bp-nr-val').textContent = BP.noteRepeat ? '1/' + BP.noteRepeat : 'OFF';
    $('#bp-nr').classList.toggle('is-on', !!BP.noteRepeat);
    $('#bp-full').classList.toggle('is-on', BP.fullLevel);
    $$('[data-bpmode]').forEach(b => b.classList.toggle('is-on', BP.mode === b.dataset.bpmode));
    $('#bp-16').classList.toggle('is-on', BP.levels16);
    $('#bp-metro').classList.toggle('is-on', BP.metro);
    $('#bp-quant').classList.toggle('is-on', BP.quant);
    $('#bp-backing').classList.toggle('is-on', BP.backing);
    $('#bp-swing').value = BP.swing; $('#bp-swing-out').textContent = BP.swing + '%';
    setRadio(slots, 'data-slot', BP.cur);
    $$('.slot', slots).forEach(b => { const sl = b.dataset.slot; b.classList.toggle('has-notes', BP.patterns[sl].events.length > 0); b.classList.toggle('is-queued', BP.queued === sl); });
    renderSteps(); renderPadPanel(); drawLCD();
  }
  // LCD: 16 x steps dot matrix + playhead
  const lcd = { cv: $('#lcd-grid'), ctx: null }; lcd.ctx = lcd.cv.getContext('2d');
  let lastLcdStep = -2;
  function drawLCD(force) {
    const pos = BP.position(), stp = pos ? pos.step : -1;
    $('#lcd-pos').textContent = !pos ? 'STOP' : pos.countIn ? 'COUNT ' + pos.countIn : pos.bar + '.' + pos.beat + '.' + pos.six;
    if (stp !== lastLcdStep || force !== false) {
      const cv = lcd.cv, c = lcd.ctx, W = cv.width, H = cv.height; if (!W) return;
      lastLcdStep = stp;
      const P = BP.pattern(), L = P.bars * 16, cw = W / L, ink = getComputedStyle(lcd.cv).color || '#c6ff1a';
      // one row per pad that has notes (plus the selected pad), highest pad on top
      const rows = Array.from(new Set(P.events.map(e => e.pad).concat([BP.sel]))).sort((a, b) => b - a);
      const rh = H / Math.max(rows.length, 4), gap = Math.max(1, Math.round(rh * 0.18));
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.06)'; for (let s = 0; s < L; s += 4) c.fillRect(s * cw, 0, Math.max(1, cw * 0.06), H);
      if (stp >= 0) { c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(stp * cw, 0, cw, H); }
      const selRow = rows.indexOf(BP.sel); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, selRow * rh, W, rh);
      c.fillStyle = ink;
      for (const e of P.events) { const r = rows.indexOf(e.pad); c.globalAlpha = 0.35 + 0.65 * e.velocity; c.fillRect(Math.floor(e.step) * cw + gap, r * rh + gap, Math.max(2, cw - gap * 2), Math.max(2, rh - gap * 2)); }
      c.globalAlpha = 1;
      if (stp >= 0 && Math.floor(stp / 16) === stepPage) for (let i = 0; i < 16; i++) strip.children[i].classList.toggle('is-head', i === stp % 16);
      else for (const el of strip.children) el.classList.remove('is-head');
    }
  }
  O.on('bp-select', () => { renderPadPanel(); renderSteps(); renderBP(); });
  ['bp-change', 'bp-transport', 'bp-status', 'music'].forEach(ev => O.on(ev, () => { if (view === 'pads') renderBP(); wake(); }));

  // ---------- career ----------
  function renderCareer() {
    const t = G.totals();
    $('#tot-stars').textContent = t.stars + '/12';
    $('#tot-best').textContent = t.best.toLocaleString();
    $('#tot-cleared').textContent = t.cleared + '/4';
    const grid = $('#venue-grid'); grid.replaceChildren();
    G.VENUES.forEach((v, i) => {
      const rec = G.progress[i] || {}, key = i + ':' + G.difficulty, comb = G.combinedBests[key], ctrl = G.ctrlBests[key];
      const grade = comb === undefined ? '—' : comb >= 900 ? 'S' : comb >= 750 ? 'A' : comb >= 550 ? 'B' : comb >= 350 ? 'C' : 'P';
      const card = document.createElement('article');
      card.className = 'venue-card' + (i === G.stage ? ' is-current' : ''); card.dataset.v = i;
      card.innerHTML = '<div class="vnum">' + String(i + 1).padStart(2, '0') + '</div>' +
        '<div class="eyebrow">VENUE ' + String(i + 1).padStart(2, '0') + '</div><h3>' + v.name + '</h3>' +
        '<div class="vsong">“' + v.song + '” · ' + v.tag + '</div>' +
        '<div class="vmeta"><span class="chip">' + v.bpm + ' BPM</span><span class="chip">' + M.STYLES[v.style].label.toUpperCase() + '</span></div>' +
        '<div class="vteach">Learn: ' + v.teaches + '</div>' +
        '<div class="vstars">' + starsHTML(rec.stars || 0) + '</div>' +
        '<div class="vrec"><div>BEST SCORE<b>' + (rec.score ? rec.score.toLocaleString() : '—') + '</b></div><div>' + G.DIFFS[G.difficulty].label + ' GRADE<b>' + grade + (ctrl !== undefined ? ' · ' + ctrl + '/300' : '') + '</b></div></div>';
      const play = document.createElement('button');
      play.className = 'btn-start'; play.innerHTML = '<svg><use href="#i-play"/></svg><span>' + (rec.stars ? 'PLAY AGAIN' : 'PLAY') + '</span>';
      play.addEventListener('click', () => playVenue(i));
      card.append(play);
      grid.append(card);
    });
  }
  function playVenue(i) {
    G.select(i);
    showView('play');
    const briefed = S.get('orbitV2Briefed', {});
    if (i > 0 && !briefed[i]) openBrief(i);
    else G.start();
  }

  // ---------- settings ----------
  function renderSettings() {
    const theme = document.documentElement.classList.contains('theme-aero') ? 'aero' : 'grunge';
    setRadio($('.theme-pick'), 'data-theme', theme);
    $('#set-motion').checked = O.reducedMotion();
    renderDifficulty(); renderStyle(); renderLevels();
    setRadio($('#seg-speed'), 'data-speed', travel);
    setRadio($('#seg-padsound'), 'data-padsound', G.padSound);
    setRadio($('#seg-guide'), 'data-guide', G.guideMode);
    $('#set-chopbank').value = G.chopBank;
    $('#chopbank-field').hidden = G.padSound !== 'chops';
    $('#set-offset').value = E.offsetMs; $('#set-offset-out').textContent = (E.offsetMs > 0 ? '+' : '') + E.offsetMs + ' ms';
    $('#set-silent').checked = E.silentSwitchFix;
    renderAudioStatus();
    $('#version-line').textContent = 'ORBIT DJ v' + O.VERSION + ' · free & open source · original sounds only';
  }
  function renderAudioStatus() {
    const s = E.status();
    $('#audio-status').textContent = 'Audio: ' + s.state + (s.sampleRate ? ' · ' + s.sampleRate + ' Hz' : '') +
      '\nDevice latency: ' + (s.state === 'not started' ? '—' : s.latencyMs + ' ms' + (s.reportsOutputLatency ? '' : ' (base only; Bluetooth not reported)')) +
      '\nSilent-switch mode: ' + (s.audioSession === 'unsupported' ? (O.isIOS ? 'media fallback' : 'n/a') : s.audioSession);
  }
  $$('.theme-card').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  $('#set-motion').addEventListener('change', e => setMotion(e.target.checked));
  $('#seg-speed').addEventListener('click', e => { const b = e.target.closest('[data-speed]'); if (!b) return; travel = Number(b.dataset.speed); S.set('orbitV2Speed', travel); renderSettings(); });
  $('#seg-guide').addEventListener('click', e => { const b = e.target.closest('[data-guide]'); if (!b) return; G.setGuide(b.dataset.guide); renderSettings(); });
  $('#seg-padsound').addEventListener('click', e => { const b = e.target.closest('[data-padsound]'); if (!b) return; G.setPadSound(b.dataset.padsound); renderSettings(); });
  $('#set-chopbank').addEventListener('change', e => G.setPadSound(null, e.target.value));
  $('#set-offset').addEventListener('input', e => { E.setOffset(Number(e.target.value)); $('#set-offset-out').textContent = (E.offsetMs > 0 ? '+' : '') + E.offsetMs + ' ms'; });
  $('#set-offset-reset').addEventListener('click', () => { E.setOffset(0); renderSettings(); });
  $('#set-silent').addEventListener('change', e => { E.setSilentFix(e.target.checked); renderAudioStatus(); });
  $('#set-test').addEventListener('click', async () => { E.unlock(); const ok = await E.ensureRunning(); if (ok) E.testSound(); else O.toast('No sound yet. Tap Test again.'); renderAudioStatus(); });
  $('#set-restart-audio').addEventListener('click', async () => {
    if (G.state === 'running') G.pause('user');
    BP.stopAll(); M.stop();
    E.needsRecreate = true; E.unlock();
    const ok = await E.ensureRunning();
    O.toast(ok ? 'Audio engine restarted.' : 'Tap again to finish restarting audio.');
    if (ok) BP.loadKit();
    renderAudioStatus();
  });
  $('#set-calib').addEventListener('click', () => openOverlay('ov-calib'));
  $('#set-intro').addEventListener('click', () => openOverlay('ov-intro'));
  $('#set-reset').addEventListener('click', () => openOverlay('ov-confirm'));
  $('#confirm-yes').addEventListener('click', () => { G.resetProgress(); closeOverlay('ov-confirm'); O.toast('Career progress reset.'); renderCareer(); });
  O.on('audio-state', () => { if (view === 'settings') renderAudioStatus(); });

  // ---------- theme + motion ----------
  function setTheme(name) {
    const h = document.documentElement, reduce = h.classList.contains('reduce-motion');
    h.className = (name === 'aero' ? 'theme-aero' : 'theme-grunge') + (reduce ? ' reduce-motion' : '');
    S.setRaw('orbitArcadeTheme', name === 'aero' ? 'aero' : 'grunge');
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = name === 'aero' ? '#03224c' : '#0b0a0e';
    readPalette(); drawHighway(); drawSpectrum();
    if (view === 'settings') renderSettings();
  }
  function setMotion(reduce) {
    document.documentElement.classList.toggle('reduce-motion', !!reduce);
    S.set('orbitV2Motion', reduce ? 'reduce' : 'full');
  }

  // ---------- overlays ----------
  const ovStack = [];
  function openOverlay(id) {
    const el = $('#' + id); if (!el || !el.hidden) return;
    el._return = document.activeElement;
    el.hidden = false; ovStack.push(id);
    const f = el.querySelector('.btn-start, .btn, button'); if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  function closeOverlay(id) {
    const el = $('#' + id); if (!el || el.hidden) return;
    el.hidden = true; const i = ovStack.indexOf(id); if (i >= 0) ovStack.splice(i, 1);
    if (id === 'ov-brief') G.stopDemo();
    if (id === 'ov-calib') stopCalib();
    try { if (el._return) el._return.focus({ preventScroll: true }); } catch (e) {}
  }
  $$('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeOverlay(ov.id); else if (e.target === ov && ov.id !== 'ov-audio' && ov.id !== 'ov-intro') closeOverlay(ov.id); });
  });

  // intro
  $('#intro-play').addEventListener('click', () => {
    S.set('orbitV2Intro', true);
    closeOverlay('ov-intro');
    G.select(0); G.setDifficulty('easy'); showView('play');
    G.start();
  });
  $('#intro-skip').addEventListener('click', () => { S.set('orbitV2Intro', true); closeOverlay('ov-intro'); });

  // equipment briefing
  let briefStage = 0, briefIdx = 0;
  function openBrief(stage) {
    briefStage = stage; briefIdx = 0;
    const ids = G.STAGE_LESSONS[stage], tabs = $('#brief-tabs'); tabs.replaceChildren();
    if (ids.length > 1) ids.forEach((id, k) => { const b = document.createElement('button'); b.className = 'btn btn-small'; b.textContent = G.LESSONS[id].control; b.addEventListener('click', () => { briefIdx = k; renderBrief(); }); tabs.append(b); });
    renderBrief();
    const briefed = S.get('orbitV2Briefed', {}); briefed[stage] = true; S.set('orbitV2Briefed', briefed);
    openOverlay('ov-brief');
  }
  function renderBrief() {
    const ids = G.STAGE_LESSONS[briefStage], L = G.LESSONS[ids[briefIdx]];
    $('#brief-eyebrow').textContent = 'EQUIPMENT · VENUE ' + String(briefStage + 1).padStart(2, '0') + ' · ' + G.VENUES[briefStage].name;
    $$('#brief-tabs .btn').forEach((b, k) => b.classList.toggle('is-on', k === briefIdx));
    $('#brief-name').textContent = L.name;
    $('#brief-purpose').textContent = L.purpose;
    $('#brief-practice').textContent = L.practice;
    $('#brief-mistakes').innerHTML = L.mistakes.map(m => '<li>' + m + '</li>').join('');
    $('#brief-challenge').textContent = L.challenge;
    $('#brief-demo-note').textContent = L.demo === 'cue' ? 'Plays the cue preview tone.' : 'Two bars normal, then two bars with the control in use.';
    $('#brief-demo').dataset.demo = L.demo;
  }
  $('#brief-demo').addEventListener('click', async e => { const msg = await G.demo(e.currentTarget.dataset.demo); $('#brief-demo-note').textContent = msg; });
  $('#brief-start').addEventListener('click', () => { closeOverlay('ov-brief'); if (G.stage !== briefStage) G.select(briefStage); showView('play'); G.start(); });

  // results
  O.on('finish', r => {
    if (!S.get('orbitV2FirstSetDone', false)) S.set('orbitV2FirstSetDone', true);
    setTimeout(() => {
      const v = G.VENUES[r.stage];
      $('#res-venue').textContent = v.name + ' · ' + G.DIFFS[r.difficulty].label;
      const gEl = $('#res-grade'); gEl.textContent = r.grade; gEl.classList.toggle('long', r.grade.length > 1);
      $('#res-stars').innerHTML = starsHTML(r.stars);
      $('#res-title').textContent = r.cleared ? 'VENUE CLEARED!' : 'KEEP PRACTISING';
      $('#res-score').textContent = r.score.toLocaleString();
      $('#res-pb').hidden = !r.newBest;
      $('#res-rhythm').textContent = r.rhythmPts + ' / 700 · ' + Math.round(r.accuracy * 100) + '%';
      $('#res-rhythm-bar').style.width = (r.rhythmPts / 7) + '%';
      $('#res-equip').textContent = r.equipmentPts + ' / 300 · ' + r.ctrlGrade;
      $('#res-equip-bar').style.width = (r.equipmentPts / 3) + '%';
      const c = r.counts;
      $('#res-counts').innerHTML = '<span>PERFECT <b>' + c.perfect + '</b></span><span>GREAT <b>' + c.great + '</b></span><span>GOOD <b>' + c.good + '</b></span><span>MISS <b>' + c.miss + '</b></span><span>MAX COMBO <b>' + r.maxCombo + '</b></span><span>TOTAL <b>' + r.combined + '/1000</b></span>';
      const next = $('#res-next');
      next.querySelector('span').textContent = r.stage < 3 ? 'NEXT VENUE' : 'PLAY AGAIN';
      openOverlay('ov-results');
    }, 450);
  });
  $('#res-retry').addEventListener('click', () => { closeOverlay('ov-results'); G.start(); });
  $('#res-career').addEventListener('click', () => { closeOverlay('ov-results'); G.state = 'idle'; O.emit('game-state', 'idle'); showView('career'); });
  $('#res-next').addEventListener('click', () => {
    closeOverlay('ov-results');
    if (G.stage < 3) { const n = G.stage + 1; G.select(n); const briefed = S.get('orbitV2Briefed', {}); if (!briefed[n]) { openBrief(n); return; } }
    G.start();
  });

  // audio recovery
  let audioReason = '';
  O.on('needs-audio', reason => {
    audioReason = reason;
    $('#audio-msg').textContent = reason === 'interrupted' ? 'Your phone paused audio (a call, Siri, an alarm or switching apps). Tap to bring it back.' : 'Tap to turn the sound on.';
    openOverlay('ov-audio');
  });
  $('#audio-resume').addEventListener('click', async () => {
    E.unlock();
    const ok = await E.ensureRunning();
    if (!ok) { $('#audio-msg').textContent = 'Still no sound. Tap once more. If it keeps failing, close other audio apps and check the volume.'; return; }
    closeOverlay('ov-audio');
    if (G.state === 'paused' && (audioReason === 'interrupted' || audioReason === 'resume')) G.resume();
    else if (audioReason === 'start') G.start();
  });

  // tap-test calibration
  let calib = null;
  function stopCalib() { if (calib) { clearTimeout(calib.timer); calib = null; } }
  $('#calib-go').addEventListener('click', async () => {
    stopCalib();
    if (!(await E.ensureRunning())) { $('#calib-msg').textContent = 'Tap Start again to enable sound.'; return; }
    const c = E.ctx, beat = 0.6, t0 = c.currentTime + 0.8, clicks = [];
    for (let i = 0; i < 12; i++) { const t = t0 + i * beat; clicks.push(t); O.synth.blip(c, E.nodes.pads, t, i % 4 === 0 ? 1320 : 880, 0.35, 0.06); }
    calib = { clicks, taps: [], timer: setTimeout(finishCalib, (t0 + 12 * beat - c.currentTime) * 1000 + 600) };
    $('#calib-msg').textContent = 'Tap on every click…';
  });
  const calibPad = $('#calib-pad');
  calibPad.addEventListener('pointerdown', e => {
    e.preventDefault(); calibPad.classList.add('is-down'); setTimeout(() => calibPad.classList.remove('is-down'), 90);
    if (calib) calib.taps.push(E.now(O.eventTime(e)) - E.latency());
  });
  function finishCalib() {
    if (!calib) return;
    const { clicks, taps } = calib; calib = null;
    const diffs = [];
    for (const t of taps) {
      let best = 0, bd = Infinity; clicks.forEach((ck, i) => { const d = t - ck; if (Math.abs(d) < Math.abs(bd)) { bd = d; best = i; } });
      if (best >= 2 && Math.abs(bd) < 0.35) diffs.push(bd);
    }
    if (diffs.length < 5) { $('#calib-msg').textContent = 'Not enough taps landed near the clicks (' + diffs.length + '). Try again and tap on every click.'; return; }
    diffs.sort((a, b) => a - b);
    const ms = Math.round(diffs[Math.floor(diffs.length / 2)] * 1000);
    E.setOffset(ms);
    $('#calib-msg').textContent = 'You tapped ' + Math.abs(ms) + ' ms ' + (ms >= 0 ? 'after' : 'before') + ' the clicks on average. Offset set to ' + (ms > 0 ? '+' : '') + E.offsetMs + ' ms.';
    renderSettings();
  }

  // ---------- keyboard ----------
  const keyLane = new Map();
  document.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const ae = document.activeElement, tag = ae && ae.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && ae.type !== 'range' && ae.type !== 'checkbox')) return;
    if (ovStack.length) { if (e.key === 'Escape') { const top = ovStack[ovStack.length - 1]; if (top !== 'ov-audio') closeOverlay(top); } return; }
    const k = e.key.toLowerCase();
    if (view === 'play') {
      const lane = LANE_KEYS.indexOf(k);
      if (lane >= 0) { e.preventDefault(); keyLane.set(k, lane); laneHit(lane, e); return; }
      if (e.code === 'Space') { e.preventDefault(); primaryAction(); return; }
      if (/^[1-8]$/.test(k)) { e.preventDefault(); BP.padDown(Number(k) - 1, O.eventTime(e), 1); }
    } else if (view === 'pads') {
      const i = PAD_KEYS.indexOf(k);
      if (i >= 0) { e.preventDefault(); padEls[i].classList.add('is-down'); BP.padDown(i, O.eventTime(e), 1); return; }
      if (e.code === 'Space') { e.preventDefault(); BP.togglePlay(); }
    }
  });
  document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keyLane.has(k)) { padUp(keyLane.get(k)); keyLane.delete(k); } const i = PAD_KEYS.indexOf(k); if (i >= 0 && view === 'pads') { padEls[i].classList.remove('is-down'); BP.padUp(undefined, i); } });

  // ---------- render loop (runs only while something is moving) ----------
  let raf = 0, wakeUntil = 0;
  function wake(ms) { wakeUntil = Math.max(wakeUntil, performance.now() + (ms || 900)); if (!raf) raf = requestAnimationFrame(loop); }
  function loop() {
    raf = 0;
    E.tick();
    G.update();
    if (view === 'play') {
      drawHighway(); updateStageMsg(); drawSpectrum();
      $('#progress').style.width = (G.state === 'running' || G.state === 'paused' ? O.clamp(G.songTime() / G.DURATION * 100, 0, 100) : G.state === 'finished' ? 100 : 0) + '%';
    } else if (view === 'pads') { drawLCD(false); }
    const busy = G.state === 'running' || M.playing || BP.playing;
    if (busy || performance.now() < wakeUntil) raf = requestAnimationFrame(loop);
  }

  // ---------- event wiring ----------
  O.on('stats', () => { renderHUD(); wake(); });
  O.on('game-state', () => { renderTransport(); renderHUD(); updateStageMsg(); wake(); });
  O.on('stage', () => { renderNowPlaying(); renderMixer(); renderHUD(); syncFaders(); stageKey = ''; updateStageMsg(); if (view === 'career') renderCareer(); wake(); });
  O.on('difficulty', () => { renderDifficulty(); if (view === 'career') renderCareer(); });
  O.on('style', renderStyle);
  O.on('levels', renderLevels);
  O.on('pad', () => wake());
  O.on('music', () => wake());
  O.on('demo', () => wake(400));
  O.on('progress-reset', () => { if (view === 'career') renderCareer(); });
  O.on('app-visible', () => { wake(); if (view === 'settings') renderAudioStatus(); });
  window.addEventListener('resize', () => requestAnimationFrame(resizeCanvases));
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvases, 250));
  if (window.ResizeObserver) new ResizeObserver(() => resizeCanvases()).observe($('#highway-wrap'));
  document.addEventListener('gesturestart', e => e.preventDefault()); // stop pinch-zoom on iOS during play
  document.addEventListener('dblclick', e => { if (!e.target.closest('input, select')) e.preventDefault(); });

  // ---------- service worker (versioned cache; never on file:// or the standalone build) ----------
  let updateRequested = false;
  if (!window.ORBIT_STANDALONE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            const t = $('#toast'); t.textContent = 'New version ready. Tap to update.'; t.classList.add('show'); t.style.pointerEvents = 'auto';
            t.onclick = () => { if (G.state === 'running') { O.toast('Finish or pause your set first.'); return; } updateRequested = true; w.postMessage('skipWaiting'); };
          }
        });
      });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
  }

  // ---------- init ----------
  readPalette();
  renderNowPlaying(); renderHUD(); renderTransport(); renderDifficulty(); renderStyle(); renderLevels(); renderMixer(); syncFaders(); renderBP();
  $('#ctrl-feedback').textContent = G.feedback || '';
  resizeCanvases(); updateStageMsg();
  if (!S.get('orbitV2Intro', false)) openOverlay('ov-intro');
  O.ui = { showView, openBrief, openOverlay, closeOverlay, setTheme, setMotion, wake, get view() { return view; }, calibClicks: () => (calib ? calib.clicks.slice() : null) };
})();
