# ORBIT DJ — QA report (v3.0.0 on top of the v2.2.0 and v2.1.0 reports)

## v3.0.0 automated results: 72 / 72 (Mix tab, school, trainer) and 103 / 103 (everything else)

**Date:** 2026-11-18 · **Tested:** the repo root served locally (the same files GitHub Pages serves), headless Chrome via Playwright with touch emulation at iPhone landscape sizes.
**Not tested:** Safari/WebKit and any physical iPhone, iPad or Android device. No person has listened to the new songs or used the controller by hand; the lessons and gigs were played by scripts calling the same functions the buttons call, plus a handful of real touch events.

`tests/qa-mix.js` (new):

**Tracks**

- ✅ Six tracks load and decode
- ✅ Beat 1 is found after the MP3 padding (0.04–0.12 s in)
- ✅ Downbeats in the drums-only mix-in sit on the detected beat grid (within 12 ms on average)
- ✅ Every track has a drums-only mix-in and mix-out and 8-bar phrasing

**Decks**

- ✅ Deck plays at 1.00× on the audio clock and makes sound
- ✅ Tempo fader: +10% plays 10% faster and reads 136.4 BPM
- ✅ CUE returns to the cue point and stops; holding CUE previews and snaps back
- ✅ SYNC matches tempo and lines the beats up within 5 ms, and stays locked
- ✅ A synced deck follows the other deck’s tempo fader
- ✅ Nudge (+) moves the beat earlier by about 30 ms per half second
- ✅ 4-beat loop is 4 beats long, holds the playhead, halves to 1 beat and exits
- ✅ Loop roll slips: on release the deck is where it would have been (within 30 ms)
- ✅ Hot cue jumps back to its marker; beat jump +4 moves exactly 4 beats
- ✅ Jog on a stopped deck scrubs (a quarter turn forward, a tenth back = 0.27 s)

**Mixer**

- ✅ LOW kill removes at least 18 dB below 150 Hz; HI kill at least 18 dB of the top end
- ✅ FILTER: left is a low-pass (highs drop), right is a high-pass (bass drops)
- ✅ Channel fader down silences the deck; crossfader to B removes deck A; centre plays it in full
- ✅ High GAIN pushes the channel meter into the red (above 1.05)
- ✅ Echo out: with the fader down the echo tail is still audible, then dies away
- ✅ Split cue, reverb, flanger and sampler pads run without errors

**Lessons**

- ✅ 14 controller lessons, each with a scripted player for every step
- ✅ Lesson "transport": every step passes when the move is made, and completion is saved
- ✅ Lesson "levels": every step passes when the move is made, and completion is saved
- ✅ Lesson "xf": every step passes when the move is made, and completion is saved
- ✅ Lesson "tempo": every step passes when the move is made, and completion is saved
- ✅ Lesson "jog": every step passes when the move is made, and completion is saved
- ✅ Lesson "sync": every step passes when the move is made, and completion is saved
- ✅ Lesson "eq": every step passes when the move is made, and completion is saved
- ✅ Lesson "filter": every step passes when the move is made, and completion is saved
- ✅ Lesson "loop": every step passes when the move is made, and completion is saved
- ✅ Lesson "hotcue": every step passes when the move is made, and completion is saved
- ✅ Lesson "roll": every step passes when the move is made, and completion is saved
- ✅ Lesson "fx": every step passes when the move is made, and completion is saved
- ✅ Lesson "cue": every step passes when the move is made, and completion is saved
- ✅ Lesson "mix": every step passes when the move is made, and completion is saved
- ✅ Lesson steps do not pass by themselves
- ✅ Transition lesson: a start on bar 1 lands within half a beat of the phrase
- ✅ Transition lesson: starting B mid-phrase is caught with a retry message
- ✅ Coach strip shows the lesson step

**Gigs**

- ✅ Clean synced transition scores an A or S
- ✅ Results sheet opens with the grade
- ✅ Results sheet with tips fits on an iPhone landscape screen, buttons included
- ✅ No-SYNC gig refuses the SYNC button
- ✅ Unmatched, mid-phrase, double-bass mix scores under 50 with tips
- ✅ Manual beatmatch (tempo fader + nudge, no SYNC) scores an A or S
- ✅ Best gig scores are saved

**Touch controls**

- ✅ PLAY button starts the deck
- ✅ Dragging the LOW knob down turns it down
- ✅ Dragging the crossfader right moves it to B
- ✅ Dragging the tempo fader down speeds the deck up
- ✅ LOOP button sets a loop
- ✅ Pad 1 stores a hot cue and lights up
- ✅ Leaving the Mix tab stops the decks

**Layout**

- ✅ iPhone landscape 844×390: whole controller on screen, no scrolling
- ✅ iPhone landscape 844×390: transport buttons at least 34 pt, knobs at least 26 pt, jog at least 90 pt
- ✅ iPhone SE landscape 667×375: whole controller on screen, no scrolling
- ✅ iPhone SE landscape 667×375: transport buttons at least 34 pt, knobs at least 26 pt, jog at least 90 pt
- ✅ iPhone Pro Max landscape 932×430: whole controller on screen, no scrolling
- ✅ iPhone Pro Max landscape 932×430: transport buttons at least 34 pt, knobs at least 26 pt, jog at least 90 pt
- ✅ Theme switch keeps the Mix tab working
- ✅ Mix: no console errors

**Beat trainer**

- ✅ 7 beat-making lessons, each with a scripted player for every step
- ✅ Beat lesson "four" completes when the moves are made, and is saved
- ✅ Beat lesson "backbeat" completes when the moves are made, and is saved
- ✅ Beat lesson "finger" completes when the moves are made, and is saved
- ✅ Beat lesson "record" completes when the moves are made, and is saved
- ✅ Beat lesson "repeat" completes when the moves are made, and is saved
- ✅ Beat lesson "levels16" completes when the moves are made, and is saved
- ✅ Beat lesson "arrange" completes when the moves are made, and is saved
- ✅ Finger drumming ignores hits that are off the beat
- ✅ Beat coach shows on the LCD
- ✅ Beat trainer: no console errors

**Notes**
- Three checks in `tests/qa.js` changed for the arranged songs: the sound-file count (137), the "notes are real drum hits" check now ignores hold notes, and loudness consistency is measured over whole songs rendered offline (the old check sampled the first seconds, which are now a quiet intro).
- Gig scoring was exercised with three scripted mixes: a clean synced transition (100), a deliberate train wreck (31) and a manual beatmatch with tempo fader and nudge (100).
- Beat grid: after MP3 decoding, downbeats sit within 3 ms of the detected grid on average in Chrome. Safari's MP3 decoder pads differently, which is why the app detects beat 1 from the audio instead of trusting a fixed offset; that path is untested on Safari.

---

# v2.2.0 report

## 0. v2.2.0 automated results: 103 / 103 passed

**Date:** 2026-11-18 · **Tested:** the repo root served locally (the same files GitHub Pages serves), headless Chrome via Playwright, with touch emulation at 844×390 for the tutorial.
**Not tested:** Safari/WebKit and any physical iPhone. Long-press hold notes, the HYPE button and the tutorial have only been exercised by automation and screenshots.

The 80 v2.1 checks below still pass on v2.2.0 (sound-file count updated from 124 to 126). 23 checks are new:

**Band mechanics**

- ✅ Sets run about a minute (50–70 s of music) at every venue tempo
- ✅ Every chart has hold notes, HYPE phrases and ends on a finale hit
- ✅ Hold notes never overlap another note in their own lane (and nothing at all on Rookie)
- ✅ Holding a note to the end of its tail completes it and pays a hold bonus
- ✅ Letting go early drops the hold without breaking the streak
- ✅ HYPE charges 25% per glowing phrase and unlocks at 50%
- ✅ Firing HYPE doubles points, then drains and switches off
- ✅ Club: missing everything empties the crowd meter and fails the set early, nothing saved
- ✅ Failed-set results explain what happened and offer TRY AGAIN
- ✅ Misses play the scratch sound (rate-limited)
- ✅ Rookie never fails: 30 misses in, the set is still running
- ✅ Band mechanics: no console errors

**Tutorial**

- ✅ First open: tutorial welcome is on screen immediately
- ✅ One tap starts drill 1 (kick only) over a metronome, coach visible, no page scroll
- ✅ An unfinished drill repeats instead of failing
- ✅ HYPE drill: button turns ready and the coach says to tap it
- ✅ Drills run in order: snare, full beat, hold, HYPE, then the finish card
- ✅ Tutorial completion is remembered and writes no career progress
- ✅ PLAY YOUR FIRST SET starts Bedroom DJ on Rookie as a real set
- ✅ Second open: no tutorial prompt
- ✅ Setup → Replay tutorial reopens it
- ✅ SKIP ends the tutorial cleanly (music stopped, coach gone)
- ✅ Tutorial: no console errors

**Notes**
- The legacy tests run with the crowd-fail rule switched off (`G.noFail`, a test hook), because several of them start a set and deliberately do not tap. Crowd failure is tested on its own page.
- One flaky check: "On-time taps judged on the audio clock (p95 under 35 ms)" failed once in four full runs (p95 37 ms, one 77 ms stall that also cost a single missed note). The automated player now plays 438 notes over a minute instead of about 150, so one long frame under headless load is enough. Passing runs measured p95 29 ms. Treat a real-phone timing check as still open.
- Screens reviewed by eye from screenshots: welcome, each drill, HYPE ready, finish card, and a set with HYPE active and a held note, in landscape (Grunge Arcade) and portrait (Cyber Aero).

---

# v2.1.0 report (unchanged below)

**Date:** 2026-11-18 · **Build tested:** `dist/site` (the exact contents of `ORBIT-DJ-v2.1.0-netlify.zip`)
**Automation:** Playwright 1.63 driving Google Chrome for Testing 153 (headless, Linux), with touch and mobile emulation for phone viewports. The standalone HTML was also opened from a local file: all 124 embedded sounds decoded and sets and the beat pad ran with no errors.
**Not tested:** Safari/WebKit (the WebKit test engine can't be downloaded in this environment), any physical iPhone, iPad or Android device, real Bluetooth headphones, real calls or Siri. Everything below is browser automation, not device certification.

## 1. Baseline: v1 Arcade prototype (before changes)

Measured in headless Chrome unless marked *(code)*.

| Area | Finding |
|---|---|
| Mobile layout | iPhone landscape (844×390): page 2,900 px tall; pads at y=558–619 (below the fold); **Start** at y=1,573 (4 screens down); sampler at y=2,441. Portrait (390×844): 4,260 px tall. |
| Sampler | Unusable before a set: "Press Start Set first to enable audio." |
| Style change mid-set | 5 notes fired in one burst, up to **1.70 s late**. |
| Pause / resume | Music resumed about **50 ms off** the note grid (single measurement; cause confirmed in code). |
| Guide drums | 8/8 beats played in desktop Chrome; relied on a 35 ms polling window, which is fragile under mobile timer throttling *(code)*. |
| Gain staging | No master bus or limiter; every source wired straight to the speakers. Sampler path ≈ 0.16× gain on samples already at −19 dB RMS, so very quiet *(code)*. |
| iOS audio | No handling for the silent switch, interruptions, backgrounding or a stuck context *(code)*. |
| Lessons | "CUE + PLAY/PAUSE" lesson defined but never displayed (venue→lesson map skipped index 1) *(code)*. |
| Count-in | Fixed 0.35 s clicks regardless of tempo *(code)*. |
| Rendering | Every note DOM node removed and recreated every animation frame *(code)*. |
| Console | 404 for a missing favicon. |

## 2. v2.1 automated results: 80 / 80 passed

**Boot**

- ✅ No audio context before a gesture
- ✅ Beat pad kit bytes prefetched before audio unlock
- ✅ Start Set unlocks audio and runs — `{"state":"running","game":"running","music":true,"mode":"set"}`
- ✅ Backing music runs in set mode with guide drums — `{"state":"running","game":"running","music":true,"mode":"set"}`
- ✅ Count-in lead-in is at least 4 beats
- ✅ Every sound file loads and decodes (kits, instruments, fx, v1 chops) — `{"total":124,"decoded":124}`

**Music + charts**

- ✅ Rookie: every note is a drum hit the song actually plays (guide drums on) — `{"notes":9,"backingPlaysThem":9}`
- ✅ Headliner: the backing drops your notes, so only your taps fill them — `{"notes":23,"backingPlaysThem":0}`
- ✅ All 6 backing styles level-matched within 3 dB (pre-limiter RMS) — `{"boombap":{"rms":-19.8,"peak":-7.1,"melodyVsBass":-3.3},"jazzhop":{"rms":-20.7,"peak":-7.8,"melodyVsBass":-0.9},"hou…`
- ✅ Backing leaves headroom (pre-limiter peaks below −6 dBFS) — `{"boombap":-7.1,"jazzhop":-7.8,"house":-8.2,"garage":-8.1,"melodic":-8.8,"dark":-9.1}`
- ✅ Melody audible: within 7 dB of the bass in every style — `{"boombap":-3.3,"jazzhop":-0.9,"house":-2.7,"garage":-3.2,"melodic":-2.9,"dark":-4.8}`

**Rhythm scoring**

- ✅ On-time taps judged on the audio clock (95th percentile error under 35 ms) — `{"notes":157,"p95ms":13,"maxMs":18}`
- ✅ Full Main Stage / Headliner set: no misses, 3 stars — `{"acc":1,"stars":3,"counts":{"perfect":157,"great":0,"good":0,"miss":0,"off":0}}`
- ✅ Score uses v1 formula (combo multiplier up to x4) — `87450`
- ✅ Result saved to v1 progress key
- ✅ Combined grade saved to v1 key
- ✅ Results screen shows grade — `B`
- ✅ Rookie accepts a 150 ms late hit (window 190 ms) — `{"easy+150":"good","normal+80":"great","expert+150":"off"}`
- ✅ Club grades an 80 ms late hit as GREAT — `{"easy+150":"good","normal+80":"great","expert+150":"off"}`
- ✅ Headliner rejects a 150 ms late hit (window 85 ms) — `{"easy+150":"good","normal+80":"great","expert+150":"off"}`

**Equipment challenges**

- ✅ House Party cue + three-position blend = 300/300 — `{"venue2":300,"venue3":300,"venue4":300,"idleMoves":0}`
- ✅ Underground Club bass swap with one-beat hold = 300/300 — `{"venue2":300,"venue3":300,"venue4":300,"idleMoves":0}`
- ✅ Main Stage filter sweep with hold = 300/300 — `{"venue2":300,"venue3":300,"venue4":300,"idleMoves":0}`
- ✅ Moving controls outside a set earns nothing — `{"venue2":300,"venue3":300,"venue4":300,"idleMoves":0}`
- ✅ Bedroom DJ equipment points require real note hits — `0`

**Audio scheduling**

- ✅ After pause/resume the music stays on the note grid (0 ms error) — `{"gridErrMaxMs":0,"originOk":true,"locked":true,"burstSteps":0,"past":0,"minGapMs":163,"unitMs":163}`
- ✅ Backing change during a set waits for the next set (notes stay matched to the music) — `{"gridErrMaxMs":0,"originOk":true,"locked":true,"burstSteps":0,"past":0,"minGapMs":163,"unitMs":163}`
- ✅ Changing style while jamming causes no burst of late notes — `{"gridErrMaxMs":0,"originOk":true,"locked":true,"burstSteps":0,"past":0,"minGapMs":163,"unitMs":163}`

**Interruptions**

- ✅ System audio interruption pauses the set and asks for a tap — `{"state":"paused","reason":"audio","overlay":true}`
- ✅ Tap to resume restores audio and the set — `{"ctx":"running","game":"running"}`
- ✅ Leaving the app pauses the set and stops audio — `{"state":"paused","reason":"background","music":false}`

**Themes**

- ✅ Theme change mid-set keeps audio and score — `{"state":"running","music":true,"ctx":"running","cls":"theme-aero","score":150,"hits":1}`
- ✅ Theme saved under v1 key — `grunge`

**Gain staging**

- ✅ Master never clips with music + 4 pads + sampler spam (peak < 0 dBFS) — `{"venue1":{"masterPeakDb":-0.6,"musicRmsDb":-20.5},"venue3":{"masterPeakDb":-0.6,"musicRmsDb":-20},"venue4":{"masterP…`
- ✅ Backing loudness consistent across venues (within 4 dB) — `[-20.5,-20,-19.5]`

**Beat pad**

- ✅ Pads play the kit’s WAV samples (not synth fallback) — `2`
- ✅ Sequencer steps land on the grid with swing (max error under 0.5 ms) — `{"hits":8,"maxErrMs":0}`
- ✅ One bar at 100 BPM = 2400 ms between kicks — `2400`
- ✅ Swing 66% delays the off-16th by the right amount — `{"got":48,"expect":48}`
- ✅ Muted pad is silent in the sequence — `0`
- ✅ Live recording snaps early hits to steps 4 and 12 — `[4,12]`
- ✅ Recorded hits are not double-triggered, then loop next bar — `{"bar2":2,"bar3":2}`
- ✅ Undo restores the pattern — `0`
- ✅ Note repeat 1/16 retriggers every 150 ms at 100 BPM — `{"hits":6,"gapMs":150}`
- ✅ Pattern change waits for the next bar — `True`
- ✅ Backing track locks to the beat pad clock and stops with it — `{"playing":true,"mode":"jam","sameOrigin":true,"sameBpm":true}`
- ✅ Bounce renders 4 bars to a valid 16-bit WAV — `{"seconds":11.2,"expect":11.2,"peak":0.663,"wavBytes":1975724,"expectBytes":1975724}`
- ✅ Export writes pattern JSON (v2, readable by import) — `{"bank":"dusty","bars":1,"events":14}`
- ✅ Imports a v1 sampler pattern and switches to its bank — `{"n":2,"kit":"dark","status":"Dark Pulse loaded."}`
- ✅ Rejects an invalid pattern and keeps the current one — `{"n":2,"status":"Invalid pattern."}`
- ✅ All 6 kits load (3 drum kits + 3 v1 chop banks) — `{"dusty":true,"club":true,"midnight":true,"soul":true,"garage":true,"dark":true}`

**Timing calibration**

- ✅ Tap test measures the delay of the taps it receives (within 3 ms) and sets the offset — `{"offset":116,"sentMs":116,"msg":"You tapped 116 ms after the clicks on average. Offset set to +116 ms."}`

**Equipment briefing**

- ✅ First visit to Underground Club opens the LOW EQ briefing — `{"open":true,"name":"LOW EQ / BASS SWAP","mistakes":3}`
- ✅ “Hear it” plays a before/after demo — `{"playing":true,"mode":"demo"}`
- ✅ Closing the briefing stops the demo and restores the EQ — `{"playing":false,"eqDb":0}`
- ✅ No console errors in the main session

**Saved progress**

- ✅ v1 stars and best score appear in Career — `{"stars":"3/12","best":"4,200","cls":"theme-aero"}`
- ✅ v1 theme choice restored before first paint — `theme-aero`

**Mobile layout**

- ✅ iPhone 14 landscape: no scrolling, every Main Stage control visible — `{"scroll":false,"allVisible":true,"minPad":70,"highwayH":250}`
- ✅ iPhone 14 landscape: pads at least 44 pt — `70`
- ✅ iPhone 14 landscape: beat pad shows all 16 pads + PLAY without page scroll, pads ≥ 44 pt — `{"scroll":false,"minPad":76,"allOn":true,"play":true}`
- ✅ iPhone 14 landscape: results sheet fits on screen
- ✅ iPhone 14 landscape: no console errors
- ✅ iPhone SE landscape: no scrolling, every Main Stage control visible — `{"scroll":false,"allVisible":true,"minPad":59,"highwayH":197}`
- ✅ iPhone SE landscape: pads at least 44 pt — `59`
- ✅ iPhone SE landscape: beat pad shows all 16 pads + PLAY without page scroll, pads ≥ 44 pt — `{"scroll":false,"minPad":60,"allOn":true,"play":true}`
- ✅ iPhone SE landscape: results sheet fits on screen
- ✅ iPhone SE landscape: no console errors
- ✅ iPhone 14 portrait (Safari bars): no scrolling, every Main Stage control visible — `{"scroll":false,"allVisible":true,"minPad":66,"highwayH":179}`
- ✅ iPhone 14 portrait (Safari bars): pads at least 44 pt — `66`
- ✅ iPhone 14 portrait (Safari bars): beat pad shows all 16 pads + PLAY without page scroll, pads ≥ 44 pt — `{"scroll":false,"minPad":60,"allOn":true,"play":true}`
- ✅ iPhone 14 portrait (Safari bars): results sheet fits on screen
- ✅ iPhone 14 portrait (Safari bars): no console errors
- ✅ iPad landscape: no scrolling, every Main Stage control visible — `{"scroll":false,"allVisible":true,"minPad":104,"highwayH":620}`
- ✅ iPad landscape: pads at least 44 pt — `104`
- ✅ iPad landscape: beat pad shows all 16 pads + PLAY without page scroll, pads ≥ 44 pt — `{"scroll":false,"minPad":167,"allOn":true,"play":true}`
- ✅ iPad landscape: results sheet fits on screen
- ✅ iPad landscape: no console errors

**PWA**

- ✅ Service worker installs
- ✅ App reloads offline from the versioned cache

## 3. Audio measurements

**Backing styles** (8-bar render, pre-limiter, dBFS):

| Style (venue) | RMS | Peak | Melody vs bass |
|---|---|---|---|
| Dusty boom bap (Bedroom DJ, 88) | −19.8 | −7.1 | −3.3 dB |
| Lo-fi jazz hop (House Party, 104) | −20.7 | −7.8 | −0.9 dB |
| Deep house (Underground Club, 128) | −19.6 | −8.2 | −2.7 dB |
| UK garage (backing menu, 130) | −20.1 | −8.1 | −3.2 dB |
| Melodic electronic (backing menu, 122) | −19.9 | −8.8 | −2.9 dB |
| Dark bass (Main Stage, 140) | −19.4 | −9.1 | −4.8 dB |

**Master output** with music plus 4 lane pads plus 2 beat pads hammered every 45 ms: peak −0.6 to −0.7 dBFS, no clipping.

**Listening previews** (rendered by the app's own engine, 0 clipped samples): `ORBIT-v2.1-music-preview.mp3` (all six songs, 1:50) and `ORBIT-v2.1-beatpad-preview.mp3` (Dusty, Club and Midnight kits, each with backing, 0:31).

These numbers show balance, headroom and timing. They don't show whether the music is good; that needs your ears, so please listen to the previews.

## 4. Physical-device checklist (owner, iPhone)

- [ ] Sound plays with the silent switch ON
- [ ] First tap on "Play your first groove" produces sound
- [ ] Each venue's song sounds musical; tell me which ones you like or don't
- [ ] Notes feel like the song's drums: kick on the kick, snare on the snare
- [ ] Headliner: missed notes leave a gap in the beat (intended)
- [ ] Beats tab: all 16 pads respond to four fingers at once; tapping higher on a pad plays louder
- [ ] PLAY, REC and tapping pads: hits loop on the next bar in time
- [ ] Note repeat: holding a pad rolls in time
- [ ] Bounce WAV opens the share sheet → Save to Files → the file plays in Files
- [ ] Export pattern → Import it back
- [ ] Swipe home mid-set or mid-beat, return → paused/stopped cleanly, no stuck audio
- [ ] Landscape Home Screen app: no page scrolling in Play or Beats
- [ ] Airplane Mode after one full visit: app opens and music plays (sounds come from the offline cache)
- [ ] First load time on cellular (5.5 MB of sounds) feels acceptable

## 5. Re-running the tests
```
python3 tools/build.py
cd dist/site && python3 -m http.server 8710 &
PW=<path to playwright> node tests/qa.js http://127.0.0.1:8710
node tests/music-levels.js http://127.0.0.1:8710      # per-style levels
node tools/render_previews.js http://127.0.0.1:8710 previews   # listening previews (WAV)
python3 tools/make_sounds.py                        # regenerate the sound library
```
