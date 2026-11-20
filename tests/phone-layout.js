/* ORBIT DJ phone layout check at the page sizes of a real iPhone inside Safari (measured from the owner's
   screenshots: about 737x287 sideways, 395x702 upright). Flags overlapping, off-screen and tiny controls.
   Run: node tests/phone-layout.js http://127.0.0.1:8710 [screenshot-dir]   Headless Chrome only; not an iPhone test. */
const { chromium } = require(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, '');
const OUT = process.argv[3] ? process.argv[3].replace(/\/?$/, '/') : null; if (OUT) require('fs').mkdirSync(OUT, { recursive: true });
let failed = 0;
function report(name, what, a) { const scrollOk = a.pageScroll <= 1 && (what === 'songs' && name === 'port' || a.viewScroll <= 12), ok = !a.bad.some(x => !x.startsWith('tiny') && !/highway.*btn-hype/.test(x)) && scrollOk; /* HYPE sits on the highway by design; tiny controls are listed, not failed */ if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + what + '  ' + JSON.stringify(a)); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [name, vp] of [['land', { width: 737, height: 287 }], ['port', { width: 395, height: 702 }]]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('orbitV22Tutorial', 'true'); localStorage.setItem('orbitV4UnlockAll', 'true'); localStorage.setItem('orbitV4RotateTip', 'true'); localStorage.setItem('orbitV42MixLevel', '"pro"'); } catch (e) {} });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/index.html'); await page.waitForTimeout(400);
    const audit = (sel) => page.evaluate((sel) => {
      const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent && !e.closest('[hidden]')), R = els.map(e => e.getBoundingClientRect()), bad = [];
      const nm = e => (e.id || e.className.toString().split(' ').slice(0, 2).join('.') || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 8);
      els.forEach((e, i) => { const r = R[i]; if (r.right > innerWidth + 1 || r.left < -1) bad.push('offscreen-x ' + nm(e)); if (r.width < 22 || r.height < 20) bad.push('tiny ' + nm(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        for (let j = i + 1; j < els.length; j++) { const q = R[j]; if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (ox > 3 && oy > 3) bad.push('overlap ' + nm(e) + ' / ' + nm(els[j])); } });
      const v = document.querySelector('.view.is-active');
      return { n: els.length, bad: bad.slice(0, 12), pageScroll: document.documentElement.scrollHeight - innerHeight, viewScroll: v.scrollHeight - v.clientHeight, minH: Math.round(Math.min(...R.map(r => r.height))), minW: Math.round(Math.min(...R.map(r => r.width))) };
    }, sel);
    await page.evaluate(async () => { ORBIT.engine.unlock(); await ORBIT.engine.ensureRunning(); ORBIT.ui.showView('mix'); await ORBIT.school.startLesson('eq'); }); await page.waitForTimeout(1800);
    report(name, 'mix(lesson)', await audit('#view-mix .btn, #view-mix .ctl, #view-mix .jog, #view-mix .dk-load, #mix-coach, #mix-wave'));
    if (OUT) await page.screenshot({ path: OUT + name + '-mix.png' });
    await page.evaluate(() => { document.querySelector('#dk-0 .tb-pads').click(); }); await page.waitForTimeout(200);
    report(name, 'mix(pads)', await audit('#dk-0 .btn, #dk-0 .dj-pad'));
    if (OUT) await page.screenshot({ path: OUT + name + '-mixpads.png' });
    await page.evaluate(async () => { ORBIT.school.stop(); ORBIT.ui.showView('play'); ORBIT.game.noFail = true; ORBIT.game.select(3); await ORBIT.game.start(); }); await page.waitForTimeout(4500);
    report(name, 'play', await audit('#view-play .btn, #view-play .btn-start, #view-play .lane-pad, #view-play input[type=range], #view-play .seg button, #highway, #btn-hype'));
    if (OUT) await page.screenshot({ path: OUT + name + '-play.png' });
    await page.evaluate(() => { ORBIT.game.stop(); ORBIT.ui.showView('pads'); }); await page.waitForTimeout(400);
    report(name, 'beatpad', await audit('#view-pads button, #view-pads select, #view-pads input'));
    if (OUT) await page.screenshot({ path: OUT + name + '-pads.png' });
    await page.evaluate(() => { ORBIT.ui.showView('songs'); document.querySelector('#sg-starters [data-style="house"]').click(); }); await page.waitForTimeout(400);
    report(name, 'songs', await audit('#view-songs button, #view-songs select, #view-songs input'));
    if (OUT) await page.screenshot({ path: OUT + name + '-songs.png' });
    if (errs.length) { failed++; console.log('FAIL ' + name + ' page errors  ' + JSON.stringify(errs)); }
    await ctx.close();
  }
  await b.close();
  console.log(failed ? failed + ' layout problem(s)' : 'Phone layouts OK'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
