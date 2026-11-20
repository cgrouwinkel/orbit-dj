/* ORBIT DJ v2 — interface controller: views, highway renderer, controls, overlays. */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, M = O.music, G = O.game, BP = O.beatpad, S = O.store, $ = O.$, $$ = O.$$;
  const LANE_KEYS = ['f', 'j', 'k', 'l'], PAD_KEYS = 'zxcvasdfqwer1234'; // MPC layout: bottom row = pads 1-4
  let view = 'play';
  let travel = Number(S.get('orbitV2Speed', 2.2)) || 2.2;
  const tut = { on: false, i: 0, preview: false };

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
    if (view === 'mix' && name !== 'mix') { O.decks.stopAll(); if (O.school.active) O.school.stop(); }
    if (name === 'mix') { if (G.state === 'running' || G.state === 'paused') G.stop(); G.stopDemo(); if (BP.playing) BP.stop(); }
    if (view === 'songs' && O.songs) O.songs.leave();
    if (name === 'songs') { if (G.state === 'running' || G.state === 'paused') G.stop(); G.stopDemo(); if (BP.playing) BP.stop(); }
    view = name;
    const studio = name === 'pads' || name === 'songs';
    document.documentElement.classList.toggle('in-mix', name === 'mix');
    document.documentElement.classList.toggle('in-studio', studio);
    $$('#studio-switch button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.studio === name)));
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tab').forEach(t => { const on = t.dataset.view === name || (studio && t.dataset.view === 'pads'); t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); });
    if (name === 'career') renderCareer();
    if (name === 'settings') renderSettings();
    if (name === 'pads') { renderBP(); BP.loadKit(); }
    if (name === 'mix' && O.mixui) O.mixui.enter();
    if (name === 'songs' && O.songs) O.songs.enter();
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
    const mNow = G.multiplier();
    if (mNow > lastMult && G.state === 'running') {
      if (mNow === 2 && O.scene && O.scene.aha()) { // the first streak of a set: the room goes "OHHHH", then the call to action
        callout('OHHHH! THAT’S A BEAT', 'hype');
        setTimeout(() => { if (G.state === 'running' && G.multiplier() >= 2) callout('HOLD IT: 8 MORE FOR ×3', 'mult'); }, 1500);
        if (!S.get('orbitV43Aha', false)) { S.set('orbitV43Aha', true); O.toast('That is the moment. Keep the streak going: every 8 hits in a row raises the multiplier.'); }
      } else callout('×' + mNow + ' MULTIPLIER', 'mult');
    }
    lastMult = mNow;
    renderHype(); if (tut.on) coachProgress();
    const c = G.counts; $('#ls-perfect').textContent = c.perfect; $('#ls-great').textContent = c.great; $('#ls-good').textContent = c.good; $('#ls-miss').textContent = c.miss; $('#ls-off').textContent = c.off; $('#ls-max').textContent = G.maxCombo;
    $('#hud-stars').innerHTML = starsHTML(st);
    $('#hud-stars').setAttribute('aria-label', st + ' of 3 stars');
  }
  function renderNowPlaying() {
    const v = G.VENUES[G.stage], c = G.custom;
    $('#np-venue').textContent = c ? 'QUICK PLAY · ' + M.STYLES[M.resolve(c.style)].label + ' · ' + c.bpm + ' BPM' : 'VENUE ' + String(G.stage + 1).padStart(2, '0') + ' · ' + v.name + ' · ' + v.bpm + ' BPM';
    $('#np-song').textContent = c ? c.name : v.song;
    $('#quick-name').textContent = c ? c.name : 'VENUE SONG'; $('#quick-exit').hidden = !c;
    document.documentElement.classList.toggle('is-battle', !!(c && c.battle));
  }

  // ---------- highway renderer ----------
  const hw = { cv: $('#highway'), ctx: null, w: 0, h: 0, dpr: 1, pal: null, flash: [0, 0, 0, 0], sparks: [], flames: [], inset: 0 };
  hw.ctx = hw.cv.getContext('2d');
  function readPalette() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    hw.pal = { lanes: [v('--lane0'), v('--lane1'), v('--lane2'), v('--lane3')], bg: v('--hw-bg'), lane: v('--hw-lane'), laneAlt: v('--hw-lane-alt'), sep: v('--hw-sep'), beat: v('--hw-beat'), bar: v('--hw-bar'), hit: v('--hw-hit'), glow: v('--hw-glow'),
      good: v('--good'), great: v('--great'), ok: v('--ok'), bad: v('--bad'), hype: v('--hype') || '#ffd84a', aero: document.documentElement.classList.contains('theme-aero') };
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
    // Both themes: a strip above the highway shows the room you are playing to (js/scene.js). Too short a canvas gets no strip.
    const sceneOn = !!O.scene, bandH = sceneOn && H - hw.inset >= 150 ? O.clamp((H - hw.inset) * 0.2, 32, 84) : 0;
    const hitY = H - 18, topY = bandH ? hw.inset + bandH : 2, k = 1.6, vy = (topY * (1 + k) - hitY) / k;
    const yAt = p => vy + (hitY - vy) / (1 + k * p), sAt = p => 1 / (1 + k * p);
    const margin = 4, bw = W - margin * 2, cx = W / 2;
    const xAt = (e, p) => cx + (e / 4 - 0.5) * bw * sAt(p);
    const pBottom = -((H - hitY) / (hitY - vy)) * (1 / k) - 0.02; // p where y reaches the canvas bottom
    const running = G.state === 'running' || G.state === 'paused' || G.state === 'finished';
    const now = running ? G.songTime() : 0, nowMs = performance.now();
    const hyped = running && G.hypeActive, beatLen = 60 / G.bpm();
    const pulse = hyped && !reduce ? 1 - (((now - G.leadIn) / beatLen % 1) + 1) % 1 : 0.4; // 1 on the beat, fading
    const midX = (lane, p) => (xAt(lane, p) + xAt(lane + 1, p)) / 2;
    const ell = (x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); };

    if (sceneOn) {
      O.scene.draw(c, W, H, { top: hw.inset, horizon: topY, aero: P.aero }, G, reduce);
      c.beginPath(); c.moveTo(xAt(0, 1), topY); c.lineTo(xAt(4, 1), topY); c.lineTo(xAt(4, pBottom), H); c.lineTo(xAt(0, pBottom), H); c.closePath();
      c.fillStyle = P.aero ? 'rgba(2,22,49,.88)' : 'rgba(9,8,11,.9)'; c.fill(); // the highway surface: dark, with a little of the room showing through
    }
    // lanes
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(xAt(i, 1), topY); c.lineTo(xAt(i + 1, 1), topY); c.lineTo(xAt(i + 1, pBottom), H); c.lineTo(xAt(i, pBottom), H); c.closePath();
      c.fillStyle = i % 2 ? P.laneAlt : P.lane; c.fill();
      const g = c.createLinearGradient(0, hitY, 0, hitY - H * 0.45);
      const f = Math.max(0, 1 - (nowMs - hw.flash[i]) / 220);
      g.addColorStop(0, hexA(P.lanes[i], 0.10 + f * 0.45)); g.addColorStop(1, hexA(P.lanes[i], 0));
      c.fillStyle = g; c.fill();
      if (hyped) { c.fillStyle = hexA(P.hype, 0.07 + 0.06 * pulse); c.fill(); }
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
    if (hyped) { c.shadowColor = P.hype; c.shadowBlur = reduce ? 0 : 18; }
    c.strokeStyle = hyped ? P.hype : P.hit; c.lineWidth = 3;
    c.beginPath(); c.moveTo(xAt(0, 0), hitY); c.lineTo(xAt(4, 0), hitY); c.stroke();
    if (hyped) { c.lineWidth = 2; for (const e of [0, 4]) { c.beginPath(); c.moveTo(xAt(e, 1), topY); c.lineTo(xAt(e, pBottom), H); c.stroke(); } }
    c.restore();
    // lane targets: rings the gems land in
    for (let i = 0; i < 4; i++) {
      const x0 = xAt(i, 0), x1 = xAt(i + 1, 0), rx = (x1 - x0) * 0.36, ry = Math.min(12, Math.max(5, rx * 0.4));
      const f = Math.max(0, 1 - (nowMs - hw.flash[i]) / 160);
      ell((x0 + x1) / 2, hitY, rx, ry);
      c.fillStyle = hexA(P.lanes[i], 0.14 + f * 0.75); c.fill();
      c.lineWidth = 2.5; c.strokeStyle = P.lanes[i]; c.stroke();
      ell((x0 + x1) / 2, hitY, rx * 0.5, ry * 0.5);
      c.lineWidth = 1.5; c.strokeStyle = hexA(P.lanes[i], 0.55); c.stroke();
    }
    // DJ moves: a band across the whole highway for as long as the move lasts
    if (running) for (const m of G.moves) {
      if (m.t - now > travel) break;
      if (now > m.t + m.dur + 0.2) continue;
      const p0 = Math.max(pBottom, (m.t - now) / travel), p1 = Math.min(1, (m.t + m.dur - now) / travel);
      if (p1 <= p0) continue;
      const col = m.done ? (m.hit ? P.good : P.bad) : P.hype, live = now >= m.t && !m.done;
      c.beginPath(); c.moveTo(xAt(0, p0), yAt(p0)); c.lineTo(xAt(0, p1), yAt(p1)); c.lineTo(xAt(4, p1), yAt(p1)); c.lineTo(xAt(4, p0), yAt(p0)); c.closePath();
      c.fillStyle = hexA(col, live ? 0.26 : 0.14); c.fill();
      c.strokeStyle = hexA(col, 0.9); c.lineWidth = 2; c.beginPath(); c.moveTo(xAt(0, p0), yAt(p0)); c.lineTo(xAt(4, p0), yAt(p0)); c.stroke();
      const ps = Math.max(p0, 0.02), sc = sAt(ps);
      if (sc > 0.42) { c.fillStyle = col; c.font = '900 ' + Math.round(8 + 9 * sc) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(m.label, cx, yAt(ps) - 3); }
    }
    // notes: sustain tails and round gems, drawn far-to-near so closer ones overlap
    if (running) {
      const vis = [];
      for (const n of G.notes) {
        if (n.t - now > travel) break;
        if (now - (n.t + (n.dur || 0)) > 0.3) continue;
        if (n.dur ? n.holdDone : n.hit) continue;
        if (n.hidden && !n.done) continue; // Headliner echo battle: play it by ear
        vis.push(n);
      }
      for (let q = vis.length - 1; q >= 0; q--) {
        const n = vis[q], col = n.rival ? '#9a97a3' : P.lanes[n.lane], missed = n.done && !n.hit;
        const held = !!(G.holding[n.lane] && G.holding[n.lane].n === n);
        const glow = n.hype !== undefined && G.phrases[n.hype] && !G.phrases[n.hype].dead && !n.done;
        let p = (n.t - now) / travel;
        if (n.dur) {
          const pT = Math.min(1, (n.t + n.dur - now) / travel), p0 = Math.max(pBottom, held ? 0 : p);
          if (pT > p0) {
            const hw0 = (xAt(n.lane + 1, p0) - xAt(n.lane, p0)) * 0.13, hw1 = (xAt(n.lane + 1, pT) - xAt(n.lane, pT)) * 0.13;
            c.beginPath(); c.moveTo(midX(n.lane, p0) - hw0, yAt(p0)); c.lineTo(midX(n.lane, pT) - hw1, yAt(pT)); c.lineTo(midX(n.lane, pT) + hw1, yAt(pT)); c.lineTo(midX(n.lane, p0) + hw0, yAt(p0)); c.closePath();
            c.save();
            if (held && !reduce) { c.shadowColor = col; c.shadowBlur = 16; }
            c.fillStyle = missed || n.dropped ? 'rgba(150,150,160,.28)' : hexA(col, held ? 0.95 : 0.6); c.fill();
            c.restore();
            c.lineWidth = 1; c.strokeStyle = missed || n.dropped ? 'rgba(255,255,255,.12)' : P.aero ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.7)'; c.stroke();
            if (held) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(midX(n.lane, p0), yAt(p0)); c.lineTo(midX(n.lane, pT), yAt(pT)); c.stroke(); }
          }
          if (held) p = 0; else if (n.hit) continue;
        }
        if (p < pBottom || p > 1) continue;
        const s = sAt(p), y = yAt(p), xc = midX(n.lane, p), rx = (xAt(n.lane + 1, p) - xAt(n.lane, p)) * 0.37, ry = Math.max(3.5, rx * 0.46);
        c.globalAlpha = missed ? 0.28 : 1;
        if (n.finale) { // the last hit of the song spans the whole highway
          c.save(); if (!reduce) { c.shadowColor = P.hype; c.shadowBlur = 14; }
          c.strokeStyle = P.hype; c.lineWidth = Math.max(2, 6 * s); c.beginPath(); c.moveTo(xAt(0, p), y); c.lineTo(xAt(4, p), y); c.stroke(); c.restore();
        }
        ell(xc, y + ry * 0.3, rx, ry); c.fillStyle = P.aero ? 'rgba(0,18,48,.7)' : 'rgba(0,0,0,.75)'; c.fill(); // rim / drop shadow
        c.save();
        if (glow && !reduce) { c.shadowColor = P.hype; c.shadowBlur = 10 + 8 * s; }
        const g = c.createLinearGradient(0, y - ry, 0, y + ry);
        g.addColorStop(0, glow ? '#ffffff' : hexA('#ffffff', 0.55)); g.addColorStop(0.3, col); g.addColorStop(1, hexA(col, P.aero ? 0.7 : 0.82));
        if (skin === 'neon' && !n.rival) { ell(xc, y, rx, ry); c.fillStyle = 'rgba(0,0,0,.55)'; c.fill(); if (!reduce) { c.shadowColor = col; c.shadowBlur = 12; } c.lineWidth = Math.max(2, ry * 0.35); c.strokeStyle = col; c.stroke(); }
        else if (skin === 'vinyl' && !n.rival) { ell(xc, y, rx, ry); c.fillStyle = '#0c0b10'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; for (const f of [0.86, 0.72]) { ell(xc, y, rx * f, ry * f); c.stroke(); } }
        else if (skin === 'gold' && !n.rival) { const gg = c.createLinearGradient(0, y - ry, 0, y + ry); gg.addColorStop(0, '#fff6c2'); gg.addColorStop(0.45, '#f2c230'); gg.addColorStop(1, '#8a5a00'); ell(xc, y, rx, ry); c.fillStyle = gg; c.fill(); }
        else { ell(xc, y, rx, ry); c.fillStyle = col; c.fill(); c.fillStyle = g; c.fill(); }
        const skinCap = n.rival || skin === 'classic' ? null : col;
        c.restore();
        c.lineWidth = glow ? 2.5 : 1.5; c.strokeStyle = glow ? P.hype : P.aero ? 'rgba(255,255,255,.9)' : '#000'; c.stroke();
        ell(xc, y - ry * 0.1, rx * 0.52, ry * 0.52); c.fillStyle = glow ? P.hype : skinCap ? skinCap : P.aero ? 'rgba(255,255,255,.92)' : '#f4efe6'; c.fill();
        c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.45)'; c.stroke();
        if (s > 0.55 && !missed && ry > 7) {
          c.fillStyle = '#0b0a0e'; c.font = '900 ' + Math.round(ry * 0.78) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(n.finale ? '★' : n.scr ? (n.scr === 'up' ? '▲' : '▼') : G.LANES[n.lane].name[0], xc, y - ry * 0.08);
        }
        c.globalAlpha = 1;
      }
    }
    // hit flames + rings
    if (!reduce) {
      const laneW = xAt(1, 0) - xAt(0, 0);
      c.save(); c.globalCompositeOperation = 'lighter';
      const tongue = (xc, w, h, col, a) => {
        const g = c.createLinearGradient(0, hitY, 0, hitY - h);
        g.addColorStop(0, hexA('#ffffff', a)); g.addColorStop(0.3, hexA(col, a * 0.9)); g.addColorStop(1, hexA(col, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(xc - w, hitY); c.quadraticCurveTo(xc - w, hitY - h * 0.5, xc, hitY - h); c.quadraticCurveTo(xc + w, hitY - h * 0.5, xc + w, hitY); c.closePath(); c.fill();
      };
      hw.flames = hw.flames.filter(f => nowMs - f.t < 360);
      for (const f of hw.flames) {
        const a = 1 - (nowMs - f.t) / 360, xc = midX(f.lane, 0), h = H * (f.big ? 0.24 : 0.17) * (0.55 + 0.45 * a);
        tongue(xc, laneW * 0.2, h, f.col, a);
        tongue(xc - laneW * 0.2, laneW * 0.12, h * 0.6, f.col, a * 0.8);
        tongue(xc + laneW * 0.2, laneW * 0.12, h * 0.66, f.col, a * 0.8);
      }
      for (const lane of Object.keys(G.holding)) { // a held note keeps burning
        const fl = 0.7 + 0.3 * Math.sin(nowMs / 37 + lane);
        tongue(midX(Number(lane), 0), laneW * 0.19, H * 0.2 * fl, P.lanes[lane], 0.85);
      }
      c.restore();
      hw.sparks = hw.sparks.filter(sp => nowMs - sp.t < 320);
      for (const sp of hw.sparks) {
        const a = 1 - (nowMs - sp.t) / 320, x0 = xAt(sp.lane, 0), x1 = xAt(sp.lane + 1, 0), r = (x1 - x0) * (0.35 + (1 - a) * 0.5);
        c.strokeStyle = hexA(sp.col, a); c.lineWidth = 3 * a + 1;
        c.beginPath(); c.ellipse((x0 + x1) / 2, hitY, r, r * 0.42, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    if (running) drawGauges(c, W, P, nowMs, reduce);
  }
  // Multiplier dial and crowd meter, drawn in the empty corner left of the lanes.
  function drawGauges(c, W, P, nowMs, reduce) {
    const R = O.clamp(W * 0.062, 16, 28), x = R + 8, y = hw.inset + R + 8, m = G.multiplier(), hyped = G.hypeActive;
    const col = hyped ? P.hype : [P.lanes[2], P.lanes[0], P.lanes[3], P.lanes[1]][m - 1], lit = m >= 4 ? 8 : G.combo % 8;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill();
    c.lineWidth = 4; c.lineCap = 'butt';
    for (let i = 0; i < 8; i++) {
      const a0 = -Math.PI / 2 + i * Math.PI / 4 + 0.07;
      c.strokeStyle = i < lit ? col : 'rgba(255,255,255,.16)';
      c.beginPath(); c.arc(x, y, R - 3, a0, a0 + Math.PI / 4 - 0.14); c.stroke();
    }
    c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 ' + Math.round(R * 0.8) + 'px system-ui, sans-serif';
    c.fillText('×' + m * (hyped ? 2 : 1), x, y + 1);
    if (G.drill) return;
    // crowd meter: red / amber / green zones with a needle
    const bw = 9, bh = R * 2.3, bx = x - bw / 2, by = y + R + 8, v = G.crowd;
    const zone = v < 0.34 ? P.bad : v < 0.67 ? '#ffd84a' : P.good, danger = G.canFail() && v < 0.2;
    c.fillStyle = 'rgba(0,0,0,.6)'; rr(c, bx - 2, by - 2, bw + 4, bh + 4, 4); c.fill();
    [[0, P.bad], [1, '#ffd84a'], [2, P.good]].forEach(([i, zc]) => { c.fillStyle = hexA(zc, 0.22); c.fillRect(bx, by + bh - (i + 1) * bh / 3, bw, bh / 3 - 1); });
    c.fillStyle = danger && !reduce && Math.floor(nowMs / 180) % 2 ? '#ffffff' : zone; c.fillRect(bx, by + bh * (1 - v), bw, bh * v);
    c.fillStyle = '#fff'; c.fillRect(bx - 3, by + bh * (1 - v) - 1, bw + 6, 2);
    c.fillStyle = danger ? P.bad : 'rgba(255,255,255,.7)'; c.font = '800 7px system-ui, sans-serif'; c.fillText('CROWD', x, by + bh + 9);
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
      setStage('idle' + G.stage + tut.on + (G.custom ? G.custom.id : ''), tut.on ? '' : G.custom ? '<div class="title">QUICK PLAY</div><div class="sub">Tap START SET.</div>' : '<div class="title">' + v.name + '</div><div class="sub">' + (first ? 'Tap START SET. When a note hits the line, tap its lane or pad.' : v.tag + ' Tap START SET.') + '</div>');
    } else if (G.state === 'running') {
      const now = G.songTime(), beat = 60 / G.bpm();
      if (now < G.leadIn) {
        const n = Math.ceil((G.leadIn - now) / beat - 0.02);
        if (n <= 4 && n >= 1) setStage('cd' + n + !!G.drill, '<div class="big">' + n + '</div>' + (G.drill ? '' : '<div class="sub">' + (first ? 'Notes are coming. Tap when they touch the line.' : 'Count it in…') + '</div>'));
        else setStage('pre', '<div class="title">GET READY</div>');
      } else if (now < G.leadIn + beat) setStage('go', '<div class="big">GO!</div>');
      else if (G.custom && G.custom.battle) { // echo battle: whose turn, and the running score
        const turn = G.battleTurn(now), you = G.score, riv = G.rivalScore;
        setStage('bt' + turn + (you >= riv), '<div class="battle-turn ' + turn + '">' + (turn === 'rival' ? 'LISTEN: ' + G.custom.battle.rival.name : turn === 'you' ? 'YOUR TURN: PLAY IT BACK' : '') + '</div>');
        const sc = 'YOU ' + you.toLocaleString() + '  ·  ' + G.custom.battle.rival.name + ' ' + riv.toLocaleString();
        if ($('#battle-score').textContent !== sc) $('#battle-score').textContent = sc;
      }
      else setStage('', '');
    } else if (G.state === 'paused') {
      const why = { background: 'Paused when you left the app.', audio: 'Sound was interrupted by your phone.', user: 'Press RESUME when you’re ready.' }[G.pauseReason] || 'Press RESUME when you’re ready.';
      setStage('paused' + G.pauseReason, '<div class="title">PAUSED</div><div class="sub">' + why + '</div>');
    } else if (G.state === 'finished') setStage('done' + G.failed, '<div class="title">' + (G.failed ? 'THE CROWD WALKED OUT' : 'SET COMPLETE') + '</div>');
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
      hw.flames.push({ lane: j.lane, t: performance.now(), col: j.hype ? hw.pal.hype : hw.pal.lanes[j.lane], big: j.kind === 'perfect' });
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
    activePointers.set(e.pointerId, i); swipeY.set(e.pointerId, e.clientY); laneHit(i, e);
  });
  hw.cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = hw.cv.getBoundingClientRect(), i = O.clamp(Math.floor((e.clientX - r.left) / r.width * 4), 0, 3);
    activePointers.set(e.pointerId, i); swipeY.set(e.pointerId, e.clientY); laneHit(i, e);
  });
  // Scratch: drag up or down on the FX lane (pad or highway). Each change of direction is another scratch.
  const swipeY = new Map();
  const scratchMove = e => {
    if (activePointers.get(e.pointerId) !== 3 || !swipeY.has(e.pointerId)) return;
    const dy = e.clientY - swipeY.get(e.pointerId);
    if (Math.abs(dy) < 16) return;
    swipeY.set(e.pointerId, e.clientY);
    G.scratch(dy < 0 ? 'up' : 'down', O.eventTime(e)); hw.flash[3] = performance.now(); wake();
  };
  lanePads.addEventListener('pointermove', scratchMove); hw.cv.addEventListener('pointermove', scratchMove);
  const release = e => { if (activePointers.has(e.pointerId)) { const i = activePointers.get(e.pointerId); padUp(i); G.release(i); activePointers.delete(e.pointerId); } };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => { lanePads.addEventListener(t, release); hw.cv.addEventListener(t, release); });
  lanePads.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- callouts (streaks, multiplier, HYPE) ----------
  const calloutEl = $('#callout');
  function callout(text, cls) {
    calloutEl.textContent = text; calloutEl.className = 'callout ' + (cls || '');
    try { calloutEl.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    if (calloutEl.animate) calloutEl.animate(O.reducedMotion() ? [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }] : [{ transform: 'translateY(10px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { transform: 'translateY(-8px)', opacity: 0 }], { duration: 1300, fill: 'forwards', easing: 'ease-out' });
    wake(1400);
  }
  let lastMult = 1;
  O.on('streak', n => callout(n + ' NOTE STREAK!', 'streak'));
  O.on('finale', () => { if (G.crowd >= 0.34 && !(G.custom && G.custom.battle)) callout('BIG FINISH!', 'hype'); });
  O.on('rival', r => { hw.flash[r.lane] = performance.now(); hw.sparks.push({ lane: r.lane, t: performance.now(), col: '#c9c6d2' }); wake(); });
  let moveHelp = !S.get('orbitV4MoveHelp', false);
  O.on('move', e => {
    if (e.type === 'start') { callout(e.m.label, 'hype'); if (moveHelp) { moveHelp = false; S.set('orbitV4MoveHelp', true); O.toast('DJ move: slide the glowing control to the marker and hold it there.'); } }
    else if (e.type === 'hit') callout('NICE MOVE! +' + 300 * G.multiplier(), 'streak');
    wake();
  });
  O.on('hold', h => { if (h.complete) hw.flames.push({ lane: h.lane, t: performance.now(), col: hw.pal.lanes[h.lane], big: true }); if (tut.on) coachProgress(); wake(); });

  // ---------- HYPE button (doubles as the HYPE meter) ----------
  const hypeBtn = $('#btn-hype');
  let hypeKey = '';
  function renderHype() {
    const pctFill = Math.round(G.hype * 100), ready = G.hypeReady(), key = pctFill + '|' + ready + '|' + G.hypeActive;
    if (key === hypeKey) return; hypeKey = key;
    hypeBtn.style.setProperty('--fill', pctFill + '%');
    hypeBtn.classList.toggle('is-ready', ready); hypeBtn.classList.toggle('is-active', G.hypeActive);
    hypeBtn.setAttribute('aria-label', G.hypeActive ? 'HYPE active, double points' : ready ? 'Fire HYPE for double points (key H)' : 'HYPE meter ' + pctFill + ' percent. Hit glowing notes to charge it.');
    hypeBtn.querySelector('small').textContent = G.hypeActive ? '×2' : ready ? 'TAP!' : pctFill + '%';
    document.documentElement.classList.toggle('is-hype', G.hypeActive);
  }
  hypeBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (!G.activateHype() && G.state === 'running' && !G.hypeActive) O.toast('Hit a full run of glowing notes to charge HYPE.'); });
  O.on('hype', h => {
    if (h.type === 'on') callout('HYPE! DOUBLE POINTS', 'hype');
    else if (h.type === 'phrase') callout(h.ready ? 'HYPE READY!' : 'HYPE +25%', 'hype');
    renderHype(); if (tut.on) coachProgress(); wake();
  });

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
  // DJ moves: a ghost marker on each slider shows where the move wants it
  const ghosts = { xf: [xf, null], eq: [eq, null], filter: [filt, null] };
  for (const k of Object.keys(ghosts)) { const g = document.createElement('i'); g.className = 'ghost'; g.hidden = true; const wrap = document.createElement('div'); wrap.className = 'ghost-wrap'; ghosts[k][0].parentNode.insertBefore(wrap, ghosts[k][0]); wrap.append(ghosts[k][0], g); ghosts[k][1] = g; }
  function renderGhosts() {
    const now = G.state === 'running' ? G.songTime() : -1;
    for (const k of Object.keys(ghosts)) {
      const g = ghosts[k][1], m = now < 0 ? null : G.activeMove(k, now), ctrl = g.closest('.ctrl');
      if (!m) { if (!g.hidden) { g.hidden = true; ctrl.classList.remove('is-target', 'is-ontarget'); } continue; }
      const v = G.moveTarget(m, now);
      g.hidden = false; g.style.left = 'calc(11px + ' + (v * 100).toFixed(1) + '% - ' + (v * 22).toFixed(1) + 'px)';
      ctrl.classList.add('is-target'); ctrl.classList.toggle('is-ontarget', Math.abs(G.pos[k] - v) <= 0.15);
    }
  }
  function renderFaderOuts() {
    G.pos.xf = Number(xf.value) / 100; G.pos.eq = Number(eq.value) / 150; G.pos.filter = Number(filt.value) / 1000;
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
  // ---------- career map (v4): every venue is a chapter of different level types ----------
  const gigStars = r => (!r ? 0 : r.score >= 90 ? 3 : r.score >= 75 ? 2 : r.score >= 55 ? 1 : 0);
  const CAREER = [
    [{ t: 'set' }, { t: 'battle' }, { t: 'beat', id: 'boombap' }],
    [{ t: 'set' }, { t: 'battle' }, { t: 'beat', id: 'soul' }, { t: 'gig', id: 'backroom' }],
    [{ t: 'set' }, { t: 'battle' }, { t: 'beat', id: 'house' }, { t: 'gig', id: 'warmup' }, { t: 'gig', id: 'peak' }],
    [{ t: 'set' }, { t: 'battle' }, { t: 'beat', id: 'trap' }, { t: 'gig', id: 'closing' }, { t: 'gig', id: 'afterhours' }, { t: 'night' }]
  ];
  const RANKS = [[0, 'BEDROOM DJ'], [6, 'OPEN-DECK REGULAR'], [14, 'LOCAL OPENER'], [24, 'RESIDENT'], [36, 'HEADLINER'], [48, 'LEGEND']];
  const SKINS = [['classic', 'CLASSIC', 0], ['vinyl', 'VINYL', 5], ['neon', 'NEON', 15], ['gold', 'GOLD', 30]];
  const UNLOCK_AT = 4; // stars needed in a venue to open the next one
  function nodeInfo(v, n) {
    const SC = O.school;
    if (n.t === 'set') return { label: 'SET', sub: G.VENUES[v].song, stars: (G.progress[v] || {}).stars || 0, go: () => playVenue(v) };
    if (n.t === 'battle') return { label: 'ECHO BATTLE', sub: 'vs ' + G.RIVALS[v].name, stars: Math.max(0, ...['easy', 'normal', 'expert'].map(d => (G.quickBests['battle:' + v + ':' + d] || {}).stars || 0)), go: () => { G.select(v); G.setCustom(G.battle(v)); showView('play'); } };
    if (n.t === 'beat') { const c = SC.BEAT_CHALLENGES.find(x => x.id === n.id); return { label: 'BEAT CHALLENGE', sub: c.name, stars: (SC.progress.challenges[n.id] || {}).stars || 0, go: () => { showView('pads'); const t = document.querySelector('[data-bptab="train"]'); if (t) t.click(); E.unlock(); SC.startChallenge(n.id).then(() => SC.listenChallenge()); } }; }
    if (n.t === 'gig') { const g = SC.GIGS.find(x => x.id === n.id); return { label: 'MIX GIG', sub: g.name, stars: gigStars(SC.progress.gigs[n.id]), go: () => { showView('mix'); E.unlock(); SC.startGig(n.id); } }; }
    return { label: 'CLUB NIGHT', sub: 'You pick the tracks', stars: (SC.progress.night || {}).stars || 0, go: () => { showView('mix'); E.unlock(); O.night.start(); } };
  }
  const venueStars = v => CAREER[v].reduce((n, x) => n + nodeInfo(v, x).stars, 0);
  const careerStars = () => CAREER.reduce((n, _, v) => n + venueStars(v), 0);
  const unlockAll = () => S.get('orbitV4UnlockAll', false) === true;
  const venueOpen = v => v === 0 || unlockAll() || venueStars(v - 1) >= UNLOCK_AT || !!(G.progress[v] && G.progress[v].stars);
  const rankFor = n => RANKS.filter(r => n >= r[0]).pop()[1];
  const skinOpen = id => unlockAll() || careerStars() >= SKINS.find(k => k[0] === id)[2];
  let skin = S.get('orbitV4Skin', 'classic'); if (!SKINS.some(k => k[0] === skin)) skin = 'classic';
  // Tell the player when stars have opened something new (a venue, a rank, a highway skin).
  function checkRewards() {
    const seen = S.get('orbitV4Rewards', null), n = careerStars(), now = { stars: n, rank: rankFor(n), venues: CAREER.map((_, v) => venueOpen(v)), skins: SKINS.filter(k => n >= k[2]).map(k => k[0]) };
    if (seen) {
      const msgs = [];
      now.venues.forEach((o, v) => { if (o && !seen.venues[v]) msgs.push(G.VENUES[v].name + ' is open'); });
      now.skins.forEach(k => { if (!seen.skins.includes(k)) msgs.push(SKINS.find(x => x[0] === k)[1] + ' highway skin unlocked (Setup)'); });
      if (now.rank !== seen.rank && n > seen.stars) msgs.push('New rank: ' + now.rank);
      if (msgs.length) setTimeout(() => O.toast('★ ' + msgs.join(' · ')), 1400);
    }
    S.set('orbitV4Rewards', now);
  }
  ['finish', 'gig-result', 'challenge-result'].forEach(ev => O.on(ev, () => setTimeout(checkRewards, 50)));
  function renderCareer() {
    const t = G.totals(), total = careerStars();
    $('#car-rank').textContent = rankFor(total) + ' · ' + total + '/' + CAREER.reduce((n, c) => n + c.length * 3, 0) + ' STARS';
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
      const open = venueOpen(i), nodes = document.createElement('div'); nodes.className = 'node-row';
      CAREER[i].slice(1).forEach(n => { const info = nodeInfo(i, n), b = document.createElement('button'); b.className = 'node' + (info.stars ? ' is-done' : ''); b.disabled = !open; b.innerHTML = '<b>' + info.label + '</b><span>' + info.sub + '</span><em>' + '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars) + '</em>'; b.addEventListener('click', info.go); nodes.append(b); });
      card.classList.toggle('is-locked', !open); play.disabled = !open;
      if (!open) { const lock = document.createElement('div'); lock.className = 'vlock'; lock.textContent = 'Earn ' + UNLOCK_AT + ' stars at ' + G.VENUES[i - 1].name + ' to open (' + venueStars(i - 1) + '/' + UNLOCK_AT + ')'; card.append(lock); }
      card.append(play, nodes);
      grid.append(card);
    });
    const SC = O.school, gigs = Object.values(SC.progress.gigs);
    $('#car-mix').textContent = Object.keys(SC.progress.mix).length + '/' + SC.LESSONS.length + ' lessons · ' + gigs.length + '/' + SC.GIGS.length + ' gigs' + (gigs.length ? ' · best ' + Math.max(...gigs.map(g => g.score)) : '');
    $('#car-beat').textContent = Object.keys(SC.progress.beat).length + '/' + SC.BEAT_LESSONS.length + ' lessons';
  }
  $('#car-mix-go').addEventListener('click', () => { showView('mix'); O.mixui.openSchool(); });
  $('#car-beat-go').addEventListener('click', () => { showView('pads'); const t = document.querySelector('[data-bptab="train"]'); if (t) t.click(); });
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
    setRadio($('#seg-moves'), 'data-moves', G.movesOn ? 'on' : 'off');
    const sk = $('#seg-skin'); sk.innerHTML = SKINS.map(k => '<button role="radio" data-skin="' + k[0] + '"' + (skinOpen(k[0]) ? '' : ' disabled') + '>' + k[1] + (skinOpen(k[0]) ? '' : ' · ' + k[2] + '★') + '</button>').join(''); setRadio(sk, 'data-skin', skin);
    setRadio($('#seg-unlock'), 'data-unlock', unlockAll() ? 'on' : 'off');
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
  $('#seg-skin').addEventListener('click', e => { const b = e.target.closest('[data-skin]'); if (!b || b.disabled) return; skin = b.dataset.skin; S.set('orbitV4Skin', skin); renderSettings(); wake(); });
  $('#seg-unlock').addEventListener('click', e => { const b = e.target.closest('[data-unlock]'); if (!b) return; S.set('orbitV4UnlockAll', b.dataset.unlock === 'on'); renderSettings(); });
  $('#seg-moves').addEventListener('click', e => { const b = e.target.closest('[data-moves]'); if (!b) return; G.setMoves(b.dataset.moves === 'on'); renderSettings(); });
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
  $('#confirm-yes').addEventListener('click', () => { G.resetProgress(); O.school.resetProgress(); closeOverlay('ov-confirm'); O.toast('Career progress reset.'); renderCareer(); });
  O.on('audio-state', () => { if (view === 'settings') renderAudioStatus(); });

  // ---------- theme + motion ----------
  function setTheme(name) {
    const h = document.documentElement, reduce = h.classList.contains('reduce-motion');
    h.className = (name === 'aero' ? 'theme-aero' : 'theme-grunge') + (reduce ? ' reduce-motion' : '');
    S.setRaw('orbitArcadeTheme', name === 'aero' ? 'aero' : 'grunge');
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = name === 'aero' ? '#03224c' : '#0b0a0e';
    readPalette(); drawHighway(); drawSpectrum(); O.emit('theme', name);
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
    O.emit('overlay-closed', id);
  }
  $$('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeOverlay(ov.id); else if (e.target === ov && !['ov-audio', 'ov-intro', 'ov-tutsong', 'ov-tutstep'].includes(ov.id) && !(ov.id === 'ov-map' && tut.on)) closeOverlay(ov.id); });
  });

  // ---------- tutorial: self-paced. Pick a song, tour the controller, then five drills that each wait for a tap ----------
  const TUT = [
    { id: 'kick', title: 'PADS: KICK', goal: 'kicks', lanes: [0],
      real: 'The eight rubber pads under each jog wheel. In sampler mode a pad plays its sound the instant you press it.',
      why: 'The kick drum marks the beat. DJs count kicks to find beat 1, and every mix starts from beat 1.',
      text: 'Notes slide down the lanes. When one lands on the ring, tap the KICK pad (or the lane itself).' },
    { id: 'snare', title: 'PADS: SNARE', goal: 'snares', lanes: [1],
      real: 'The next pad in the same bank. Pads sit side by side so two fingers can trade kick and snare. That is finger drumming.',
      why: 'The snare answers the kick. Kick, snare, kick, snare is the count that beatmatching relies on.',
      text: 'Same move, next lane. Listen for the tick and tap the SNARE pad with it.' },
    { id: 'beat', title: 'FULL BEAT + HI-HAT', goal: 'notes', lanes: [0, 1, 2],
      real: 'Three pads in play at once: kick, snare, hi-hat. On real pads this is drumming live over a running track.',
      why: 'Music moves in bars of four beats and phrases of eight bars. DJs time every move to the start of one, so a steady pattern is the core skill.',
      text: 'Kick, snare, then hi-hats in between. Every 8 hits in a row raises your multiplier, up to ×4.' },
    { id: 'hold', title: 'HOLD: MOMENTARY PADS', goal: 'hold finished', lanes: [3],
      real: 'Some pad modes only work while the pad is down. A loop roll repeats a slice and a pad effect runs until you let go.',
      why: 'Holding for an exact number of beats and releasing on the beat is how a roll or an echo ends cleanly into the next bar.',
      text: 'A note with a tail is a hold. Tap it on the FX pad and keep your finger down until the tail runs out.' },
    { id: 'hype', title: 'HYPE: SAVE IT FOR THE PEAK', goal: 'HYPE fired', lanes: [0, 1],
      real: 'HYPE is ORBIT’s own scoring button; no controller has one. The nearest real control is the FX ON button in the effects section.',
      why: 'DJs keep effects for the big moment so they still mean something. Same rule here: charge it, then fire it.',
      text: 'Glowing notes charge HYPE. Hit a whole glowing run, then tap the round HYPE button for double points.' }
  ];
  // Standard two-deck controller layout. `orbit` says where the same control lives in this app.
  const MAP = [
    { id: 'jog', name: 'JOG WHEEL', where: 'The big round platter on each deck.', what: 'Turning it nudges the track slightly ahead or behind. Touching the top surface scratches.', why: 'It is how you line two tracks up by hand when their beats drift apart.', orbit: 'Mix tab: drag the platter on either deck.' },
    { id: 'transport', name: 'CUE + PLAY / PAUSE', where: 'Two large buttons at the bottom-left of each deck.', what: 'CUE marks a start point and jumps back to it. PLAY / PAUSE starts and stops the deck.', why: 'Set the cue on the first beat, then press PLAY on the beat so the new track lands in time.', orbit: 'Mix tab: CUE and the play button under each platter.' },
    { id: 'tempo', name: 'TEMPO FADER + SYNC', where: 'A long fader on the outer edge of each deck, with a SYNC button nearby.', what: 'The fader speeds the track up or slows it down. SYNC matches it to the other deck for you.', why: 'Two tracks only blend cleanly at the same tempo. Matching them is called beatmatching.', orbit: 'Mix tab: the fader beside each platter, plus SYNC.' },
    { id: 'pads', name: 'PERFORMANCE PADS', where: 'Eight rubber pads under each jog wheel, with mode buttons above them.', what: 'Hot Cue jumps to a marked spot. Loop and Roll repeat a section. Sampler fires one-shot sounds.', why: 'They let you rearrange a track live instead of only letting it play.', orbit: 'Play tab: KICK, SNARE, HAT and FX are sampler pads. Mix tab: PADS on each deck.' },
    { id: 'eq', name: 'TRIM + 3-BAND EQ', where: 'The top four knobs of each mixer channel: TRIM (gain), HI, MID, LOW.', what: 'TRIM sets how loud a track arrives. HI, MID and LOW turn treble, middle and bass up or down.', why: 'Match the level of two tracks, and cut the bass on one so two basslines never play together.', orbit: 'Mix tab: GAIN, HI, MID and LOW on each side of the mixer.' },
    { id: 'filter', name: 'FILTER', where: 'One knob per channel, under the EQ.', what: 'Turned left it removes the highs; turned right it removes the lows. Centre is off.', why: 'A sweep builds tension before a drop and tucks one track under another.', orbit: 'Mix tab: FILTER on each channel. Play tab: opens at Main Stage.' },
    { id: 'cue', name: 'HEADPHONE CUE', where: 'A small button on each channel, above its fader.', what: 'Sends that channel to your headphones only, even with its fader down.', why: 'You line up the next track in private before the crowd hears it.', orbit: 'Mix tab: the headphone buttons A and B, and SPLIT.' },
    { id: 'fader', name: 'CHANNEL FADERS', where: 'The two vertical faders in the middle of the mixer.', what: 'Each one sets how loud its deck is in the speakers.', why: 'Bring the next track in gradually over a phrase instead of all at once.', orbit: 'Mix tab: the tall faders beside the level meters.' },
    { id: 'xf', name: 'CROSSFADER', where: 'The horizontal fader at the bottom centre.', what: 'Left plays deck A, right plays deck B, centre plays both.', why: 'Fast cuts between decks, and the fader hand when scratching.', orbit: 'Mix tab: A to B along the bottom. On the Play tab it blends the melody and bass layers of one song, not two decks.' }
  ];
  const mapSvg = () => {
    const r = (x, y, w, h, rx) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 2) + '"/>', ci = (x, y, rad) => '<circle cx="' + x + '" cy="' + y + '" r="' + rad + '"/>';
    const both = f => f(0) + f(194), chans = f => f(143) + f(177), shapes = {
      jog: both(d => ci(54 + d, 54, 32) + ci(54 + d, 54, 9)), transport: both(d => r(10 + d, 108, 16, 22) + r(10 + d, 134, 16, 22)),
      tempo: both(d => r(102 + d, 22, 6, 66, 3) + r(98 + d, 48, 14, 9)), pads: both(d => [0, 1, 2, 3].map(i => r(32 + d + i * 19, 108, 16, 22) + r(32 + d + i * 19, 134, 16, 22)).join('')),
      eq: chans(x => [16, 33, 50, 67].map(y => ci(x, y, 6)).join('')), filter: chans(x => ci(x, 86, 6)), cue: chans(x => r(x - 7, 99, 14, 8)),
      fader: chans(x => r(x - 2, 114, 4, 30) + r(x - 7, 122, 14, 7)), xf: r(134, 157, 52, 4) + r(154, 152, 12, 14)
    }, badge = { jog: [54, 54], transport: [18, 119], tempo: [105, 12], pads: [40, 119], eq: [160, 41], filter: [160, 86], cue: [160, 103], fader: [160, 129], xf: [125, 159] };
    return '<svg viewBox="0 0 320 174" role="img" aria-label="Diagram of a two-deck DJ controller"><rect class="map-body" x="1" y="1" width="318" height="172" rx="10"/><path class="map-body" d="M116 8V166M204 8V166"/>' +
      MAP.map((m, i) => '<g class="map-part" data-part="' + i + '">' + shapes[m.id] + '<circle class="map-badge" cx="' + badge[m.id][0] + '" cy="' + badge[m.id][1] + '" r="7"/><text class="map-num" x="' + badge[m.id][0] + '" y="' + (badge[m.id][1] + 3) + '" text-anchor="middle">' + (i + 1) + '</text></g>').join('') + '</svg>';
  };
  let mapAt = 0;
  function mapShow(i) {
    mapAt = (i + MAP.length) % MAP.length; const m = MAP[mapAt];
    $('#map-name').textContent = (mapAt + 1) + ' / ' + MAP.length + ' · ' + m.name;
    $('#map-where').textContent = m.where; $('#map-what').textContent = m.what; $('#map-why').textContent = m.why; $('#map-orbit').textContent = m.orbit;
    $$('#map-svg .map-part').forEach(g => g.classList.toggle('is-on', Number(g.dataset.part) === mapAt));
  }
  function openMap() {
    if (!$('#map-svg').firstChild) $('#map-svg').innerHTML = mapSvg();
    const t = tut.on;
    $('#map-eyebrow').textContent = t ? 'TUTORIAL · 2 OF 3 · THE CONTROLLER' : 'CONTROLLER MAP';
    $('#map-x').hidden = t; $('#map-back').hidden = !t; $('#map-skip').hidden = !t;
    $('#map-go').querySelector('span').textContent = t ? 'TRY THE PADS' : 'GOT IT';
    $('#map-note').textContent = t ? 'The standard two-deck layout. The drills use the pads (4). Tap any number to see the rest.' : 'The standard two-deck layout. Tap a number or use the arrows.';
    mapShow(t ? 3 : mapAt); // in the tutorial, open on the pads: they are what the drills use
    openOverlay('ov-map');
  }
  $('#map-svg').addEventListener('click', e => { const g = e.target.closest('.map-part'); if (g) mapShow(Number(g.dataset.part)); });
  $('#map-prev').addEventListener('click', () => mapShow(mapAt - 1));
  $('#map-next').addEventListener('click', () => mapShow(mapAt + 1));
  $('#map-go').addEventListener('click', () => { closeOverlay('ov-map'); if (tut.on) tutCard(0); });
  $('#map-back').addEventListener('click', () => { closeOverlay('ov-map'); if (tut.on) tutSongOpen(); });
  $('#set-map').addEventListener('click', openMap);

  const coach = $('#coach');
  const teach = lanes => $$('#lane-pads .lane-pad').forEach((b, i) => b.classList.toggle('is-teach', !!lanes && lanes.includes(i)));
  function coachShow(on) {
    coach.hidden = !on;
    document.documentElement.classList.toggle('is-tutorial', on);
    hw.inset = on ? coach.offsetHeight + 2 : 0;
    hypeBtn.style.top = on ? hw.inset + 6 + 'px' : '';
  }
  function coachRender(note) {
    const st = TUT[tut.i];
    $('#coach-step').textContent = (tut.i + 1) + ' / ' + TUT.length + ' · ' + st.title;
    $('#coach-text').textContent = note || st.text;
    coach.classList.toggle('is-pass', !!note && note.startsWith('NICE'));
    coachProgress();
    coachShow(true);
  }
  function coachProgress() {
    const d = G.drill, st = TUT[tut.i]; if (!st) return;
    const txt = d ? Math.min(d.count(G), d.goal) + ' / ' + d.goal + ' ' + st.goal : '';
    if ($('#coach-count').textContent !== txt) $('#coach-count').textContent = txt;
    if (d && d.id === 'hype' && G.hypeReady() && !coach.dataset.hint) { coach.dataset.hint = '1'; $('#coach-text').textContent = 'HYPE is charged. Tap the round HYPE button now!'; }
  }
  // 1 of 3: the song. Rows preview on tap; nothing moves on until the player confirms.
  let tutPick = null;
  const tutSongs = () => O.songs.builtin().slice().sort((a, b) => a.bpm - b.bpm);
  function tutStopPreview() { if (tut.preview) { tut.preview = false; M.stop(); } }
  function tutSongRender() {
    $('#tutsong-list').replaceChildren(...tutSongs().map(c => {
      const b = document.createElement('button'); b.className = 'track-row' + (tutPick && tutPick.id === c.id ? ' is-on' : '');
      b.innerHTML = '<b></b><span>' + M.STYLES[c.style].label + ' · ' + c.bpm + ' BPM</span><em>' + (tutPick && tutPick.id === c.id ? (tut.preview ? 'PLAYING' : 'CHOSEN') : c.bpm < 100 ? 'SLOW' : c.bpm < 136 ? 'MEDIUM' : 'FAST') + '</em>';
      b.firstChild.textContent = c.name;
      b.addEventListener('click', () => tutSongPick(c));
      return b;
    }));
    const go = $('#tutsong-go'); go.disabled = !tutPick; go.querySelector('span').textContent = tutPick ? 'USE THIS SONG' : 'CHOOSE A SONG';
  }
  async function tutSongPick(c) {
    tutPick = c; tutStopPreview(); tutSongRender();
    E.unlock();
    if (!(await E.ensureRunning())) return; // chosen, just not audible yet; the next tap will play it
    if (G.state === 'running' || G.state === 'paused') G.stop(); G.stopDemo(); if (BP.playing) BP.stop(); O.decks.stopAll();
    await O.assets.ensure(M.assetsFor(c.style), 8000);
    if (tutPick !== c || $('#ov-tutsong').hidden) return;
    const t0 = E.ctx.currentTime + 0.12;
    M.start({ style: c.style, bpm: c.bpm, origin: t0, mode: 'jam', endAt: t0 + (c.bpm >= 120 ? 8 : 4) * 240 / c.bpm - 0.01 });
    tut.preview = true; tutSongRender();
  }
  O.on('music', m => { if (tut.preview && !m.playing) { tut.preview = false; if (!$('#ov-tutsong').hidden) tutSongRender(); } });
  function tutSongOpen() { tutSongRender(); openOverlay('ov-tutsong'); }
  $('#tutsong-go').addEventListener('click', () => {
    if (!tutPick) return;
    tutStopPreview();
    G.tutSong = { style: tutPick.style, bpm: tutPick.bpm, name: tutPick.name, id: tutPick.id };
    closeOverlay('ov-tutsong'); openMap();
  });
  // 3 of 3: each drill opens on a card (what the control is on real gear, why it matters, what to do) and waits.
  function tutCard(i) {
    if (G.drill) G.endDrill();
    tut.i = i; const st = TUT[i];
    coachShow(false); teach(null);
    $('#tutstep-eyebrow').textContent = 'TUTORIAL · 3 OF 3 · DRILL ' + (i + 1) + ' OF ' + TUT.length + (G.tutSong ? ' · ' + G.tutSong.name.toUpperCase() : '');
    $('#tutstep-title').textContent = st.title;
    $('#tutstep-real').textContent = st.real; $('#tutstep-why').textContent = st.why; $('#tutstep-now').textContent = st.text;
    stageKey = ''; updateStageMsg();
    openOverlay('ov-tutstep');
  }
  $('#tutstep-go').addEventListener('click', () => { closeOverlay('ov-tutstep'); tutStep(); });
  $('#tutstep-back').addEventListener('click', () => { closeOverlay('ov-tutstep'); if (tut.i > 0) tutCard(tut.i - 1); else openMap(); });
  async function tutStep() {
    delete coach.dataset.hint;
    teach(TUT[tut.i].lanes);
    coachRender('');
    await G.startDrill(TUT[tut.i].id);
    if (tut.on) { hw.inset = coach.offsetHeight + 2; coachProgress(); wake(); }
  }
  function tutStart() {
    S.set('orbitV2Intro', true);
    closeOverlay('ov-intro');
    if (G.state === 'running' || G.state === 'paused') G.stop();
    if (view !== 'play') showView('play');
    tut.on = true; tut.i = 0; tutPick = null; G.tutSong = null;
    stageKey = '';
    tutSongOpen();
  }
  function tutEnd(done) {
    const was = tut.on; tut.on = false;
    tutStopPreview();
    ['ov-tutsong', 'ov-map', 'ov-tutstep'].forEach(closeOverlay);
    coachShow(false); teach(null);
    if (G.drill) G.endDrill();
    if (done) S.set('orbitV22Tutorial', true);
    stageKey = ''; updateStageMsg(); wake();
    return was;
  }
  O.on('drill', d => {
    if (!tut.on) return;
    if (d.status === 'pass') coachRender('NICE! ' + (tut.i < TUT.length - 1 ? 'Next: ' + TUT[tut.i + 1].title + ', when you are ready.' : 'That’s everything.'));
    else if (d.status === 'retry') coachRender(d.id === 'hold' ? 'Again: tap the note, then keep holding until its tail is gone.' : d.id === 'hype' ? 'Again: hit every glowing note in a run, then tap HYPE.' : 'One more time. Tap right as the note lands on the ring.');
    else if (d.status === 'done') {
      if (tut.i + 1 < TUT.length) tutCard(tut.i + 1); // stops here until the player taps TRY IT
      else {
        tutEnd(true);
        $('#tut-play-label').textContent = G.tutSong ? 'PLAY ' + G.tutSong.name.toUpperCase() : 'PLAY YOUR FIRST SET';
        openOverlay('ov-tutdone');
      }
    } else if (d.status === 'abort') { tutEnd(false); O.toast('Tutorial stopped. Replay it from Setup.'); }
  });
  const tutSkip = () => { tutEnd(true); O.toast('Tutorial skipped. Replay it any time from Setup.'); };
  $('#coach-skip').addEventListener('click', tutSkip);
  $$('[data-tut-skip]').forEach(b => b.addEventListener('click', tutSkip));
  $('#intro-play').addEventListener('click', tutStart);
  $('#intro-skip').addEventListener('click', () => { S.set('orbitV2Intro', true); S.set('orbitV22Tutorial', true); closeOverlay('ov-intro'); });
  $('#tut-play').addEventListener('click', () => {
    closeOverlay('ov-tutdone');
    const mine = G.tutSong && O.songs.builtin().find(c => c.id === G.tutSong.id);
    if (mine) G.setCustom(mine); else if (G.stage !== 0) G.select(0); // the song they learned on, as a Quick Play set
    G.setDifficulty('easy');
    G.start();
  });

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
      $('#res-venue').textContent = (r.custom || v.name) + ' · ' + G.DIFFS[r.difficulty].label;
      const gEl = $('#res-grade'); gEl.textContent = r.grade; gEl.classList.toggle('long', r.grade.length > 1);
      $('#res-stars').innerHTML = starsHTML(r.stars);
      $('#res-title').textContent = r.battle ? (r.battle.won ? 'YOU BEAT ' + r.battle.rival + '!' : r.battle.rival + ' WINS ' + r.battle.rivalScore.toLocaleString() + ' TO ' + r.score.toLocaleString()) : r.failed ? 'CROWD WALKED OUT AT ' + Math.round(r.progressPct * 100) + '%' : r.custom ? (r.cleared ? 'NICE SET!' : 'KEEP PRACTISING') : r.cleared ? 'VENUE CLEARED!' : 'KEEP PRACTISING';
      $('#res-score').textContent = r.score.toLocaleString();
      $('#res-pb').hidden = !r.newBest;
      $('#res-rhythm').textContent = r.rhythmPts + ' / 700 · ' + Math.round(r.accuracy * 100) + '%';
      $('#res-rhythm-bar').style.width = (r.rhythmPts / 7) + '%';
      $('#res-equip').textContent = r.equipmentPts + ' / 300 · ' + r.ctrlGrade;
      $('#res-equip-bar').style.width = (r.equipmentPts / 3) + '%';
      const c = r.counts;
      $('#res-counts').innerHTML = '<span>PERFECT <b>' + c.perfect + '</b></span><span>GREAT <b>' + c.great + '</b></span><span>GOOD <b>' + c.good + '</b></span><span>MISS <b>' + c.miss + '</b></span><span>BEST STREAK <b>' + r.maxCombo + '</b></span><span>HOLDS <b>' + r.holdsDone + '/' + r.holdsTotal + '</b></span>' + (r.movesTotal ? '<span>DJ MOVES <b>' + r.movesDone + '/' + r.movesTotal + '</b></span>' : '') + '<span>HYPE <b>×' + r.hypeUses + '</b></span><span>TOTAL <b>' + r.combined + '/1000</b></span>';
      const next = $('#res-next');
      next.querySelector('span').textContent = r.failed ? 'TRY AGAIN' : r.custom ? 'PLAY AGAIN' : r.stage < 3 ? 'NEXT VENUE' : 'PLAY AGAIN';
      openOverlay('ov-results');
    }, 450);
  });
  $('#res-retry').addEventListener('click', () => { closeOverlay('ov-results'); G.start(); });
  $('#res-career').addEventListener('click', () => { closeOverlay('ov-results'); G.state = 'idle'; O.emit('game-state', 'idle'); showView('career'); });
  $('#res-next').addEventListener('click', () => {
    closeOverlay('ov-results');
    if (G.lastResult && (G.lastResult.failed || G.lastResult.custom)) { G.start(); return; }
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
    else if (audioReason === 'drill' && tut.on) tutStep();
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
    if (ovStack.length) { if (e.key === 'Escape') { const top = ovStack[ovStack.length - 1]; if (top !== 'ov-audio' && !(tut.on && /^ov-(tutsong|tutstep|map)$/.test(top))) closeOverlay(top); } return; }
    const k = e.key.toLowerCase();
    if (view === 'play') {
      const lane = LANE_KEYS.indexOf(k);
      if (lane >= 0) { e.preventDefault(); keyLane.set(k, lane); laneHit(lane, e); return; }
      if (e.code === 'Space') { e.preventDefault(); primaryAction(); return; }
      if (k === 'h' || k === 'enter') { e.preventDefault(); G.activateHype(); return; }
      if ((k === 'arrowup' || k === 'arrowdown') && view === 'play') { e.preventDefault(); G.scratch(k === 'arrowup' ? 'up' : 'down'); wake(); return; }
      if (/^[1-8]$/.test(k)) { e.preventDefault(); BP.padDown(Number(k) - 1, O.eventTime(e), 1); }
    } else if (view === 'pads') {
      const i = PAD_KEYS.indexOf(k);
      if (i >= 0) { e.preventDefault(); padEls[i].classList.add('is-down'); BP.padDown(i, O.eventTime(e), 1); return; }
      if (e.code === 'Space') { e.preventDefault(); BP.togglePlay(); }
    }
  });
  document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keyLane.has(k)) { padUp(keyLane.get(k)); G.release(keyLane.get(k)); keyLane.delete(k); } const i = PAD_KEYS.indexOf(k); if (i >= 0 && view === 'pads') { padEls[i].classList.remove('is-down'); BP.padUp(undefined, i); } });

  // ---------- render loop (runs only while something is moving) ----------
  let raf = 0, wakeUntil = 0;
  function wake(ms) { wakeUntil = Math.max(wakeUntil, performance.now() + (ms || 900)); if (!raf) raf = requestAnimationFrame(loop); }
  function loop() {
    raf = 0;
    E.tick();
    G.update();
    if (view === 'play') {
      drawHighway(); updateStageMsg(); drawSpectrum(); if (G.state === 'running') renderHype(); renderGhosts();
      $('#progress').style.width = (G.state === 'running' || G.state === 'paused' ? O.clamp(G.songTime() / G.DURATION * 100, 0, 100) : G.state === 'finished' ? 100 : 0) + '%';
    } else if (view === 'pads') { drawLCD(false); }
    else if (view === 'mix' && O.mixui) O.mixui.frame();
    O.decks.tick(); O.school.tick();
    const busy = G.state === 'running' || M.playing || BP.playing || O.decks.anyPlaying() || (view === 'mix' && !!O.school.active) || (view === 'pads' && !!O.school.beatActive);
    if ((busy || performance.now() < wakeUntil) && !raf) raf = requestAnimationFrame(loop); // !raf: something in this frame may already have called wake()
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
  if (!S.get('orbitV22Tutorial', false)) openOverlay('ov-intro'); // new players land straight in the tutorial
  // a real controller's pads on the Play tab (js/midi.js): same as touching the lane pads
  const lanePress = (i, down, ts) => { if (down) { padDown(i); G.tap(i, O.eventTime({ timeStamp: ts })); } else { padUp(i); G.release(i); } };
  O.ui = { lanePress, career: { CAREER, careerStars, venueOpen, venueStars, rankFor, checkRewards, setSkin: k => { skin = k; } }, tutorial: tut, tutStart, tutEnd, showView, openBrief, openOverlay, closeOverlay, setTheme, setMotion, wake, get view() { return view; }, calibClicks: () => (calib ? calib.clicks.slice() : null) };
})();
