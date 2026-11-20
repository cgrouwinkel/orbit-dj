/* ORBIT DJ real-controller (Web MIDI) QA with a simulated controller. No hardware is involved: a fake MIDI input
   is injected and sent the messages a typical controller sends (notes for buttons, CC for knobs, centre-64 jog).
   Run: node tests/qa-midi.js http://127.0.0.1:8710   Headless Chrome only. */
const { chromium } = require(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, '');
const results = []; let current = '';
function check(name, ok, detail) { results.push({ group: current, name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + current + ' :: ' + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) + ']' : '')); }
const SEED = () => { try { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('orbitV22Tutorial', 'true'); localStorage.setItem('orbitV42MixLevel', '"pro"'); localStorage.setItem('orbitV4RotateTip', 'true'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} };
const MOCK = () => {
  const inp = { id: 'mock1', name: 'Mock DDJ', type: 'input', state: 'connected', onmidimessage: null };
  window.__midi = inp;
  window.__send = (...b) => { if (inp.onmidimessage) inp.onmidimessage({ data: new Uint8Array(b), timeStamp: performance.now() }); };
  const access = { inputs: new Map([['mock1', inp]]), outputs: new Map(), onstatechange: null };
  navigator.requestMIDIAccess = () => Promise.resolve(access);
  const q = navigator.permissions && navigator.permissions.query ? navigator.permissions.query.bind(navigator.permissions) : null;
  if (navigator.permissions) navigator.permissions.query = d => (d && d.name === 'midi' ? Promise.resolve({ state: 'granted' }) : q(d));
};
// A made-up controller layout, Pioneer-like: deck A on channel 1, deck B on channel 2, mixer CCs, centre-64 jog,
// pads on their own channel, tempo reversed (its + end sends 0).
const HW = {
  play: i => [0x90 + i, 0x0b], cue: i => [0x90 + i, 0x0c], sync: i => [0x90 + i, 0x58], loop: i => [0x90 + i, 0x14],
  jogSide: i => [0xb0 + i, 0x21], jogTop: i => [0xb0 + i, 0x22], touch: i => [0x90 + i, 0x36], tempo: i => [0xb0 + i, 0x00],
  pad1: i => [0x97 + i * 2, 0x00],
  gain: i => [0xb6, 0 + i], hi: i => [0xb6, 2 + i], mid: i => [0xb6, 4 + i], low: i => [0xb6, 6 + i],
  filter: i => [0xb6, 8 + i], fader: i => [0xb0 + i, 0x13], hp: i => [0x90 + i, 0x54], xf: () => [0xb6, 10]
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

  current = 'No MIDI in this browser';
  {
    const ctx = await browser.newContext({ viewport: { width: 395, height: 702 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(SEED); await ctx.addInitScript(() => { try { delete Navigator.prototype.requestMIDIAccess; } catch (e) {} navigator.requestMIDIAccess = undefined; });
    const page = await ctx.newPage(); await page.goto(BASE + '/index.html'); await page.waitForTimeout(300);
    await page.evaluate(() => { ORBIT.ui.showView('settings'); document.getElementById('set-midi').click(); });
    const u = await page.evaluate(() => ({ open: !document.getElementById('ov-midi').hidden, msg: !document.getElementById('midi-unsupported').hidden && /Chrome or Edge on a computer/.test(document.getElementById('midi-unsupported').textContent), main: document.getElementById('midi-main').hidden, supported: ORBIT.midi.supported }));
    check('Setup → Real controller explains it needs Chrome or Edge on a computer, and shows no controls', u.open && u.msg && u.main && !u.supported, u);
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(SEED); await ctx.addInitScript(MOCK);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { ORBIT.engine.unlock(); await ORBIT.engine.ensureRunning(); window.wait = ms => new Promise(r => setTimeout(r, ms)); window.until = (f, ms) => new Promise(r => { const t0 = performance.now(); const k = () => (f() ? r(true) : performance.now() - t0 > ms ? r(false) : setTimeout(k, 30)); k(); }); });
  await page.evaluate(hw => { window.HW = Object.fromEntries(Object.entries(hw).map(([k, f]) => [k, eval(f)])); }, Object.fromEntries(Object.entries(HW).map(([k, f]) => [k, f.toString()])));

  current = 'Connect';
  await page.evaluate(() => { ORBIT.ui.showView('settings'); document.getElementById('set-midi').click(); });
  await page.click('#midi-connect'); await page.waitForTimeout(200);
  check('CONNECT finds the controller and shows its name', await page.evaluate(() => /Mock DDJ/.test(document.getElementById('midi-status').textContent) && ORBIT.midi.inputs.length === 1));
  await page.evaluate(() => __send(0xb0, 0x21, 0x41));
  check('Incoming messages show on the sheet', /CC 33 · ch 1 = 65/.test(await page.textContent('#midi-last')));
  check('MIDI clock and other system messages are ignored', await page.evaluate(() => ORBIT.midi.parse([0xf8]) === null && ORBIT.midi.parse([0xfe]) === null));

  current = 'Learn everything';
  await page.click('#midi-learn-all'); await page.waitForTimeout(100);
  const steps = await page.evaluate(async () => {
    const M = ORBIT.midi, L = M.learn, log = [];
    const btn = async m => { __send(m[0], m[1], 127); await wait(10); __send(m[0], m[1], 0); };
    const sweep = async (m, vals) => { for (const v of vals) { __send(m[0], m[1], v); __send(m[0], m[1] + 32, 5); await wait(12); } };
    for (let guard = 0; guard < 60 && L.on; guard++) {
      const id = L.id, step = L.step, ask = document.getElementById('midi-ask').textContent; log.push(id);
      const mm = id.match(/^([a-z]+)(\d)?(?:_\d)?$/), kind = mm[1], i = Number(mm[2] || 0);
      if (!ask) return { err: 'no prompt', id };
      if (kind === 'sync' && i === 1) { document.getElementById('midi-skip').click(); await wait(50); continue; } // pretend deck B has no SYNC
      if (['play', 'cue', 'sync', 'loop', 'touch', 'hp'].includes(kind)) await btn(HW[kind](i));
      else if (kind === 'pad') await btn(HW.pad1(i));
      else if (kind === 'jog') { for (let k = 0; k < 40; k++) { __send(...HW.jogSide(i), 64 + 1 + (k % 3)); await wait(5); } for (let k = 0; k < 30; k++) { __send(...HW.jogTop(i), 66); await wait(5); } }
      else if (kind === 'tempo') await sweep(HW.tempo(i), [64, 50, 30, 10, 0]);
      else if (kind === 'xf') await sweep(HW.xf(), [0, 40, 90, 127]);
      else await sweep(HW[kind](i), [64, 100, 127, 90, 30, 0, 64]);
      await until(() => !L.on || L.step !== step, 3000); await wait(30);
    }
    return { log, on: L.on, map: M.cfg().map };
  });
  const mp = steps.map || {};
  check('The wizard asks for every control in order and finishes (31 steps)', !steps.err && !steps.on && steps.log.length === 31, { n: steps.log && steps.log.length, err: steps.err });
  check('Buttons bind to their notes; a skipped control stays empty', mp.play0 && mp.play0.keys[0] === 'n:0:11' && mp.hp1 && mp.hp1.keys[0] === 'n:1:84' && !mp.sync1, { play0: mp.play0, hp1: mp.hp1, sync1: mp.sync1 });
  check('Pads 2 to 8 are filled in from pad 1 (consecutive notes)', mp.pad0_0 && mp.pad0_0.keys[0] === 'n:7:0' && mp.pad0_7 && mp.pad0_7.keys[0] === 'n:7:7' && mp.pad0_7.auto && mp.pad1_3 && mp.pad1_3.keys[0] === 'n:9:3', { a: mp.pad0_7, b: mp.pad1_3 });
  check('Knobs keep the coarse CC of a 14-bit pair; the tempo fader whose + end sends 0 is marked reversed', mp.low0 && mp.low0.keys[0] === 'c:6:6' && mp.tempo0 && mp.tempo0.keys[0] === 'c:0:0' && mp.tempo0.inv === true, { low0: mp.low0, tempo0: mp.tempo0 });
  check('The jog takes both the side and top messages and reads them as centre-64', mp.jog0 && mp.jog0.keys.includes('c:0:33') && mp.jog0.keys.includes('c:0:34') && mp.jog0.enc === 'offset', mp.jog0);
  check('Mapping is saved on the device', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('orbitV44Midi')).map).length >= 44));

  current = 'Playing the decks';
  await page.evaluate(() => document.querySelector('#ov-midi [data-close]').click());
  await page.evaluate(() => ORBIT.ui.showView('mix'));
  const dk = await page.evaluate(async () => {
    const D = ORBIT.decks, A = D.decks[0], B = D.decks[1], o = {};
    const btn = async (m, hold) => { __send(m[0], m[1], 127); await wait(hold || 15); __send(m[0], m[1], 0); await wait(15); };
    await btn(HW.play(0)); o.autoLoad = await until(() => !!A.buf, 15000); // an empty deck loads a track on PLAY
    await btn(HW.play(0)); o.playing = A.playing && A.stats.plays >= 1;
    await btn(HW.play(1)); await until(() => !!B.buf, 15000);
    // tempo: reversed fader, + end sends 0. Pick-up: far from the screen value nothing happens; meeting it takes over
    __send(...HW.tempo(0), 10); await wait(20); o.notPicked = A.tempo === 0;
    __send(...HW.tempo(0), 64); await wait(20); __send(...HW.tempo(0), 0); await wait(20); o.tempoUp = A.tempo > 0.95;
    D.setTempo(A, 0); __send(...HW.tempo(0), 0); await wait(20); o.repick = A.tempo === 0; // the screen moved it: pick up again
    __send(...HW.tempo(0), 70); __send(...HW.tempo(0), 60); await wait(20); o.crossed = Math.abs(A.tempo) < 0.1 && A.tempo !== 0;
    // channel fader and EQ, through the same mixer the screen uses
    __send(...HW.fader(0), 127); __send(...HW.fader(0), 40); await wait(20); o.fader = Math.abs(A.ch.fader - 40 / 127) < 0.01;
    __send(...HW.low(0), 64); await wait(10); o.lowCentre = A.ch.low === 0.5; __send(...HW.low(0), 60); __send(...HW.low(0), 0); await wait(20); o.lowCut = A.ch.low === 0;
    __send(...HW.xf(), 64); __send(...HW.xf(), 127); await wait(20); o.xf = D.mixer.xf === 1;
    await btn(HW.hp(0)); o.hp = A.ch.cue === true; await btn(HW.hp(0)); o.hpOff = A.ch.cue === false;
    // jog: turning the side while playing bends the speed, then lets go
    for (let k = 0; k < 8; k++) { __send(...HW.jogSide(0), 68); await wait(12); } o.bend = A.bend > 0; await wait(300); o.bendBack = !A.bend;
    // touch + turn while paused scrubs
    await btn(HW.play(0)); const p0 = A.pos; __send(...HW.touch(0), 127); for (let k = 0; k < 10; k++) { __send(...HW.jogTop(0), 70); await wait(10); } __send(...HW.touch(0), 0); o.scrub = A.pos > p0 + 0.02 && A.stats.scrubs >= 1;
    // CUE: like club players, a press while paused sets the cue point and holding it previews; pads set hot cues
    await btn(HW.cue(0)); const setCue = Math.abs(A.cue - A.pos) < 0.001; await btn(HW.cue(0), 200); o.cue = setCue && A.stats.cuePreview >= 1; // paused off the cue: first press sets it, holding previews
    D.setPadMode(A, 'hotcue'); D.play(A); await wait(300); await btn(HW.pad1(0)); o.hot = A.hot[0] !== null;
    __send(0x97, 0x03, 127); await wait(15); __send(0x97, 0x03, 0); o.pad4 = A.hot[3] !== null;
    await btn(HW.sync(0)); o.sync = A.sync === true; await btn(HW.loop(0)); o.loop = !!A.loop; await btn(HW.loop(0)); o.loopOff = !A.loop;
    D.stopAll(); return o;
  });
  check('PLAY on an empty deck loads a track; PLAY again starts it', dk.autoLoad && dk.playing, dk);
  check('Tempo fader picks up only where the screen value is, follows the reversed direction, and picks up again after the screen moves it', dk.notPicked && dk.tempoUp && dk.repick && dk.crossed, dk);
  check('Channel fader, EQ (exact centre at 64) and crossfader move the mixer', dk.fader && dk.lowCentre && dk.lowCut && dk.xf, dk);
  check('Headphone cue button toggles', dk.hp && dk.hpOff, dk);
  check('Jog side bends the speed while turning and lets go; touch + turn while paused scrubs', dk.bend && dk.bendBack && dk.scrub, dk);
  check('CUE, hot-cue pads (pad 1 and an auto-filled pad 4), SYNC and LOOP work from the controller', dk.cue && dk.hot && dk.pad4 && dk.sync && dk.loop && dk.loopOff, dk);
  const ls = await page.evaluate(async () => {
    const SC = ORBIT.school, A = ORBIT.decks.decks[0]; ORBIT.decks.reset();
    SC.startLesson(SC.LESSONS[0].id); await until(() => SC.active && !SC.active.loading && !!A.buf, 10000); await wait(300);
    const before = SC.active && SC.active.step;
    __send(...HW.play(0), 127); await wait(15); __send(...HW.play(0), 0);
    await until(() => SC.active && SC.active.step !== before, 4000);
    const after = SC.active && SC.active.step; SC.stop(); ORBIT.decks.stopAll();
    return { lesson: SC.LESSONS[0].id, before, after };
  });
  check('A lesson counts a move made on the controller (first step of lesson 1 advances on PLAY)', ls.after !== ls.before, ls);

  current = 'Play tab';
  const pt = await page.evaluate(async () => {
    const G = ORBIT.game; ORBIT.ui.showView('play'); G.setDifficulty('easy'); await G.start(); await until(() => G.state === 'running', 8000);
    const taps = []; const off = ORBIT.on('pad', l => taps.push(l));
    __send(0x97, 0x00, 127); await wait(30); const lit = document.querySelectorAll('#lane-pads .lane-pad')[0].classList.contains('is-down'); __send(0x97, 0x00, 0);
    __send(0x99, 0x02, 127); await wait(10); __send(0x99, 0x02, 0); // deck B pad 3
    __send(0x97, 0x05, 127); await wait(10); __send(0x97, 0x05, 0); // pad 6: not a lane
    const deckUntouched = !ORBIT.decks.decks[0].playing; __send(...HW.play(0), 127); await wait(30); __send(...HW.play(0), 0);
    const r = { taps, lit, deckUntouched, deckStill: !ORBIT.decks.decks[0].playing };
    if (typeof off === 'function') off(); G.stop(); return r;
  });
  check('Pads 1 to 4 of either deck play the lanes (pad lights up); pads 5 to 8 and deck buttons do nothing here', pt.taps.join() === '0,2' && pt.lit && pt.deckUntouched && pt.deckStill, pt);

  current = 'Mapping tools';
  await page.evaluate(() => { ORBIT.ui.showView('settings'); document.getElementById('set-midi').click(); });
  const mt = await page.evaluate(async () => {
    const M = ORBIT.midi, o = {};
    M.learnStart('xf', false); __send(0xb0, 0x13, 10); __send(0xb0, 0x13, 90); await until(() => !M.learn.on, 2500);
    o.steal = M.cfg().map.xf.keys[0] === 'c:0:19' && !M.cfg().map.fader0; // a key can belong to one control only
    o.rows = document.querySelectorAll('#midi-list .midi-row').length;
    document.getElementById('midi-copy').click(); await wait(50); const txt = document.getElementById('midi-json').value; o.copied = JSON.parse(txt).map.play0.keys[0] === 'n:0:11';
    document.getElementById('midi-clear').click(); document.getElementById('midi-clear').click(); o.cleared = Object.keys(M.cfg().map).length === 0;
    document.getElementById('midi-json').value = txt; document.getElementById('midi-apply').click(); o.loaded = Object.keys(M.cfg().map).length >= 43;
    document.getElementById('midi-json').value = 'not json'; document.getElementById('midi-apply').click(); o.badKept = Object.keys(M.cfg().map).length >= 43;
    return o;
  });
  check('Learning a message already in use moves it to the new control', mt.steal, mt);
  check('Every control has a row (45); copy, clear and load a mapping; bad text is refused', mt.rows === 45 && mt.copied && mt.cleared && mt.loaded && mt.badKept, mt);
  await page.reload(); await page.waitForTimeout(800);
  check('After a reload the mapping is kept and the controller reconnects by itself where MIDI was already allowed', await page.evaluate(() => !!ORBIT.midi.access && ORBIT.midi.inputs.length === 1 && Object.keys(ORBIT.midi.cfg().map).length >= 43));
  await page.evaluate(() => { ORBIT.ui.showView('settings'); document.getElementById('set-midi').click(); });
  await page.screenshot({ path: process.env.SHOT || '/tmp/qa-midi-sheet.png' });
  check('No console errors', errors.length === 0, errors.slice(0, 3));

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log('\nSUMMARY ' + pass + ' / ' + results.length + ' passed');
  require('fs').writeFileSync(process.env.QA_OUT || 'qa-midi-results.json', JSON.stringify(results, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
