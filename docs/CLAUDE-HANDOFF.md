# ORBIT DJ — Claude handoff (after v2.2.0, 2026-11-18)

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
| `css/orbit.css` | Tokens for `.theme-grunge` / `.theme-aero`; layouts for landscape phone, portrait, iPad/desktop |
| `sw.js` | Network-first, versioned cache. **Bump `VERSION` together with `O.VERSION`** (build.py checks). |

Storage keys: v1 keys kept (`orbitArcadeProgress`, `orbitArcadeTheme` (raw string), `orbitArcadeControllerBestV1`, `orbitArcadeCombinedV11`); new keys are prefixed `orbitV2*`.

Sounds: `python3 tools/make_sounds.py` regenerates `sounds/` and `js/sounds-manifest.js` (deterministic). Build and test: `python3 tools/build.py`, serve `dist/site`, then `node tests/qa.js <url>` (set `PW` to the Playwright module path if needed): 103 checks. `tools/render_previews.js` renders listening previews with the app's own engine.

## v2.2 additions (tutorial + band-game mechanics)
- `M.chartSet(id, bpm, leadIn, bars, diff, stage)` builds a set chart: drum-part notes plus hold notes (`dur`, FX lane, back half of bar 4 of each phrase; whole fill bar above Rookie), HYPE phrases (`hype` = bar index, bars 2 and 6 of each phrase) and a `finale` note on the last downbeat. `M.chart` is kept for reference.
- Set length: `G.barsFor(bpm)` (24 or 32 bars), `G.duration`, `G.songEnd()`. `G.DURATION` is now a getter.
- Holds: `G.holding[lane]`, `G.release(lane)` (wired to pointerup/keyup), bonus 200 × multiplier per hold, riser one-shot pitched to the hold length.
- HYPE: `G.hype` (0–1), `G.phrases`, `G.hypeReady()`, `G.activateHype()` (button `#btn-hype`, keys H / Enter). Doubles points and crowd gain; a full meter drains in 8 bars.
- Crowd: `G.crowd` (starts 0.5; per-difficulty `CROWD` table), `G.canFail()`, `finish(true)` → `lastResult.failed`, grade `FAILED`, nothing saved. `G.noFail` is a test hook.
- Miss feedback: `fx/miss.wav` (rate-limited) + `M.dip()` on per-session dip gains (melody, bass).
- Drills: `G.DRILLS`, `G.startDrill(id)`, `G.endDrill()`, event `drill` {status: start | pass | retry | done | abort}. Drills run at 88 BPM over `M.start({mode:'bare', click:true})`, never save, never fail, and loop until passed.
- Tutorial (ui.js): welcome overlay `#ov-intro`, coach strip `#coach`, finish card `#ov-tutdone`; shown when `orbitV22Tutorial` is unset. `O.ui.tutorial`, `O.ui.tutStart()`, `O.ui.tutEnd(done)`.
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
1. **Device pass.** Owner runs `docs/QA-REPORT.md` §4 on the iPhone; fix whatever fails first.
2. **Real decks (milestone priority 4).** Get the v0.5 source. Build two `AudioBufferSourceNode` decks (playbackRate tempo, per-deck 3-band EQ + filter, true crossfader, cue to the pre-fader bus) behind the same mixer UI; keep Arcade venues as the teaching layer, and make Main Stage a real two-deck transition.
3. **Music:** act on the owner's listening feedback; longer forms (16–32 bars with breakdowns), velocity layers for the kits, an optional sample-chop workflow in the beat pad (slice a bounced loop onto pads).
4. **Gameplay depth:** longer sets per venue, practice mode with slow-down, unlock rules and achievements, beat-pad challenges (e.g. "program this groove") that feed the career.
5. **Recording:** capture a full rhythm set or live DJ performance to WAV (the bounce path already exists).
6. **Accessibility.** VoiceOver pass, colour-blind lane shapes, larger-text mode.
