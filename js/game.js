/* ORBIT DJ v2 — career, rhythm gameplay, scoring, controller lessons and challenges.
 * Ported from the v1 Arcade prototype. Per-note points, star thresholds, timing windows and
 * saved-progress keys are unchanged so existing players keep their records.
 * v2.2 adds band-game mechanics on top: hold notes, HYPE (charge with glowing phrases, fire for
 * double points), a crowd meter that can end the set above Rookie, miss feedback, full-length
 * sets with a finale hit, and short drills used by the first-run tutorial.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, M = O.music, S = O.store, Synth = O.synth;

  const VENUES = [
    { name: 'BEDROOM DJ', song: 'The First Groove', tag: 'Feel the pulse. Own the backbeat.', bpm: 88, style: 'boombap', teaches: 'Rhythm, downbeats, performance pads' },
    { name: 'HOUSE PARTY', song: 'Basement Bounce', tag: 'Keep the groove moving.', bpm: 104, style: 'jazzhop', teaches: 'Cue, play/pause, crossfader blends' },
    { name: 'UNDERGROUND CLUB', song: 'Neon Pressure', tag: 'Catch the syncopation.', bpm: 128, style: 'house', teaches: 'Low EQ and bass swaps' },
    { name: 'MAIN STAGE', song: 'Final Frequency', tag: 'Everything comes together.', bpm: 140, style: 'dark', teaches: 'Filter sweeps and the full set' }
  ];
  const DIFFS = { easy: { label: 'ROOKIE', window: 0.19 }, normal: { label: 'CLUB', window: 0.13 }, expert: { label: 'HEADLINER', window: 0.085 } };
  const LANES = [{ name: 'KICK', key: 'f' }, { name: 'SNARE', key: 'j' }, { name: 'HAT', key: 'k' }, { name: 'FX', key: 'l' }];
  const MISS_AFTER = 0.21, TAIL = 2.2;
  // About a minute of music, rounded to whole 8-bar phrases.
  const barsFor = bpm => Math.max(16, Math.round(58 / (240 / bpm) / 8) * 8);
  const CROWD = { easy: { hit: 0.03, miss: 0.035, off: 0.015 }, normal: { hit: 0.03, miss: 0.045, off: 0.02 }, expert: { hit: 0.03, miss: 0.055, off: 0.03 } };
  const STREAKS = [25, 50, 100, 150, 200, 300];

  // Tutorial drills: tiny charts at 88 BPM over a metronome. notes(beat, leadIn) -> chart, pass(G) -> done.
  const every = (L, b, bars, lane, beats, extra) => { const out = []; for (let bar = 0; bar < bars; bar++) for (const x of beats) out.push(Object.assign({ t: L + (bar * 4 + x) * b, lane, done: false }, extra && extra(bar))); return out; };
  const DRILLS = {
    kick: { bars: 4, notes: (b, L) => every(L, b, 4, 0, [0, 2]), pass: g => g.hits >= 4, goal: 4, count: g => g.hits },
    snare: { bars: 4, notes: (b, L) => every(L, b, 4, 1, [1, 3]), pass: g => g.hits >= 4, goal: 4, count: g => g.hits },
    beat: { bars: 4, notes: (b, L) => every(L, b, 4, 0, [0, 2]).concat(every(L, b, 4, 1, [1, 3]), every(L, b, 2, 2, [0.5, 2.5]).map(n => (n.t += 8 * b, n))), pass: g => g.hits >= 10, goal: 10, count: g => g.hits },
    hold: { bars: 4, notes: (b, L) => every(L, b, 4, 3, [0], () => ({ dur: 2 * b })), pass: g => g.holdsDone >= 1, goal: 1, count: g => g.holdsDone },
    hype: { bars: 4, notes: (b, L) => every(L, b, 4, 0, [0, 2], bar => ({ hype: bar })).concat(every(L, b, 4, 1, [1, 3], bar => ({ hype: bar }))), pass: g => g.hypeUses >= 1, goal: 1, count: g => g.hypeUses, phraseGain: 0.5 }
  };
  const DRILL_ORDER = ['kick', 'snare', 'beat', 'hold', 'hype'];

  // Controller education. Each entry covers: name, purpose, sound demo, best practice,
  // common mistakes, interactive challenge, and live feedback (see controlInput).
  const LESSONS = [
    { id: 'pads', name: 'PERFORMANCE PADS', control: 'Pads',
      purpose: 'Pads trigger sounds instantly: kick, snare, hi-hat and an FX zap. Every tap adds a real hit to the mix.',
      practice: 'Lock in with the kick and snare first. Count “1 2 3 4” with the beat and tap on the count, not after it.',
      mistakes: ['Watching the screen and ignoring the beat you hear', 'Mashing extra taps after a miss', 'Rushing ahead when the combo gets big'],
      challenge: 'Hit 4 notes in time, build an 8-note streak, then land 16 hits.', demo: 'pads' },
    { id: 'cue', name: 'CUE + PLAY / PAUSE', control: 'Cue & Play',
      purpose: 'On real decks, Cue lets you hear and set the next track’s start point before the crowd does. Play/Pause starts and stops the deck.',
      practice: 'Prepare your cue early, then press Play right on beat 1 so the new track lands on the downbeat.',
      mistakes: ['Pressing Play in the middle of a phrase', 'Mixing up Cue and Play', 'Forgetting that ORBIT’s cue preview plays through the main speakers (real gear sends it to headphones)'],
      challenge: 'Press CUE to preview the incoming sound before the set, then start the set.', demo: 'cue' },
    { id: 'xf', name: 'CROSSFADER (LAYER BLEND)', control: 'Crossfader',
      purpose: 'A crossfader blends between two sources. On a real controller that is Deck A and Deck B. In ORBIT it blends the melody and bass layers of one backing track, so you can practise fader technique. It is not two-deck mixing yet.',
      practice: 'Move it gradually over a phrase (8 or 16 bars). Centre means both sides are playing.',
      mistakes: ['Slamming from one end to the other', 'Leaving it parked on one side and forgetting', 'Letting two full basslines play together'],
      challenge: 'During the set, move to MELODY, then BASS, then back to centre.', demo: 'xf' },
    { id: 'eq', name: 'LOW EQ / BASS SWAP', control: 'Low EQ',
      purpose: 'The low EQ turns the bass range (roughly below 250 Hz: kick and bassline) up or down without changing the rest.',
      practice: 'Cut the outgoing bass before the next bassline comes in. That is a bass swap. Return to 100%, not above.',
      mistakes: ['Two full basslines at once (muddy, clipping)', 'Boosting EQ to make things louder', 'Swapping bass halfway through a phrase'],
      challenge: 'Cut the bass below 40%, hold it for one beat, then restore it to at least 95%.', demo: 'eq' },
    { id: 'filter', name: 'FILTER SWEEP', control: 'Filter',
      purpose: 'A low-pass filter removes high frequencies, so the music sounds darker and muffled. DJs sweep it for build-ups and transitions.',
      practice: 'Make short, intentional sweeps timed to a phrase. Open it fully again before the drop.',
      mistakes: ['Leaving the filter half-closed', 'Sweeping all the time so it stops meaning anything', 'Forgetting to reopen it'],
      challenge: 'Close the filter below 900 Hz, hold it for one beat, then reopen it above 7000 Hz.', demo: 'filter' }
  ];
  const STAGE_LESSONS = [[0], [1, 2], [3], [4]];
  // Which mixer controls are revealed at each venue (progressive disclosure, as in v1).
  const STAGE_CONTROLS = [[], ['cue', 'play', 'xf'], ['cue', 'play', 'xf', 'eq'], ['cue', 'play', 'xf', 'eq', 'filter']];

  const CHALLENGES = [
    { name: 'Pad performance', tasks: ['Hit four notes in time', 'Build an eight-note streak', 'Hit sixteen notes in time'] },
    { name: 'Cue and blend', tasks: ['Preview the next layer before starting', 'Start the set after cueing', 'Move blend to melody, then bass, then center during playback'] },
    { name: 'EQ bass swap', tasks: ['Cut low EQ below 40% during playback', 'Hold the bass cut for one musical beat', 'Restore low EQ to at least 95% during playback'] },
    { name: 'Filter sweep', tasks: ['Close filter below 900 Hz during playback', 'Hold the sweep for one musical beat', 'Reopen filter above 7000 Hz during playback'] }
  ];

  // v1 storage keys kept so saved progress carries over.
  const KEY_PROGRESS = 'orbitArcadeProgress', KEY_CTRL = 'orbitArcadeControllerBestV1', KEY_COMBINED = 'orbitArcadeCombinedV11';

  const G = (O.game = {
    VENUES, DIFFS, LANES, LESSONS, STAGE_LESSONS, STAGE_CONTROLS, CHALLENGES, DRILLS, DRILL_ORDER, barsFor,
    stage: O.clamp(Number(S.get('orbitV2Stage', 0)) || 0, 0, 3),
    difficulty: DIFFS[S.get('orbitV2Difficulty', 'easy')] ? S.get('orbitV2Difficulty', 'easy') : 'easy',
    styleChoice: (v => (v === 'hiphop' ? 'boombap' : v === 'house' || v === 'dark' || v === 'auto' || window.ORBIT.music.STYLES[v] ? v : 'auto'))(S.get('orbitV2Style', 'auto')),
    guideMode: S.get('orbitV2Guide', 'auto'),
    padSound: S.get('orbitV2PadSound', 'drums'),
    chopBank: S.get('orbitV2ChopBank', 'soul'),
    state: 'idle', notes: [], startAt: 0, elapsed: 0, leadIn: 2.7,
    score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0, off: 0 },
    progress: S.get(KEY_PROGRESS, {}) || {},
    ctrlBests: S.get(KEY_CTRL, {}) || {},
    combinedBests: S.get(KEY_COMBINED, {}) || {},
    challenge: null, lastResult: null, pauseReason: '',
    bars: barsFor(88), duration: 0, crowd: 0.5, hype: 0, hypeActive: false, hypeUses: 0, holdsDone: 0, holdsTotal: 0, holding: {}, phrases: {}, drill: null
  });
  Object.defineProperty(G, 'DURATION', { get: () => G.duration || G.plannedDuration() });

  G.bpm = () => (G.drill ? 88 : VENUES[G.stage].bpm);
  G.styleFor = () => (G.drill ? 'boombap' : M.resolve(G.styleChoice === 'auto' ? VENUES[G.stage].style : G.styleChoice));
  G.plannedDuration = () => { const b = 60 / G.bpm(); return Math.max(2.7, 4 * b + 0.3) + barsFor(G.bpm()) * 4 * b + TAIL; };
  G.songEnd = () => G.leadIn + G.bars * 240 / G.bpm(); // song time of the finale hit
  const FX = ['impact', 'crowd', 'miss', 'riser'];
  // How loudly the backing plays the drum hits you're supposed to play (timing assist).
  G.guideLevel = () => G.guideMode === 'off' ? 0 : G.guideMode === 'on' ? 0.55 : ({ easy: 0.5, normal: 0.28, expert: 0 })[G.difficulty];
  G.setGuide = function (m) { G.guideMode = m; S.set('orbitV2Guide', m); O.emit('guide', m); };
  G.controlsFor = st => STAGE_CONTROLS[st === undefined ? G.stage : st];

  // ---------- note chart (identical patterns to v1) ----------
  // v2.1: notes are charted from the song's own drum parts (see music.js chartAt).
  function makeNotes(stage, level, leadIn) { return M.chartSet(G.styleFor(), VENUES[stage].bpm, leadIn, barsFor(VENUES[stage].bpm), level, stage); }
  // v1 charts, kept for reference and tests.
  function makeNotesV1(stage, level, leadIn) {
    const b = 60 / VENUES[stage].bpm, list = [];
    for (let n = 0; leadIn + n * b < 24 - 1; n++) {
      const t = leadIn + n * b;
      const lane = stage === 0 ? (n % 4 === 0 ? 0 : n % 4 === 2 ? 1 : 2)
        : stage === 1 ? (n % 4 === 0 ? 0 : n % 4 === 2 ? 1 : n % 2 ? 2 : 3)
          : (n % 4 === 0 ? 0 : n % 4 === 2 ? 1 : n % 3 === 0 ? 3 : 2);
      list.push({ t, lane, done: false });
      if (level !== 'easy' && n % 2 === 0 && stage > 0) list.push({ t: t + b / 2, lane: (lane + 2) % 4, done: false });
      if (level === 'expert' && n % 4 === 0) list.push({ t: t + b * 0.75, lane: 3, done: false });
    }
    return list.sort((a, b2) => a.t - b2.t);
  }
  G.makeNotes = makeNotes; G.makeNotesV1 = makeNotesV1;

  // ---------- selection ----------
  G.select = function (stage) {
    if (G.state === 'running' || G.state === 'paused') G.stop();
    G.stage = O.clamp(stage, 0, 3);
    S.set('orbitV2Stage', G.stage);
    G.state = 'idle';
    resetLessonFeedback();
    challengeReset();
    O.emit('stage', G.stage);
    O.emit('game-state', G.state);
  };
  G.setDifficulty = function (d) {
    if (!DIFFS[d]) return;
    if (G.state === 'running' || G.state === 'paused') G.stop();
    G.difficulty = d; S.set('orbitV2Difficulty', d);
    O.emit('difficulty', d);
  };
  G.setStyle = function (s) {
    G.styleChoice = s; S.set('orbitV2Style', s);
    // Notes are charted from the song, so a new backing applies from the next set.
    if (G.state === 'running' || G.state === 'paused') O.toast('New backing track starts with your next set.');
    else O.assets.ensure(M.assetsFor(G.styleFor()));
    O.emit('style', s);
  };
  G.setPadSound = function (mode, bank) {
    if (mode) { G.padSound = mode; S.set('orbitV2PadSound', mode); }
    if (bank) { G.chopBank = bank; S.set('orbitV2ChopBank', bank); }
    O.emit('pad-sound', { mode: G.padSound, bank: G.chopBank });
  };

  // ---------- transport ----------
  let wakeLock = null;
  function holdScreen() { try { if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {}); } catch (e) {} }
  function releaseScreen() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

  function resetRun() {
    G.score = G.combo = G.maxCombo = G.hits = G.misses = 0;
    G.counts = { perfect: 0, great: 0, good: 0, miss: 0, off: 0 };
    dropHolds();
    G.crowd = 0.5; G.hype = 0; G.hypeActive = false; G.hypeUses = 0; G.holdsDone = 0; G.failed = false;
    G.holdsTotal = G.notes.filter(n => n.dur).length;
    G.phrases = {};
    for (const n of G.notes) if (n.hype !== undefined) { const ph = G.phrases[n.hype] || (G.phrases[n.hype] = { total: 0, hit: 0, dead: false }); ph.total++; }
    holdCarry = 0; lastNow = null; lastMissFx = -9; finaleDone = false;
  }
  let holdCarry = 0, lastNow = null, lastMissFx = -9, finaleDone = false;

  // Shared by sets and drills: clock, state and backing track.
  function launch(music) {
    const c = E.ctx, beat = 60 / G.bpm();
    G.leadIn = Math.max(2.7, 4 * beat + 0.3);
    G.duration = G.leadIn + G.bars * 4 * beat + (G.drill ? 0.4 : TAIL);
    G.startAt = c.currentTime + 0.15;
    G.elapsed = 0;
    G.state = 'running';
    G.setStyleLocked = G.styleFor();
    M.start(Object.assign({ style: G.setStyleLocked, bpm: G.bpm(), origin: G.startAt + G.leadIn, countIn: true, endAt: G.startAt + G.songEnd() - 0.01 }, music));
    holdScreen();
  }
  const setMusic = () => ({ mode: 'set', guide: G.guideLevel(), chartRule: chartRule(), form: G.bars });
  const drillMusic = () => ({ mode: 'bare', click: true });

  G.start = async function () {
    if (O.sampler) O.sampler.stopAll();
    if (M.playing) M.stop();
    const prepared = G.stage === 1 && G.challenge && G.challenge.cueReady;
    const ok = await E.ensureRunning();
    if (!ok) { O.emit('needs-audio', 'start'); return false; }
    O.emit('loading', true);
    G.drill = null;
    await O.assets.ensure(M.assetsFor(G.styleFor()).concat(FX.map(O.assets.fxPath)), 2500);
    O.emit('loading', false);
    G.stop(true);
    const beat = 60 / G.bpm();
    G.bars = barsFor(G.bpm());
    G.notes = makeNotes(G.stage, G.difficulty, Math.max(2.7, 4 * beat + 0.3));
    resetRun();
    challengeReset();
    if (prepared) { G.challenge.cueReady = true; award('Cue prepared before set'); }
    launch(setMusic());
    G.challenge.started = true;
    observe();
    O.emit('game-state', G.state);
    O.emit('stats');
    return true;
  };

  // ---------- tutorial drills ----------
  function drillRun() {
    const d = G.drill, beat = 60 / 88;
    G.bars = d.bars;
    G.notes = d.notes(beat, Math.max(2.7, 4 * beat + 0.3)).sort((a, b) => a.t - b.t);
    const keep = d.id === 'hype' && d.tries ? G.hype : 0; // a charged meter survives a retry
    resetRun();
    G.hype = keep;
    d.passed = false; d.passAt = 0;
    launch(drillMusic());
    O.emit('game-state', G.state);
    O.emit('stats');
  }
  G.startDrill = async function (id) {
    if (!DRILLS[id]) return false;
    if (O.sampler) O.sampler.stopAll();
    const ok = await E.ensureRunning();
    if (!ok) { O.emit('needs-audio', 'drill'); return false; }
    G.stop(true);
    G.drill = Object.assign({ id, tries: 0 }, DRILLS[id]);
    await O.assets.ensure(M.assetsFor('boombap').concat(FX.map(O.assets.fxPath)), 2500);
    if (!G.drill || G.drill.id !== id) return false; // tutorial was closed while loading
    drillRun();
    O.emit('drill', { id, status: 'start' });
    return true;
  };
  G.endDrill = function () { if (!G.drill) return; G.drill = null; G.stop(); };
  function drillUpdate(now) {
    const d = G.drill;
    if (!d.passed && d.pass(G)) { d.passed = true; d.passAt = now; O.emit('drill', { id: d.id, status: 'pass' }); }
    if (d.passed && now > d.passAt + 1.3) { const id = d.id; G.drill = null; G.stop(); O.emit('drill', { id, status: 'done' }); return; }
    if (!d.passed && now >= G.duration) { d.tries++; O.emit('drill', { id: d.id, status: 'retry', tries: d.tries }); drillRun(); }
  }

  G.pause = function (reason) {
    if (G.state !== 'running') return;
    if (G.drill) { G.endDrill(); O.emit('drill', { status: 'abort' }); return; }
    dropHolds();
    G.elapsed = (E.ctx ? E.ctx.currentTime : 0) - G.startAt;
    G.heardAtPause = G.songTime();
    G.state = 'paused';
    G.pauseReason = reason || '';
    M.stop();
    releaseScreen();
    O.emit('game-state', G.state);
  };

  G.resume = async function () {
    if (G.state !== 'paused') return false;
    const ok = await E.ensureRunning();
    if (!ok) { O.emit('needs-audio', 'resume'); return false; }
    const c = E.ctx;
    G.startAt = c.currentTime + 0.35 - G.elapsed;
    G.state = 'running';
    G.pauseReason = '';
    lastNow = null;
    if (G.elapsed < G.songEnd() - 0.05) M.start(Object.assign({ style: G.setStyleLocked || G.styleFor(), bpm: G.bpm(), origin: G.startAt + G.leadIn, endAt: G.startAt + G.songEnd() - 0.01 }, setMusic()));
    holdScreen();
    O.emit('game-state', G.state);
    return true;
  };

  function chartRule() { return { lvl: { easy: 0, normal: 1, expert: 2 }[G.difficulty], single: G.difficulty !== 'expert', stage: G.stage }; }

  G.togglePause = () => (G.state === 'running' ? G.pause('user') : G.state === 'paused' ? G.resume() : G.start());

  G.stop = function (silent) {
    if (G.state === 'running') G.elapsed = E.ctx.currentTime - G.startAt;
    dropHolds();
    G.hypeActive = false;
    if (!silent) G.drill = null;
    G.state = 'idle';
    M.stop();
    releaseScreen();
    if (!silent) O.emit('game-state', G.state);
  };

  // Heard song time: what the player is hearing now, corrected for output latency + calibration.
  G.songTime = function (perfMs) {
    if (G.state === 'paused') return G.heardAtPause || 0;
    if (G.state !== 'running' && G.state !== 'finished') return 0;
    return E.heard(perfMs) - G.startAt;
  };

  // ---------- input / judgement ----------
  G.tapSound = function (lane) {
    if (!E.isRunning()) return;
    const c = E.ctx, t = c.currentTime + 0.004;
    if (G.padSound === 'chops') Synth.chop(c, E.nodes.pads, G.chopBank, lane, t);
    else {
      const snd = M.laneSound(G.state === 'running' && G.setStyleLocked ? G.setStyleLocked : G.styleFor(), lane);
      if (G.state === 'running') { const now = G.songTime(); const n = G.notes.find(x => x.lane === lane && Math.abs(x.t - now) < 0.2); if (n && n.pad !== undefined) snd.pad = n.pad; }
      Synth.kit(c, E.nodes.pads, snd.kit, snd.pad, t, { vel: 1 });
    }
  };

  G.tap = function (lane, perfMs) {
    G.tapSound(lane);
    O.emit('pad', lane);
    if (G.state !== 'running') return null;
    const now = G.songTime(perfMs), win = G.drill ? DIFFS.easy.window : DIFFS[G.difficulty].window;
    let best = null, bestErr = Infinity;
    for (const n of G.notes) {
      if (n.done || n.lane !== lane) continue;
      const err = Math.abs(n.t - now);
      if (err <= win && err < bestErr) { best = n; bestErr = err; }
      if (n.t - now > win) break;
    }
    let kind;
    if (!best) {
      if (now > G.songEnd() + 0.3) return null; // free taps over the outro
      G.combo = 0; G.counts.off++; kind = 'off'; crowdMove(-CROWD[G.difficulty].off);
    } else {
      best.done = true; best.hit = true;
      G.hits++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
      kind = bestErr < 0.055 ? 'perfect' : bestErr < 0.11 ? 'great' : 'good';
      G.counts[kind]++;
      G.score += ({ perfect: 150, great: 100, good: 65 })[kind] * G.multiplier() * (G.hypeActive ? 2 : 1);
      crowdMove(CROWD[G.difficulty].hit * (G.hypeActive ? 2 : 1));
      if (best.hype !== undefined) phraseHit(best);
      if (best.dur) startHold(best, lane);
      if (STREAKS.includes(G.combo)) O.emit('streak', G.combo);
    }
    O.emit('judge', { lane, kind, err: best ? now - best.t : 0, hype: !!(best && best.hype !== undefined), hold: !!(best && best.dur) });
    observe();
    O.emit('stats');
    return kind;
  };

  // ---------- hold notes ----------
  function startHold(n, lane) {
    let snd = null;
    if (E.isRunning()) {
      const buf = O.assets.get(O.assets.fxPath('riser'));
      snd = Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('riser'), E.ctx.currentTime + 0.005, 0.5);
      if (snd && buf) snd.src.playbackRate.value = O.clamp(buf.duration / n.dur, 0.5, 2.5);
    }
    n.held = 0;
    G.holding[lane] = { n, snd, last: n.t };
  }
  function endHold(lane, complete) {
    const h = G.holding[lane]; if (!h) return;
    delete G.holding[lane];
    if (h.snd && E.ctx) { const t = E.ctx.currentTime; try { h.snd.gain.gain.setTargetAtTime(0, t, complete ? 0.06 : 0.025); h.snd.src.stop(t + 0.3); } catch (e) {} }
    if (complete) { h.n.holdDone = true; G.holdsDone++; crowdMove(CROWD[G.difficulty].hit); } else h.n.dropped = true;
    O.emit('hold', { lane, complete });
  }
  function dropHolds() { for (const lane of Object.keys(G.holding)) endHold(Number(lane), false); }
  // Letting go early just stops the hold paying out; it never breaks the streak.
  G.release = function (lane) {
    const h = G.holding[lane]; if (!h || G.state !== 'running') return;
    if (G.songTime() < h.n.t + h.n.dur - 0.12) endHold(lane, false);
  };
  function holdUpdate(now) {
    for (const lane of Object.keys(G.holding)) {
      const h = G.holding[lane], end = h.n.t + h.n.dur, cur = Math.min(now, end);
      if (cur > h.last) {
        holdCarry += (cur - h.last) / h.n.dur * 200 * G.multiplier() * (G.hypeActive ? 2 : 1);
        h.n.held = (cur - h.n.t) / h.n.dur; h.last = cur;
        const whole = Math.floor(holdCarry); if (whole) { G.score += whole; holdCarry -= whole; }
      }
      if (now >= end) endHold(Number(lane), true);
    }
  }

  // ---------- HYPE ----------
  function phraseHit(n) {
    const ph = G.phrases[n.hype]; if (!ph || ph.dead) return;
    if (++ph.hit >= ph.total) { G.hype = Math.min(1, G.hype + (G.drill && G.drill.phraseGain || 0.25)); O.emit('hype', { type: 'phrase', ready: G.hype >= 0.5 }); }
  }
  G.hypeReady = () => G.state === 'running' && !G.hypeActive && G.hype >= 0.5;
  G.activateHype = function () {
    if (!G.hypeReady()) return false;
    G.hypeActive = true; G.hypeUses++;
    if (E.isRunning()) { const t = E.ctx.currentTime + 0.005; Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('impact'), t, 0.55); Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('crowd'), t, 0.4); }
    O.emit('hype', { type: 'on' });
    O.emit('stats');
    return true;
  };
  function hypeUpdate(dt) {
    if (!G.hypeActive) return;
    G.hype -= dt / (8 * 240 / G.bpm()); // a full meter lasts eight bars
    if (G.hype <= 0) { G.hype = 0; G.hypeActive = false; O.emit('hype', { type: 'off' }); O.emit('stats'); }
  }

  // ---------- crowd ----------
  function crowdMove(d) {
    if (G.drill) return;
    G.crowd = O.clamp(G.crowd + d, G.difficulty === 'easy' ? 0.06 : 0, 1);
  }
  G.canFail = () => G.difficulty !== 'easy' && !G.drill && !G.noFail; // noFail: test hook only
  function missFx() {
    if (G.drill || !E.isRunning()) return;
    const t = E.ctx.currentTime;
    if (t - lastMissFx < 0.45) return;
    lastMissFx = t;
    Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('miss'), t + 0.005, 0.3);
    M.dip(0.3, 0.2);
  }

  G.multiplier = () => Math.min(4, 1 + Math.floor(G.combo / 8));
  G.accuracy = () => { const j = G.hits + G.misses; return j ? G.hits / j : null; };
  G.liveStars = () => { const a = G.accuracy(); return a === null ? 0 : Math.min(3, Math.floor(a * 3.2)); };

  // Called every animation frame.
  G.update = function () {
    if (G.state !== 'running') return;
    const now = G.songTime();
    let changed = false;
    for (const n of G.notes) {
      if (n.t > now) break;
      if (!n.done && now > n.t + MISS_AFTER) {
        n.done = true; G.misses++; G.counts.miss++; G.combo = 0; changed = true;
        if (n.hype !== undefined && G.phrases[n.hype]) G.phrases[n.hype].dead = true;
        crowdMove(-CROWD[G.difficulty].miss); missFx();
        O.emit('judge', { lane: n.lane, kind: 'miss', err: 0 });
      }
    }
    const dt = lastNow === null ? 0 : Math.max(0, now - lastNow); lastNow = now;
    holdUpdate(now);
    hypeUpdate(dt);
    if (changed) O.emit('stats');
    if (G.drill) { drillUpdate(now); return; }
    observe();
    // Finale: the last downbeat lands with an impact, and the crowd answers as loudly as you earned.
    if (!finaleDone && now >= G.songEnd() - 0.12) {
      finaleDone = true;
      if (E.isRunning()) {
        const t = Math.max(E.ctx.currentTime + 0.005, G.startAt + G.songEnd());
        Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('impact'), t, 0.8);
        Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('crowd'), t + 0.08, 0.25 + 0.55 * G.crowd);
      }
      O.emit('finale');
    }
    if (G.canFail() && G.crowd <= 0) { finish(true); return; }
    if (now >= G.duration) finish(false);
  };

  function finish(failed) {
    failed = failed === true;
    dropHolds();
    G.hypeActive = false;
    G.failed = failed;
    G.state = 'finished';
    M.stop();
    if (failed && E.isRunning()) Synth.oneShot(E.ctx, E.nodes.pads, O.assets.fxPath('miss'), E.ctx.currentTime + 0.01, 0.5);
    releaseScreen();
    const st = G.stage, diff = G.difficulty, key = st + ':' + diff;
    const total = G.hits + G.misses, accuracy = total ? G.hits / total : 0;
    const stars = failed ? 0 : accuracy >= 0.92 ? 3 : accuracy >= 0.75 ? 2 : accuracy >= 0.5 ? 1 : 0;
    const old = G.progress[st] || { score: 0, stars: 0 };
    const newBest = !failed && G.score > (old.score || 0);
    if (!failed) {
      G.progress[st] = { score: Math.max(old.score || 0, G.score), stars: Math.max(old.stars || 0, stars) };
      S.set(KEY_PROGRESS, G.progress);
    }

    const ctrl = G.challenge ? G.challenge.points : 0;
    if (!failed) G.ctrlBests[key] = Math.max(G.ctrlBests[key] || 0, ctrl);
    S.set(KEY_CTRL, G.ctrlBests);
    const ctrlGrade = ctrl === 300 ? 'A' : ctrl >= 200 ? 'B' : ctrl >= 100 ? 'C' : 'INCOMPLETE';

    const rhythmPts = Math.round(accuracy * 700), equipmentPts = Math.round(ctrl / 300 * 300), combined = rhythmPts + equipmentPts;
    const grade = failed ? 'FAILED' : combined >= 900 ? 'S' : combined >= 750 ? 'A' : combined >= 550 ? 'B' : combined >= 350 ? 'C' : 'PRACTICE';
    const prevCombined = G.combinedBests[key] || 0;
    if (!failed) G.combinedBests[key] = Math.max(prevCombined, combined);
    S.set(KEY_COMBINED, G.combinedBests);

    G.lastResult = { stage: st, difficulty: diff, score: G.score, accuracy, stars, newBest, maxCombo: G.maxCombo, counts: Object.assign({}, G.counts),
      ctrl, ctrlBest: G.ctrlBests[key] || 0, ctrlGrade, rhythmPts, equipmentPts, combined, grade, newCombinedBest: !failed && combined > prevCombined, cleared: stars > 0,
      failed, hypeUses: G.hypeUses, holdsDone: G.holdsDone, holdsTotal: G.holdsTotal, crowd: G.crowd, progressPct: failed ? O.clamp((G.songTime() - G.leadIn) / (G.songEnd() - G.leadIn), 0, 1) : 1 };
    O.emit('game-state', G.state);
    O.emit('finish', G.lastResult);
  }
  G._finishForTest = finish;

  // ---------- career stats ----------
  G.totals = function () {
    const recs = Object.values(G.progress);
    return {
      stars: recs.reduce((n, r) => n + (r.stars || 0), 0),
      best: Math.max(0, ...recs.map(r => r.score || 0)),
      cleared: recs.filter(r => r.stars >= 1).length
    };
  };
  G.resetProgress = function () {
    G.progress = {}; G.ctrlBests = {}; G.combinedBests = {};
    S.remove(KEY_PROGRESS); S.remove(KEY_CTRL); S.remove(KEY_COMBINED);
    O.emit('progress-reset');
  };

  // ---------- controller challenge (v1 logic) ----------
  function challengeActive() { return G.state === 'running' && !G.drill && E.isRunning(); }
  function challengeReset() {
    G.challenge = { stage: G.stage, step: 0, points: 0, log: [], cueReady: false, started: false, blendPhase: 0, holdStart: null, finished: false, hint: '' };
    O.emit('challenge', G.challenge);
  }
  function award(label) {
    const ch = G.challenge;
    if (!ch || ch.finished || ch.stage !== G.stage) return;
    ch.points += 100; ch.log.push('+100 · ' + label); ch.step++; ch.hint = '';
    if (ch.step >= 3) ch.finished = true;
    O.emit('challenge', ch);
    O.emit('award', label);
  }
  function observe() {
    const ch = G.challenge;
    if (!ch || !challengeActive() || ch.finished || ch.stage !== G.stage) return;
    const c = ch.step, now = E.ctx.currentTime, st = G.stage;
    if (st === 0) {
      if (c === 0 && G.hits >= 4) award('Four clean notes');
      else if (c === 1 && G.combo >= 8) award('Eight-note streak');
      else if (c === 2 && G.hits >= 16) award('Sixteen hits');
    } else if (st === 1) {
      if (c === 1 && ch.cueReady && ch.started) award('Set started after cue');
    } else {
      const v = st === 2 ? E.controls.lowEq : E.controls.filterHz;
      const cut = st === 2 ? v < 40 : v < 900, open = st === 2 ? v >= 95 : v >= 7000;
      if (c === 0 && cut) { ch.holdStart = now; award(st === 2 ? 'Bass cut' : 'Filter closed'); }
      else if (c === 1) {
        if (!cut) { ch.holdStart = null; if (ch.hint !== 'hold') { ch.hint = 'hold'; O.emit('challenge', ch); } }
        else { if (ch.holdStart === null) ch.holdStart = now; if (now - ch.holdStart >= 60 / G.bpm()) award('Held for one beat'); }
      } else if (c === 2 && open) award(st === 2 ? 'Bass restored' : 'Filter reopened');
    }
  }
  G.observe = observe;
  G.challengeText = function () {
    const ch = G.challenge, info = CHALLENGES[G.stage];
    if (!ch) return '';
    if (ch.finished) return 'All equipment tasks complete. Finish the set to bank your grade.';
    if (ch.hint === 'hold') return 'Keep the control low for one beat before restoring.';
    if (ch.hint === 'cue-early') return 'Prepare Cue before starting your next set.';
    if (ch.hint === 'blend1') return 'Now bring the bass layer in.';
    if (ch.hint === 'blend2') return 'Return to the center.';
    return info.tasks[Math.min(ch.step, 2)];
  };

  // ---------- DJ controls: lesson feedback + challenge hooks (v1 messages) ----------
  let fb = { goal: 0, touched: false };
  function resetLessonFeedback() { fb = { goal: 0, touched: false }; G.feedback = 'Try the unlocked controls while the song plays.'; O.emit('feedback', G.feedback); }
  function say(msg) { G.feedback = msg; O.emit('feedback', msg); }

  G.cue = async function () {
    await E.ensureRunning();
    if (E.isRunning()) {
      // Preview the incoming layer: the song's first chord on its lead instrument.
      const sty = M.STYLES[G.styleFor()], inst = sty.inst[0], t = E.ctx.currentTime + 0.01;
      sty.chords[0].forEach(m => Synth.inst(E.ctx, E.nodes.pads, inst, m, t, { dur: 0.5, vel: 0.5 }));
    }
    say('CUE PREVIEW HEARD! On real DJ equipment, cue can route privately to headphones.');
    const ch = G.challenge;
    if (G.stage === 1 && ch && ch.step === 0 && G.state !== 'running') { ch.cueReady = true; award('Cue prepared before set'); }
    else if (G.stage === 1 && G.state === 'running' && ch && ch.step === 0) { ch.hint = 'cue-early'; O.emit('challenge', ch); }
  };

  G.controlInput = function (name, value) {
    E.setControl(name, value);
    const ch = G.challenge;
    if (name === 'xf') {
      if (fb.goal === 0 && value < 15) { fb.goal = 1; say('NICE! Now move toward BASS.'); }
      else if (fb.goal === 1 && value > 85) { fb.goal = 2; say('GOOD! Return to center.'); }
      else if (fb.goal === 2 && value >= 45 && value <= 55) say('BLEND CHALLENGE COMPLETE! You heard both layers change.');
      if (G.stage === 1 && challengeActive() && ch && ch.step === 2) {
        if (ch.blendPhase === 0 && value <= 15) { ch.blendPhase = 1; ch.hint = 'blend1'; O.emit('challenge', ch); }
        else if (ch.blendPhase === 1 && value >= 85) { ch.blendPhase = 2; ch.hint = 'blend2'; O.emit('challenge', ch); }
        else if (ch.blendPhase === 2 && value >= 45 && value <= 55) award('Three-position blend');
      }
    } else if (name === 'lowEq') {
      if (value < 40) { fb.touched = true; say('BASS CUT! Now restore to 100%.'); }
      else if (fb.touched && value >= 98) say('EQ CHALLENGE COMPLETE!');
      observe();
    } else if (name === 'filterHz') {
      if (value < 900) { fb.touched = true; say('FILTER CLOSED! Now open it fully.'); }
      else if (fb.touched && value > 7000) say('FILTER CHALLENGE COMPLETE!');
      observe();
    }
  };

  // ---------- "hear it" demos for the equipment briefing ----------
  let demoTimer = 0;
  G.demo = async function (kind) {
    if (G.state === 'running') return 'Pause the set to hear the demo.';
    if (!(await E.ensureRunning())) { O.emit('needs-audio', 'demo'); return 'Tap again to enable audio.'; }
    G.stopDemo();
    await O.assets.ensure(M.assetsFor(G.styleFor()), 2000);
    const c = E.ctx, n = E.nodes, bpm = G.bpm(), bar = 240 / bpm, t0 = c.currentTime + 0.1;
    if (kind === 'cue') { G.cue(); return 'Cue preview played.'; }
    M.start({ style: G.styleFor(), bpm, origin: t0, mode: kind === 'pads' ? 'bare' : 'demo', endAt: t0 + bar * 4 });
    const at = t0 + bar * 2;
    if (kind === 'pads') {
      for (let i = 0; i < 8; i++) { const snd = M.laneSound(G.styleFor(), i % 4 === 0 ? 0 : i % 4 === 2 ? 1 : 2); Synth.kit(c, n.pads, snd.kit, snd.pad, at + i * (60 / bpm), { vel: 0.9 }); }
    } else if (kind === 'xf') {
      n.melody.gain.setValueAtTime(1, at); n.bass.gain.setValueAtTime(0, at);
      n.melody.gain.setValueAtTime(0, at + bar); n.bass.gain.setValueAtTime(1, at + bar);
    } else if (kind === 'eq') {
      n.lowShelf.gain.setValueAtTime(-24, at);
    } else if (kind === 'filter') {
      n.lowPass.frequency.setValueAtTime(18000, at); n.lowPass.frequency.exponentialRampToValueAtTime(450, at + bar * 1.5);
    }
    O.emit('demo', { kind, playing: true, changeAt: at, endAt: t0 + bar * 4 });
    demoTimer = setTimeout(() => G.stopDemo(), (t0 + bar * 4 - c.currentTime) * 1000 + 150);
    return 'Bars 1–2: normal. Bars 3–4: ' + ({ pads: 'with pad hits added.', xf: 'melody only, then bass only.', eq: 'bass cut.', filter: 'filter sweeping closed.' })[kind];
  };
  G.stopDemo = function () {
    clearTimeout(demoTimer); demoTimer = 0;
    if (M.playing && (M.mode === 'demo' || M.mode === 'bare')) M.stop();
    if (E.nodes && E.ctx) {
      const n = E.nodes, t = E.ctx.currentTime;
      [n.melody.gain, n.bass.gain, n.lowShelf.gain, n.lowPass.frequency].forEach(p => { try { p.cancelScheduledValues(t); } catch (e) {} });
      E.applyControls();
    }
    O.emit('demo', { playing: false });
  };

  // ---------- system interruptions ----------
  O.on('audio-interrupted', () => { if (G.state === 'running') { G.pause('audio'); O.emit('needs-audio', 'interrupted'); } });
  O.on('app-hidden', () => { if (G.state === 'running') G.pause('background'); G.stopDemo(); });

  challengeReset();
  resetLessonFeedback();
})();
