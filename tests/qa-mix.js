/* ORBIT DJ v3 automated QA for the Mix tab (two-deck engine, lessons, gigs) and the Beats trainer.
   Run: node tests/qa-mix.js http://127.0.0.1:8710   (serve the repo root first)
   Headless Chrome only; not a substitute for iPhone testing. */
const { chromium } = require(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, '');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const results = []; let current = '';
function check(name, ok, detail) { results.push({ group: current, name, ok: !!ok, detail: detail === undefined ? '' : detail }); console.log((ok ? 'PASS ' : 'FAIL ') + current + ' :: ' + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 420) + ']' : '')); }
async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('orbitV22Tutorial', 'true'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  const page = await ctx.newPage(); page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(300);
  await page.tap('[data-view="mix"]'); await page.waitForTimeout(200);
  await page.evaluate(async () => { ORBIT.engine.unlock(); await ORBIT.engine.ensureRunning(); window.wait = ms => new Promise(r => setTimeout(r, ms)); window.until = (f, ms) => new Promise(r => { const t0 = performance.now(); (function w() { if (f() || performance.now() - t0 > (ms || 8000)) r(!!f()); else setTimeout(w, 30); })(); }); });
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page } = await newPage(browser);

  // ---------------------------------------------------------------- tracks
  current = 'Tracks';
  const tracks = await page.evaluate(async () => {
    const D = ORBIT.decks, out = [];
    for (const T of D.TRACKS) {
      await D.load(0, T.id); const d = D.decks[0], pk = d.peaks.pk, per = d.peaks.per;
      // the mix-in is drums only: kicks should sit on the beat grid. Compare bass level on beats 1 and 3 with the bass level just before them.
      // the sharpest rise in level near each predicted downbeat should sit on the grid
      let sum = 0, n = 0, worst = 0; for (let bar = 0; bar < 8; bar++) { const t = d.track.first + bar * 4 * d.track.beat, j0 = Math.floor((t - 0.05) * per), j1 = Math.floor((t + 0.05) * per); let best = j0, rise = -1; for (let j = Math.max(1, j0); j <= j1; j++) { const r = pk[j] - pk[j - 1]; if (r > rise) { rise = r; best = j; } } const off = best / per - t; sum += off; n++; worst = Math.max(worst, Math.abs(off)); }
      out.push({ id: T.id, bpm: T.bpm, first: +d.track.first.toFixed(3), dur: +d.buf.duration.toFixed(1), bars: T.bars, gridMs: Math.round(sum / n * 1000), worstMs: Math.round(worst * 1000), sections: T.sections.map(s => s.sec).join('>') });
    }
    return out;
  });
  check('Six tracks load and decode', tracks.length === 6 && tracks.every(t => t.dur > 100 && t.dur < 140), tracks.map(t => t.id + ' ' + t.dur + 's'));
  check('Beat 1 is found after the MP3 padding (0.04–0.12 s in)', tracks.every(t => t.first > 0.04 && t.first < 0.12), tracks.map(t => t.first));
  check('Downbeats in the drums-only mix-in sit on the detected beat grid (within 12 ms on average)', tracks.every(t => Math.abs(t.gridMs) <= 12), tracks.map(t => t.id + ' ' + t.gridMs + ' ms (worst ' + t.worstMs + ')'));
  check('Every track has a drums-only mix-in and mix-out and 8-bar phrasing', tracks.every(t => /^mixin>/.test(t.sections) && />mixout$/.test(t.sections) && t.bars % 8 === 0), tracks.map(t => t.sections)[0]);

  // ---------------------------------------------------------------- transport
  current = 'Decks';
  const tr = await page.evaluate(async () => {
    const D = ORBIT.decks, E = ORBIT.engine, [A, B] = D.decks, out = {};
    D.reset(); await D.load(0, 'neon'); await D.load(1, 'glass');
    D.play(A); await wait(1000);
    const p0 = D.posOf(A), t0 = E.ctx.currentTime; await wait(1000); out.rate1 = (D.posOf(A) - p0) / (E.ctx.currentTime - t0);
    out.level = D.level(0);
    D.setTempo(A, 1); const p1 = D.posOf(A), t1 = E.ctx.currentTime; await wait(1000); out.rateFast = (D.posOf(A) - p1) / (E.ctx.currentTime - t1); out.bpmFast = D.bpm(A);
    D.setTempo(A, 0);
    // CUE: back to the cue point and stop; hold to preview
    D.cueDown(A); D.cueUp(A); out.cueBack = !A.playing && Math.abs(A.pos - A.cue) < 1e-6;
    D.cueDown(A); await wait(300); out.previewPlays = A.playing; D.cueUp(A); out.previewReturns = !A.playing && Math.abs(A.pos - A.cue) < 1e-6;
    // nudge and SYNC
    D.play(A); await wait(200); D.setTempo(B, 0.3); D.play(B); await wait(300);
    out.phaseBefore = D.phaseMs(); out.bpmB0 = D.bpm(B);
    D.toggleSync(B); await wait(250); out.phaseSync = D.phaseMs(); out.bpmSync = [D.bpm(A), D.bpm(B)];
    await wait(1500); out.phaseHeld = D.phaseMs();
    D.setTempo(A, -0.5); await wait(200); out.follows = Math.abs(D.bpm(A) - D.bpm(B)) < 1e-6; D.setTempo(A, 0);
    D.toggleSync(B); const ph0 = D.phaseMs(); D.nudge(B, 1); await wait(500); D.nudge(B, 0); out.nudgeMoved = ph0 - D.phaseMs(); // B sped up, so it gets earlier
    // loop
    D.loopOn(A, 4); const L = Object.assign({}, A.loop); let inside = true; for (let i = 0; i < 30; i++) { await wait(100); const p = D.posOf(A); if (p < L.a - 0.6 || p > L.b + 0.02) inside = false; }
    out.loopLen = (L.b - L.a) / A.track.beat; out.loopHolds = inside;
    D.loopScale(A, 0.5); D.loopScale(A, 0.5); out.loopHalved = A.loop.beats; D.loopOff(A); out.loopOff = !A.loop;
    // roll with slip
    const pr = D.posOf(A), tr0 = E.ctx.currentTime; D.rollStart(A, 0.5); await wait(900); D.rollEnd(A); await wait(50);
    out.slipErrMs = Math.abs(D.posOf(A) - (pr + (E.ctx.currentTime - tr0) * A.rate)) * 1000;
    // hot cue and beat jump
    D.hot(A, 0); const mark = A.hot[0]; await wait(700); D.hot(A, 0); await wait(40); out.hotErr = Math.abs(D.posOf(A) - mark - 0.04 * A.rate) < 0.06;
    const pj = D.posOf(A), tj = E.ctx.currentTime; D.jump(A, 4); await wait(40); out.jumpBeats = (D.posOf(A) - pj - (E.ctx.currentTime - tj) * A.rate) / A.track.beat;
    // scrub on a stopped deck
    D.pause(B); const ps = B.pos; D.jogStart(B); D.jog(B, 0.25, 0.05); D.jog(B, -0.1, 0.05); D.jogEnd(B); out.scrub = +(B.pos - ps).toFixed(3);
    D.stopAll();
    return out;
  });
  check('Deck plays at 1.00× on the audio clock and makes sound', Math.abs(tr.rate1 - 1) < 0.01 && tr.level > 0.1, { rate: tr.rate1, level: tr.level });
  check('Tempo fader: +10% plays 10% faster and reads 136.4 BPM', Math.abs(tr.rateFast - 1.1) < 0.012 && Math.abs(tr.bpmFast - 136.4) < 0.01, { rate: tr.rateFast, bpm: tr.bpmFast });
  check('CUE returns to the cue point and stops; holding CUE previews and snaps back', tr.cueBack && tr.previewPlays && tr.previewReturns, tr);
  check('SYNC matches tempo and lines the beats up within 5 ms, and stays locked', Math.abs(tr.bpmSync[0] - tr.bpmSync[1]) < 1e-6 && Math.abs(tr.phaseSync) < 5 && Math.abs(tr.phaseHeld) < 5, { before: tr.phaseBefore, after: tr.phaseSync, held: tr.phaseHeld });
  check('A synced deck follows the other deck’s tempo fader', tr.follows);
  check('Nudge (+) moves the beat earlier by about 30 ms per half second', tr.nudgeMoved > 15 && tr.nudgeMoved < 50, tr.nudgeMoved);
  check('4-beat loop is 4 beats long, holds the playhead, halves to 1 beat and exits', Math.abs(tr.loopLen - 4) < 1e-6 && tr.loopHolds && tr.loopHalved === 1 && tr.loopOff, { len: tr.loopLen, holds: tr.loopHolds });
  check('Loop roll slips: on release the deck is where it would have been (within 30 ms)', tr.slipErrMs < 30, tr.slipErrMs);
  check('Hot cue jumps back to its marker; beat jump +4 moves exactly 4 beats', tr.hotErr && Math.abs(tr.jumpBeats - 4) < 0.05, { jump: tr.jumpBeats });
  check('Jog on a stopped deck scrubs (a quarter turn forward, a tenth back = 0.27 s)', Math.abs(tr.scrub - 0.27) < 0.01, tr.scrub);

  // ---------------------------------------------------------------- mixer
  current = 'Mixer';
  const mx = await page.evaluate(async () => {
    const D = ORBIT.decks, [A, B] = D.decks, out = {};
    D.reset(); await D.load(0, 'neon'); D.seek(A, A.track.first + 32 * 4 * A.track.beat); D.play(A); D.setXf(0);
    const band = async () => { const an = D.g.ch[0].meter, f = new Float32Array(an.frequencyBinCount); an.smoothingTimeConstant = 0; let lo = -200, hi = -200; for (let k = 0; k < 20; k++) { await wait(45); an.getFloatFrequencyData(f); const hz = ORBIT.engine.ctx.sampleRate / an.fftSize; for (let i = 0; i < f.length; i++) { if (i * hz < 150) lo = Math.max(lo, f[i]); else if (i * hz > 6000 && i * hz < 12000) hi = Math.max(hi, f[i]); } } return { lo, hi }; };
    const peak = async i => { let p = 0; for (let k = 0; k < 25; k++) { p = Math.max(p, D.level(i)); await wait(30); } return p; };
    await wait(600); const flat = await band(); const m0 = await peak(2);
    D.set(0, 'low', 0); await wait(500); const lowKill = await band();
    D.set(0, 'low', 0.5); D.set(0, 'hi', 0); await wait(500); const hiKill = await band(); D.set(0, 'hi', 0.5);
    D.set(0, 'filter', 0.1); await wait(500); const lp = await band(); D.set(0, 'filter', 0.9); await wait(500); const hp = await band(); D.set(0, 'filter', 0.5);
    out.lowKillDb = flat.lo - lowKill.lo; out.hiKillDb = flat.hi - hiKill.hi; out.lpDb = flat.hi - lp.hi; out.hpDb = flat.lo - hp.lo;
    await wait(300);
    D.set(0, 'fader', 0); await wait(300); out.faderDown = await peak(2); D.set(0, 'fader', 1);
    D.setXf(1); await wait(300); out.xfToB = await peak(2); D.setXf(0.5); await wait(300); out.xfMid = await peak(2); out.m0 = m0;
    D.set(0, 'gain', 0.9); await wait(300); out.hot = await peak(0); D.set(0, 'gain', 0.5);
    // echo out: FX on, fader down, tail still audible, then gone
    D.setFx({ type: 'echo', beats: 1, amount: 0.8 }); D.set(0, 'fx', true); await wait(1200); D.set(0, 'fader', 0); await wait(350); out.echoTail = await peak(2); D.set(0, 'fx', false); await wait(5000); out.echoGone = await peak(2); D.set(0, 'fader', 1);
    for (const t of ['reverb', 'flanger']) { D.setFx({ type: t }); D.set(0, 'fx', true); await wait(300); } D.set(0, 'fx', false);
    // split cue: the mix moves to the right ear only
    D.setSplit(true); D.set(0, 'cue', true); await wait(200); out.split = D.mixer.split; D.setSplit(false); D.set(0, 'cue', false);
    D.sample(A, 0); out.samples = A.stats.samples;
    D.stopAll();
    return out;
  });
  check('LOW kill removes at least 18 dB below 150 Hz; HI kill at least 18 dB of the top end', mx.lowKillDb > 18 && mx.hiKillDb > 18, { low: mx.lowKillDb, hi: mx.hiKillDb });
  check('FILTER: left is a low-pass (highs drop), right is a high-pass (bass drops)', mx.lpDb > 18 && mx.hpDb > 18, { lp: mx.lpDb, hp: mx.hpDb });
  check('Channel fader down silences the deck; crossfader to B removes deck A; centre plays it in full', mx.faderDown < 0.01 && mx.xfToB < 0.01 && Math.abs(mx.xfMid - mx.m0) < 0.2 * mx.m0, { down: mx.faderDown, toB: mx.xfToB, mid: mx.xfMid, full: mx.m0 });
  check('High GAIN pushes the channel meter into the red (above 1.05)', mx.hot > 1.05, mx.hot);
  check('Echo out: with the fader down the echo tail is still audible, then dies away', mx.echoTail > 0.02 && mx.echoGone < mx.echoTail * 0.2, { tail: mx.echoTail, later: mx.echoGone });
  check('Split cue, reverb, flanger and sampler pads run without errors', mx.split && mx.samples === 1 && page._errors.length === 0, page._errors.slice(0, 3));

  // ---------------------------------------------------------------- lessons, played by a script that does each move
  current = 'Lessons';
  const lessons = await page.evaluate(async () => {
    const D = ORBIT.decks, SC = ORBIT.school, [A, B] = D.decks, out = {};
    const step = async (fn, n) => { const a = SC.active, s0 = a.step; await fn(); return until(() => a.done || a.step > s0, n || 6000); };
    const untilBar = (d, bar, beat) => until(() => { const w = D.where(d); return w.phraseBar === bar && w.beat >= beat; }, 30000);
    const bots = {
      transport: [() => D.play(A), () => D.cueDown(A), async () => { D.cueDown(A); await wait(250); D.cueUp(A); }, () => D.play(A)],
      levels: [() => D.set(0, 'fader', 0), () => D.set(0, 'fader', 1), () => D.set(0, 'gain', 0.9), () => D.set(0, 'gain', 0.5)],
      xf: [() => D.setXf(1), () => D.setXf(0), () => D.setXf(0.5)],
      tempo: [() => D.setTempo(B, (124 / 122 - 1) / D.RANGE)],
      jog: [async () => { for (let i = 0; i < 80 && Math.abs(D.phaseMs()) > 12; i++) { D.nudge(B, D.phaseMs() > 0 ? 1 : -1); await wait(40); } D.nudge(B, 0); }, async () => { D.pause(B); await wait(120); D.jogStart(B); D.jog(B, 0.2, 0.05); D.jogEnd(B); }],
      sync: [() => D.toggleSync(B), () => D.toggleSync(B)],
      eq: [() => D.set(0, 'low', 0), () => D.set(0, 'low', 0.5), async () => { D.set(0, 'hi', 0); await wait(120); D.set(0, 'hi', 0.5); }, async () => { D.set(0, 'mid', 0); await wait(120); D.set(0, 'mid', 0.5); }, () => { D.set(0, 'low', 0); D.set(1, 'low', 0.5); }],
      filter: [() => D.set(0, 'filter', 0.05), () => D.set(0, 'filter', 0.95), () => D.set(0, 'filter', 0.5)],
      loop: [() => D.loopToggle(A), () => { D.loopScale(A, 0.5); D.loopScale(A, 0.5); }, () => { D.loopScale(A, 2); D.loopScale(A, 2); }, () => D.loopToggle(A)],
      hotcue: [() => D.padDown(A, 0), async () => { await wait(400); D.padDown(A, 0); }, async () => { D.padDown(A, 1); await wait(200); D.padDown(A, 0); await wait(200); D.padDown(A, 1); }],
      roll: [async () => { for (let i = 0; i < 2; i++) { D.padDown(A, 3); await wait(300); D.padUp(A); await wait(100); } }, () => { D.setPadMode(A, 'jump'); D.padDown(A, 3); }, () => { D.setPadMode(A, 'sampler'); D.padDown(A, 0); D.padDown(A, 4); D.padDown(A, 7); }],
      fx: [() => { D.set(0, 'fx', true); D.setFx({ amount: 0.7 }); }, () => D.set(0, 'fader', 0), () => { D.set(0, 'fader', 1); D.set(0, 'fx', false); }],
      cue: [() => { D.setSplit(true); D.set(1, 'cue', true); }, () => D.set(1, 'fader', 1), () => D.setSplit(false)],
      mix: [() => { D.toggleSync(B); D.set(1, 'low', 0); }, async () => { await untilBar(A, 8, 4); await until(() => D.where(A).phraseBar === 1, 4000); D.play(B); }, () => D.setXf(0.5), () => { D.set(0, 'low', 0); D.set(1, 'low', 0.5); }, () => { D.setXf(1); D.pause(A); }]
    };
    for (const L of SC.LESSONS) {
      const ok = await SC.startLesson(L.id); let passed = ok ? 0 : -1;
      if (ok) for (const fn of bots[L.id]) { if (await step(fn, L.id === 'mix' ? 40000 : 6000)) passed++; else break; }
      out[L.id] = { steps: L.steps.length, passed, done: !!(SC.active && SC.active.done), saved: !!SC.progress.mix[L.id], bots: bots[L.id].length };
      if (L.id === 'mix') out.mixPhrase = SC.phraseDist(A, B);
    }
    // a step must not pass by itself
    await SC.startLesson('eq'); await wait(1500); out.idle = SC.active.step;
    // wrong phrase start is caught
    await SC.startLesson('mix'); D.toggleSync(B); D.set(1, 'low', 0); await until(() => SC.active.step === 1, 3000); await until(() => D.where(A).phraseBar === 4 && D.where(A).beat === 2, 30000); D.play(B); await wait(300);
    out.wrongPhrase = { step: SC.active.step, note: SC.active.note };
    SC.stop();
    return out;
  });
  const ids = Object.keys(lessons).filter(k => lessons[k] && lessons[k].steps);
  check('14 controller lessons, each with a scripted player for every step', ids.length === 14 && ids.every(k => lessons[k].bots === lessons[k].steps), ids.length);
  for (const k of ids) check('Lesson "' + k + '": every step passes when the move is made, and completion is saved', lessons[k].passed === lessons[k].steps && lessons[k].done && lessons[k].saved, lessons[k]);
  check('Lesson steps do not pass by themselves', lessons.idle === 0, lessons.idle);
  check('Transition lesson: a start on bar 1 lands within half a beat of the phrase', lessons.mixPhrase <= 0.6, lessons.mixPhrase);
  check('Transition lesson: starting B mid-phrase is caught with a retry message', lessons.wrongPhrase.step === 1 && /off the phrase/.test(lessons.wrongPhrase.note), lessons.wrongPhrase);
  await page.waitForTimeout(300);
  check('Coach strip shows the lesson step', /YOUR FIRST TRANSITION|FREE MIX/.test(await page.textContent('#mc-step')));

  // ---------------------------------------------------------------- gigs
  current = 'Gigs';
  const gigs = await page.evaluate(async () => {
    const D = ORBIT.decks, SC = ORBIT.school, [A, B] = D.decks, out = {};
    const result = () => new Promise(r => { const off = ORBIT.on('gig-result', x => { off(); r(x); }); });
    // a clean transition with SYNC
    await SC.startGig('warmup');
    D.toggleSync(B); D.set(1, 'low', 0);
    await until(() => D.where(A).phraseBar === 8 && D.where(A).beat === 4, 40000); await until(() => D.where(A).phraseBar === 1, 4000);
    D.play(B); await wait(300); D.setXf(0.5);
    await wait(16 * 60000 / D.bpm(A) + 800);
    D.set(0, 'low', 0); D.set(1, 'low', 0.5); await wait(1500);
    const p = result(); D.setXf(1); out.clean = await p;
    await wait(700); out.cleanOverlay = !document.getElementById('ov-gig').hidden; out.cleanGrade = document.getElementById('gig-grade').textContent; ORBIT.ui.closeOverlay('ov-gig');
    out.fit = null;
    // a train wreck: no beatmatch, both basslines, slammed in mid-phrase
    await SC.startGig('peak');
    out.syncBlocked = D.toggleSync(B) === false && !B.sync;
    await until(() => D.where(A).phraseBar === 3 && D.where(A).beat === 2, 30000);
    D.play(B); D.setXf(0.5); await wait(9000);
    const p2 = result(); D.setXf(1); out.wreck = await p2; await wait(700); out.fit = (r => r.top >= 0 && r.bottom <= innerHeight + 1)(document.querySelector('#ov-gig .sheet').getBoundingClientRect()) && (r => r.bottom <= innerHeight)(document.getElementById('gig-retry').getBoundingClientRect()); ORBIT.ui.closeOverlay('ov-gig');
    // manual beatmatch (no SYNC): match tempo, nudge into phase, then mix
    await SC.startGig('peak');
    D.setTempo(B, (D.bpm(A) / B.track.bpm - 1) / D.RANGE); D.set(1, 'low', 0);
    await until(() => D.where(A).phraseBar === 8 && D.where(A).beat === 4, 40000); await until(() => D.where(A).phraseBar === 1, 4000);
    D.play(B); await wait(150);
    for (let i = 0; i < 120 && Math.abs(D.phaseMs()) > 10; i++) { D.nudge(B, D.phaseMs() > 0 ? 1 : -1); await wait(30); } D.nudge(B, 0);
    D.setXf(0.5); await wait(16 * 60000 / D.bpm(A) + 800); D.set(0, 'low', 0); D.set(1, 'low', 0.5); await wait(1200);
    const p3 = result(); D.setXf(1); out.manual = await p3; await wait(700); ORBIT.ui.closeOverlay('ov-gig');
    out.saved = JSON.parse(localStorage.getItem('orbitV3School') || '{}').gigs;
    SC.stop();
    return out;
  });
  check('Clean synced transition scores an A or S', gigs.clean.total >= 80, { total: gigs.clean.total, parts: gigs.clean.parts });
  check('Results sheet opens with the grade', gigs.cleanOverlay && gigs.cleanGrade === gigs.clean.grade, gigs.cleanGrade);
  check('Results sheet with tips fits on an iPhone landscape screen, buttons included', gigs.fit === true);
  check('No-SYNC gig refuses the SYNC button', gigs.syncBlocked);
  check('Unmatched, mid-phrase, double-bass mix scores under 50 with tips', gigs.wreck.total < 50 && gigs.wreck.tips.length >= 2, { total: gigs.wreck.total, parts: gigs.wreck.parts });
  check('Manual beatmatch (tempo fader + nudge, no SYNC) scores an A or S', gigs.manual.total >= 80, { total: gigs.manual.total, parts: gigs.manual.parts });
  check('Best gig scores are saved', gigs.saved && gigs.saved.warmup && gigs.saved.peak && gigs.saved.peak.score === Math.max(gigs.wreck.total, gigs.manual.total), gigs.saved);

  // ---------------------------------------------------------------- real touches on the controls
  current = 'Touch controls';
  await page.evaluate(async () => { ORBIT.school.stop(); ORBIT.decks.reset(); await ORBIT.decks.load(0, 'neon'); });
  await page.tap('#dk-0 .tb-play'); await page.waitForTimeout(300);
  check('PLAY button starts the deck', await page.evaluate(() => ORBIT.decks.decks[0].playing));
  const drag = async (sel, dx, dy) => { const r = await page.$eval(sel, e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); await page.dispatchEvent(sel, 'pointerdown', { pointerId: 7, clientX: r.x, clientY: r.y, bubbles: true }); for (let i = 1; i <= 6; i++) await page.dispatchEvent(sel, 'pointermove', { pointerId: 7, clientX: r.x + dx * i / 6, clientY: r.y + dy * i / 6, bubbles: true }); await page.dispatchEvent(sel, 'pointerup', { pointerId: 7, clientX: r.x + dx, clientY: r.y + dy, bubbles: true }); };
  await drag('.mx-col[data-ch="0"] [data-knob="low"]', 0, 90);
  check('Dragging the LOW knob down turns it down', await page.evaluate(() => ORBIT.decks.decks[0].ch.low < 0.05), await page.evaluate(() => ORBIT.decks.decks[0].ch.low));
  await drag('#mx-xfader', 200, 0);
  check('Dragging the crossfader right moves it to B', await page.evaluate(() => ORBIT.decks.mixer.xf > 0.95));
  await drag('#dk-0 .dk-tempo .vs', 0, 60);
  check('Dragging the tempo fader down speeds the deck up', await page.evaluate(() => ORBIT.decks.bpm(ORBIT.decks.decks[0]) > 126), await page.evaluate(() => ORBIT.decks.bpm(ORBIT.decks.decks[0])));
  await page.tap('#dk-0 .tb-loop');
  check('LOOP button sets a loop', await page.evaluate(() => !!ORBIT.decks.decks[0].loop));
  await page.tap('#dk-0 .tb-pads'); await page.waitForTimeout(100);
  await page.dispatchEvent('#dk-0 .dj-pad[data-n="0"]', 'pointerdown', { pointerId: 9 }); await page.dispatchEvent('#dk-0 .dj-pad[data-n="0"]', 'pointerup', { pointerId: 9 }); await page.waitForTimeout(150);
  check('Pad 1 stores a hot cue and lights up', await page.evaluate(() => ORBIT.decks.decks[0].hot[0] !== null && document.querySelector('#dk-0 .dj-pad').classList.contains('is-lit')));
  await page.tap('[data-view="play"]'); await page.waitForTimeout(150);
  check('Leaving the Mix tab stops the decks', await page.evaluate(() => !ORBIT.decks.anyPlaying()));

  // ---------------------------------------------------------------- layout
  current = 'Layout';
  for (const vp of [{ n: 'iPhone landscape 844×390', w: 844, h: 390 }, { n: 'iPhone SE landscape 667×375', w: 667, h: 375 }, { n: 'iPhone Pro Max landscape 932×430', w: 932, h: 430 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h }); await page.tap('[data-view="mix"]'); await page.waitForTimeout(250);
    const lay = await page.evaluate(() => { const box = s => [...document.querySelectorAll(s)].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()); const all = box('#view-mix .btn, #view-mix .ctl, #view-mix .jog');
      return { scroll: document.documentElement.scrollHeight > innerHeight + 1, inside: all.every(r => r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1), minTransport: Math.round(Math.min(...box('.dk-transport .btn').map(r => Math.min(r.width, r.height)))), minKnob: Math.round(Math.min(...box('.mx-col .kn').map(r => Math.min(r.width, r.height)))), jog: Math.round(Math.min(...box('.jog-plate').map(r => r.width))), wave: Math.round(box('#mix-wave')[0].height) }; });
    check(vp.n + ': whole controller on screen, no scrolling', !lay.scroll && lay.inside, lay);
    check(vp.n + ': transport buttons at least 34 pt, knobs at least 26 pt, jog at least 90 pt', lay.minTransport >= 34 && lay.minKnob >= 26 && lay.jog >= 90, lay);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => ORBIT.ui.setTheme('aero')); await page.waitForTimeout(150);
  check('Theme switch keeps the Mix tab working', await page.evaluate(() => document.documentElement.classList.contains('theme-aero') && !!document.querySelector('#dk-0 .jog-plate')));
  await page.evaluate(() => ORBIT.ui.setTheme('grunge'));
  check('Mix: no console errors', page._errors.length === 0, page._errors.slice(0, 3));

  // ---------------------------------------------------------------- beat-making lessons
  current = 'Beat trainer';
  await page.tap('[data-view="pads"]'); await page.waitForTimeout(300);
  const beat = await page.evaluate(async () => {
    const BP = ORBIT.beatpad, SC = ORBIT.school, E = ORBIT.engine, out = {};
    await BP.loadKit();
    const step = async (fn, n) => { const a = SC.beatActive, s0 = a.step; await fn(); return until(() => a.done || a.step > s0, n || 8000); };
    const sel = i => { BP.sel = i; ORBIT.emit('bp-select', i); };
    const put = async (pad, steps) => { sel(pad); for (const s of steps) { const has = BP.pattern().events.some(e => e.pad === pad && Math.round(e.step) === s); if (!has) BP.toggleStep(s); } };
    const onBeat = async (pad, parity) => { await until(() => { const x = (E.ctx.currentTime - E.latency() - E.offsetMs / 1000 - BP.origin) / (60 / BP.bpm); return x > 0 && Math.abs(x - Math.round(x)) < 0.03 && ((Math.round(x) % 2) + 2) % 2 === parity; }, 5000); await BP.padDown(pad, undefined, 1); BP.padUp(undefined, pad); };
    const bots = {
      four: [() => BP.padDown(0, undefined, 1), () => put(0, [0, 4, 8, 12]), () => { if (!BP.playing) return BP.play(); }],
      backbeat: [() => put(1, [4, 12]), () => put(2, [0, 2, 4, 6, 8, 10, 12, 14]), () => { if (!BP.playing) return BP.play(); }],
      finger: [() => { if (!BP.playing) return BP.play(); }, async () => { for (let i = 0; i < 8; i++) { await onBeat(i % 2, i % 2); await wait(120); } }],
      record: [async () => { if (!BP.rec) await BP.toggleRec(); }, async () => { await until(() => !BP.countingIn, 5000); for (let i = 0; i < 5; i++) { await BP.padDown(5 + i, undefined, 1); BP.padUp(undefined, 5 + i); await wait(230); } }, async () => { if (BP.rec) await BP.toggleRec(); }],
      repeat: [() => BP.setNoteRepeat(16), async () => { await BP.padDown(2, undefined, 1, 77); await wait(2200); BP.padUp(77, 2); }, () => { BP.setNoteRepeat(0); BP.setSwing(62); }],
      levels16: [() => BP.padDown(12, undefined, 1), () => BP.setLevels16(true), async () => { for (const i of [3, 5, 8, 10]) { await BP.padDown(i, undefined, 1); await wait(80); } }, () => BP.setLevels16(false)],
      arrange: [() => document.getElementById('bp-copy').click(), async () => { const next = BP.SLOTS[(BP.SLOTS.indexOf(BP.cur) + 1) % 4]; BP.selectSlot(next); await until(() => BP.cur === next, 6000); }, () => { sel(4); BP.toggleStep(3); }]
    };
    for (const L of SC.BEAT_LESSONS) {
      SC.startBeat(L.id); let passed = 0;
      for (const fn of bots[L.id]) { if (await step(fn)) passed++; else break; }
      out[L.id] = { steps: L.steps.length, passed, done: SC.beatActive.done, saved: !!SC.progress.beat[L.id], bots: bots[L.id].length };
    }
    out.coach = !document.getElementById('bp-coach').hidden && /COMPLETE/.test(document.getElementById('bpc-step').textContent);
    SC.startBeat('finger'); if (!BP.playing) await BP.play(); await until(() => SC.beatActive.step === 1, 3000);
    // off-beat taps must not count
    for (let i = 0; i < 4; i++) { await until(() => { const x = (E.ctx.currentTime - BP.origin) / (60 / BP.bpm); return Math.abs(x - Math.floor(x) - 0.5) < 0.04; }, 3000); await BP.padDown(0, undefined, 1); await wait(150); }
    out.offBeat = SC.beatActive.mem.good || 0;
    BP.stop(); SC.stopBeat();
    return out;
  });
  const bids = Object.keys(beat).filter(k => beat[k] && beat[k].steps);
  check('7 beat-making lessons, each with a scripted player for every step', bids.length === 7 && bids.every(k => beat[k].bots === beat[k].steps), bids.length);
  for (const k of bids) check('Beat lesson "' + k + '" completes when the moves are made, and is saved', beat[k].passed === beat[k].steps && beat[k].done && beat[k].saved, beat[k]);
  check('Finger drumming ignores hits that are off the beat', beat.offBeat === 0, beat.offBeat);
  check('Beat coach shows on the LCD', beat.coach);
  check('Beat trainer: no console errors', page._errors.length === 0, page._errors.slice(0, 3));
  await ctx.close();

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log('\nSUMMARY ' + pass + ' / ' + results.length + ' passed');
  require('fs').writeFileSync(process.env.QA_OUT || 'qa-mix-results.json', JSON.stringify(results, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
