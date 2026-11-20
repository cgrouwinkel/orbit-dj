/* ORBIT DJ — live-show scene behind the highway (both themes).
 * You are the DJ. In front of you is the room you are playing to: your friends on the couch at the crib,
 * then a house party, a club and a festival crowd. They react to how the set is going (the crowd meter),
 * and the first time you lock into a streak everyone goes "OHHHH". All of it is drawn in code: original art,
 * no assets from any other game.
 * Grunge Arcade: dim, warm, hazy rooms. Cyber Aero (v4.3.1): the same rooms as glossy sky-blue spaces —
 * a window with clouds, a glass couch, orb lights, balloons, an LED wall, a grid floor and rising bubbles.
 */
(function () {
  'use strict';
  const O = window.ORBIT, clamp = O.clamp;
  const ROOMS = [
    { id: 'crib', wall: ['#1c1511', '#2b1d15'], wash: ['#ffb23a', '#46e0a0'], people: 3, couch: true },
    { id: 'party', wall: ['#1b1020', '#2c1632'], wash: ['#ff2d87', '#ffb23a'], people: 6, lights: true },
    { id: 'club', wall: ['#06121a', '#0b2a2e'], wash: ['#24e2ff', '#ff2d87'], people: 13, beams: true },
    { id: 'stage', wall: ['#120c1c', '#2a1b10'], wash: ['#ffd21a', '#24e2ff'], people: 18, beams: true, rows: 2 }
  ];
  // Cyber Aero colours for the same rooms
  const AERO = {
    crib: { wall: ['#0d5797', '#1b86c2'], wash: ['#7dffb8', '#5ff6ff'] },
    party: { wall: ['#0b3c80', '#2063ae'], wash: ['#ff6ad5', '#5ff6ff'] },
    club: { wall: ['#021d42', '#053a68'], wash: ['#5ff6ff', '#c4a2ff'] },
    stage: { wall: ['#03285a', '#0a5690'], wash: ['#fff27a', '#5ff6ff'] }
  };
  const HOODIES = ['#6b7a3a', '#7a4468', '#3f6676', '#8a5a2c', '#51508a', '#2f7a5c'];
  const HOODIES_AERO = ['#35c8f0', '#a98cf0', '#5fe0a4', '#4a8fe8', '#f07ccc', '#7fd8f0'];
  const QUIPS = {
    crib: { rough: ['bro. what is this', 'is it plugged in?', 'pass the aux', '…you good?'], hype: ['RUN IT BACK!', 'AYOOO'], streak: ['wait he’s actually DJing', 'who taught you that'], fail: ['we’re getting food'], win: ['one more. ONE MORE.'] },
    crowd: { rough: ['?', 'BOOO', 'next DJ!'], hype: ['LET’S GO!', 'AYOOO'], streak: ['TUNE!', 'RELOAD!'], fail: ['*leaves*'], win: ['ONE MORE TUNE!'] }
  };
  const S = { set: null, aha: false, ahaAt: -1e9, flashAt: -1e9, bubble: null, missRun: 0, quipAt: -1e9, n: 0 };
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')'; };
  const pick = arr => arr[(S.n++) % arr.length];
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else c.rect(x, y, w, h); };

  function roomFor(G) {
    if (G.drill) return ROOMS[0]; // the tutorial happens at the crib
    if (G.custom) { const st = O.music.resolve(G.custom.style || 'house'); return ROOMS[st === 'boombap' ? 0 : st === 'soul' ? 1 : st === 'dubstep' || st === 'trap' ? 3 : 2]; }
    return ROOMS[clamp(G.stage || 0, 0, 3)];
  }
  function say(text, ms) { S.bubble = { text, at: performance.now(), ms: ms || 2200, who: S.n % 3 }; S.quipAt = performance.now(); }
  // The "aha": the first ×2 of a set. Returns true the first time so the caller can show its call to action.
  function aha() {
    if (S.aha) return false;
    S.aha = true; S.ahaAt = performance.now(); say('OHHHH', 2600);
    return true;
  }

  O.on('judge', j => {
    const G = O.game; if (G.state !== 'running') return;
    if (j.kind === 'miss' || j.kind === 'off') { if (++S.missRun === 4 && performance.now() - S.quipAt > 5000) say(pick(QUIPS[roomFor(G).couch ? 'crib' : 'crowd'].rough)); }
    else { S.missRun = 0; if (j.kind === 'perfect') S.flashAt = performance.now(); }
  });
  O.on('hype', h => { if (h.type === 'on') { S.flashAt = performance.now(); say(pick(QUIPS[roomFor(O.game).couch ? 'crib' : 'crowd'].hype)); } });
  O.on('streak', n => { if (n >= 50) say(pick(QUIPS[roomFor(O.game).couch ? 'crib' : 'crowd'].streak)); });
  O.on('finish', r => { const q = QUIPS[roomFor(O.game).couch ? 'crib' : 'crowd']; if (r && r.failed) say(q.fail[0], 4000); else if (O.game.crowd > 0.7) say(q.win[0], 4000); });

  // o: { bob, slump, up, wow, cap, ember, phone, gloss, rim, t, skin }
  function person(c, x, y, r, col, o) {
    const hy = y - r * 2.1 - o.bob + o.slump, ink = o.gloss ? '#062447' : '#17131a';
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y, r * 1.55, r * 1.5, 0, Math.PI, 0); c.fill(); // shoulders
    if (o.up) { // arms in the air
      c.strokeStyle = col; c.lineWidth = Math.max(2, r * 0.5); c.lineCap = 'round';
      for (const s of [-1, 1]) { const w = Math.sin(o.t * 6 + x) * r * 0.25; c.beginPath(); c.moveTo(x + s * r * 1.2, y - r * 0.9); c.lineTo(x + s * r * 1.7 + w, hy - r * 1.2); c.stroke(); }
    }
    c.fillStyle = o.skin; c.beginPath(); c.arc(x, hy, r, 0, Math.PI * 2); c.fill();
    if (o.cap === 1) { c.fillStyle = col; c.beginPath(); c.arc(x, hy - r * 0.15, r * 1.02, Math.PI, 0); c.fill(); } // beanie
    else if (o.cap === 2) { c.fillStyle = o.gloss ? '#0a1f3a' : '#17131a'; c.beginPath(); c.arc(x, hy - r * 0.2, r * 1.35, Math.PI * 0.95, Math.PI * 0.05); c.fill(); } // big hair
    if (o.rim) { c.strokeStyle = o.rim; c.lineWidth = 1.2; c.beginPath(); c.arc(x, hy, r, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); } // backlit silhouette
    if (o.gloss) { c.fillStyle = 'rgba(255,255,255,.32)'; c.beginPath(); c.ellipse(x - r * 0.35, hy - r * 0.5, r * 0.38, r * 0.2, -0.5, 0, Math.PI * 2); c.fill(); } // glossy highlight
    if (r >= 5) { // face
      c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        if (o.wow) { c.beginPath(); c.arc(x + s * r * 0.38, hy - r * 0.05, r * 0.17, 0, Math.PI * 2); c.fill(); }
        else if (o.slump > 0.5) { c.beginPath(); c.moveTo(x + s * r * 0.38 - r * 0.18, hy); c.lineTo(x + s * r * 0.38 + r * 0.18, hy); c.stroke(); }
        else { c.beginPath(); c.arc(x + s * r * 0.38, hy - r * 0.05, r * 0.11, 0, Math.PI * 2); c.fill(); }
      }
      if (o.wow) { c.beginPath(); c.ellipse(x, hy + r * 0.48, r * 0.2, r * 0.26, 0, 0, Math.PI * 2); c.fill(); }
      else { c.beginPath(); c.arc(x, hy + r * 0.3, r * 0.32, o.slump > 0.5 ? Math.PI * 1.15 : 0.15 * Math.PI, o.slump > 0.5 ? Math.PI * 1.85 : 0.85 * Math.PI); c.stroke(); }
    }
    if (o.ember) { // one of them is holding a lit one; a thin wisp drifts up
      const ex = x + r * 1.5, ey = hy + r * 0.5, glow = 0.55 + 0.45 * Math.sin(o.t * 0.9);
      c.strokeStyle = '#e9e2d0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + r * 0.7, hy + r * 0.45); c.lineTo(ex, ey); c.stroke();
      c.fillStyle = hexA('#ff7a1a', glow); c.beginPath(); c.arc(ex, ey, 1.8 + glow, 0, Math.PI * 2); c.fill();
      for (let k = 0; k < 4; k++) { const q = (o.t * 0.25 + k / 4) % 1; c.fillStyle = 'rgba(220,235,220,' + (0.16 * (1 - q)).toFixed(3) + ')'; c.beginPath(); c.arc(ex + Math.sin(q * 5 + k) * 4, ey - q * r * 4.5, 2 + q * 5, 0, Math.PI * 2); c.fill(); }
    }
    if (o.phone) { // Aero: one of them is on their phone… until the set gets good and it goes up to film you
      const up = o.phone === 2, sd = up ? -1 : 1, px = x + sd * r * (up ? 1.8 : 1.1), py = up ? hy - r * 1.7 : y - r * 1.15, pw = r * 0.62, ph = r * 1.05;
      c.strokeStyle = col; c.lineWidth = Math.max(2, r * 0.45); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + sd * r * 1.1, y - r * 0.8); c.lineTo(px, py + ph * 0.4); c.stroke();
      c.fillStyle = '#0a1f3a'; rrect(c, px - pw / 2, py - ph / 2, pw, ph, r * 0.15); c.fill();
      c.fillStyle = up ? '#e8ffff' : '#5ff6ff'; rrect(c, px - pw / 2 + 1, py - ph / 2 + 1, pw - 2, ph - 2, r * 0.1); c.fill();
      if (up) { c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(px, py - ph * 0.22, Math.max(1, r * 0.12), 0, Math.PI * 2); c.fill(); } // recording
      const gl = c.createRadialGradient(px, py, 0, px, py, r * 2.2); gl.addColorStop(0, 'rgba(160,250,255,.28)'); gl.addColorStop(1, 'rgba(160,250,255,0)');
      c.fillStyle = gl; c.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
    }
    return hy;
  }

  // g: { top, horizon, aero } = top of the scene, top edge of the highway, and which theme draws it.
  function draw(c, W, H, g, G, reduce) {
    const room = roomFor(G), A = !!g.aero, pal = A ? AERO[room.id] : room, nowMs = performance.now(), t = reduce ? 0 : nowMs / 1000, running = G.state === 'running';
    if (running && S.set !== G.notes) { S.set = G.notes; S.aha = false; S.missRun = 0; S.bubble = null; S.ahaAt = -1e9; }
    const crowd = running || G.state === 'finished' || G.state === 'paused' ? G.crowd : 0.5, hyped = running && G.hypeActive;
    const beat = 60 / G.bpm(), ph = running && !reduce ? ((((G.songTime() - G.leadIn) / beat) % 1) + 1) % 1 : 1, pulse = Math.max(0, 1 - ph * 2.4);
    const ahaK = clamp(1 - (nowMs - S.ahaAt) / 1600, 0, 1), flash = clamp(1 - (nowMs - S.flashAt) / 260, 0, 1);
    const band = g.horizon - g.top, [w0, w1] = pal.wash, cx = W / 2;
    // wall and floor
    let gr = c.createLinearGradient(0, g.top, 0, g.horizon + 4); gr.addColorStop(0, pal.wall[0]); gr.addColorStop(1, pal.wall[1]);
    c.fillStyle = gr; c.fillRect(0, 0, W, g.horizon + 4);
    gr = c.createLinearGradient(0, g.horizon, 0, H);
    if (A) { gr.addColorStop(0, '#0a4f86'); gr.addColorStop(0.35, '#04294f'); gr.addColorStop(1, '#021631'); } else { gr.addColorStop(0, '#120e0d'); gr.addColorStop(1, '#070607'); }
    c.fillStyle = gr; c.fillRect(0, g.horizon, W, H - g.horizon);
    if (A) { // a digital grid floor running out from under the room (it shows beside the highway)
      c.strokeStyle = 'rgba(140,240,255,.22)'; c.lineWidth = 1; c.beginPath(); // one path, one stroke
      for (let i = 1; i <= 7; i++) { const y = g.horizon + (H - g.horizon) * Math.pow(i / 7, 1.8); c.moveTo(0, y); c.lineTo(W, y); }
      for (let i = -6; i <= 6; i++) { c.moveTo(cx + i * W * 0.06, g.horizon); c.lineTo(cx + i * W * 0.42, H); }
      c.stroke();
    }
    // coloured light: two washes from the top corners, brighter as the room warms up
    const lit = (A ? 0.12 : 0.16) + 0.26 * crowd + 0.12 * pulse * crowd + (hyped ? 0.14 : 0) + 0.3 * ahaK;
    for (const [x, col] of [[W * 0.08, w0], [W * 0.92, w1]]) {
      gr = c.createRadialGradient(x, g.top, 4, x, g.top, Math.max(W, H) * 0.75); gr.addColorStop(0, hexA(col, Math.min(0.6, lit))); gr.addColorStop(1, hexA(col, 0));
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
    }
    if (room.beams) { // moving beams from the rig
      for (let i = 0; i < 4; i++) {
        const x0 = W * (0.14 + 0.24 * i), a = Math.sin(t * (0.5 + i * 0.13) + i * 1.9) * 0.55, x1 = x0 + Math.tan(a) * H * 0.9, wd = W * 0.07, col = i % 2 ? w1 : w0;
        gr = c.createLinearGradient(x0, g.top, x1, H * 0.9); gr.addColorStop(0, hexA(col, 0.07 + 0.2 * crowd + 0.1 * flash)); gr.addColorStop(1, hexA(col, 0));
        c.fillStyle = gr; c.beginPath(); c.moveTo(x0 - 2, g.top); c.lineTo(x0 + 2, g.top); c.lineTo(x1 + wd, H * 0.9); c.lineTo(x1 - wd, H * 0.9); c.closePath(); c.fill();
      }
    }
    if (band >= 30) {
      const r = clamp(band * 0.17, 4, 13), baseY = g.horizon - (room.couch ? r * 0.9 : 0), span = room.couch ? Math.min(W * 0.56, r * 12) : W * 0.9, n = room.people;
      if (A && room.beams) { // LED wall behind the crowd: an equaliser that moves with the beat and the crowd
        const lw = W * (room.rows ? 0.78 : 0.6), lh = band * 0.5, lx = cx - lw / 2, ly = g.top + band * 0.08, bars = room.rows ? 18 : 14, bw = lw / bars;
        c.fillStyle = 'rgba(2,16,40,.7)'; rrect(c, lx, ly, lw, lh, 5); c.fill();
        const bg = c.createLinearGradient(0, ly + lh - 3, 0, ly + 3); bg.addColorStop(0, hexA(w1, 0.9)); bg.addColorStop(1, hexA(w0, 0.95));
        c.fillStyle = bg; c.beginPath(); // all the bars in one path, one fill
        for (let i = 0; i < bars; i++) {
          const v = clamp(0.15 + 0.55 * crowd * (0.55 + 0.45 * Math.abs(Math.sin(t * 2.2 + i * 0.9))) + 0.3 * pulse * crowd + 0.4 * ahaK, 0.08, 1), h = (lh - 6) * v;
          c.rect(lx + i * bw + bw * 0.18, ly + lh - 3 - h, bw * 0.64, h);
        }
        c.fill();
        gr = c.createLinearGradient(0, ly, 0, ly + lh * 0.5); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; rrect(c, lx, ly, lw, lh * 0.5, 5); c.fill();
        c.strokeStyle = 'rgba(190,240,255,.45)'; c.lineWidth = 1; rrect(c, lx, ly, lw, lh, 5); c.stroke();
      }
      if (A && room.lights) { // balloons in the corners
        for (const [bx, col, k] of [[W * 0.2, '#ff6ad5', 0], [W * 0.35, '#5ff6ff', 1], [W * 0.65, '#fff27a', 2], [W * 0.8, '#c4a2ff', 3]]) {
          const by = g.top + band * (0.2 + 0.08 * (k % 2)) + Math.sin(t * 0.8 + k) * 2, br = r * 0.85;
          c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by + br); c.lineTo(bx + Math.sin(t + k) * 2, g.horizon - r); c.stroke();
          c.fillStyle = hexA(col, 0.85); c.beginPath(); c.ellipse(bx, by, br * 0.85, br, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(bx - br * 0.3, by - br * 0.4, br * 0.22, br * 0.32, -0.4, 0, Math.PI * 2); c.fill();
        }
      }
      if (room.couch || room.lights) { // string lights along the ceiling (glossy orbs in Aero)
        for (let i = 0, m = Math.floor(W / 22); i <= m; i++) {
          const x = i / m * W, y = g.top + 5 + Math.sin(i / m * Math.PI) * band * 0.1, on = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.3 + i * 1.7));
          const col = (A ? [w0, w1, '#ff6ad5', '#fff27a'] : [w0, w1, '#ff2d87', '#c6ff1a'])[i % 4];
          c.fillStyle = hexA(col, on * (0.5 + 0.5 * crowd)); c.beginPath(); c.arc(x, y, A ? 2.8 : 2, 0, Math.PI * 2); c.fill();
          if (A) { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - 0.9, y - 0.9, 0.9, 0, Math.PI * 2); c.fill(); }
        }
      }
      if (room.couch) { // posters (a window with sky in Aero), a lava lamp and the couch
        const wx = cx - span * 0.78, wy = g.top + band * 0.2;
        if (A) {
          const ww = r * 3.2, wh = r * 2.6; gr = c.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#c9f6ff'); gr.addColorStop(1, '#46b8ea');
          c.fillStyle = gr; rrect(c, wx, wy, ww, wh, r * 0.4); c.fill();
          c.fillStyle = 'rgba(255,255,255,.9)'; const cl = wx + ww * 0.3 + Math.sin(t * 0.07) * ww * 0.2;
          for (const [dx, dy, rad] of [[0, 0, 0.42], [0.42, -0.18, 0.5], [0.85, 0, 0.38]]) { c.beginPath(); c.arc(cl + dx * r, wy + wh * 0.62 + dy * r, rad * r, 0, Math.PI * 2); c.fill(); }
          c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.5; rrect(c, wx, wy, ww, wh, r * 0.4); c.stroke();
          c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.stroke();
          c.fillStyle = 'rgba(255,255,255,.12)'; rrect(c, cx + span * 0.62, g.top + band * 0.16, r * 2.6, r * 2, r * 0.4); c.fill();
          c.strokeStyle = hexA(w0, 0.6); c.lineWidth = 1.5; c.beginPath(); c.arc(cx + span * 0.62 + r * 1.3, g.top + band * 0.16 + r, r * 0.55, 0, Math.PI * 2); c.stroke();
        } else {
          c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(wx, wy, r * 2.2, r * 2.8); c.fillRect(cx + span * 0.62, g.top + band * 0.16, r * 2.6, r * 2);
          c.strokeStyle = hexA(w1, 0.5); c.lineWidth = 1.5; c.beginPath(); c.arc(wx + r * 1.1, wy + r * 1.4, r * 0.7, 0, Math.PI * 2); c.stroke();
        }
        const lx = cx + span * 0.56, ly = g.horizon - r * 3.4; c.fillStyle = hexA(w1, A ? 0.4 : 0.28); c.beginPath(); c.ellipse(lx, ly + r * 1.6, r * 0.6, r * 1.7, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = hexA(A ? '#ffffff' : w1, 0.85); c.beginPath(); c.arc(lx, ly + r * 1.6 + Math.sin(t * 0.6) * r * 0.9, r * 0.36, 0, Math.PI * 2); c.fill();
        if (A) { // glass couch: translucent aqua with a bright rim
          c.fillStyle = 'rgba(150,235,255,.3)'; rrect(c, cx - span / 2, baseY - r * 2.2, span, r * 3.4, r * 0.9); c.fill();
          c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = 1.5; c.stroke();
          gr = c.createLinearGradient(0, baseY - r * 2.2, 0, baseY - r * 0.8); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = gr; rrect(c, cx - span / 2 + 2, baseY - r * 2.2 + 2, span - 4, r * 1.3, r * 0.7); c.fill();
          for (const s of [-1, 1]) { c.fillStyle = 'rgba(120,220,255,.45)'; rrect(c, cx + s * span / 2 - r * 0.7, baseY - r * 1.5, r * 1.4, r * 2.7, r * 0.6); c.fill(); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.stroke(); }
        } else {
          c.fillStyle = '#3d2a25'; rrect(c, cx - span / 2, baseY - r * 2.2, span, r * 3.4, r * 0.8); c.fill();
          c.fillStyle = '#4a342d'; for (const s of [-1, 1]) { rrect(c, cx + s * span / 2 - r * 0.7, baseY - r * 1.5, r * 1.4, r * 2.7, r * 0.6); c.fill(); }
        }
      }
      const amp = r * 0.5 * clamp((crowd - 0.35) / 0.45, 0, 1), slump = crowd < 0.3 ? r * 0.7 : 0, jump = ahaK * r * 1.6 * Math.abs(Math.sin(ahaK * 9));
      const hoodies = A ? HOODIES_AERO : HOODIES, sk = A ? ['#f0c49e', '#a8714c', '#ffd9b8'] : ['#c98f62', '#8a5a3c', '#e2b08a'];
      let bubbleAt = null;
      for (let row = (room.rows || 1) - 1; row >= 0; row--) {
        const m = row ? Math.ceil(n / 2) : room.rows ? Math.floor(n / 2) : n, rr = r * (row ? 0.75 : 1);
        for (let i = 0; i < m; i++) {
          const x = cx + ((i + 0.5) / m - 0.5) * span * (room.couch ? 0.78 : 1) + (row ? rr : 0), sil = !room.couch && !room.lights;
          const silCol = A ? (row ? '#041a36' : '#072a52') : (row ? '#0c0a10' : '#15121a');
          const up = hyped || crowd > 0.85 || ahaK > 0.2;
          const hy = person(c, x, baseY - row * r * 1.3, rr, sil ? silCol : hoodies[i % hoodies.length], {
            bob: (i % 2 ? pulse : Math.max(0, 1 - ((ph + 0.5) % 1) * 2.4)) * amp + jump, slump, up: up && !(A && room.couch && i === 0) ? (sil ? i % 2 === 0 : true) : false,
            wow: ahaK > 0.05, cap: i % 3, ember: !A && room.couch && i === 0 && ahaK < 0.05, phone: A && room.couch && i === 0 ? (up || crowd > 0.7 ? 2 : 1) : 0,
            gloss: A && !sil, rim: A && sil ? hexA(i % 2 ? w0 : w1, 0.55) : null, t, skin: sil ? silCol : sk[i % 3] });
          if (!row && S.bubble && i === Math.min(m - 1, S.bubble.who + (room.couch ? 0 : 3))) bubbleAt = [x, hy - rr];
        }
      }
      if (A) { // bubbles rising through the room; more of them as it warms up
        const nb = reduce ? 6 : 4 + Math.round(9 * crowd + 4 * ahaK), rims = new Path2D(), glints = new Path2D();
        for (let i = 0; i < nb; i++) { // bubbles fade out near the ceiling (they shrink to nothing), batched into two paths
          const q = (t * (0.08 + (i % 4) * 0.025) + i * 0.137) % 1, x = W * (((i * 0.618) % 1) * 0.9 + 0.05) + Math.sin(t * 0.9 + i) * 5, y = g.horizon - q * band * 1.05, rad = (2 + (i % 3) * 1.6) * Math.min(1, (1 - q) * 2.2);
          if (rad < 0.6) continue;
          rims.moveTo(x + rad, y); rims.arc(x, y, rad, 0, Math.PI * 2);
          glints.moveTo(x - rad * 0.35 + rad * 0.28, y - rad * 0.35); glints.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.28, 0, Math.PI * 2);
        }
        c.fillStyle = 'rgba(200,250,255,.10)'; c.fill(rims); c.strokeStyle = 'rgba(220,255,255,.55)'; c.lineWidth = 1; c.stroke(rims);
        c.fillStyle = 'rgba(255,255,255,.8)'; c.fill(glints);
        gr = c.createLinearGradient(0, g.top, 0, g.top + band * 0.45); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); // glass sheen
        c.fillStyle = gr; c.fillRect(0, g.top, W, band * 0.45);
      } else { // haze hanging in the room
        for (let i = 0; i < 5; i++) {
          const x = W * (0.1 + 0.2 * i) + Math.sin(t * 0.13 + i * 2.1) * W * 0.08, y = g.top + band * (0.25 + 0.5 * ((i * 0.37) % 1)) + Math.cos(t * 0.1 + i) * band * 0.15, rad = band * (1 + (i % 3) * 0.5);
          gr = c.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(210,235,215,' + (room.couch ? 0.11 : 0.06) + ')'); gr.addColorStop(1, 'rgba(210,235,215,0)');
          c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
      const b = S.bubble;
      if (b && bubbleAt && nowMs - b.at < b.ms) { // speech bubble
        const fs = clamp(band * 0.2, 10, 15); c.font = '800 ' + fs + 'px ' + (A ? 'ui-rounded, "SF Pro Rounded", ' : '') + 'system-ui, -apple-system, sans-serif';
        const tw = c.measureText(b.text).width, bw = tw + (A ? 18 : 14), bh = fs + 9, by = Math.max(g.top + 2, bubbleAt[1] - bh - 6), bx = clamp(bubbleAt[0] - bw / 2, 4, W - bw - 4), k = clamp((nowMs - b.at) / 120, 0, 1) * clamp((b.at + b.ms - nowMs) / 200, 0, 1);
        c.globalAlpha = k;
        if (A) { gr = c.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bdf3ff'); c.fillStyle = gr; } else c.fillStyle = '#f4efe6';
        rrect(c, bx, by, bw, bh, A ? bh / 2 : 7); c.fill();
        if (A) { c.strokeStyle = 'rgba(95,246,255,.95)'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#bdf3ff'; }
        c.beginPath(); c.moveTo(bubbleAt[0] - 4, by + bh - 1); c.lineTo(bubbleAt[0] + 4, by + bh - 1); c.lineTo(bubbleAt[0], by + bh + 5); c.closePath(); c.fill();
        c.fillStyle = A ? '#03285a' : '#17131a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.text, bx + bw / 2, by + bh / 2 + 0.5); c.globalAlpha = 1; c.textAlign = 'start'; c.textBaseline = 'alphabetic';
      } else if (b && nowMs - b.at >= b.ms) S.bubble = null;
    }
    if (ahaK > 0 || flash > 0) { // the room lights up
      const fc = A ? '220,255,255,' : '255,255,235,';
      gr = c.createRadialGradient(W / 2, g.horizon, 0, W / 2, g.horizon, W * 0.8); gr.addColorStop(0, 'rgba(' + fc + (0.35 * ahaK + 0.1 * flash).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + fc + '0)');
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
    }
    return S.bubble || ahaK > 0;
  }

  O.scene = { draw, aha, say, roomFor, state: S, ROOMS, AERO };
})();
