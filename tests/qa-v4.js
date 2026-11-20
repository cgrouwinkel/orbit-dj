/* ORBIT DJ v4 automated QA: song builder, Quick Play, DJ moves, echo battle, intro rules.
   Run: node tests/qa-v4.js http://127.0.0.1:8710   Headless Chrome only; not a substitute for iPhone testing. */
const { chromium } = require(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, '');
const results = []; let current = '';
function check(name, ok, detail) { results.push({ group: current, name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + current + ' :: ' + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) + ']' : '')); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('orbitV22Tutorial', 'true'); localStorage.setItem('orbitV42MixLevel', '"pro"'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { ORBIT.engine.unlock(); await ORBIT.engine.ensureRunning(); window.wait = ms => new Promise(r => setTimeout(r, ms)); window.until = (f, ms) => new Promise(r => { const t0 = performance.now(); (function w() { if (f() || performance.now() - t0 > (ms || 8000)) r(!!f()); else setTimeout(w, 30); })(); });
    window.autoplay = () => setInterval(() => { const G = ORBIT.game; if (G.state !== 'running') return; const now = G.songTime();
      for (const n of G.notes) { if (n.t > now + 0.01) break; if (!n.done && !n.rival && n.t > now - 0.1) { if (n.scr) G.scratch(n.scr); else G.tap(n.lane); } }
      for (const [k, id, max] of [['xf', 'xf', 100], ['eq', 'low-eq', 150], ['filter', 'filter', 1000]]) { const m = G.activeMove(k, now); if (m && now >= m.t - 0.1) { const el = document.getElementById(id); el.value = Math.round(G.moveTarget(m, now) * max); el.dispatchEvent(new Event('input', { bubbles: true })); } } }, 8); });

  current = 'Song builder';
  await page.tap('[data-view="pads"]'); await page.waitForTimeout(150); await page.tap('[data-studio="songs"]'); await page.waitForTimeout(150);
  check('Studio tab has a BEAT PAD / SONG BUILDER switch and starts with genre starters', await page.evaluate(() => document.getElementById('view-songs').classList.contains('is-active') && document.querySelectorAll('#sg-starters button').length === 7));
  await page.tap('#sg-starters [data-style="garage"]'); await page.waitForTimeout(200);
  await page.selectOption('#sg-key', '2'); await page.selectOption('#sg-kit', 'midnight'); await page.selectOption('#sg-bass', 'donk'); await page.tap('#sg-mutes [data-part="vocal"]');
  await page.tap('#sg-add'); await page.tap('#sg-usebeat'); await page.waitForTimeout(150);
  const sb = await page.evaluate(async () => {
    const O = ORBIT, SG = O.songs, M = O.music, D = O.decks, s = SG.cur, out = {};
    out.saved = JSON.parse(localStorage.getItem('orbitV4Songs'))[0]; out.rows = s.rows.length; out.beat = !!s.beat && s.rows.some(r => r.drums === 'A');
    const c = SG.custom(s), notes = M.chartSet(c.style, c.bpm, 3, c.rows, 'normal', 3, c.song); out.notes = notes.length; out.bars = SG.bars(s);
    // what the engine plays: collect instruments and transposition through a stubbed sample player
    const used = new Set(), kits = new Set(), mids = []; const oi = O.synth.inst, ok = O.synth.kit;
    O.synth.inst = (c2, d, name, midi) => { used.add(name); mids.push(midi); return null; }; O.synth.kit = (c2, d, kit) => { kits.add(kit); return null; };
    await M.renderOffline(c.style, c.bpm, 8 * 240 / c.bpm, { form: c.rows, song: c.song }); const withKey = mids.slice(0, 40);
    mids.length = 0; await M.renderOffline(c.style, c.bpm, 8 * 240 / c.bpm, { form: c.rows, song: Object.assign({}, c.song, { key: 0 }) });
    O.synth.inst = oi; O.synth.kit = ok;
    out.used = [...used]; out.kits = [...kits]; out.transposed = withKey.length > 5 && withKey.every((m, i) => m === mids[i] + 2);
    return out;
  });
  check('Edits are saved on the device (key, kit, bass sound, muted vocals, extra section)', sb.saved && sb.saved.key === 2 && sb.saved.kit === 'midnight' && sb.saved.swaps.bass === 'donk' && sb.saved.mutes.vocal === true && sb.rows === 8, { rows: sb.rows });
  check('The engine plays the swapped bass, drops the muted vocals and transposes every note by the chosen key', sb.used.includes('donk') && !sb.used.includes('sub') && !sb.used.some(n => /^v|chip|choir/.test(n)) && sb.transposed, sb.used);
  check('USE MY BEAT puts the beat-pad pattern into the song (played on its own kit) and the chart follows it', sb.beat && sb.kits.includes('dusty') && sb.kits.includes('midnight') && sb.notes > 60, { kits: sb.kits, notes: sb.notes });
  await page.tap('#sg-preview'); await page.waitForTimeout(700);
  check('PREVIEW plays the song', await page.evaluate(() => ORBIT.music.playing && !!ORBIT.music.song));
  await page.tap('#sg-preview'); await page.waitForTimeout(200);
  check('PREVIEW again stops it', await page.evaluate(() => !ORBIT.music.playing));
  const lay = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight > innerHeight + 1, inside: [...document.querySelectorAll('#view-songs .sg-col')].every(e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }) }));
  check('Song builder fits an iPhone landscape screen without page scrolling', !lay.scroll && lay.inside, lay);
  const deck = await page.evaluate(async () => {
    const O = ORBIT, SG = O.songs, D = O.decks, s = SG.cur; s.rows = [{ sec: 'intro', bars: 2, drums: 'style' }, { sec: 'drop', bars: 4, drums: 'style' }]; SG.save(s); // short, to keep the test quick
    const ok = await D.load(0, SG.deckTrack(s).id), d = D.decks[0]; if (!ok) return { ok };
    let sq = 0; const a = d.buf.getChannelData(0); for (let i = 0; i < a.length; i++) sq += a[i] * a[i];
    D.play(d); await wait(500); const playing = d.playing && D.level(0) > 0.02; D.stopAll();
    return { ok, title: d.track.title, bars: d.track.bars, secs: d.track.sections.map(x => x.sec).join('>'), rms: +(10 * Math.log10(sq / a.length)).toFixed(1), first: d.track.first, playing, inLibrary: D.library().some(t => t.mine) };
  });
  check('A built song renders in the browser and loads on a deck with a drums-only mix-in and mix-out', deck.ok && deck.bars === 22 && /^mixin>.*>mixout$/.test(deck.secs) && deck.playing && deck.inLibrary, deck);
  check('The rendered song is mastered to about −13 dBFS RMS like the built-in tracks', Math.abs(deck.rms + 13) < 1.5, deck.rms);

  current = 'Quick Play';
  await page.tap('[data-view="play"]'); await page.waitForTimeout(150); await page.tap('#quick-open'); await page.waitForTimeout(150);
  const q = await page.evaluate(() => ({ built: document.querySelectorAll('#quick-built .track-row').length, mine: document.querySelectorAll('#quick-mine .track-row').length }));
  check('Quick Play lists the 7 ORBIT songs, 4 echo battles and the player’s own songs', q.built === 11 && q.mine === 1, q);
  await page.tap('#quick-built .track-row:nth-child(5)'); await page.waitForTimeout(200);
  const qp = await page.evaluate(async () => {
    const G = ORBIT.game, out = { custom: G.custom && G.custom.style, np: document.getElementById('np-venue').textContent };
    localStorage.setItem('orbitArcadeProgress', '{}'); G.progress = {}; G.noFail = true; G.setDifficulty('easy'); await G.start();
    out.style = ORBIT.music.style; out.bpm = ORBIT.music.bpm; const auto = autoplay(); await wait(2500 + G.leadIn * 1000); clearInterval(auto);
    G._finishForTest(); await wait(100);
    out.career = localStorage.getItem('orbitArcadeProgress'); out.quick = JSON.parse(localStorage.getItem('orbitV4Quick') || '{}'); out.result = G.lastResult.custom;
    return out;
  });
  check('Picking a song switches the set to it (trap at 140 BPM on any venue)', qp.custom === 'trap' && qp.style === 'trap' && qp.bpm === 140 && /QUICK PLAY/.test(qp.np), qp.np);
  check('Quick Play saves its own best score and leaves the career untouched', qp.career === '{}' && Object.keys(qp.quick).length === 1 && qp.result === 'Night Shift', qp.quick);
  await page.evaluate(() => ORBIT.ui.closeOverlay('ov-results')); await page.tap('#quick-exit'); 
  check('The ✕ button returns to the venue song', await page.evaluate(() => !ORBIT.game.custom && /VENUE/.test(document.getElementById('np-venue').textContent)));

  current = 'DJ moves';
  const mv = await page.evaluate(async () => {
    const G = ORBIT.game, out = {};
    const plan = st => { G.select(st); G.setDifficulty('normal'); return null; };
    out.per = [];
    for (let st = 0; st < 4; st++) { plan(st); await G.start(); out.per.push({ ctrls: [...new Set(G.moves.map(m => m.ctrl))].sort().join(), scr: G.notes.filter(n => n.scr).length, moves: G.moves.length }); G.stop(); }
    G.setMoves(false); G.select(3); await G.start(); out.off = { moves: G.moves.length, scr: G.notes.filter(n => n.scr).length }; G.stop(); G.setMoves(true);
    // a full Main Stage set played by a script that also performs every move
    G.noFail = true; G.select(3); await G.start(); const auto = autoplay(); await until(() => G.state === 'finished', 90000); clearInterval(auto);
    const r = G.lastResult; out.full = { moves: r.movesDone + '/' + r.movesTotal, acc: +r.accuracy.toFixed(3), stars: r.stars }; await wait(600); ORBIT.ui.closeOverlay('ov-results');
    // the same set with the mixer left alone: every move is missed
    await G.start(); const auto2 = setInterval(() => { const now = G.songTime(); for (const n of G.notes) { if (n.t > now + 0.01) break; if (!n.done && n.t > now - 0.1 && !n.scr) G.tap(n.lane); } }, 8);
    await until(() => G.moves.length && G.moves.every(m => m.done), 60000); clearInterval(auto2); out.idle = G.moves.filter(m => m.hit).length; out.eqAfter = ORBIT.engine.controls.lowEq; G.stop();
    // scratch direction and arming
    await G.start(); const s = G.notes.find(n => n.scr); await until(() => G.songTime() >= s.t - 0.004, 60000);
    out.sdir = s.scr; out.arm = G.tap(3); const wrong = G.scratch(s.scr === 'up' ? 'down' : 'up'); G.tap(3); const right = G.scratch(s.scr); out.scratch = { wrong, right, hit: !!s.hit }; G.stop();
    return out;
  });
  check('Each venue adds a move: scratches everywhere, crossfader cuts from House Party, bass kills from Underground Club, filter sweeps at Main Stage', mv.per[0].ctrls === '' && mv.per[0].scr > 0 && mv.per[1].ctrls === 'xf' && mv.per[2].ctrls === 'eq,xf' && mv.per[3].ctrls === 'eq,filter,xf', mv.per);
  check('Setup → DJ moves OFF removes moves and scratch notes (taps only)', mv.off.moves === 0 && mv.off.scr === 0, mv.off);
  check('A scripted player that performs every move completes them all and gets 3 stars', mv.full.moves.split('/')[0] === mv.full.moves.split('/')[1] && mv.full.stars === 3, mv.full);
  check('Leaving the mixer alone misses every move', mv.idle === 0, mv.idle);
  check('Scratch notes: a touch arms the note, the wrong swipe direction is rejected, the right one hits', mv.arm === 'arm' && mv.scratch.wrong === 'off' && /perfect|great|good/.test(mv.scratch.right) && mv.scratch.hit, mv);

  current = 'Echo battle';
  const bt = await page.evaluate(async () => {
    const G = ORBIT.game, out = {};
    G.setDifficulty('normal'); G.setCustom(G.battle(0)); await G.start();
    out.shape = { rival: G.notes.filter(n => n.rival).length, you: G.notes.filter(n => !n.rival).length, moves: G.moves.length, drumsMuted: ORBIT.music.song.mutes.drums, same: G.notes.filter(n => n.rival && n.round === 3).map(n => n.lane).join('') === G.notes.filter(n => !n.rival && n.round === 3).map(n => n.lane).join('') };
    const auto = autoplay(); await until(() => G.state === 'finished', 90000); clearInterval(auto);
    out.win = Object.assign({ score: G.lastResult.score, stars: G.lastResult.stars }, G.lastResult.battle); await wait(600); out.title = document.getElementById('res-title').textContent; ORBIT.ui.closeOverlay('ov-results');
    await G.start(); await until(() => G.state === 'finished', 90000); out.lose = Object.assign({ score: G.lastResult.score, stars: G.lastResult.stars }, G.lastResult.battle); await wait(600); ORBIT.ui.closeOverlay('ov-results');
    G.setDifficulty('expert'); await G.start(); out.hidden = G.notes.filter(n => !n.rival).every(n => n.hidden) && G.notes.filter(n => n.rival).every(n => !n.hidden); G.stop(); G.select(0);
    return out;
  });
  check('Eight rounds: the rival’s phrase, then the same phrase for the player; the song’s drums are muted', bt.shape.rival === bt.shape.you && bt.shape.you > 40 && bt.shape.same && bt.shape.drumsMuted && bt.shape.moves === 0, bt.shape);
  check('Playing every phrase back beats the rival and earns stars', bt.win.won && bt.win.score > bt.win.rivalScore && bt.win.stars >= 2 && /YOU BEAT/.test(bt.title), bt.win);
  check('Not playing loses the battle with no stars; a battle never fails early', !bt.lose.won && bt.lose.stars === 0 && bt.lose.rivalScore > 0, bt.lose);
  check('On Headliner the player’s copy of the phrase is hidden (play it by ear)', bt.hidden);

  current = 'Intros';
  const intro = await page.evaluate(async () => {
    const O = ORBIT, M = O.music, out = {};
    const oi = O.synth.inst, ok = O.synth.kit;
    for (const [id, bpm] of [['house', 126], ['basshouse', 126], ['soul', 96], ['garage', 132], ['boombap', 88], ['trap', 140], ['dubstep', 140]]) {
      const used = new Set(), pads = new Set(), whole = new Set(), names = window.ORBIT_SOUNDS.kits[M.STYLES[id].kit];
      O.synth.inst = (c, d, name) => { used.add(name); return null; }; O.synth.kit = (c, d, kit, i) => { pads.add(names[i].name); return null; };
      await M.renderOffline(id, bpm, 3 * 240 / bpm - 0.3, { form: 32, noBed: true, tail: 0 }); // the first three bars (the fourth is the fill into the verse)
      O.synth.inst = (c, d, name) => { whole.add(name); return null; }; O.synth.kit = () => null;
      await M.renderOffline(id, bpm, 32 * 240 / bpm, { form: 32, noBed: true, tail: 0 }); // the whole song
      const opt = new Set(); O.synth.inst = (c, d, name) => { opt.add(name); return null; };
      await M.renderOffline(id, bpm, 32 * 240 / bpm, { form: 32, noBed: true, tail: 0, song: { swaps: { vocal: 'vah' }, mutes: {} } });
      out[id] = { inst: [...used], pads: [...pads], whole: [...whole], optIn: opt.has('vah'), hadVocal: M.STYLES[id].inst.some(n => /^(vah|voh|vee|vyeah|vhey|chip)/.test(n)) };
    }
    O.synth.inst = oi; O.synth.kit = ok;
    out.hats = await Promise.all(['dusty', 'club', 'midnight'].map(async k => { // spectral centroid of each kit's closed hat
      const path = O.assets.kitPaths(k)[2]; await O.assets.ensure([path], 5000); const b = O.assets.get(path), d = b.getChannelData(0); let z = 0;
      for (let i = 1; i < d.length; i++) if ((d[i] >= 0) !== (d[i - 1] >= 0)) z++;
      return Math.round(z / 2 / b.duration); // zero-crossing rate: a rough "how high does it sound" in Hz
    }));
    return out;
  });
  const voc = /^(vah|voh|vee|vyeah|vhey|chipoo|chipah|choir|brass)$/;
  const hats = intro.hats; delete intro.hats;
  check('No synthesized voices, choir or brass anywhere in the seven songs (owner: “cartoon horns”)', Object.values(intro).every(x => !x.whole.some(n => voc.test(n))), Object.fromEntries(Object.entries(intro).map(([k, v]) => [k, v.whole.join(',')])));
  check('A song-builder song can still opt in to a voice for its hook', Object.values(intro).filter(x => x.hadVocal).every(x => x.optIn) && Object.values(intro).some(x => x.hadVocal));
  check('Hi-hats are pitched lower: zero-crossing rate under 9 kHz in every kit (v3.1: about 13–15 kHz)', hats.every(h => h < 9000), hats);
  check('Intros are instrumental: no vocal chops and no horns in the opening bars of any song', Object.values(intro).every(x => !x.inst.some(n => voc.test(n))), Object.fromEntries(Object.entries(intro).map(([k, v]) => [k, v.inst.join(',')])));
  check('Intro drums are just kick and one hat (no shakers, tambourine or busy tops)', Object.values(intro).every(x => x.pads.every(n => /KICK|HAT|CRASH|IMPACT|RIDE/.test(n)) && x.pads.length <= 3), Object.fromEntries(Object.entries(intro).map(([k, v]) => [k, v.pads.join(',')])));

  current = 'Beat challenges';
  await page.tap('[data-view="pads"]'); await page.waitForTimeout(150); await page.tap('[data-studio="pads"]'); await page.waitForTimeout(200);
  const bc = await page.evaluate(async () => {
    const O = ORBIT, SC = O.school, BP = O.beatpad, out = {};
    const before = JSON.stringify(BP.pattern().events), kit0 = BP.kit, bpm0 = BP.bpm;
    await SC.startChallenge('house'); out.setup = { kit: BP.kit, bpm: BP.bpm, empty: BP.pattern().events.length === 0 };
    out.listen = await SC.listenChallenge(); out.empty = SC.challengeMatch();
    const put = (pad, steps) => { BP.sel = pad; steps.forEach(st => BP.toggleStep(st)); };
    put(0, [0, 4, 8, 12]); put(1, [4, 12]); out.partial = SC.checkChallenge();
    put(3, [2, 6, 10, 14]); put(7, [1, 3, 5, 7, 9, 11, 13, 15]); out.full = SC.checkChallenge();
    put(9, [3]); out.extra = SC.challengeMatch();
    out.coach = !document.getElementById('bp-coach').hidden && /CHALLENGE/.test(document.getElementById('bpc-step').textContent);
    SC.stopChallenge(true); await wait(100);
    out.restored = JSON.stringify(BP.pattern().events) === before && BP.kit === kit0 && BP.bpm === bpm0; out.saved = SC.progress.challenges.house;
    return out;
  });
  check('Starting a challenge sets the kit and tempo, clears the grid and plays the target beat', bc.setup.kit === 'club' && bc.setup.bpm === 126 && bc.setup.empty && bc.listen && bc.empty === 0, bc.setup);
  check('CHECK scores the copy: kick and clap only is a partial match, the full beat is 100% and 3 stars, an extra hit lowers it', bc.partial.score > 20 && bc.partial.score < 60 && bc.partial.missing === 12 && bc.full.score === 100 && bc.full.stars === 3 && bc.extra < 100, { partial: bc.partial, extra: bc.extra });
  check('Quitting a challenge puts the player’s own pattern, kit and tempo back, and the best score is kept', bc.restored && bc.saved && bc.saved.stars === 3 && bc.coach, bc.saved);

  current = 'Club night';
  await page.tap('[data-view="mix"]'); await page.waitForTimeout(200);
  const nt = await page.evaluate(async () => {
    const O = ORBIT, D = O.decks, SC = O.school, N = O.night, out = {};
    const result = () => new Promise(r => { const off = O.on('gig-result', x => { off(); r(x); }); });
    await N.start(); out.picker = !document.getElementById('ov-tracks').hidden && document.querySelectorAll('#track-list .night-tag').length >= 7; O.ui.closeOverlay('ov-tracks');
    await D.load(0, 'neon'); await until(() => SC.active.phase === 'mix' && D.decks[0].playing, 8000);
    out.opener = { live: SC.active.live, playing: D.decks[0].playing, request: SC.active.request && SC.active.request.id, coach: document.getElementById('mc-step').textContent };
    const done = result();
    for (let k = 0; k < 3 && !SC.active.done; k++) {
      const a = SC.active, from = D.decks[a.live], to = D.other(from), n0 = a.n;
      await until(() => Math.abs(from.tempo) < 0.01, 6000); out.settled = out.settled !== false && Math.abs(from.tempo) < 0.01; // the live track settles back to its own tempo after a mix
      // pick a track that fits the request, is in tempo range and has not been played
      const pool = D.library().filter(T => Math.abs(T.bpm / from.track.bpm - 1) <= D.RANGE && T.id !== from.track.id && !a.played.includes(T.id) && !T.mine && !T.imported); // built-in tracks only: the short test song from the builder checks would run out mid-mix
      const pickT = pool.find(T => a.request && a.request.ok(from.track, T)) || pool[0];
      await D.load(to.i, pickT.id); D.toggleSync(to); D.set(to.i, 'low', 0);
      await until(() => { const w = D.where(from); return w.phraseBar === 8 && w.beat === 4; }, 40000); await until(() => D.where(from).phraseBar === 1, 4000);
      D.play(to); await wait(250); D.setXf(0.5); await wait(16 * 60000 / D.bpm(from) + 700);
      D.set(from.i, 'low', 0); D.set(to.i, 'low', 0.5); await wait(900); D.setXf(to.i === 0 ? 0 : 1);
      await until(() => SC.active.n > n0 || SC.active.done, 6000); D.set(from.i, 'low', 0.5);
    }
    out.result = await done; await wait(700); out.overlay = !document.getElementById('ov-gig').hidden; out.saved = SC.progress.night; O.ui.closeOverlay('ov-gig'); SC.stop();
    // a bad night: slam an unmatched repeat in
    await N.start(); O.ui.closeOverlay('ov-tracks'); await D.load(0, 'neon'); await until(() => SC.active.phase === 'mix' && D.decks[0].playing, 8000);
    const e0 = SC.active.energy; await D.load(1, 'final'); D.play(D.decks[1]); D.setXf(0.5); await wait(2200); D.setXf(1); await until(() => SC.active.n === 1, 6000);
    out.bad = { delta: SC.active.energy - e0, log: SC.active.log[0] }; SC.stop();
    return out;
  });
  check('Club Night opens the track list with style and energy tags, then starts the opener and posts a crowd request', nt.picker && nt.opener.playing && !!nt.opener.request && /CLUB NIGHT · MIX 1\/3 · CROWD 50%/.test(nt.opener.coach), nt.opener);
  check('After a mix the live track eases back to its own tempo (so the next track is always in range)', nt.settled === true);
  check('Three clean, on-request mixes finish the night with a high score and stars', nt.result.night && nt.result.total >= 80 && nt.result.stars >= 2 && nt.result.log.length === 3 && nt.result.log.every(l => l.mix >= 80 && l.delta > 0), { total: nt.result.total, energy: nt.result.energy, log: nt.result.log.map(l => l.mix + '/' + l.delta + (l.req ? 'R' : '')) });
  check('The result sheet opens and the best night is saved', nt.overlay && nt.saved && nt.saved.score === nt.result.total, nt.saved);
  check('A rushed, unmatched mix costs crowd energy', nt.bad.delta < 0 && nt.bad.log.mix < 50, nt.bad);

  current = 'Import audio';
  const im = await page.evaluate(async () => {
    const O = ORBIT, IM = O.imports, D = O.decks, G = O.game, M = O.music, out = {};
    await IM.ready;
    // make a test file: 24 bars of the tech-house song at 126 BPM, as WAV
    await O.assets.ensure(M.assetsFor('house'), 8000);
    const buf = await M.renderOffline('house', 126, 24 * 240 / 126 + 0.5, { form: 24, preLimiter: true });
    const file = new File([O.beatpad.encodeWav(buf)], 'My Test Track.wav', { type: 'audio/wav' });
    const m = await IM.add(file); if (!m) return { failed: true };
    const beat = 60 / m.bpm, off = ((m.first - 0.05) % beat + beat) % beat;
    out.meta = { name: m.name, bpm: m.bpm, firstErrMs: Math.round(Math.min(off, beat - off) * 1000), dur: +m.duration.toFixed(1) };
    out.inLib = D.library().filter(T => T.imported).length; out.inQuick = O.songs.imports().length;
    const T = IM.deckTrack(m); out.loaded = await D.load(1, T.id); const d = D.decks[1]; D.setXf(1); D.play(d); await wait(500); out.deck = { playing: d.playing, level: D.level(1) > 0.02, bars: d.track.bars, first: +d.track.first.toFixed(3) }; D.stopAll();
    // survives a reload of the list from storage
    const rows = await new Promise(r => { const q = indexedDB.open('orbit-dj', 1); q.onsuccess = () => { const g = q.result.transaction('imports').objectStore('imports').getAll(); g.onsuccess = () => r(g.result); }; });
    out.stored = rows.length === 1 && rows[0].bytes.byteLength > 100000;
    // Quick Play on the imported file
    O.ui.showView('play'); G.noFail = true; G.setDifficulty('normal'); G.setCustom(IM.custom(m)); const ok = await G.start();
    out.game = { ok, notes: G.notes.length, lanes: [...new Set(G.notes.map(n => n.lane))].sort().join(''), audio: !!M.audio, bars: G.bars };
    const grid = G.notes.slice(0, -1).every(n => { const x = (n.t - G.leadIn) / (60 / m.bpm / 4); return Math.abs(x - Math.round(x)) < 1e-6; }); out.game.onGrid = grid;
    const auto = autoplay(); await wait(6000 + G.leadIn * 1000); clearInterval(auto); out.game.hits = G.hits; out.game.level = O.engine.isRunning(); G.stop(); G.select(0);
    await IM.fix(m.id, 'half'); out.half = IM.list[0].bpm; await IM.fix(m.id, 'double'); out.double = IM.list[0].bpm;
    await IM.remove(m.id); out.removed = IM.list.length === 0 && D.library().every(T => !T.imported);
    return out;
  });
  check('An imported file is analysed: tempo within 0.3 BPM of the true 126 and beat 1 within 25 ms', !im.failed && Math.abs(im.meta.bpm - 126) <= 0.3 && im.meta.firstErrMs <= 25 && im.meta.name === 'My Test Track', im.meta);
  check('It is saved on the device and appears in the deck library and Quick Play', im.stored && im.inLib === 1 && im.inQuick === 1);
  check('It loads and plays on a deck with a beat grid', im.loaded && im.deck.playing && im.deck.level && im.deck.bars >= 20, im.deck);
  check('Quick Play charts it from its own drum hits (kick, snare and hat lanes, all on the grid) and plays the file', im.game.ok && im.game.notes > 40 && im.game.lanes.includes('0') && im.game.lanes.includes('1') && im.game.onGrid && im.game.audio && im.game.hits > 5, im.game);
  check('Grid fixes (half / double tempo) and delete work', im.half === 63 && im.double === 126 && im.removed, { half: im.half, double: im.double });

  current = 'Live-show scene';
  const sc = await page.evaluate(async () => {
    const O = ORBIT, G = O.game, wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
    if (G.state !== 'idle') G.stop(); O.ui.setTheme('grunge'); O.ui.showView('play'); G.setCustom(null);
    o.rooms = [0, 1, 2, 3].map(st => { G.select(st); return O.scene.roomFor(G).id; }).join();
    G.select(0); G.setDifficulty('easy'); O.engine.unlock(); await O.engine.ensureRunning(); await G.start();
    const px = () => { const cv = document.getElementById('highway'), c = cv.getContext('2d'), d = c.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height * 0.08), 1, 1).data; return d[0] + d[1] + d[2]; };
    await wait(400); o.roomDrawn = px() > 40; // the strip above the highway is not the flat background any more
    const auto = setInterval(() => { if (G.state !== 'running') return; const now = G.songTime(); for (const n of G.notes) { if (n.t > now + 0.01) break; if (!n.done && n.t > now - 0.1) G.tap(n.lane); } }, 8);
    const t0 = performance.now(); while (G.multiplier() < 2 && performance.now() - t0 < 30000) await wait(50);
    await wait(250);
    o.aha = O.scene.state.aha && O.scene.state.bubble && O.scene.state.bubble.text === 'OHHHH' && /THAT.S A BEAT/.test(document.getElementById('callout').textContent);
    await wait(1700); o.cta = /8 MORE FOR ×3/.test(document.getElementById('callout').textContent);
    o.onlyOnce = O.scene.aha() === false;
    O.ui.setTheme('aero'); await wait(200); o.aeroRuns = G.state === 'running'; o.aeroRoom = px() > 150; // Aero highway background is #021631 (sum 73); its room is sky blue
    // v4.3.1: a fresh set in Cyber Aero gets the same OHHHH moment, drawn in the Aero room
    G.stop(); G.select(0); await G.start(); await wait(300);
    const t1 = performance.now(); while (G.multiplier() < 2 && performance.now() - t1 < 30000) await wait(50);
    await wait(250); o.aeroAha = O.scene.state.aha && !!O.scene.state.bubble && O.scene.state.bubble.text === 'OHHHH' && /THAT.S A BEAT/.test(document.getElementById('callout').textContent);
    o.aeroCallout = getComputedStyle(document.getElementById('callout')).top;
    O.ui.setTheme('grunge'); await wait(100);
    clearInterval(auto); G.stop();
    return o;
  });
  check('Each venue has its own room: crib, house party, club, main stage', sc.rooms === 'crib,party,club,stage', sc.rooms);
  check('Grunge theme draws the room above the highway during a set', sc.roomDrawn, sc);
  check('First ×2 of a set: the room says OHHHH and the callout reads THAT’S A BEAT, then the call to action', sc.aha && sc.cta, sc);
  check('The OHHHH moment happens once per set; switching theme mid-set keeps the set running', sc.onlyOnce && sc.aeroRuns, sc);
  check('Cyber Aero draws its own room above the highway too', sc.aeroRoom, sc);
  check('Cyber Aero: a new set gets the OHHHH moment and THAT’S A BEAT callout', sc.aeroAha, sc);

  current = 'Career map';
  const cr = await page.evaluate(async () => {
    const O = ORBIT, G = O.game, C = O.ui.career, out = {};
    G.progress = {}; for (const k of Object.keys(G.quickBests)) delete G.quickBests[k]; // earlier checks cleared venues; start this one from a new player's career
    O.ui.showView('settings'); O.ui.showView('career'); await wait(100);
    out.nodes = [...document.querySelectorAll('.venue-card')].map(c => c.querySelectorAll('.node').length + 1).join(',');
    out.rank = document.getElementById('car-rank').textContent;
    out.locked = [...document.querySelectorAll('.venue-card')].map(c => c.classList.contains('is-locked'));
    out.stars0 = C.venueStars(0);
    // earn stars at venue 1 → venue 2 opens
    G.progress[0] = { score: 9000, stars: 3 }; localStorage.setItem('orbitArcadeProgress', JSON.stringify(G.progress)); G.quickBests['battle:0:easy'] = { score: 1, stars: 2 };
    O.ui.showView('settings'); O.ui.showView('career'); await wait(100);
    out.locked2 = [...document.querySelectorAll('.venue-card')].map(c => c.classList.contains('is-locked'));
    document.querySelector('.venue-card[data-v="0"] .node').click(); await wait(200);
    out.battleNode = { view: O.ui.view, custom: G.custom && G.custom.id };
    G.select(0); O.ui.showView('settings'); await wait(100);
    out.skins = [...document.querySelectorAll('#seg-skin button')].map(b => b.textContent + (b.disabled ? ' (locked)' : ''));
    return out;
  });
  check('Career shows every venue as a chapter of level types (3, 4, 5 and 6 levels) with a rank', cr.nodes === '3,4,5,6' && /BEDROOM DJ|OPEN-DECK/.test(cr.rank), cr);
  check('Later venues are locked until 4 stars are earned at the one before; earning them opens the next venue', cr.locked.slice(1).every(Boolean) && !cr.locked[0] && cr.locked2[1] === false && cr.locked2[2] === true, { before: cr.locked, after: cr.locked2 });
  check('A level node launches its mode (echo battle from the career card)', cr.battleNode.view === 'play' && cr.battleNode.custom === 'battle:0', cr.battleNode);
  check('Highway skins unlock with career stars (VINYL at 5)', cr.skins.length === 4 && !/locked/.test(cr.skins[0]) && !/locked/.test(cr.skins[1]) && /locked/.test(cr.skins[3]), cr.skins);
  check('No console errors', errors.length === 0, errors.slice(0, 3));

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log('\nSUMMARY ' + pass + ' / ' + results.length + ' passed');
  require('fs').writeFileSync(process.env.QA_OUT || 'qa-v4-results.json', JSON.stringify(results, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
