/* ORBIT DJ — DJ school: controller lessons, scored mix gigs (Mix tab) and beat-making lessons (Beats tab).
 * Lessons are lists of steps; each step has an instruction and a check that reads the real deck,
 * mixer or beat pad state, so a step only passes when the player has actually done the move.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, D = O.decks, BP = O.beatpad, S = O.store;
  const KEY = 'orbitV3School';
  const near = (v, x, e) => Math.abs(v - x) <= (e === undefined ? 0.05 : e);
  const [A, B] = D.decks;
  const saved = S.get(KEY, {}) || {};
  const SC = (O.school = { progress: { mix: saved.mix || {}, gigs: saved.gigs || {}, beat: saved.beat || {} }, active: null, beatActive: null });
  const persist = () => S.set(KEY, SC.progress);
  // kill a control and bring it back: used for "turn it all the way down, then reset" steps
  const downUp = (get, lo) => (a, b, m) => { if (get(a, b) < (lo || 0.08)) m.down = true; return !!m.down && near(get(a, b), 0.5, 0.06); };

  // ================= controller lessons =================
  // Setup keys: a, b (track ids) · playA / playB · at (section to start from) · synced (B matched to A)
  // · offset (B late by this many beats) · xf · init(A, B)
  const LESSONS = [
    { id: 'transport', name: 'PLAY + CUE', a: 'neon', at: 'mixin', steps: [
      { t: 'Press PLAY on Deck A.', ok: a => a.playing && !a.cueHeld },
      { t: 'Press CUE. The deck jumps back to its cue point (beat 1 of the track) and stops.', ok: a => a.stats.cueReturn >= 1 },
      { t: 'Now hold CUE: it plays from the cue point while you hold, and snaps back when you let go. DJs use this to check a starting point.', ok: a => a.stats.cuePreview >= 1 },
      { t: 'Press PLAY to let it run.', ok: a => a.playing && !a.cueHeld }] },
    { id: 'levels', name: 'GAIN + CHANNEL FADER', a: 'neon', playA: true, steps: [
      { t: 'Pull Deck A’s channel fader all the way down. The deck keeps running, silently.', ok: a => a.ch.fader < 0.05 },
      { t: 'Push the fader back to the top.', ok: a => a.ch.fader > 0.95 },
      { t: 'GAIN sets how hot a track comes into the mixer. Turn A’s GAIN up and watch its meter go red.', ok: a => a.ch.gain > 0.8 },
      { t: 'Red means distortion. Bring GAIN back to the middle (double-tap any knob to reset it).', ok: a => near(a.ch.gain, 0.5) }] },
    { id: 'xf', name: 'CROSSFADER', a: 'neon', b: 'glass', playA: true, playB: true, synced: true, steps: [
      { t: 'Both decks are playing in time. Slide the crossfader all the way to B.', ok: () => D.mixer.xf > 0.95 },
      { t: 'Now all the way to A.', ok: () => D.mixer.xf < 0.05 },
      { t: 'Rest it in the middle: both decks are in the mix.', ok: () => near(D.mixer.xf, 0.5, 0.06) }] },
    { id: 'tempo', name: 'TEMPO FADER', a: 'neon', b: 'glass', playA: true, steps: [
      { t: 'The two decks are at different tempos: compare the BPM readouts. Slide Deck B’s TEMPO fader until B reads the same as A.', hold: 0.7, ok: (a, b) => !b.sync && Math.abs(D.bpm(b) - D.bpm(a)) < 0.12 }] },
    { id: 'jog', name: 'JOG WHEEL + NUDGE', a: 'neon', b: 'glass', playA: true, playB: true, synced: true, offset: 0.3, steps: [
      { t: 'Same tempo, but B’s beats land late: you can hear a double kick. Drag B’s jog wheel forward (or hold +) to speed it up for a moment until the beat marks on the two waveforms line up.', hold: 1.5, ok: () => { const p = D.phaseMs(); return p !== null && Math.abs(p) < 28; } },
      { t: 'Locked in. Now pause Deck B and drag its jog wheel: on a stopped deck the platter scrubs through the track.', ok: (a, b, m) => { if (!b.playing && m.s0 === undefined) m.s0 = b.stats.scrubs; return !b.playing && b.stats.scrubs > m.s0; } }] },
    { id: 'sync', name: 'SYNC', a: 'neon', b: 'glass', playA: true, playB: true, offset: 0.4, steps: [
      { t: 'Deck B is at its own tempo and out of time. Press SYNC on B: it copies A’s tempo and lines up the beats.', ok: (a, b) => { const p = D.phaseMs(); return b.sync && p !== null && Math.abs(p) < 20; } },
      { t: 'SYNC is a tool, but learn to match by hand too. Press SYNC again to switch it off.', ok: (a, b) => !b.sync }] },
    { id: 'eq', name: '3-BAND EQ + BASS SWAP', a: 'neon', b: 'glass', playA: true, playB: true, synced: true, init: (a, b) => { D.set(1, 'low', 0); }, steps: [
      { t: 'Turn Deck A’s LOW all the way down. The kick and bassline vanish.', ok: a => a.ch.low < 0.08 },
      { t: 'Double-tap LOW to snap it back to the middle.', ok: a => near(a.ch.low, 0.5) },
      { t: 'HI is hats and sparkle. Turn A’s HI all the way down, then reset it.', ok: downUp(a => a.ch.hi) },
      { t: 'MID is chords and melody. Kill A’s MID, then reset it.', ok: downUp(a => a.ch.mid) },
      { t: 'Bass swap: two basslines together sound muddy, so B’s LOW starts off. Turn A’s LOW down and B’s LOW up to the middle.', ok: (a, b) => a.ch.low < 0.1 && near(b.ch.low, 0.5, 0.08) }] },
    { id: 'filter', name: 'FILTER', a: 'neon', playA: true, steps: [
      { t: 'Turn A’s FILTER left: a low-pass filter strips the highs, like hearing the club from outside.', ok: a => a.ch.filter < 0.15 },
      { t: 'Now turn it right, past the middle: a high-pass filter strips the bass and thins the track out.', ok: a => a.ch.filter > 0.85 },
      { t: 'Centre it to switch the filter off (double-tap).', ok: a => near(a.ch.filter, 0.5, 0.03) }] },
    { id: 'loop', name: 'LOOPS', a: 'neon', playA: true, steps: [
      { t: 'Press LOOP on Deck A. It repeats the next 4 beats.', ok: a => !!a.loop && !a.loop.roll },
      { t: 'Press ½ twice to shrink the loop to 1 beat. DJs do this to build tension.', ok: a => !!a.loop && a.loop.beats <= 1 },
      { t: 'Press ×2 twice to grow it back to 4 beats.', ok: a => !!a.loop && a.loop.beats >= 4 },
      { t: 'Press LOOP again to exit. The track carries on.', ok: a => !a.loop }] },
    { id: 'hotcue', name: 'PADS: HOT CUES', a: 'neon', playA: true, pads: 'hotcue', steps: [
      { t: 'Deck A’s pads are open in HOT CUE mode. While it plays, tap pad 1 to drop a marker right there.', ok: a => a.hot[0] !== null },
      { t: 'Wait a few beats, then tap pad 1 again. The deck jumps straight back to the marker.', ok: a => a.stats.hotJumps >= 1 },
      { t: 'Store a second marker on pad 2, then jump between pads 1 and 2 a couple of times.', ok: a => a.hot[1] !== null && a.stats.hotJumps >= 3 }] },
    { id: 'roll', name: 'PADS: ROLL, JUMP, SAMPLER', a: 'neon', playA: true, pads: 'roll', steps: [
      { t: 'ROLL mode: hold a pad and the beat stutters. Let go and the track is where it would have been. Do it twice.', ok: a => a.stats.rolls >= 2 && !a.slip },
      { t: 'Switch the pads to JUMP and tap +4: the deck skips ahead four beats and stays in time.', ok: a => a.stats.jumps >= 1 },
      { t: 'Switch to SAMPLER and fire three different one-shots over the track.', ok: a => [0, 1, 2, 3, 4, 5, 6, 7].filter(n => a.stats['s' + n]).length >= 3 }] },
    { id: 'fx', name: 'FX: ECHO OUT', a: 'neon', playA: true, init: () => D.setFx({ type: 'echo', beats: 1, amount: 0.3 }), steps: [
      { t: 'Press FX A to send Deck A into the echo, and turn the FX knob up past halfway.', ok: a => a.ch.fx && D.mixer.fx.amount > 0.55 },
      { t: 'Echo out: pull A’s channel fader to zero. The track is gone but its echoes trail away.', ok: a => a.ch.fx && a.ch.fader < 0.05 },
      { t: 'Bring the fader back up, then switch FX A off.', ok: a => a.ch.fader > 0.9 && !a.ch.fx }] },
    { id: 'cue', name: 'HEADPHONE CUE', a: 'neon', b: 'glass', playA: true, playB: true, synced: true, init: () => D.set(1, 'fader', 0), steps: [
      { t: 'Deck B is playing with its fader down, so the room can’t hear it. Put headphones in, turn SPLIT on, then press the headphone button for B.', ok: (a, b) => D.mixer.split && b.ch.cue },
      { t: 'Left ear: Deck B alone. Right ear: what the room hears. This is how DJs line up the next track in private. Now raise B’s fader to bring it in.', ok: (a, b) => b.ch.fader > 0.9 },
      { t: 'Turn SPLIT off to return to normal stereo.', ok: () => !D.mixer.split }] },
    { id: 'mix', name: 'YOUR FIRST TRANSITION', a: 'neon', b: 'glass', playA: true, at: 'drop', xf: 0, steps: [
      { t: 'Deck A is live. Prepare B: press SYNC on Deck B and turn B’s LOW all the way down.', ok: (a, b) => b.sync && b.ch.low < 0.1 },
      { t: 'Phrasing: music moves in 8-bar blocks, so start B at the top of one. Watch A’s bar counter and press PLAY on B just as it rolls over to bar 1.', ok: (a, b, m) => {
        if (!b.playing) { m.judged = false; return false; }
        if (!m.judged) { m.judged = true; m.dist = SC.phraseDist(a, b); if (m.dist > 0.6) { SC.say('That was ' + m.dist.toFixed(0) + ' beat' + (m.dist >= 1.5 ? 's' : '') + ' off the phrase. Press CUE on B and try again on bar 1.'); } }
        return m.dist <= 0.6; } },
      { t: 'On the beat and on the phrase. Slide the crossfader to the middle to blend B in.', ok: () => near(D.mixer.xf, 0.5, 0.1) },
      { t: 'Bass swap: turn A’s LOW down and bring B’s LOW up to the middle.', ok: (a, b) => a.ch.low < 0.1 && near(b.ch.low, 0.5, 0.08) },
      { t: 'Finish the mix: crossfader all the way to B, then stop Deck A.', ok: a => D.mixer.xf > 0.95 && !a.playing }] }
  ];
  SC.LESSONS = LESSONS;

  // How far (in beats) B's first beat landed from the nearest 8-bar boundary of A.
  SC.phraseDist = function (a, b) {
    const st = b.stats.startAt; if (!st || !a.track || !b.track) return 99;
    const beatsA = D.beatOf(a, D.posOf(a, st.at)), beatsB = D.beatOf(b, st.pos); // where each deck was when B started
    const x = (((beatsA - beatsB) % 32) + 32) % 32;
    return Math.min(x, 32 - x);
  };

  const secStart = (d, sec) => { const s = d.track.sections.find(x => x.sec === sec) || d.track.sections[0]; return d.track.first + s.bar * 4 * d.track.beat; };
  async function prepare(def) {
    D.stopAll(); D.reset(); D.syncLocked = false; D.vinyl = false;
    const okA = await D.load(0, def.a), okB = def.b ? await D.load(1, def.b) : true;
    if (!okA || !okB) return false;
    D.setXf(def.xf === undefined ? (def.b ? 0.5 : 0) : def.xf);
    A.padMode = B.padMode = 'hotcue';
    if (def.pads) A.padMode = def.pads;
    if (def.playA) { D.seek(A, secStart(A, def.at || 'verse')); D.play(A); }
    if (def.b && def.synced) { D.toggleSync(B); B.sync = false; }
    if (def.playB) { D.seek(B, secStart(B, def.at || 'verse') + (def.offset || 0) * B.track.beat); D.play(B); if (def.synced) D.seek(B, D.posOf(B) + phaseFix(def.offset || 0)); }
    if (def.init) def.init(A, B);
    return true;
  }
  // seconds to move B so that it sits exactly `offset` beats behind A's beat
  function phaseFix(offset) { const w = x => { x -= Math.floor(x); return x > 0.5 ? x - 1 : x; }; return w(D.beatOf(A) - offset - D.beatOf(B)) * B.track.beat; }

  SC.say = msg => { if (SC.active) { SC.active.note = msg; O.emit('school', SC.active); } };
  SC.startLesson = async function (id) {
    const def = LESSONS.find(l => l.id === id); if (!def) return false;
    SC.stop(true);
    SC.active = { kind: 'lesson', def, step: 0, mem: {}, held: 0, note: '', loading: true, done: false, last: performance.now() };
    O.emit('school', SC.active);
    const ok = await prepare(def);
    if (!SC.active || SC.active.def !== def) return false;
    if (!ok) { SC.stop(); return false; }
    SC.active.loading = false; O.emit('school', SC.active);
    return true;
  };
  SC.stop = function (silent) {
    const a = SC.active; SC.active = null; D.syncLocked = false;
    if (a && !a.done) D.stopAll();
    if (!silent) O.emit('school', null);
  };
  SC.nextLesson = id => { const i = LESSONS.findIndex(l => l.id === id); return i >= 0 && i < LESSONS.length - 1 ? LESSONS[i + 1].id : null; };

  // ================= gigs: scored transitions =================
  const GIGS = [
    { id: 'warmup', name: 'WARM-UP SLOT', a: 'glass', b: 'neon', sync: true, blurb: 'Bass house into tech house, 126 to 124 BPM. SYNC allowed.' },
    { id: 'backroom', name: 'BACK ROOM', a: 'groove', b: 'bounce', sync: true, blurb: 'Boom bap into chipmunk soul, 88 to 94 BPM. Swung beats, SYNC allowed.' },
    { id: 'peak', name: 'PEAK TIME', a: 'neon', b: 'tonic', sync: false, blurb: 'Tech house into UK garage, 124 to 132 BPM. No SYNC: tempo fader and jog only.' },
    { id: 'closing', name: 'CLOSING SET', a: 'tonic', b: 'final', sync: false, blurb: 'UK garage into dubstep, 132 to 140 BPM. No SYNC, a big tempo jump.' },
    { id: 'afterhours', name: 'AFTER HOURS', a: 'final', b: 'night', sync: true, blurb: 'Dubstep into trap, both at 140 BPM. The tempo is easy; the phrasing is the test.' }
  ];

  SC.GIGS = GIGS;
  SC.startGig = async function (id) {
    const def = GIGS.find(g => g.id === id); if (!def) return false;
    SC.stop(true);
    SC.active = { kind: 'gig', def, loading: true, done: false, last: performance.now(), note: '',
      m: { total: 0, overlap: 0, inTime: 0, clash: 0, hot: 0, start: null, plays: 0, soloB: 0 } };
    O.emit('school', SC.active);
    const ok = await prepare({ a: def.a, b: def.b, playA: true, at: 'drop', xf: 0 });
    if (!SC.active || SC.active.def !== def) return false;
    if (!ok) { SC.stop(); return false; }
    D.syncLocked = !def.sync;
    SC.active.loading = false; O.emit('school', SC.active);
    return true;
  };
  function gigTick(a, dt) {
    const m = a.m, both = D.audible(A) && D.audible(B);
    m.total += dt;
    if (B.stats.plays !== m.plays) { m.plays = B.stats.plays; if (B.playing && A.playing) m.start = SC.phraseDist(A, B); }
    if (both) {
      m.overlap += dt;
      const p = D.phaseMs(); if (p !== null && Math.abs(p) <= 35) m.inTime += dt;
      if (A.ch.low > 0.35 && B.ch.low > 0.35) m.clash += dt;
    }
    if (D.level(2) > 1.35) m.hot += dt;
    const aGone = !D.audible(A), bOn = D.audible(B);
    m.soloB = aGone && bOn && m.overlap > 1.5 ? m.soloB + dt : 0;
    const ended = !A.playing && D.posOf(A) >= A.buf.duration - 0.3;
    if (m.soloB > 1.6 || (ended && m.total > 2)) SC.finishGig();
  }
  SC.gigHint = function () {
    const a = SC.active; if (!a || a.kind !== 'gig') return '';
    const m = a.m, both = D.audible(A) && D.audible(B), p = D.phaseMs();
    if (!B.playing && m.overlap === 0) return 'Deck A is live. Get B ready' + (a.def.sync ? ' (SYNC is allowed)' : ' (match the tempo by hand)') + ', then start it on bar 1 of a phrase.';
    if (B.playing && !both && m.overlap === 0) return (p !== null && Math.abs(p) > 35 ? 'B is ' + Math.round(Math.abs(p)) + ' ms ' + (p > 0 ? 'late: nudge it forward.' : 'early: nudge it back.') : 'B is in time.') + ' Bring it in with the crossfader.';
    if (both) return (p !== null && Math.abs(p) > 35 ? 'Beats are drifting (' + Math.round(Math.abs(p)) + ' ms). Nudge B. ' : '') + (A.ch.low > 0.35 && B.ch.low > 0.35 ? 'Two basslines are clashing: swap the LOWs.' : 'Blend, then take Deck A out.');
    return 'Finish on Deck B alone, with its EQ and filter back to normal.';
  };
  SC.finishGig = function () {
    const a = SC.active; if (!a || a.kind !== 'gig' || a.done) return null;
    a.done = true;
    const m = a.m, need = 16 * 60 / D.bpm(A), enough = Math.min(1, m.overlap / need); // a blend should last at least 16 beats
    const beat = m.overlap > 0 ? m.inTime / m.overlap * 100 * enough : 0;
    const phrase = m.start === null ? 0 : O.clamp(100 - Math.max(0, m.start - 0.5) * 35, 0, 100);
    const bass = m.overlap > 0 ? (1 - m.clash / m.overlap) * 100 * enough : 0;
    const levels = 100 - Math.min(100, m.hot / Math.max(1, m.total) * 500);
    const finish = (D.audible(B) ? 40 : 0) + (near(B.ch.low, 0.5, 0.1) ? 20 : 0) + (near(B.ch.filter, 0.5, 0.04) ? 15 : 0) + (!D.audible(A) ? 25 : 0);
    const total = Math.round(0.35 * beat + 0.2 * phrase + 0.2 * bass + 0.1 * levels + 0.15 * finish);
    const grade = total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'PRACTICE';
    const tips = [];
    if (m.overlap < need) tips.push('Let both tracks play together for at least 4 bars (16 beats) before taking A out.');
    if (beat < 70 && m.overlap > 0) tips.push('The beats drifted apart during the blend. Match the BPM readouts first, then nudge until the waveform beat marks line up.');
    if (phrase < 70) tips.push(m.start === null ? 'Start Deck B while A is still playing, before you bring it in.' : 'Start B on bar 1 of a phrase: watch A’s bar counter roll over from 8 to 1.');
    if (bass < 70 && m.overlap > 0) tips.push('Two basslines played together for too long. Keep one LOW down until you swap them.');
    if (finish < 80) tips.push('End with only Deck B in the mix, with its LOW and FILTER back in the middle.');
    if (levels < 80) tips.push('The master was in the red. Keep GAIN in the middle and avoid boosting EQ.');
    const old = SC.progress.gigs[a.def.id], best = !old || total > old.score;
    if (best) { SC.progress.gigs[a.def.id] = { score: total, grade }; persist(); }
    a.result = { id: a.def.id, name: a.def.name, total, grade, best, parts: { beat: Math.round(beat), phrase: Math.round(phrase), bass: Math.round(bass), levels: Math.round(levels), finish: Math.round(finish) }, overlap: m.overlap, tips };
    D.syncLocked = false;
    O.emit('gig-result', a.result); O.emit('school', a);
    return a.result;
  };

  // ================= beat-making lessons (Beats tab) =================
  const has = (pad, steps) => { const ev = BP.pattern().events; return steps.every(s => ev.some(e => e.pad === pad && Math.round(e.step) % 16 === s)); };
  const sig = p => p.events.map(e => e.pad + ':' + Math.round(e.step)).sort().join(',');
  const BEAT_LESSONS = [
    { id: 'four', name: 'FOUR ON THE FLOOR', clear: true, steps: [
      { t: 'Tap pad 1 (KICK, bottom left) to select it.', ok: () => BP.sel === 0 },
      { t: 'In STEPS, switch on steps 1, 5, 9 and 13. That is a kick on every beat.', ok: () => has(0, [0, 4, 8, 12]) },
      { t: 'Press PLAY and listen to your kick pattern loop.', ok: () => BP.playing }] },
    { id: 'backbeat', name: 'BACKBEAT + HATS', steps: [
      { t: 'Tap pad 2 (SNARE) to select it, then switch on steps 5 and 13: the backbeat, on beats 2 and 4.', ok: () => has(1, [4, 12]) },
      { t: 'Tap pad 3 (HAT) and switch on every odd step: 1, 3, 5, 7, 9, 11, 13, 15.', ok: () => has(2, [0, 2, 4, 6, 8, 10, 12, 14]) },
      { t: 'That is a full drum beat. Press PLAY if it is not already running.', ok: () => BP.playing }] },
    { id: 'finger', name: 'FINGER DRUMMING', steps: [
      { t: 'Press PLAY so the pattern and metronome run.', ok: () => BP.playing },
      { t: 'Play along by hand: KICK (pad 1) on beats 1 and 3, SNARE (pad 2) on beats 2 and 4. Land 8 hits on the beat.', count: m => (m.good || 0) + ' / 8 on the beat', ok: (m) => (m.good || 0) >= 8 }] },
    { id: 'record', name: 'RECORD A TAKE', steps: [
      { t: 'Press REC. You get a one-bar count-in if the sequencer is stopped.', ok: () => BP.rec },
      { t: 'Play any pads. Each hit is recorded and snapped to the grid. Record at least 4 hits.', count: m => Math.max(0, BP.pattern().events.length - m.n0) + ' / 4 recorded', enter: m => { m.n0 = BP.pattern().events.length; }, ok: m => BP.pattern().events.length - m.n0 >= 4 },
      { t: 'Press REC again to stop recording. Your take keeps looping.', ok: () => !BP.rec }] },
    { id: 'repeat', name: 'NOTE REPEAT + SWING', steps: [
      { t: 'Tap NOTE RPT until it reads 1/16.', ok: () => BP.noteRepeat === 16 },
      { t: 'Hold the HAT pad (pad 3): it rolls for as long as you hold. Get 8 repeats.', count: m => Math.min(8, m.rolls || 0) + ' / 8 repeats', ok: m => (m.rolls || 0) >= 8 },
      { t: 'Turn NOTE RPT off, then open MODES and raise SWING to 60% or more. Swing delays every other 16th for a lazier feel.', ok: () => !BP.noteRepeat && BP.swing >= 60 }] },
    { id: 'levels16', name: '16 LEVELS BASSLINE', steps: [
      { t: 'Tap pad 13 (bottom-left of the top row) to select the bass sound.', ok: () => BP.sel === 12 },
      { t: 'Open MODES and switch on 16 LEVELS. Now all 16 pads play that one sound at different pitches.', ok: () => BP.levels16 },
      { t: 'Play a bassline: hit 4 different pads.', count: m => Object.keys(m.pads || {}).length + ' / 4 notes', ok: m => Object.keys(m.pads || {}).length >= 4 },
      { t: 'Switch 16 LEVELS off again.', ok: () => !BP.levels16 }] },
    { id: 'arrange', name: 'PATTERNS A–D', steps: [
      { t: 'In STEPS, press COPY to copy this pattern into the next slot.', enter: (m, k) => { k.cur = BP.cur; }, ok: (m, k) => { const next = 'ABCD'[('ABCD'.indexOf(k.cur) + 1) % 4]; return BP.pattern().events.length > 0 && sig(BP.patterns[next]) === sig(BP.patterns[k.cur]); } },
      { t: 'Tap the next pattern letter to switch to the copy. While playing, the switch waits for the bar line.', ok: (m, k) => BP.cur !== k.cur },
      { t: 'Change the copy: add or remove any step. Now you have a verse and a variation.', enter: m => { m.sig = sig(BP.pattern()); }, ok: m => sig(BP.pattern()) !== m.sig }] }
  ];
  SC.BEAT_LESSONS = BEAT_LESSONS;
  SC.startBeat = function (id) {
    const def = BEAT_LESSONS.find(l => l.id === id); if (!def) return false;
    if (['dusty', 'club', 'midnight'].indexOf(BP.kit) < 0) BP.setKit('dusty');
    if (def.clear && BP.pattern().events.length) BP.clear();
    if (BP.levels16) BP.setLevels16(false);
    SC.beatActive = { def, step: 0, mem: {}, keep: {}, done: false }; // mem resets every step, keep lasts the lesson
    const st = def.steps[0]; if (st.enter) st.enter(SC.beatActive.mem, SC.beatActive.keep);
    O.emit('beat-school', SC.beatActive);
    return true;
  };
  SC.stopBeat = function () { SC.beatActive = null; O.emit('beat-school', null); };
  // Live pad hits: timing against the sequencer grid (finger drumming) and which pads were played.
  const padDown = BP.padDown;
  BP.padDown = function (i, perfMs) {
    const a = SC.beatActive;
    if (a && !a.done && E.isRunning()) {
      const m = a.mem;
      (m.pads = m.pads || {})[i] = 1;
      if (BP.playing && (i === 0 || i === 1)) {
        const t = E.heard(perfMs), beat = 60 / BP.bpm, x = (t - BP.origin) / beat, n = Math.round(x), err = Math.abs(x - n) * beat;
        const want = ((n % 2) + 2) % 2; // even beats (1, 3) = kick, odd beats (2, 4) = snare
        if (err < 0.075 && want === i) m.good = (m.good || 0) + 1;
      }
    }
    return padDown.apply(this, arguments);
  };
  O.on('bp-hit', h => { const a = SC.beatActive; if (a && !a.done && BP.noteRepeat && BP.held && BP.held.size && h.pad === 2) a.mem.rolls = (a.mem.rolls || 0) + 1; });

  // ================= step runner =================
  SC.tick = function () {
    const now = performance.now();
    const a = SC.active;
    if (a && !a.loading && !a.done) {
      const dt = Math.min(0.25, (now - a.last) / 1000); a.last = now;
      if (a.kind === 'gig') gigTick(a, dt);
      else {
        // keep the lesson's music going: loop back before the drums-only outro
        for (const d of D.decks) if (d.playing && d.track && a.def.id !== 'mix') { const w = D.where(d); if (w && w.sec === 'mixout') D.seek(d, secStart(d, 'verse')); }
        const st = a.def.steps[a.step];
        if (st.ok(A, B, a.mem)) { a.held += dt; } else a.held = 0;
        if (a.held > (st.hold || 0) && (st.hold || st.ok(A, B, a.mem))) {
          a.step++; a.mem = {}; a.held = 0; a.note = '';
          if (a.step >= a.def.steps.length) { a.done = true; SC.progress.mix[a.def.id] = 1; persist(); }
          O.emit('school', a);
        }
      }
    }
    const b = SC.beatActive;
    if (b && !b.done) {
      const st = b.def.steps[b.step];
      if (st.ok(b.mem, b.keep)) {
        b.step++; b.mem = {};
        if (b.step >= b.def.steps.length) { b.done = true; SC.progress.beat[b.def.id] = 1; persist(); }
        else if (b.def.steps[b.step].enter) b.def.steps[b.step].enter(b.mem, b.keep);
        O.emit('beat-school', b);
      }
    }
  };
  SC.resetProgress = function () { SC.progress = { mix: {}, gigs: {}, beat: {} }; persist(); };
})();
