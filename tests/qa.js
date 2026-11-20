/* ORBIT DJ v2 automated QA (headless Chrome via Playwright).
   Run: node tests/qa.js http://127.0.0.1:8710   (serve the site folder first)
   Results are desktop-browser automation only; they are not a substitute for iPhone testing. */
const { chromium } = require(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, '');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const results = []; let current = '';
function check(name, ok, detail) { results.push({ group: current, name, ok: !!ok, detail: detail === undefined ? '' : detail }); console.log((ok ? 'PASS ' : 'FAIL ') + current + ' :: ' + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']' : '')); }

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 860 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, acceptDownloads: true });
  await ctx.addInitScript(seed => { try { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('orbitV2Intro', 'true'); if (!seed.__tutorial) localStorage.setItem('orbitV22Tutorial', 'true'); if (!seed.__moves) localStorage.setItem('orbitV4Moves', 'false'); if (!seed.__locks) localStorage.setItem('orbitV4UnlockAll', 'true'); for (const k in seed) localStorage.setItem(k, seed[k]); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, opts.seed || {});
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(300);
  if (!opts.fail) await page.evaluate(() => { ORBIT.game.noFail = true; }); // crowd-fail is tested on its own page
  return { ctx, page };
}
const autoPlay = page => page.evaluate(() => new Promise(res => {
  const G = ORBIT.game, errs = [], kinds = {};
  const off = ORBIT.on('judge', j => { kinds[j.kind] = (kinds[j.kind] || 0) + 1; if (j.kind !== 'miss' && j.kind !== 'off') errs.push(j.err); });
  (function step() {
    if (G.state !== 'running') { off(); res({ errs, kinds }); return; }
    const now = G.songTime();
    for (const n of G.notes) { if (n.t > now + 0.004) break; if (!n.done && n.t > now - 0.1) G.tap(n.lane); }
    requestAnimationFrame(step);
  })();
}));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });

  // ---------------------------------------------------------------- boot & unlock
  current = 'Boot';
  let { ctx, page } = await newPage(browser);
  check('No audio context before a gesture', await page.evaluate(() => ORBIT.engine.ctx === null));
  check('Beat pad kit bytes prefetched before audio unlock', await page.evaluate(() => Promise.all(ORBIT.assets.kitPaths(ORBIT.beatpad.kit).map(p => ORBIT.assets.fetch(p))).then(() => true, () => false)));
  await page.click('#btn-start');
  await page.waitForTimeout(500);
  const boot = await page.evaluate(() => ({ state: ORBIT.engine.ctx && ORBIT.engine.ctx.state, game: ORBIT.game.state, music: ORBIT.music.playing, mode: ORBIT.music.mode }));
  check('Start Set unlocks audio and runs', boot.state === 'running' && boot.game === 'running', boot);
  check('Backing music runs in set mode with guide drums', boot.music && boot.mode === 'set', boot);
  check('Count-in lead-in is at least 4 beats', await page.evaluate(() => ORBIT.game.leadIn >= 4 * 60 / ORBIT.game.bpm()));
  await page.evaluate(() => ORBIT.game.stop());
  const lib = await page.evaluate(async () => {
    const A = ORBIT.assets, S = window.ORBIT_SOUNDS, paths = [];
    Object.values(S.kits).forEach(k => k.forEach(d => paths.push(d.path))); paths.push(...A.allInstPaths(), ...Object.values(S.fx));
    await A.ensure(paths); return { total: paths.length, decoded: paths.filter(p => A.get(p)).length };
  });
  check('Every sound file loads and decodes (kits, instruments, fx, v1 chops)', lib.total === 160 && lib.decoded === lib.total, lib);

  current = 'Music + charts';
  const follow = await page.evaluate(async () => {
    const G = ORBIT.game, Syn = ORBIT.synth, out = {};
    const orig = Syn.kit; let log = [];
    Syn.kit = function (c, dest, kit, pad, t, o) { log.push({ pad, t, vel: o && o.vel }); return orig.apply(this, arguments); };
    for (const diff of ['easy', 'expert']) {
      G.select(2); G.setDifficulty(diff); log = [];
      await G.start(); await new Promise(r => setTimeout(r, 9000 + G.leadIn * 1000));
      const sty = ORBIT.music.STYLES[G.styleFor()], laneEl = ['kick', 'snare', 'hat', 'fx'];
      const due = G.notes.filter(n => n.t < G.songTime() - 0.3 && !n.dur); // hold notes are not drum hits
      let matched = 0;
      for (const n of due) { if (log.some(h => Math.abs(h.t - (G.startAt + n.t)) < 0.0015 && h.pad === n.pad)) matched++; }
      out[diff] = { notes: due.length, backingPlaysThem: matched };
      G.stop();
    }
    Syn.kit = orig;
    return out;
  });
  check('Rookie: every note is a drum hit the song actually plays (guide drums on)', follow.easy.notes > 5 && follow.easy.backingPlaysThem === follow.easy.notes, follow.easy);
  check('Headliner: the backing drops your notes, so only your taps fill them', follow.expert.notes > 5 && follow.expert.backingPlaysThem === 0, follow.expert);
  const styles = await page.evaluate(async () => {
    // share of energy above 4 kHz, above 8 kHz and below 60 Hz (4096-point FFT averaged over the render)
    const spectrum = b => {
      const N = 4096, d = b.getChannelData(0), rate = b.sampleRate, win = new Float32Array(N), re = new Float32Array(N), im = new Float32Array(N), acc = new Float64Array(N / 2);
      for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
      for (let o = 0; o + N <= d.length; o += N * 4) {
        for (let i = 0; i < N; i++) { re[i] = d[o + i] * win[i]; im[i] = 0; }
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
        for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, c = a + len / 2, xr = re[c] * wr - im[c] * wi, xi = re[c] * wi + im[c] * wr; re[c] = re[a] - xr; im[c] = im[a] - xi; re[a] += xr; im[a] += xi; } }
        for (let i = 0; i < N / 2; i++) acc[i] += re[i] * re[i] + im[i] * im[i];
      }
      let tot = 0, a4 = 0, a8 = 0, lo = 0; for (let i = 1; i < N / 2; i++) { const f = i * rate / N; tot += acc[i]; if (f >= 4000) a4 += acc[i]; if (f >= 8000) a8 += acc[i]; if (f < 60) lo += acc[i]; }
      return { above4k: +(100 * a4 / tot).toFixed(2), above8k: +(100 * a8 / tot).toFixed(2), below60: +(100 * lo / tot).toFixed(1) };
    };
    const M = ORBIT.music, r = {}, st = b => { let s = 0, n = 0, pk = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; n++; pk = Math.max(pk, Math.abs(d[i])); } } return [+(10 * Math.log10(s / n)).toFixed(1), +(20 * Math.log10(pk)).toFixed(1)]; };
    for (const [id, bpm] of [['boombap', 88], ['soul', 96], ['trap', 140], ['house', 126], ['basshouse', 126], ['garage', 132], ['dubstep', 140]]) {
      await ORBIT.assets.ensure(M.assetsFor(id));
      const secs = 240 / bpm * 8 + 0.4;
      const full = await M.renderOffline(id, bpm, secs, { preLimiter: true });
      const mix = st(full), mel = st(await M.renderOffline(id, bpm, secs, { preLimiter: true, only: 'melody' })), bass = st(await M.renderOffline(id, bpm, secs, { preLimiter: true, only: 'bass' }));
      const sp = spectrum(full);
      r[id] = { rms: mix[0], peak: mix[1], melodyVsBass: +(mel[0] - bass[0]).toFixed(1), above4k: sp.above4k, above8k: sp.above8k, below60: sp.below60 };
    }
    return r;
  });
  const rmsVals = Object.values(styles).map(x => x.rms);
  check('All 7 songs level-matched within 3 dB (pre-limiter RMS)', Math.max(...rmsVals) - Math.min(...rmsVals) <= 3, styles);
  check('Songs stay under full scale before the limiter (peaks below −2 dBFS)', Object.values(styles).every(x => x.peak < -2), Object.fromEntries(Object.entries(styles).map(([k, v]) => [k, v.peak])));
  check('Not dull: every song has at least 3% of its energy above 4 kHz and 1.5% above 8 kHz (v3.0 songs: about 2% and 0.3%)', Object.values(styles).every(x => x.above4k >= 3 && x.above8k >= 1.5), Object.fromEntries(Object.entries(styles).map(([k, v]) => [k, v.above4k + '/' + v.above8k])));
  check('Not boomy: less than half of any song’s energy sits below 60 Hz, where phone speakers play nothing', Object.values(styles).every(x => x.below60 < 50), Object.fromEntries(Object.entries(styles).map(([k, v]) => [k, v.below60])));
  check('Melody audible: within 7 dB of the bass in every style', Object.values(styles).every(x => x.melodyVsBass > -7), Object.fromEntries(Object.entries(styles).map(([k, v]) => [k, v.melodyVsBass])));

  // ---------------------------------------------------------------- full set, machine-timed taps
  current = 'Rhythm scoring';
  await page.evaluate(() => { ORBIT.game.select(3); ORBIT.game.setDifficulty('expert'); });
  await page.click('#btn-start');
  const play = await autoPlay(page);
  const res = await page.evaluate(() => ORBIT.game.lastResult);
  const absMs = play.errs.map(e => Math.abs(e * 1000)).sort((a, b) => a - b);
  const p95 = absMs[Math.floor(absMs.length * 0.95)] || 0;
  check('On-time taps judged on the audio clock (95th percentile error under 35 ms)', p95 < 35, { notes: absMs.length, p95ms: Math.round(p95), maxMs: Math.round(absMs[absMs.length - 1]) });
  check('Full Main Stage / Headliner set: no misses, 3 stars', res && res.counts.miss === 0 && res.stars === 3, res && { acc: res.accuracy, stars: res.stars, counts: res.counts });
  check('Score uses v1 formula (combo multiplier up to x4)', res && res.score > absMs.length * 150, res && res.score);
  check('Result saved to v1 progress key', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('orbitArcadeProgress') || '{}'); return p[3] && p[3].stars === 3; }));
  check('Combined grade saved to v1 key', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('orbitArcadeCombinedV11') || '{}'); return p['3:expert'] >= 700; }));
  await page.waitForTimeout(700);
  check('Results screen shows grade', await page.evaluate(() => !document.getElementById('ov-results').hidden && document.getElementById('res-grade').textContent.length > 0), await page.textContent('#res-grade'));
  await page.click('#res-career');

  // timing windows: tap deliberately late
  const windowTest = await page.evaluate(async () => {
    const G = ORBIT.game, E = ORBIT.engine, out = {};
    for (const [diff, lateMs] of [['easy', 150], ['normal', 80], ['expert', 150]]) {
      G.select(0); G.setDifficulty(diff); await G.start();
      const n = G.notes[0];
      await new Promise(r => { (function w() { if (G.songTime() >= n.t + lateMs / 1000) r(); else requestAnimationFrame(w); })(); });
      out[diff + '+' + lateMs] = G.tap(n.lane);
      G.stop();
    }
    return out;
  });
  check('Rookie accepts a 150 ms late hit (window 190 ms)', windowTest['easy+150'] === 'good', windowTest);
  check('Club grades an 80 ms late hit as GREAT', windowTest['normal+80'] === 'great', windowTest);
  check('Headliner rejects a 150 ms late hit (window 85 ms)', windowTest['expert+150'] === 'off', windowTest);

  // ---------------------------------------------------------------- controller challenges
  current = 'Equipment challenges';
  const ch = await page.evaluate(async () => {
    const G = ORBIT.game, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
    const setRange = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    // venue 2: cue before start, then blend melody -> bass -> centre
    G.select(1); G.setDifficulty('easy'); await G.cue(); await G.start(); await wait(300);
    setRange('xf', 5); await wait(80); setRange('xf', 95); await wait(80); setRange('xf', 50); await wait(80);
    out.venue2 = G.challenge.points; G.stop();
    // venue 3: bass cut, hold one beat, restore
    G.select(2); await G.start(); await wait(300);
    setRange('low-eq', 20); await wait(60 / G.bpm() * 1000 + 250); setRange('low-eq', 100); await wait(100);
    out.venue3 = G.challenge.points; G.stop();
    // venue 4: filter close, hold, reopen
    G.select(3); await G.start(); await wait(300);
    setRange('filter', 150); await wait(60 / G.bpm() * 1000 + 250); setRange('filter', 1000); await wait(100);
    out.venue4 = G.challenge.points; G.stop();
    // anti-cheat: controls moved while NOT playing do not score
    G.select(2); setRange('low-eq', 10); await wait(600); setRange('low-eq', 100);
    out.idleMoves = G.challenge.points;
    return out;
  });
  check('House Party cue + three-position blend = 300/300', ch.venue2 === 300, ch);
  check('Underground Club bass swap with one-beat hold = 300/300', ch.venue3 === 300, ch);
  check('Main Stage filter sweep with hold = 300/300', ch.venue4 === 300, ch);
  check('Moving controls outside a set earns nothing', ch.idleMoves === 0, ch);
  const v1 = await page.evaluate(async () => { const G = ORBIT.game; G.select(0); await G.start(); await new Promise(r => setTimeout(r, 200)); const pts = G.challenge.points; G.stop(); return pts; });
  check('Bedroom DJ equipment points require real note hits', v1 === 0, v1);

  // ---------------------------------------------------------------- scheduling: pause/resume + restyle
  current = 'Audio scheduling';
  const sched = await page.evaluate(async () => {
    const G = ORBIT.game, M = ORBIT.music, E = ORBIT.engine, wait = ms => new Promise(r => setTimeout(r, ms));
    const log = []; M.onStep = (k, t) => log.push({ k, t, now: E.ctx.currentTime, origin: M.origin, unit: M.unit() });
    G.select(0); G.setDifficulty('easy'); await G.start(); await wait(3500);
    G.pause('user'); await wait(737); log.length = 0; await G.resume(); await wait(1500);
    const afterResume = log.slice();
    const grid = afterResume.filter(s => s.k % 2 === 0).map(s => Math.abs(s.t - (s.origin + s.k * s.unit)) * 1000);
    const originOk = Math.abs(M.origin - (G.startAt + G.leadIn)) < 1e-9;
    const notesBefore = G.notes.length, styleBefore = M.style;
    G.setStyle('dubstep'); await wait(100);
    const locked = M.style === styleBefore && G.notes.length === notesBefore;
    G.stop(); G.setStyle('auto');
    M.start({ style: 'boombap', bpm: 92, mode: 'jam' }); await wait(1200);
    log.length = 0; M.restyle('dubstep'); await wait(60); const burst = log.slice(); await wait(800);
    const restyled = log.slice(); M.stop();
    const past = restyled.filter(s => s.t < s.now - 0.006).length;
    let minGap = Infinity; for (let i = 1; i < restyled.length; i++) minGap = Math.min(minGap, restyled[i].t - restyled[i - 1].t);
    M.onStep = null;
    return { gridErrMaxMs: Math.max(0, ...grid), originOk, locked, burstSteps: burst.length, past, minGapMs: Math.round(minGap * 1000), unitMs: Math.round(60 / 92 / 4 * 1000) };
  });
  check('After pause/resume the music stays on the note grid (0 ms error)', sched.originOk && sched.gridErrMaxMs < 0.5, sched);
  check('Backing change during a set waits for the next set (notes stay matched to the music)', sched.locked, sched);
  check('Changing style while jamming causes no burst of late notes', sched.past === 0 && sched.burstSteps <= 3 && sched.minGapMs >= sched.unitMs * 0.5, sched);

  // ---------------------------------------------------------------- interruptions
  current = 'Interruptions';
  const intr = await page.evaluate(async () => {
    const G = ORBIT.game, E = ORBIT.engine, wait = ms => new Promise(r => setTimeout(r, ms));
    G.select(0); await G.start(); await wait(600);
    await E.ctx.suspend(); await wait(150);
    const a = { state: G.state, reason: G.pauseReason, overlay: !document.getElementById('ov-audio').hidden };
    return a;
  });
  check('System audio interruption pauses the set and asks for a tap', intr.state === 'paused' && intr.reason === 'audio' && intr.overlay, intr);
  await page.click('#audio-resume'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ ctx: ORBIT.engine.ctx.state, game: ORBIT.game.state }));
  check('Tap to resume restores audio and the set', after.ctx === 'running' && after.game === 'running', after);
  const bg = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 50));
    const s = { state: ORBIT.game.state, reason: ORBIT.game.pauseReason, music: ORBIT.music.playing };
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    ORBIT.game.stop();
    return s;
  });
  check('Leaving the app pauses the set and stops audio', bg.state === 'paused' && bg.reason === 'background' && !bg.music, bg);

  // ---------------------------------------------------------------- theme switch mid-set
  current = 'Themes';
  const th = await page.evaluate(async () => {
    const G = ORBIT.game, wait = ms => new Promise(r => setTimeout(r, ms));
    G.select(0); await G.start(); await wait(3200); G.tap(0);
    const before = { score: G.score, hits: G.hits, notes: G.notes.length };
    ORBIT.ui.setTheme('aero'); await wait(200);
    const mid = { state: G.state, music: ORBIT.music.playing, ctx: ORBIT.engine.ctx.state, cls: document.documentElement.className, score: G.score, hits: G.hits };
    ORBIT.ui.setTheme('grunge'); G.stop();
    return { before, mid, saved: localStorage.getItem('orbitArcadeTheme') };
  });
  check('Theme change mid-set keeps audio and score', th.mid.state === 'running' && th.mid.music && th.mid.ctx === 'running' && th.mid.score === th.before.score && /theme-aero/.test(th.mid.cls), th.mid);
  check('Theme saved under v1 key', th.saved === 'grunge', th.saved);

  // ---------------------------------------------------------------- gain staging (live master output)
  current = 'Gain staging';
  const gain = await page.evaluate(async () => {
    const E = ORBIT.engine, G = ORBIT.game, BP = ORBIT.beatpad, c = E.ctx, wait = ms => new Promise(r => setTimeout(r, ms));
    await BP.loadKit();
    const tap = c.createAnalyser(); tap.fftSize = 2048; E.nodes.ceiling.connect(tap);
    const mtap = c.createAnalyser(); mtap.fftSize = 2048; E.nodes.music.connect(mtap);
    const buf = new Float32Array(2048), mbuf = new Float32Array(2048);
    const out = {};
    for (const st of [0, 2, 3]) {
      G.select(st); await G.start(); await wait(3000);
      let peak = 0, msum = 0, mn = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 2500) {
        for (let i = 0; i < 4; i++) G.tap(i); BP.padDown(0, undefined, 1); BP.padDown(12, undefined, 1);
        await wait(45);
        tap.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v));
        mtap.getFloatTimeDomainData(mbuf); for (const v of mbuf) { msum += v * v; mn++; }
      }
      G.stop();
      out['venue' + (st + 1)] = { masterPeakDb: +(20 * Math.log10(peak)).toFixed(1), musicRmsDb: +(10 * Math.log10(msum / mn)).toFixed(1) };
    }
    E.nodes.ceiling.disconnect(tap); E.nodes.music.disconnect(mtap);
    return out;
  });
  const worst = Math.max(...Object.values(gain).map(g => g.masterPeakDb));
  check('Master never clips with music + 4 pads + sampler spam (peak < 0 dBFS)', worst < 0, gain);
  // v3: songs have quiet intros and loud drops, so compare whole songs rendered offline rather than the first seconds live
  const rms = await page.evaluate(async () => {
    const M = ORBIT.music, G = ORBIT.game, out = [];
    for (const v of G.VENUES) {
      await ORBIT.assets.ensure(M.assetsFor(v.style)); const bars = G.barsFor(v.bpm), b = await M.renderOffline(v.style, v.bpm, bars * 240 / v.bpm + 0.45, { guide: 1, form: bars, preLimiter: true });
      let s = 0, n = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; n++; } }
      out.push(+(10 * Math.log10(s / n)).toFixed(1));
    }
    return out;
  });
  check('Whole-song loudness consistent across the four venues (within 3 dB)', Math.max(...rms) - Math.min(...rms) <= 3, rms);

  // ---------------------------------------------------------------- beat pad
  current = 'Beat pad';
  await page.click('[data-view="pads"]');
  const bp = await page.evaluate(async () => {
    const BP = ORBIT.beatpad, M = ORBIT.music, E = ORBIT.engine, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
    const hits = []; const off = ORBIT.on('bp-hit', h => hits.push(h));
    BP.setKit('dusty'); await BP.loadKit();
    let bufStarts = 0; const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () { if (this.buffer && this.buffer.duration > 0.05) bufStarts++; return orig.apply(this, arguments); };
    await BP.padDown(0, undefined, 1); await BP.padDown(1, undefined, 1); await wait(50);
    out.samples = bufStarts; AudioBufferSourceNode.prototype.start = orig;
    // sequencer timing with swing
    BP.selectSlot('B'); BP.clear(); BP.setBpm(100); BP.setSwing(66);
    BP.sel = 0; BP.toggleStep(0); BP.sel = 2; [0, 1, 2, 3].forEach(s => BP.toggleStep(s * 2)); BP.toggleStep(5);
    hits.length = 0; await BP.play(false); await wait(2600); BP.stop();
    const unit = 60 / 100 / 4, sw = (0.66 - 0.5) * 2 * unit, o = BP.origin;
    const err = hits.filter(h => h.pad === 2 || h.pad === 0).map(h => { const pos = (h.at - o) / unit, step = Math.round(pos - (Math.round(pos) % 2 ? sw / unit : 0)); return Math.abs(h.at - (o + step * unit + (step % 2 ? sw : 0))) * 1000; });
    out.seqHits = err.length; out.seqMaxErrMs = +Math.max(...err).toFixed(3);
    const kicks = hits.filter(h => h.pad === 0).map(h => h.at); out.kickBarMs = kicks.length > 1 ? +((kicks[1] - kicks[0]) * 1000).toFixed(2) : 0;
    const swung = hits.find(h => h.pad === 2 && Math.abs(((h.at - o) / unit) % 16 - 5) < 0.6);
    out.swingMs = swung ? +(((swung.at - o) - 5 * unit) * 1000).toFixed(2) : null; out.swingExpectMs = +(sw * 1000).toFixed(2);
    // mute
    BP.mutes.add(2); hits.length = 0; await BP.play(false); await wait(800); BP.stop(); BP.mutes.delete(2);
    out.mutedPlayed = hits.filter(h => h.pad === 2).length;
    // live overdub, quantized, no double trigger
    BP.setSwing(50); BP.clear(); hits.length = 0;
    await BP.play(false); await BP.toggleRec();
    for (const step of [4, 12]) {
      const target = BP.origin + 16 * unit + step * unit - 0.012; // 12 ms early, second bar
      await new Promise(r => { (function w() { if (E.heard() >= target) r(); else requestAnimationFrame(w); })(); });
      await BP.padDown(1, undefined, 0.9);
    }
    await wait(unit * 1000 * 8);
    const recSteps = BP.pattern().events.filter(e => e.pad === 1).map(e => e.step).sort((a, b) => a - b);
    const bar2 = hits.filter(h => h.pad === 1 && h.at >= BP.origin + 16 * unit - 0.05 && h.at < BP.origin + 32 * unit - 0.05).length;
    await wait(unit * 1000 * 16);
    const bar3 = hits.filter(h => h.pad === 1 && h.at >= BP.origin + 32 * unit - 0.05 && h.at < BP.origin + 48 * unit - 0.05).length;
    BP.stop();
    out.recSteps = recSteps; out.liveBar2 = bar2; out.playedBar3 = bar3;
    // undo restores the empty pattern
    BP.undo(); out.afterUndo = BP.pattern().events.length;
    // note repeat 1/16 for one beat while stopped
    BP.setNoteRepeat(16); hits.length = 0;
    await BP.padDown(3, undefined, 1, 77); await wait(60 / 100 * 1000); BP.padUp(77); BP.setNoteRepeat(0);
    const nr = hits.filter(h => h.pad === 3).map(h => h.at); out.noteRepeat = nr.length;
    out.nrGapMs = nr.length > 2 ? +((nr[2] - nr[1]) * 1000).toFixed(1) : 0;
    // pattern switch is queued to the bar line
    BP.selectSlot('A'); hits.length = 0; await BP.play(false); await wait(200);
    BP.selectSlot('B'); const queued = BP.queued === 'B' && BP.cur === 'A';
    await wait(unit * 16 * 1000 + 300); out.queuedSwitch = queued && BP.cur === 'B'; BP.stop(); BP.selectSlot('A');
    // backing sync
    BP.backing = true; await BP.play(false); await wait(300);
    out.backing = { playing: M.playing, mode: M.mode, sameOrigin: Math.abs(M.origin - BP.origin) < 1e-9, sameBpm: M.bpm === BP.bpm };
    BP.stop(); out.backingStopped = !M.playing; BP.backing = false;
    // bounce
    const buf = await BP.renderBuffer(4, false);
    let pk = 0; for (let ch = 0; ch < buf.numberOfChannels; ch++) for (const v of buf.getChannelData(ch)) pk = Math.max(pk, Math.abs(v));
    const wav = BP.encodeWav(buf);
    out.bounce = { seconds: +buf.duration.toFixed(2), expect: +(64 * 60 / BP.bpm / 4 + 1.6).toFixed(2), peak: +pk.toFixed(3), wavBytes: wav.size, expectBytes: 44 + buf.length * buf.numberOfChannels * 2 };
    off();
    return out;
  });
  check('Pads play the kit’s WAV samples (not synth fallback)', bp.samples === 2, bp.samples);
  check('Sequencer steps land on the grid with swing (max error under 0.5 ms)', bp.seqHits >= 8 && bp.seqMaxErrMs < 0.5, { hits: bp.seqHits, maxErrMs: bp.seqMaxErrMs });
  check('One bar at 100 BPM = 2400 ms between kicks', Math.abs(bp.kickBarMs - 2400) < 0.5, bp.kickBarMs);
  check('Swing 66% delays the off-16th by the right amount', bp.swingMs !== null && Math.abs(bp.swingMs - bp.swingExpectMs) < 0.5, { got: bp.swingMs, expect: bp.swingExpectMs });
  check('Muted pad is silent in the sequence', bp.mutedPlayed === 0, bp.mutedPlayed);
  check('Live recording snaps early hits to steps 4 and 12', JSON.stringify(bp.recSteps) === '[4,12]', bp.recSteps);
  check('Recorded hits are not double-triggered, then loop next bar', bp.liveBar2 === 2 && bp.playedBar3 === 2, { bar2: bp.liveBar2, bar3: bp.playedBar3 });
  check('Undo restores the pattern', bp.afterUndo === 0, bp.afterUndo);
  check('Note repeat 1/16 retriggers every 150 ms at 100 BPM', bp.noteRepeat >= 3 && Math.abs(bp.nrGapMs - 150) < 1, { hits: bp.noteRepeat, gapMs: bp.nrGapMs });
  check('Pattern change waits for the next bar', bp.queuedSwitch, bp.queuedSwitch);
  check('Backing track locks to the beat pad clock and stops with it', bp.backing.playing && bp.backing.mode === 'jam' && bp.backing.sameOrigin && bp.backing.sameBpm && bp.backingStopped, bp.backing);
  check('Bounce renders 4 bars to a valid 16-bit WAV', Math.abs(bp.bounce.seconds - bp.bounce.expect) < 0.05 && bp.bounce.peak > 0.05 && bp.bounce.peak <= 1 && bp.bounce.wavBytes === bp.bounce.expectBytes, bp.bounce);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.evaluate(() => ORBIT.beatpad.exportPattern())]);
  let exported = null; if (download) { const fs = require('fs'); exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8')); }
  check('Export writes pattern JSON (v2, readable by import)', exported && exported.format === 'orbit-sampler-pattern' && exported.version === 2 && Array.isArray(exported.events), exported && { bank: exported.bank, bars: exported.bars, events: exported.events.length });
  await page.click('[data-bptab="file"]');
  await page.setInputFiles('#bp-import', { name: 'v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'orbit-sampler-pattern', version: 1, bank: 'dark', bpm: 100, events: [{ pad: 1, step: 2 }, { pad: 15, step: 14.5 }] })) });
  await page.waitForTimeout(400);
  const imp = await page.evaluate(() => ({ n: ORBIT.beatpad.pattern().events.length, kit: ORBIT.beatpad.kit, status: ORBIT.beatpad.status }));
  check('Imports a v1 sampler pattern and switches to its bank', imp.n === 2 && imp.kit === 'dark', imp);
  await page.setInputFiles('#bp-import', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'orbit-sampler-pattern', bank: 'dark', events: [{ pad: 99, step: 0 }] })) });
  await page.waitForTimeout(200);
  const bad = await page.evaluate(() => ({ n: ORBIT.beatpad.pattern().events.length, status: ORBIT.beatpad.status }));
  check('Rejects an invalid pattern and keeps the current one', bad.n === 2 && /Invalid/.test(bad.status), bad);
  const kitsOk = await page.evaluate(async () => { const BP = ORBIT.beatpad, r = {}; for (const k of Object.keys(BP.KITS)) { BP.setKit(k); await BP.loadKit(); r[k] = ORBIT.assets.ready(ORBIT.assets.kitPaths(k)); } BP.setKit('dusty'); return r; });
  check('All 6 kits load (3 drum kits + 3 v1 chop banks)', Object.values(kitsOk).every(Boolean), kitsOk);

  // ---------------------------------------------------------------- calibration
  current = 'Timing calibration';
  await page.click('[data-view="settings"]');
  await page.click('#set-calib');
  await page.click('#calib-go');
  const cal = await page.evaluate(async () => { const O_eventTime = ORBIT.eventTime;
    const E = ORBIT.engine, pad = document.getElementById('calib-pad');
    // tap 100 ms after each click is heard (simulates Bluetooth headphones); record how late each tap really was
    const clicks = ORBIT.ui.calibClicks(), t0 = clicks[0]; // the app's own click times
    const actual = [];
    for (let i = 0; i < 12; i++) {
      const target = t0 + i * 0.6 + 0.1 + E.latency();
      await new Promise(r => { (function w() { if (E.now() >= target) r(); else requestAnimationFrame(w); })(); });
      const ev = new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 });
      if (i >= 2) actual.push(E.now(O_eventTime(ev)) - E.latency() - (t0 + i * 0.6));
      pad.dispatchEvent(ev);
    }
    await new Promise(r => setTimeout(r, 1400));
    actual.sort((a, b) => a - b);
    return { offset: E.offsetMs, sentMs: Math.round(actual[Math.floor(actual.length / 2)] * 1000), msg: document.getElementById('calib-msg').textContent };
  });
  check('Tap test measures the delay of the taps it receives (within 3 ms) and sets the offset', Math.abs(cal.offset - cal.sentMs) <= 3 && cal.offset >= 90 && cal.offset <= 160, cal);
  await page.evaluate(() => { ORBIT.engine.setOffset(0); ORBIT.ui.closeOverlay('ov-calib'); });

  // ---------------------------------------------------------------- briefing + demo
  current = 'Equipment briefing';
  await page.click('[data-view="career"]');
  await page.evaluate(() => localStorage.removeItem('orbitV2Briefed'));
  await page.click('.venue-card[data-v="2"] .btn-start');
  await page.waitForTimeout(200);
  const br = await page.evaluate(() => ({ open: !document.getElementById('ov-brief').hidden, name: document.getElementById('brief-name').textContent, mistakes: document.querySelectorAll('#brief-mistakes li').length }));
  check('First visit to Underground Club opens the LOW EQ briefing', br.open && /LOW EQ/.test(br.name) && br.mistakes >= 3, br);
  await page.click('#brief-demo'); await page.waitForTimeout(300);
  const demo = await page.evaluate(() => ({ playing: ORBIT.music.playing, mode: ORBIT.music.mode }));
  check('“Hear it” plays a before/after demo', demo.playing && demo.mode === 'demo', demo);
  await page.click('#ov-brief [data-close]'); await page.waitForTimeout(100);
  const restored = await page.evaluate(() => ({ playing: ORBIT.music.playing, eqDb: ORBIT.engine.nodes.lowShelf.gain.value }));
  check('Closing the briefing stops the demo and restores the EQ', !restored.playing && Math.abs(restored.eqDb) < 0.5, restored);
  check('No console errors in the main session', page._errors.length === 0, page._errors.slice(0, 5));
  await ctx.close();

  // ---------------------------------------------------------------- v1 progress carries over
  current = 'Saved progress';
  ({ ctx, page } = await newPage(browser, { seed: { orbitArcadeProgress: JSON.stringify({ 0: { score: 4200, stars: 2 }, 1: { score: 900, stars: 1 } }), orbitArcadeTheme: 'aero' } }));
  await page.click('[data-view="career"]');
  const carry = await page.evaluate(() => ({ stars: document.getElementById('tot-stars').textContent, best: document.getElementById('tot-best').textContent, cls: document.documentElement.className }));
  check('v1 stars and best score appear in Career', carry.stars === '3/12' && /4,?200/.test(carry.best), carry);
  check('v1 theme choice restored before first paint', /theme-aero/.test(carry.cls), carry.cls);
  await ctx.close();

  // ---------------------------------------------------------------- layout: no scroll during play, overlays fit
  current = 'Mobile layout';
  for (const vp of [{ n: 'iPhone 14 landscape', w: 844, h: 390 }, { n: 'iPhone SE landscape', w: 667, h: 325 }, { n: 'iPhone 14 portrait (Safari bars)', w: 390, h: 664 }, { n: 'iPad landscape', w: 1180, h: 820 }]) {
    ({ ctx, page } = await newPage(browser, { viewport: { width: vp.w, height: vp.h }, touch: true }));
    await page.evaluate(() => { ORBIT.game.select(3); });
    await page.click('#btn-start'); await page.waitForTimeout(300);
    const lay = await page.evaluate(() => {
      const vis = s => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; };
      const pads = [...document.querySelectorAll('.lane-pad')].map(p => p.getBoundingClientRect());
      return { scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
        allVisible: ['#btn-start', '#btn-stop', '#highway', '#lane-pads', '#xf', '#low-eq', '#filter', '#btn-cue'].every(vis),
        minPad: Math.round(Math.min(...pads.map(r => Math.min(r.width, r.height)))), highwayH: Math.round(document.getElementById('highway').getBoundingClientRect().height) };
    });
    check(vp.n + ': no scrolling, every Main Stage control visible', !lay.scroll && lay.allVisible, lay);
    check(vp.n + ': pads at least 44 pt', lay.minPad >= 44, lay.minPad);
    await page.evaluate(() => { ORBIT.game.stop(); ORBIT.ui.showView('pads'); });
    await page.waitForTimeout(150);
    const bpl = await page.evaluate(() => { const r = [...document.querySelectorAll('.mpc-pad')].map(p => p.getBoundingClientRect()); return { scroll: document.documentElement.scrollHeight > innerHeight + 1, minPad: Math.round(Math.min(...r.map(x => Math.min(x.width, x.height)))), allOn: r.every(x => x.top >= -1 && x.bottom <= innerHeight + 1), play: (b => b.top >= 0 && b.bottom <= innerHeight + 1)(document.getElementById('bp-play').getBoundingClientRect()) }; });
    check(vp.n + ': beat pad shows all 16 pads + PLAY without page scroll, pads ≥ 44 pt', !bpl.scroll && bpl.allOn && bpl.play && bpl.minPad >= 44, bpl);
    await page.evaluate(() => { ORBIT.ui.showView('play'); ORBIT.ui.openOverlay('ov-results'); });
    const fit = await page.evaluate(() => { const r = document.querySelector('#ov-results .sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
    check(vp.n + ': results sheet fits on screen', fit);
    check(vp.n + ': no console errors', page._errors.length === 0, page._errors.slice(0, 3));
    await ctx.close();
  }

  // ---------------------------------------------------------------- v2.2 band-game mechanics
  current = 'Band mechanics';
  ({ ctx, page } = await newPage(browser, { fail: true }));
  await page.click('#btn-start'); await page.waitForTimeout(200); await page.evaluate(() => ORBIT.game.stop());
  const chart = await page.evaluate(() => {
    const G = ORBIT.game, M = ORBIT.music, out = {};
    for (const [st, diff] of [[0, 'easy'], [2, 'normal'], [3, 'expert']]) {
      const v = G.VENUES[st], bars = G.barsFor(v.bpm), lead = 3, n = M.chartSet(v.style, v.bpm, lead, bars, diff, st);
      const holds = n.filter(x => x.dur), secs = bars * 240 / v.bpm;
      const clash = holds.filter(h => n.some(x => x !== h && x.t > h.t - 0.02 && x.t < h.t + h.dur - 0.02 && (diff === 'easy' || x.lane === 3))).length;
      const phrases = new Set(n.filter(x => x.hype !== undefined).map(x => x.hype)).size, last = n[n.length - 1];
      out[st + diff] = { notes: n.length, secs: +secs.toFixed(1), holds: holds.length, clash, phrases, finale: !!last.finale && Math.abs(last.t - (lead + secs)) < 1e-6, sorted: n.every((x, i) => !i || x.t >= n[i - 1].t) };
    }
    return out;
  });
  const charts = Object.values(chart);
  check('Sets run about a minute (50–70 s of music) at every venue tempo', charts.every(c => c.secs >= 50 && c.secs <= 70), Object.fromEntries(Object.entries(chart).map(([k, v]) => [k, v.secs])));
  check('Every chart has hold notes, HYPE phrases and ends on a finale hit', charts.every(c => c.holds >= 2 && c.phrases >= 4 && c.finale && c.sorted), chart);
  check('Hold notes never overlap another note in their own lane (and nothing at all on Rookie)', charts.every(c => c.clash === 0), Object.fromEntries(Object.entries(chart).map(([k, v]) => [k, v.clash])));

  const hold = await page.evaluate(async () => {
    const G = ORBIT.game, waitFor = f => new Promise(r => { (function w() { if (f()) r(); else requestAnimationFrame(w); })(); }), out = {};
    G.select(0); G.setDifficulty('easy'); await G.start();
    const hs = G.notes.filter(n => n.dur), [h1, h2] = hs;
    const auto = setInterval(() => { const now = G.songTime(); for (const n of G.notes) { if (n.t > now + 0.01) break; if (!n.done && n.t > now - 0.1 && n !== h2) G.tap(n.lane); } }, 8);
    await waitFor(() => G.holding[3] && G.holding[3].n === h1);
    const s0 = G.score; out.holdingAfterTap = true;
    await waitFor(() => G.songTime() > h1.t + h1.dur + 0.05);
    out.completed = !!h1.holdDone && G.holdsDone === 1; out.bonus = G.score - s0;
    await waitFor(() => G.songTime() >= h2.t - 0.004); G.tap(3);
    await waitFor(() => G.songTime() > h2.t + h2.dur * 0.4);
    const combo = G.combo; G.release(3);
    out.dropped = !!h2.dropped && !h2.holdDone && !G.holding[3]; out.comboKept = G.combo === combo && combo > 0; out.holdsDone = G.holdsDone;
    clearInterval(auto); G.stop();
    return out;
  });
  check('Holding a note to the end of its tail completes it and pays a hold bonus', hold.completed && hold.bonus >= 150, hold);
  check('Letting go early drops the hold without breaking the streak', hold.dropped && hold.comboKept && hold.holdsDone === 1, hold);

  const hype = await page.evaluate(async () => {
    const G = ORBIT.game, waitFor = f => new Promise(r => { (function w() { if (f()) r(); else requestAnimationFrame(w); })(); }), out = {};
    G.select(0); G.setDifficulty('easy'); await G.start();
    out.notReadyAtStart = !G.hypeReady() && G.activateHype() === false;
    const auto = setInterval(() => { const now = G.songTime(); for (const n of G.notes) { if (n.t > now + 0.01) break; if (!n.done && n.t > now - 0.1) G.tap(n.lane); } }, 8);
    await waitFor(() => G.hype >= 0.25); out.afterOnePhrase = G.hype; out.readyAfterOne = G.hypeReady();
    await waitFor(() => G.hypeReady()); out.meter = G.hype;
    clearInterval(auto);
    const next = G.notes.find(n => !n.done && !n.dur);
    await waitFor(() => G.songTime() >= next.t - 0.004);
    out.fired = G.activateHype(); const before = G.score; G.tap(next.lane);
    out.gain = G.score - before; out.expected = 150 * G.multiplier() * 2; // v1 rule: the multiplier counts the hit itself
    out.active = G.hypeActive; out.active = G.hypeActive;
    await waitFor(() => !G.hypeActive || G.state !== 'running');
    out.ended = !G.hypeActive && G.hype === 0 && G.hypeUses === 1;
    G.stop();
    return out;
  });
  check('HYPE charges 25% per glowing phrase and unlocks at 50%', hype.notReadyAtStart && Math.abs(hype.afterOnePhrase - 0.25) < 1e-9 && !hype.readyAfterOne && hype.meter >= 0.5, hype);
  check('Firing HYPE doubles points, then drains and switches off', hype.fired && hype.active && hype.gain === hype.expected && hype.ended, hype);

  const crowd = await page.evaluate(async () => {
    const G = ORBIT.game, S = ORBIT.synth, waitFor = (f, ms) => new Promise(r => { const t0 = performance.now(); (function w() { if (f() || performance.now() - t0 > ms) r(); else requestAnimationFrame(w); })(); }), out = {};
    localStorage.removeItem('orbitArcadeProgress'); G.progress = {};
    const orig = S.oneShot; let scratches = 0; S.oneShot = function (c, d, path) { if (/miss\.wav/.test(path)) scratches++; return orig.apply(this, arguments); };
    G.select(0); G.setDifficulty('normal'); await G.start();
    await waitFor(() => G.state === 'finished', 30000);
    out.club = { failed: !!(G.lastResult && G.lastResult.failed), grade: G.lastResult && G.lastResult.grade, stars: G.lastResult && G.lastResult.stars, saved: !!G.progress[0], pct: G.lastResult && G.lastResult.progressPct, scratches };
    await new Promise(r => setTimeout(r, 700));
    out.club.title = document.getElementById('res-title').textContent; out.club.next = document.querySelector('#res-next span').textContent;
    ORBIT.ui.closeOverlay('ov-results');
    G.setDifficulty('easy'); await G.start();
    await waitFor(() => G.misses >= 30, 60000);
    out.rookie = { state: G.state, crowd: G.crowd, misses: G.misses };
    G.stop(); S.oneShot = orig;
    return out;
  });
  check('Club: missing everything empties the crowd meter and fails the set early, nothing saved', crowd.club.failed && crowd.club.grade === 'FAILED' && crowd.club.stars === 0 && !crowd.club.saved && crowd.club.pct < 0.5, crowd.club);
  check('Failed-set results explain what happened and offer TRY AGAIN', /CROWD WALKED OUT/.test(crowd.club.title) && crowd.club.next === 'TRY AGAIN', crowd.club);
  check('Misses play the scratch sound (rate-limited)', crowd.club.scratches >= 3 && crowd.club.scratches <= 12, crowd.club.scratches);
  check('Rookie never fails: 30 misses in, the set is still running', crowd.rookie.state === 'running' && crowd.rookie.crowd > 0, crowd.rookie);
  check('Band mechanics: no console errors', page._errors.length === 0, page._errors.slice(0, 3));
  await ctx.close();

  // ---------------------------------------------------------------- first-run tutorial
  current = 'Tutorial';
  ({ ctx, page } = await newPage(browser, { seed: { __tutorial: '1' }, touch: true, viewport: { width: 844, height: 390 } }));
  check('First open: tutorial welcome is on screen immediately', await page.evaluate(() => !document.getElementById('ov-intro').hidden && /START TUTORIAL/.test(document.getElementById('intro-play').textContent)));
  await page.tap('#intro-play'); await page.waitForTimeout(2500);
  const ts = await page.evaluate(() => ({ picker: !document.getElementById('ov-tutsong').hidden, rows: document.querySelectorAll('#tutsong-list .track-row').length, drill: !!ORBIT.game.drill, music: ORBIT.music.playing, goOff: document.getElementById('tutsong-go').disabled }));
  check('START TUTORIAL opens the song list and waits: 7 songs, nothing playing, no drill, continue disabled', ts.picker && ts.rows === 7 && !ts.drill && !ts.music && ts.goOff, ts);
  await page.locator('#tutsong-list .track-row').nth(0).tap();
  await page.waitForFunction(() => ORBIT.music.playing, null, { timeout: 12000 });
  const tp = await page.evaluate(() => ({ mode: ORBIT.music.mode, style: ORBIT.music.style, bpm: ORBIT.music.bpm, goOff: document.getElementById('tutsong-go').disabled, drill: !!ORBIT.game.drill, on: document.querySelectorAll('#tutsong-list .track-row.is-on').length }));
  check('Tapping a song previews it and enables USE THIS SONG; still no drill', tp.mode === 'jam' && tp.style === 'boombap' && !tp.goOff && !tp.drill && tp.on === 1, tp);
  await page.tap('#tutsong-go'); await page.waitForTimeout(300);
  const tm = await page.evaluate(() => ({ map: !document.getElementById('ov-map').hidden, music: ORBIT.music.playing, parts: document.querySelectorAll('#map-svg .map-part').length, name: document.getElementById('map-name').textContent, filled: ['map-where', 'map-what', 'map-why', 'map-orbit'].every(i => document.getElementById(i).textContent.length > 20), song: ORBIT.game.tutSong && ORBIT.game.tutSong.style }));
  check('Choosing the song stops the preview and opens the controller map (9 controls, each with where / what / why / in ORBIT)', tm.map && !tm.music && tm.parts === 9 && /4 \/ 9 · PERFORMANCE PADS/.test(tm.name) && tm.filled && tm.song === 'boombap', tm);
  await page.evaluate(() => document.querySelector('#map-svg [data-part="8"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  check('Tapping a control on the diagram shows it', /9 \/ 9 · CROSSFADER/.test(await page.textContent('#map-name')) && await page.evaluate(() => document.querySelectorAll('#map-svg .map-part.is-on').length === 1));
  await page.tap('#map-go'); await page.waitForTimeout(3000);
  const tc = await page.evaluate(() => ({ card: !document.getElementById('ov-tutstep').hidden, title: document.getElementById('tutstep-title').textContent, real: document.getElementById('tutstep-real').textContent.length > 30, why: document.getElementById('tutstep-why').textContent.length > 30, drill: !!ORBIT.game.drill, state: ORBIT.game.state, music: ORBIT.music.playing }));
  check('Each drill opens on a card (real controller, why, your turn) and waits: 3 s later nothing has started', tc.card && /KICK/.test(tc.title) && tc.real && tc.why && !tc.drill && tc.state === 'idle' && !tc.music, tc);
  await page.tap('#tutstep-go');
  await page.waitForFunction(() => ORBIT.game.drill && ORBIT.game.state === 'running', null, { timeout: 8000 });
  const t1 = await page.evaluate(() => ({ drill: ORBIT.game.drill.id, coach: !document.getElementById('coach').hidden, step: document.getElementById('coach-step').textContent, click: ORBIT.music.click, mode: ORBIT.music.mode, style: ORBIT.music.style, lanes: [...new Set(ORBIT.game.notes.map(n => n.lane))], teach: [...document.querySelectorAll('.lane-pad')].map(b => b.classList.contains('is-teach')).join(), scroll: document.documentElement.scrollHeight > innerHeight + 1 }));
  check('TRY IT starts drill 1 (kick only) over the chosen song with a click, KICK pad highlighted, coach visible, no page scroll', t1.drill === 'kick' && t1.coach && /1 \/ 5/.test(t1.step) && t1.click && t1.mode === 'bare' && t1.style === 'boombap' && t1.lanes.join() === '0' && t1.teach === 'true,false,false,false' && !t1.scroll, t1);
  // let the first drill run out untouched: it must loop, not fail
  await page.waitForFunction(() => ORBIT.game.drill && ORBIT.game.drill.tries >= 1, null, { timeout: 30000 });
  check('An unfinished drill repeats instead of failing', await page.evaluate(() => ORBIT.game.state === 'running' && ORBIT.game.drill.id === 'kick' && document.getElementById('ov-results').hidden));
  await page.evaluate(() => { window.__seen = []; window.__waited = []; ORBIT.on('drill', d => { if (d.status === 'start') window.__seen.push(d.id); }); window.__auto = setInterval(() => { const G = ORBIT.game; if (G.state !== 'running') return; const now = G.songTime(); for (const n of G.notes) { if (n.t > now + 0.01) break; if (!n.done && n.t > now - 0.1) G.tap(n.lane); } }, 8); });
  for (let i = 1; i < 5; i++) { // after each drill the next card must be up with nothing running until TRY IT
    await page.waitForFunction(i => !document.getElementById('ov-tutstep').hidden && ORBIT.ui.tutorial.i === i, i, { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__waited.push(!ORBIT.game.drill && !ORBIT.music.playing && document.getElementById('coach').hidden));
    await page.tap('#tutstep-go');
  }
  await page.waitForFunction(() => ORBIT.ui.tutorial.i === 4 && ORBIT.game.hypeReady(), null, { timeout: 90000 });
  check('HYPE drill: button turns ready and the coach says to tap it', await page.evaluate(() => document.getElementById('btn-hype').classList.contains('is-ready') && /HYPE button/.test(document.getElementById('coach-text').textContent)));
  await page.dispatchEvent('#btn-hype', 'pointerdown');
  await page.waitForSelector('#ov-tutdone:not([hidden])', { timeout: 15000 });
  const t2 = await page.evaluate(() => ({ seen: window.__seen, waited: window.__waited, saved: localStorage.getItem('orbitV22Tutorial'), coach: document.getElementById('coach').hidden, state: ORBIT.game.state, progress: localStorage.getItem('orbitArcadeProgress'), label: document.getElementById('tut-play-label').textContent, fits: (r => r.top >= 0 && r.bottom <= innerHeight + 1)(document.querySelector('#ov-tutdone .sheet').getBoundingClientRect()) }));
  check('Drills run in order (snare, full beat, hold, HYPE), each one waiting on its card, then the finish card', t2.seen.join() === 'snare,beat,hold,hype' && t2.waited.join() === 'true,true,true,true' && t2.coach && t2.state === 'idle' && t2.fits, t2);
  check('Tutorial completion is remembered and writes no career progress', t2.saved === 'true' && !t2.progress, t2);
  await page.tap('#tut-play');
  await page.waitForFunction(() => ORBIT.game.state === 'running', null, { timeout: 8000 });
  check('The finish button plays the chosen song on Rookie as a real set', await page.evaluate(() => /PLAY THE FIRST GROOVE/.test(document.getElementById('tut-play-label').textContent) && ORBIT.game.custom && ORBIT.game.custom.style === 'boombap' && ORBIT.game.difficulty === 'easy' && !ORBIT.game.drill && ORBIT.music.mode === 'set' && ORBIT.game.notes.length > 40));
  await page.evaluate(() => { clearInterval(window.__auto); ORBIT.game.stop(); });
  await page.reload(); await page.waitForTimeout(400);
  check('Second open: no tutorial prompt', await page.evaluate(() => document.getElementById('ov-intro').hidden));
  await page.evaluate(() => { ORBIT.ui.showView('settings'); document.getElementById('set-intro').click(); });
  check('Setup → Replay tutorial reopens it', await page.evaluate(() => !document.getElementById('ov-intro').hidden));
  await page.tap('#intro-play'); await page.waitForTimeout(300);
  await page.locator('#tutsong-list .track-row').nth(6).tap(); await page.tap('#tutsong-go'); await page.tap('#map-go'); await page.tap('#tutstep-go');
  await page.waitForFunction(() => ORBIT.game.drill && ORBIT.game.state === 'running', null, { timeout: 12000 });
  check('A 140 BPM song runs its drills half-time (8 bars, kicks four beats apart)', await page.evaluate(() => { const G = ORBIT.game, gap = G.notes[1].t - G.notes[0].t; return G.bpm() === 140 && G.bars === 8 && Math.abs(gap - 4 * 60 / 140) < 0.01; }));
  await page.tap('#coach-skip');
  check('SKIP ends the tutorial cleanly (music stopped, coach gone)', await page.evaluate(() => !ORBIT.ui.tutorial.on && !ORBIT.game.drill && ORBIT.game.state === 'idle' && !ORBIT.music.playing && document.getElementById('coach').hidden));
  await page.evaluate(() => { ORBIT.ui.showView('settings'); document.getElementById('set-map').click(); });
  check('Setup → Controller map opens the map on its own, with a close button and no tutorial buttons', await page.evaluate(() => !document.getElementById('ov-map').hidden && !document.getElementById('map-x').hidden && document.getElementById('map-back').hidden && document.getElementById('map-skip').hidden));
  await page.evaluate(() => document.getElementById('map-go').click());
  check('Tutorial: no console errors', page._errors.length === 0, page._errors.slice(0, 3));
  await ctx.close();

  // ---------------------------------------------------------------- offline / service worker
  current = 'PWA';
  const swCtx = await browser.newContext();
  const swPage = await swCtx.newPage();
  const lh = BASE.replace('127.0.0.1', 'localhost');
  await swPage.goto(lh + '/index.html');
  const swOk = await swPage.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
  check('Service worker installs', swOk);
  await swPage.reload(); await swPage.waitForTimeout(500);
  await swCtx.setOffline(true);
  await swPage.reload().catch(() => {});
  await swPage.waitForTimeout(500);
  const offline = await swPage.evaluate(() => !!(window.ORBIT && ORBIT.game && document.getElementById('btn-start'))).catch(() => false);
  check('App reloads offline from the versioned cache', offline);
  await swCtx.close();

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log('\nSUMMARY ' + pass + ' / ' + results.length + ' passed');
  require('fs').writeFileSync(process.env.QA_OUT || 'qa-results.json', JSON.stringify(results, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
