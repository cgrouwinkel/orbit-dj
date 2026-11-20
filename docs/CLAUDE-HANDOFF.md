# ORBIT DJ — Claude handoff (after v4.3.0, 2026-11-20)

## Source of truth
- This source bundle (`ORBIT-DJ-v2.1.0-source.zip`) replaces earlier bundles and `ORBIT-Arcade-Final-Prototype.zip`.
- Source of truth is now the GitHub repo `cgrouwinkel/orbit-dj` (branch `main`). GitHub Pages serves it at https://cgrouwinkel.github.io/orbit-dj/; pushing to `main` deploys. https://g-bit.netlify.app/ still has the v1 prototype.
- The earlier full two-deck **ORBIT DJ v0.5** (local import, waveforms, cue points, sequencer, recording/export) is **not** in this bundle. Ask the owner for it before claiming any of those features.

## Owner constraints (unchanged)
Personal iPhone only (no computer), deploys to Netlify from iPhone via ZIP upload, free tools only, never use the company-managed iPad to bypass security. Original sounds only; no artist voices or recognizable melodies. Don't claim device testing that didn't happen.

## Architecture (plain scripts, no build step, global `window.ORBIT`)
| File | Role |
|---|---|
| `js/util.js` | `$`, store (localStorage, never throws), event bus `O.on/O.emit`, `O.eventTime(e)` |
| `js/sounds-manifest.js` | Generated list of kits (name + path per pad), instrument roots and fx. Regenerate with `tools/make_sounds.py`. |
| `js/engine.js` | AudioContext lifecycle (gesture unlock, audioSession playback, silent-element fallback, interruption → `audio-interrupted`, stuck-context rebuild via `needsRecreate`), graph (layers → lowshelf → lowpass → glue → music → master → compressor → soft-clip ceiling; reverb return into the lowshelf), levels, DJ controls, smoothed audio clock (`E.now`, `E.heard`, `E.latency`, user offset), voices: `Synth.inst` (pitched samples, oscillator fallback), `Synth.kit` (drum pads), `Synth.oneShot`, legacy `Synth.drum/voice/chop` |
| `js/assets.js` | Fetch early, decode after unlock, per-generation cache (re-decodes after an iOS engine rebuild), embedded base64 for the standalone build |
| `js/music.js` | 6 styles, each an 8-bar form (A / B / fill) with drum specs `[step, vel, chartLevel, pad, 'first']`; `chartAt()` turns drum parts into notes (one note per step on Rookie/Club, priority snare>kick>fx>hat); guide level scales the backing's charted hits; per-style layer trims, sidechain duck, vinyl bed; `renderOffline()` used by tests, previews and WAV bounce |
| `js/game.js` | Venues (each has its own song), charts via `M.chartSet`, judgement (windows 190/130/85 ms), v1 scoring/stars/grades, guide drums setting, controller lessons + challenges, demos, pause/resume, interruption handling |
| `js/beatpad.js` | MPC-style beat pad: event-list patterns A–D (`{{pad, step, velocity, tune}}`), audio-clock sequencer with swing, overdub with `_skip` to avoid double hits, count-in, note repeat (free clock when stopped), 16 Levels, mute/solo/erase, per-kit pad params, choke, undo, backing sync, JSON v1/v2 import/export, WAV bounce via `renderOffline` + `encodeWav` |
| `js/ui.js` | Views, canvas highway + spectrum, faders, overlays (intro, briefing, results, audio, calibration), keyboard, render loop, SW registration |
| `css/orbit.css` | Tokens for `.theme-grunge` / `.theme-aero`; layouts for portrait phone (primary on iPhone), short landscape phone (`max-height: 340px`), iPad/desktop |
| `sw.js` | Network-first, versioned cache. **Bump `VERSION` together with `O.VERSION`** (build.py checks). |

Storage keys: v1 keys kept (`orbitArcadeProgress`, `orbitArcadeTheme` (raw string), `orbitArcadeControllerBestV1`, `orbitArcadeCombinedV11`); new keys are prefixed `orbitV2*`.

Sounds: `python3 tools/make_sounds.py` regenerates `sounds/` and `js/sounds-manifest.js` (deterministic). Build and test: `python3 tools/build.py`, serve `dist/site`, then `node tests/qa.js <url>` (set `PW` to the Playwright module path if needed): 103 checks. `tools/render_previews.js` renders listening previews with the app's own engine.

## Device feedback so far (owner's iPhone, v4.0.0, 2026-11-19)
- The app loads and plays in Safari on her iPhone. She finds it much easier to use upright than sideways; iPad is fine both ways. **Design phone layouts upright first.** Sideways must not overlap, but it is the secondary layout on a phone.
- Real page sizes inside iPhone Safari, measured from her screenshots: about **395 × 702 pt upright** and **737 × 287 pt sideways**. Do not test phone layouts at 844 × 390; Safari's bars never leave that much room. `tests/phone-layout.js` checks both real sizes.
- Sound feedback before that: no voice-like or brass sounds, no bright loud hi-hats, clean song intros. See `CLEAN` and `TOPS_LEVEL` in `js/music.js`.
- v4.0.1 layout fixes have not been confirmed on the phone yet.
- Tutorial feedback: "starts too fast, pause to let user choose song, then learn what buttons to use and why per DJ controller standards". **Nothing in a teaching flow should start without a tap, and every control gets a what / why tied to real controller layout.** v4.1.0 applies this to the first-run tutorial only; the Mix lessons and beat trainer still run on their own pacing.

## Product direction (owner, 2026-11-20)
- She personally wants to learn the beat pad, but to sell the idea the product should lean on **gamifying standard two-deck controller mixing**. Treat the Mix tab's lessons, gigs and Club Night as the core game from here; keep the beat pad as the second track.
- Research note: gamified pad-drumming training is an established product category (Melodics, founded 2014, partnered with Pioneer DJ). One search did not surface an equivalent game for two-deck mixing; that is not proof none exists.
- Tone she asked for: humour. Most DJs start out messing about at home for their friends; the first venue is that, and the first locked-in streak is the "ohhhh" moment.

## v4.3 live-show scene (js/scene.js)
- Both themes since v4.3.1. `drawHighway()` in ui.js reserves a strip (`bandH`, 20 % of the canvas, 32 to 84 pt, none when the canvas is under 150 pt tall) and calls `O.scene.draw(c, W, H, { top, horizon, aero }, G, reduce)` before the lanes; the highway then gets a ~90 % dark surface (navy in Aero) so the room shows through slightly. `topY` moves down by the strip, so notes travel a shorter distance.
- Cyber Aero (v4.3.1): `AERO` holds per-room wall and light colours; Aero-only parts are the window and glass couch (crib), balloons (party), LED-wall equaliser (club, stage), grid floor, rising bubbles, glass sheen, glossy pill speech bubbles, and the crib friend whose phone goes up to film (`phone` option in `person()`, replaces the Grunge `ember`). Keep its draw calls batched (one path per grid / bubbles / bars): painting, not the JS, is what costs frame time.
- `ROOMS[]`: crib, party, club, stage. `roomFor(G)`: drills → crib; Quick Play by style; otherwise `G.stage`.
- People react to `G.crowd`, `G.hypeActive` and the beat phase. Speech bubbles via `O.scene.say(text)`; lines live in `QUIPS`.
- `O.scene.aha()` returns true once per set. `renderHUD()` calls it when the multiplier first reaches 2 and shows the two callouts. `orbitV43Aha` stores that the one-time note was shown.
- Original art only. Do not add characters, logos or art from band games.

## v4.2 rigs, SIMPLE / PRO, pad FX
- Owner brief: act as an expert in current electronic dance music and rap / UK garage production; research what Fred again.., Skepta and similar artists play on; build it in; simple for a beginner, deep enough for someone with mixing history. Research and sources: `docs/RIGS-RESEARCH.md`.
- **Mix level** (mixui.js): `orbitV42MixLevel` = `"simple"` or `"pro"`; `null` until chosen (treated as PRO, and `#ov-level` asks on the first Mix visit). `applyLevel()` sets `html.mix-simple`, which hides controls in CSS only. It is switched off while `SC.active` so lessons, gigs and Club Night always have every control. Tests seed `"pro"`.
- **Pad FX** (decks.js): pad mode `padfx`. `D.brake`, `D.spin`, `D.reload`, `D.echoOut` (own delay line `g.relDelay`, fed per channel through `n.rel`, so the FX unit's settings are untouched), `D.holdFx` (momentary `d.hold.low / hi / mute`, read in `applyAll`; knob and fader values do not change).
- **Tempo range**: `D.setRange(0.06 | 0.10 | 0.16)`; `RANGE` is now a `let` and `D.RANGE` mirrors it. `D.reset()` returns to ±10 so lessons and gigs stay as designed.
- **Half / double sync**: `syncMult(d)` picks 1, 2 or 0.5; `d.syncM` is used for tempo and phase.
- **Beat pad effects** (beatpad.js): `BP.setFx('off' | 'vinyl' | 'lofi')` re-routes `E.nodes.sampler` through a wave-shaper and two filters. Not in the offline bounce.
- **Rigs** (mixui.js): `RIGS[]`, `openRigs()`, `loadRig(id)`; `#ov-rigs`; Setup button `#set-rigs`.

## v4.1 tutorial (ui.js)
- Flow: `#ov-intro` → `#ov-tutsong` (song list, preview on tap, sets `G.tutSong = { style, bpm, name, id }`) → `#ov-map` (controller map; also opened from Setup with `openMap()`) → `#ov-tutstep` card → drill → next card … → `#ov-tutdone`.
- `TUT[]` holds each drill's card text (`real`, `why`, `text`) and the lanes to highlight. `MAP[]` holds the nine controller parts; `mapSvg()` draws the diagram (original schematic, no product artwork).
- `tutCard(i)` shows a card and starts nothing. `tutStep()` starts the drill. On `drill` status `done` the next card opens; there is no auto-advance into a drill.
- Drills use `G.tutSong` for style and tempo (`G.bpm()`, `G.styleFor()`); at 136 BPM and above `drillRun()` doubles the note spacing and bar count (half-time).
- Tutorial sheets do not close on a backdrop tap or Escape while `tut.on`.

## v4.0 additions
- **Song model (music.js):** `M.song` = `{ key, kit, swaps: { bass, keys, lead, vocal }, mutes, beat: { kit, patterns } }`, applied in `helpers.n` (role by instrument via `ROLE`), `scheduleStep` (kit translation `padIn`, beat-pad drums `beatEvents`) and `chartAt` (`beatChart`). `buildForm` accepts rows `{ sec, bars, drums: 'style' | 'A'..'D' | 'none' }`. `M.start({ song, form, audio })`, `M.chartSet(..., song)`, `M.renderOffline(..., { song, form })`. Intros / mix-ins drop vocal and brass notes; `TOPS_LEVEL` scales hats and percussion.
- **`js/songs.js` (`O.songs`):** saved songs (`orbitV4Songs`), builder UI (`#view-songs`), `SG.custom(song)` (Quick Play entry), `SG.render / exportWav / deckTrack`, `D.library()` (built-in tracks + songs + imports), Quick Play overlay (`#ov-quick`).
- **Game (game.js):** `G.custom` (Quick Play context; `G.setCustom`, `G.form()`, `G.songCfg()`, bests in `orbitV4Quick`), DJ moves (`G.moves`, `makeMoves`, `movesUpdate`, `G.pos`, `G.activeMove`, `G.moveTarget`, setting `orbitV4Moves`), scratches (`addScratches`, `G.scratch(dir)`; a tap on a scratch note arms it), echo battle (`G.battle(stage)`, `battleNotes`, `rivalUpdate`, `G.battleTurn`).
- **`js/night.js` (`O.night`):** Club Night as `SC.active.kind === 'night'`; `N.start`, `N.tick`, requests, `transition()`, result via the `gig-result` event (`r.night`, `r.rows`).
- **Beat challenges (school.js):** `SC.BEAT_CHALLENGES`, `startChallenge / listenChallenge / checkChallenge / stopChallenge`, progress in `SC.progress.challenges`.
- **Career (ui.js):** `CAREER` node table, `nodeInfo`, `venueOpen` (4 stars), `RANKS`, `SKINS` (`orbitV4Skin`), `checkRewards` (`orbitV4Rewards`), `orbitV4UnlockAll`.
- **`js/imports.js` (`O.imports`):** IndexedDB `orbit-dj/imports`, `IM.analyse(buf)` (band envelopes at 100 Hz, comb-filter tempo search, downbeat by low-end energy), `IM.chart`, `IM.fix`, deck entries (`T.imported`, `T.first`), Quick Play entries with `audio` (played by `M.start({ audio })`).
- **Tests:** `tests/qa-v4.js`. Legacy suites run with DJ moves off and everything unlocked (`orbitV4Moves`, `orbitV4UnlockAll` seeds). Do not run suites concurrently: CPU starvation makes the scripted players miss notes.
- **Render loop:** `loop()` only re-arms `requestAnimationFrame` if `wake()` has not already done so in that frame.

## v3.1 changes (sound library and songs)
- `tools/make_sounds.py` regenerates the whole library at 44.1 kHz (it deletes `sounds/kits` and `sounds/inst` first). New building blocks: `svf` (state-variable filter), `saw_ph`, `room`, `sp` (early-sampler grit), `ott` (multiband upward compression), `sing` (formant voice with formant tuning and `balance()`), `growl(kind)`. Instruments are listed in `INSTRUMENTS` (builder, MIDI roots, output rate).
- Styles in music.js: `house`, `basshouse`, `garage`, `dubstep`, `trap`, `boombap`, `soul` (`ALIASES` maps old ids: hiphop, jazzhop, melodic, dark). Each `play(...)` uses helpers `H.n` (note: attack, release, pan, send, echo, detune, glide), `H.c` (chord, `wide` doubles and pans), `H.d` (off-grid drum hit), `H.pump`, `H.fx`. Per-style `duckBass` sets the sidechain depth on the bass separately from the melody.
- Engine: `Synth.inst` accepts `detune`, `glide` and a second send (`send2`, used for the session echo bus `L.echo`). The reverb return is high-passed at 320 Hz. `SCALE.music` is 0.75.
- `tools/analyze_audio.py` prints band energies, energy above 4 and 8 kHz and the centroid for any audio file; use it after changing sounds. Re-run `tools/render_tracks.js` after changing any song.

## v3.0 additions (two decks, school, arranged songs)
- **Songs:** `buildForm(name)` in music.js maps every bar of a set or track to `{ sec, pos, dk (drum groove), hb (which of the 8 written bars), bass, mel, lead, full }`. Forms: `24`, `32` (rhythm sets), `deck48`, `deck64` (deck tracks with `mixin` / `mixout`). Seven deck tracks as of v3.1. Each style's `play(c, L, bar, step, t, beat, H, X)` reads `X` to decide which parts play. Extra grooves `I`, `K`, `R1`, `R2` are derived per style. `M.start({ form })`, `M.renderOffline(..., { form, tail, noBed })`, `M.sections(form)`.
- **Deck tracks:** `tools/render_tracks.js` renders six tracks through `M.renderOffline` (pre-limiter, normalized to −16 dBFS RMS), encodes MP3 with ffmpeg and writes `js/tracks-manifest.js` (`window.ORBIT_TRACKS`: id, title, style, bpm, key, bars, sections). Re-run it after changing any song. MP3 decoders add padding, so `decks.js` re-detects beat 1 after decoding (`analyse()`).
- **`js/decks.js` (`O.decks`):** deck state, `D.load/play/pause/toggle/seek`, `D.posOf` (audio-clock position incl. loop wrap), `D.cueDown/cueUp`, `D.setTempo`, `D.toggleSync` (+ quantized start in `D.play`), `D.nudge/bendTo/jog*`, `D.loopOn/Off/Scale`, `D.rollStart/End` (slip), `D.jump`, `D.hot`, pad modes (`D.padDown/padUp/setPadMode`), mixer (`D.set(i, name, v)`, `D.setXf`, `D.setFx`, `D.setSplit`, `D.level`), `D.phaseMs()`, `D.where(d)`. Sources are restarted for every seek / loop change; `startSrc(d, delay, keep)` with `keep` skips the 6 ms scheduling delay so phase-preserving operations do not drift. Graph is rebuilt on `audio-reset`.
- **`js/school.js` (`O.school`):** `LESSONS` (steps `{ t, ok(A, B, mem), hold }`), `GIGS`, `startLesson/startGig/finishGig/stop`, `phraseDist`, `BEAT_LESSONS` (steps `{ t, ok(mem, keep), enter, count }`), `startBeat/stopBeat`, `tick()` (called every frame from ui.js). Progress key `orbitV3School`.
- **`js/mixui.js` (`O.mixui`):** Mix view (custom knob / fader controls via `ctl()`), waveform canvas, coach strip, track picker, school and gig-result overlays, Beats TRAIN panel and LCD coach.
- **Tests:** `tests/qa-mix.js` (72 checks) plays every lesson and three gigs with scripted moves. `tests/qa.js` (103 checks) covers the rest.
- **Unfinished from an earlier pass:** `M.setRoll` (loop roll for the live backing) and `sounds/fx/scratch.wav` exist; the Play tab does not use `setRoll`.

## v2.2 additions (tutorial + band-game mechanics)
- `M.chartSet(id, bpm, leadIn, bars, diff, stage)` builds a set chart: drum-part notes plus hold notes (`dur`, FX lane, back half of bar 4 of each phrase; whole fill bar above Rookie), HYPE phrases (`hype` = bar index, bars 2 and 6 of each phrase) and a `finale` note on the last downbeat. `M.chart` is kept for reference.
- Set length: `G.barsFor(bpm)` (24 or 32 bars), `G.duration`, `G.songEnd()`. `G.DURATION` is now a getter.
- Holds: `G.holding[lane]`, `G.release(lane)` (wired to pointerup/keyup), bonus 200 × multiplier per hold, riser one-shot pitched to the hold length.
- HYPE: `G.hype` (0–1), `G.phrases`, `G.hypeReady()`, `G.activateHype()` (button `#btn-hype`, keys H / Enter). Doubles points and crowd gain; a full meter drains in 8 bars.
- Crowd: `G.crowd` (starts 0.5; per-difficulty `CROWD` table), `G.canFail()`, `finish(true)` → `lastResult.failed`, grade `FAILED`, nothing saved. `G.noFail` is a test hook.
- Miss feedback: `fx/miss.wav` (rate-limited) + `M.dip()` on per-session dip gains (melody, bass).
- Drills: `G.DRILLS`, `G.startDrill(id)`, `G.endDrill()`, event `drill` {status: start | pass | retry | done | abort}. Drills run at 88 BPM over `M.start({mode:'bare', click:true})`, never save, never fail, and loop until passed.
- Tutorial (ui.js, reworked in v4.1, see above): welcome overlay `#ov-intro`, coach strip `#coach`, finish card `#ov-tutdone`; shown when `orbitV22Tutorial` is unset. `O.ui.tutorial`, `O.ui.tutStart()`, `O.ui.tutEnd(done)`.
- Highway: gems, tails, flames and the multiplier dial / crowd meter are drawn in `drawHighway()` / `drawGauges()`; `--hype` theme token.
- Tests: 103 checks. Playwright's `tap()` waits for the pulsing HYPE button to stop moving, so tests use `dispatchEvent('pointerdown')` on it.

## Known limitations
1. **No physical-device or Safari/WebKit testing yet.** All results come from headless Chrome. iOS-specific paths (audioSession, silent element, interruption sheet, wake lock, share-sheet export) are implemented from documentation and unverified on hardware.
2. **Not a two-deck DJ yet.** The crossfader blends the melody and bass layers of one song. No independent decks, track import, tempo/sync, hot cues or loops. The beat pad's WAV bounce is the only audio export.
3. **Music is synthesized from scratch and was checked by measurement plus rendered previews, not by a human listener.** Each song is an 8-bar form that repeats; longer arrangements would help jams.
4. **Download size:** the site is ~5.5 MB (sound library) and the standalone HTML is ~8 MB. First load on cellular is slower than v2.0.
5. On iOS below 18.4, `outputLatency` isn't reported, so Bluetooth delay relies on the Tap test.
6. The silent-switch fallback for iOS 16 and older (looping silent `<audio>`) may show a media control on the lock screen; unverified.
7. All venues are open (as in v1); there are no unlock rules or achievements beyond stars, personal bests and grades.
8. Progress is per device in localStorage. Safari can clear storage for sites not opened for a while; the Home Screen app is safer.
9. Sets are still 24 seconds; charts now come from the songs. Beat pad patterns are per device, with no cloud sync.

## Recommended next priorities
1. **Device pass.** Owner confirms the v4.0.1 phone layouts (Mix and song builder, upright and sideways); fix whatever fails first. Larger step buttons on the upright beat pad are the next known gap.
2. **Real decks (milestone priority 4).** Get the v0.5 source. Build two `AudioBufferSourceNode` decks (playbackRate tempo, per-deck 3-band EQ + filter, true crossfader, cue to the pre-fader bus) behind the same mixer UI; keep Arcade venues as the teaching layer, and make Main Stage a real two-deck transition.
3. **Music:** act on the owner's listening feedback; longer forms (16–32 bars with breakdowns), velocity layers for the kits, an optional sample-chop workflow in the beat pad (slice a bounced loop onto pads).
4. **Gameplay depth:** longer sets per venue, practice mode with slow-down, unlock rules and achievements, beat-pad challenges (e.g. "program this groove") that feed the career.
5. **Recording:** capture a full rhythm set or live DJ performance to WAV (the bounce path already exists).
6. **Accessibility.** VoiceOver pass, colour-blind lane shapes, larger-text mode.
