/* ORBIT DJ — Club Night (Mix tab): you choose the tracks, the crowd reacts.
 * Three transitions in a row. Before each one the crowd makes a request; your choice of track and the
 * quality of the mix (beatmatch, phrasing, bass swap, clean finish) move the crowd-energy meter.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, D = O.decks, SC = O.school, clamp = O.clamp;
  const STYLE_META = { house: ['house', 3], basshouse: ['house', 4], garage: ['garage', 3], dubstep: ['bass', 5], trap: ['bass', 4], boombap: ['hip-hop', 2], soul: ['hip-hop', 3] };
  const meta = T => { const m = STYLE_META[T.style] || ['house', 3]; return { fam: m[0], e: m[1] }; };
  const near = (a, b) => Math.abs(a / b - 1) <= D.RANGE;
  const base = id => String(id).split(':').slice(0, 2).join(':'); // a song's id without its revision
  const REQUESTS = [
    { id: 'harder', text: 'The crowd wants it HARDER', ok: (f, t) => meta(t).e > meta(f).e },
    { id: 'bass', text: 'Someone is shouting for BASS', ok: (f, t) => meta(t).fam === 'bass' },
    { id: 'groove', text: 'They love this groove: keep the same style going', ok: (f, t) => meta(t).fam === meta(f).fam },
    { id: 'faster', text: 'Pick up the tempo', ok: (f, t) => t.bpm > f.bpm + 1 },
    { id: 'switch', text: 'Time to switch it up: change the style', ok: (f, t) => meta(t).fam !== meta(f).fam }
  ];
  const N = (O.night = { TARGET: 3 });
  const candidates = (a, live) => D.library().filter(T => near(T.bpm, live.bpm) && base(T.id) !== base(live.id) && !a.played.includes(base(T.id)));
  function newRequest(a) {
    const live = D.decks[a.live].track, pool = candidates(a, live), opts = REQUESTS.filter(r => r.id !== (a.request && a.request.id) && pool.some(T => r.ok(live, T)));
    a.request = opts.length ? opts[(a.n * 2 + a.played.length + Math.round(live.bpm)) % opts.length] : null;
  }
  // Tag shown in the track picker while a night is running.
  N.tag = function (T) {
    const a = SC.active; if (!a || a.kind !== 'night') return '';
    const m = meta(T), live = a.live === null ? null : D.decks[a.live].track;
    let s = '<small class="night-tag">' + m.fam.toUpperCase() + ' · ENERGY ' + '●'.repeat(m.e) + '○'.repeat(5 - m.e);
    if (live && a.request && a.request.ok(live, T)) s += ' · <b>MATCHES THE REQUEST</b>';
    if (a.played.includes(base(T.id))) s += ' · ALREADY PLAYED';
    return s + '</small>';
  };
  N.start = async function () {
    SC.stop(true); D.stopAll(); D.reset(); D.syncLocked = false;
    SC.active = { kind: 'night', def: { id: 'night', name: 'CLUB NIGHT' }, loading: false, done: false, last: performance.now(), note: '', energy: 50, live: null, n: 0, played: [], request: null, log: [], m: null, phase: 'opener' };
    O.emit('school', SC.active);
    O.mixui.openTracks(0);
    return true;
  };
  const fresh = () => ({ overlap: 0, inTime: 0, clash: 0, start: null, plays: -1, solo: 0, late: 0 });
  O.on('deck', e => {
    const a = SC.active; if (!a || a.kind !== 'night' || a.done || e.type !== 'loaded') return;
    const d = D.decks[e.deck]; if (!d.track) return;
    if (a.phase === 'opener') { // the first track starts by itself, past its mix-in
      if (d.track.bpm < 110 && D.library().filter(T => near(T.bpm, d.track.bpm)).length < 4) O.toast('Heads up: few tracks are close to ' + d.track.bpm + ' BPM, so choices will be tight.');
      const s = d.track.sections.find(x => x.sec === 'verse') || d.track.sections[0];
      D.setXf(e.deck === 0 ? 0 : 1); D.seek(d, d.track.first + s.bar * 4 * d.track.beat); D.play(d);
      a.live = e.deck; a.phase = 'mix'; a.played.push(base(d.track.id)); a.m = fresh(); a.m.plays = D.other(d).stats.plays; newRequest(a);
      O.emit('school', a);
    } else if (e.deck !== a.live) { a.m = fresh(); a.m.plays = d.stats.plays; O.emit('school', a); }
  });
  N.tick = function (a, dt) {
    if (a.phase !== 'mix' || a.live === null) return;
    const from = D.decks[a.live], to = D.other(from), m = a.m;
    if (!from.track) return;
    // After a mix the new live track eases back to its own tempo, so a chain of synced mixes cannot
    // drag the night down to one tempo and leave no track in range.
    if (a.settle && !to.playing) { const v = from.tempo, step = dt * 0.35; if (Math.abs(v) <= step) { D.setTempo(from, 0); a.settle = false; } else D.setTempo(from, v - Math.sign(v) * step); }
    const both = D.audible(from) && D.audible(to) && !!to.track;
    if (to.track && to.stats.plays !== m.plays) { m.plays = to.stats.plays; if (to.playing && from.playing) m.start = phraseDist(from, to); }
    if (both) {
      m.overlap += dt;
      const p = D.phaseMs(); if (p !== null && Math.abs(p) <= 35) m.inTime += dt;
      if (from.ch.low > 0.35 && to.ch.low > 0.35) m.clash += dt;
    }
    m.solo = !D.audible(from) && D.audible(to) && to.track && m.overlap > 1.5 ? m.solo + dt : 0;
    // the crowd gets restless once the live track is into its drums-only outro
    const w = D.where(from); if (w && w.sec === 'mixout' && from.playing) { m.late += dt; a.energy = clamp(a.energy - dt * 1.5, 0, 100); }
    const ended = !from.playing && from.buf && D.posOf(from) >= from.buf.duration - 0.3;
    if (m.solo > 1.6) transition(a, from, to);
    else if (ended && !D.audible(to)) finish(a, 'The music stopped: the track ran out before the next one was in.');
    else if (a.energy <= 0) finish(a, 'The crowd drifted off.');
  };
  function phraseDist(a, b) {
    const st = b.stats.startAt; if (!st) return 99;
    const x = (((D.beatOf(a, D.posOf(a, st.at)) - D.beatOf(b, st.pos)) % 32) + 32) % 32;
    return Math.min(x, 32 - x);
  }
  function transition(a, from, to) {
    const m = a.m, need = 16 * 60 / D.bpm(from), enough = Math.min(1, m.overlap / need);
    const beat = m.inTime / m.overlap * 100 * enough, phrase = m.start === null ? 0 : clamp(100 - Math.max(0, m.start - 0.5) * 35, 0, 100), bass = (1 - m.clash / m.overlap) * 100 * enough;
    const clean = (Math.abs(to.ch.low - 0.5) <= 0.1 ? 50 : 0) + (Math.abs(to.ch.filter - 0.5) <= 0.04 ? 50 : 0);
    const mix = Math.round(0.4 * beat + 0.2 * phrase + 0.25 * bass + 0.15 * clean);
    const req = !!(a.request && a.request.ok(from.track, to.track)), repeat = a.played.includes(base(to.track.id)), drop = meta(from.track).e - meta(to.track).e >= 2;
    const pick = (req ? 20 : a.request ? -6 : 0) + (repeat ? -15 : 0) + (drop ? -10 : 0);
    const delta = Math.round((mix - 55) * 0.5 + pick);
    a.energy = clamp(a.energy + delta, 0, 100);
    a.log.push({ from: from.track.title, to: to.track.title, mix, req, repeat, delta, request: a.request ? a.request.text : '' });
    a.played.push(base(to.track.id)); a.n++; a.live = to.i; a.m = fresh(); a.m.plays = from.stats.plays; a.settle = true;
    D.pause(from);
    O.toast((delta >= 0 ? 'Crowd energy +' : 'Crowd energy ') + delta + (req ? ' · request played!' : '') + ' · mix ' + mix + '/100');
    if (a.n >= N.TARGET) finish(a, ''); else { newRequest(a); O.emit('school', a); }
  }
  function finish(a, why) {
    if (a.done) return; a.done = true;
    const mixes = a.log.map(l => l.mix), avg = mixes.length ? Math.round(mixes.reduce((x, y) => x + y, 0) / mixes.length) : 0, reqs = a.log.filter(l => l.req).length;
    const done = a.n >= N.TARGET, total = Math.round((avg * 0.6 + a.energy * 0.4) * (done ? 1 : a.n / N.TARGET * 0.8));
    const stars = !done ? 0 : total >= 85 ? 3 : total >= 70 ? 2 : total >= 50 ? 1 : 0, grade = total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'PRACTICE';
    const old = SC.progress.night, best = done && (!old || total > old.score);
    if (best) { SC.progress.night = { score: total, stars }; O.store.set('orbitV3School', SC.progress); }
    const tips = [];
    if (why) tips.push(why);
    if (done && reqs < a.log.length) tips.push('Open the track list before each mix: tracks that match the request are marked.');
    if (avg < 70 && mixes.length) tips.push('Mix quality moves the crowd most: SYNC, start on bar 1 of a phrase, swap the basslines, then take the old track out.');
    a.result = { night: true, name: 'CLUB NIGHT', total, grade, stars, best, title: !done ? 'NIGHT CUT SHORT' : a.energy >= 75 ? 'THE ROOM IS JUMPING' : a.energy >= 50 ? 'SOLID NIGHT' : 'TOUGH CROWD', tips,
      rows: [['MIXING', avg, 60], ['CROWD ENERGY', Math.round(a.energy), 40], ['REQUESTS', Math.round(reqs / N.TARGET * 100), 0], ['MIXES DONE', Math.round(a.n / N.TARGET * 100), 0]], log: a.log, energy: a.energy };
    O.emit('gig-result', a.result); O.emit('school', a);
  }
  N.finish = () => { const a = SC.active; if (a && a.kind === 'night') finish(a, a.n < N.TARGET ? 'You ended the night early.' : ''); };
  N.hint = function (a) {
    if (a.phase === 'opener') return 'Pick your opening track.';
    const from = D.decks[a.live], to = D.other(from), req = a.request ? a.request.text + '. ' : '';
    if (!to.track || a.played.includes(base(to.track.id)) && !to.playing) return req + 'Load the next track on Deck ' + to.name + '.';
    if (!to.playing) return req + 'Start Deck ' + to.name + ' on bar 1 of a phrase (SYNC helps), then blend it in.';
    if (D.audible(from) && D.audible(to)) return 'Blend, swap the basslines, then take Deck ' + from.name + ' out.';
    return 'Bring Deck ' + to.name + ' in with the crossfader.';
  };
})();
