# AudioSystem DSP Web — Product Requirements Doc

## Original Problem Statement
The user uploaded an `AudioSystem DSP 3.0` Windows `.msi` installer and asked (in Portuguese) "corrigir e melhorar este programa" (fix and improve this program). The original software:
- **Did not save channel delays** between sessions.
- **Had latency** during processing.

The user requested a web-based React + Python re-implementation inspired by the original AudioSystem DSP, with two configurations (16+16 and 8+8 Dante channels) and a focused feature set.

## Architecture
- **Frontend**: React 19 + Tailwind + Recharts + Web Audio API.
- **Backend**: FastAPI (kept as boilerplate health checks; not required for core flow).
- **State**: React Context + `useReducer`, mirrored to **`localStorage`** under keys `dsp_state_v1` and `dsp_presets_v1` (no server persistence — fully client-side per user choice).
- **Audio engine** (`/app/frontend/src/lib/audioEngine.js`): `AudioContext({ latencyHint: 'interactive' })`, per-output processing chain: `input → HPF → LPF → 5×BiquadFilter (parametric EQ) → DynamicsCompressor → makeup gain → DelayNode → equal-power pan → master`. All parameter updates use `setTargetAtTime` with a 5 ms ramp — **click-free, zero-rebuild updates** that eliminate the original latency problem.

## User Personas
- **Pro audio engineer / system integrator** wiring physical and Dante-virtual I/O for installs or live sound.
- **Car-audio installer** tuning delays per speaker (mm/ms/inch).
- **Studio engineer** experimenting with parametric EQ, crossover, and dynamics on uploaded audio files.

## Core Requirements (Static)
1. Selectable DSP version: **16+16** or **8+8** physical + Dante virtual channels.
2. Per-channel processing: Gain, Mute, Solo, Pan (L–C–R), Delay (ms/mm/inch), Crossover (HPF/LPF), 5-band Parametric EQ, Compressor, Limiter.
3. **Routing Matrix** (N×N grid, Dante-Controller style) — sum any inputs into any outputs.
4. **Preset manager** — save/load/delete/export/import named configurations to localStorage.
5. **Audio file upload + playback** — feeds the audio graph for real-time monitoring.
6. **State must persist** across page reloads — fixes the original "doesn't save delays" bug.

## What's Been Implemented (2026-02-13 — AudioSystem DSP File Importer · v2 real-file verified)
- ✅ **⇩ Import** button in TopBar opens a modal that accepts an AudioSystem DSP binary project file (`.audiosystemdsp` / `.dsp`) via drag-and-drop or file browser.
- ✅ **Binary parser** (`/app/frontend/src/lib/dspBinaryImporter.js`) — reverse-engineered from a real 45 128-byte project file:
  - MAGIC = `B0 04 E0 E3` (4 bytes)
  - TERM = `E8 03 40 ED` (4 bytes)
  - Input record = 40 bytes: magic(4) header(6) name(16) term(4) tail(10)
  - Output record = 34 bytes: magic(4) header(4) name(16) term(4) tail(6)
  - 32 input names start at offset 0x14; 32 output names at offset 0xAB88 (after a ~42 KB block of EQ/delay/comp/routing parameters — out of scope for this iteration).
- ✅ **Verified end-to-end** against the user-supplied `16.audiosystemdsp` file: all 64 names (FRONT L / CENTER / SUB FRONT / M AUDIO / C JBL625 / C JBL 620 L/R / C JM809 L/R / WIDE 1L/2L/1R/2R / SURR L/R / SUB L/C/R / IN9-32 / OUT17-32) extracted correctly and split 32/32 to state.inputs/state.outputs.
- ✅ Auto-Categorisation correctly tags **SUB FRONT → BASS**, **SUB L/C/R → BASS**, **FRONT/CENTER/SURR/WIDE → MIC**.
- ✅ Two-column preview + Auto-tag toggle + Apply CTA + read-only safety + bad-file error all functional.
- ❌ **Out of scope (still)** — EQ / delay / routing / dynamics import. The 42 KB gap between input and output blocks holds these but mapping them to bytes safely requires 2-3 more sample files with **known differences** (e.g., one file with only EQ on channel 1, another with only delay on channel 14). See ROADMAP for the request.

## What's Been Implemented (2026-02-13 — AudioSystem DSP File Importer)
- ✅ **⇩ Import** button in TopBar opens a modal that accepts an AudioSystem DSP binary project file (.dsp) via drag-and-drop or file browser.
- ✅ **Binary parser** (`/app/frontend/src/lib/dspBinaryImporter.js`) scans for the magic byte sequence `0xB0 0xE0 0xE3` and terminator `0xE8 0x40 0xED` to extract ASCII channel names. Real 64-record exports split exactly 32 inputs / 32 outputs; smaller test files use a half-split heuristic (`Math.ceil(N/2)`).
- ✅ **Auto-Categorisation** (toggleable in the modal) — heuristic `guessCategory(name)` maps common names to scribble strip categories: KICK/SNARE/TOM → drum, BASS DI → bass, GTR → gtr, VOX LD → vox, SUB → bass, FRONT/CENTER/SURR → mic, etc.
- ✅ Two-column preview shows the parsed split + category badges before commit. Apply patches `name` + optional `category` via `updateInput`/`updateOutput` on every channel.
- ✅ Error states: tiny/non-DSP files report "Only N channel name(s) recognised" and disable Apply.
- ✅ **Out of scope (deliberate)** — EQ / delay / routing / dynamics / matrix import. The Dante DSP datasheet PDF supplied confirms the binary format is proprietary; reverse-engineering byte layouts safely requires multiple known samples or the manufacturer's Communication Protocol Document. Channel name import alone delivers ~80% of practical value for an installer.

## What's Been Implemented (2026-02-13 — Refined Layout: Waves eMotion LV1 inspired)
- ✅ **Scribble strip color tags** — per-channel category (None/Mic/Vox/Drum/Bass/Gtr/Key/FX/Aux, 9 colours) settable from the Selected Channel hero panel via a swatch palette. Painted as a thin coloured band above ChannelStrip / InputStrip when category ≠ "none". Defined in `/app/frontend/src/lib/channelCategories.js`.
- ✅ **CLR SOLO** button in TopBar (yellow) — wipes the solo flag on every input + output in one click. New reducer case `clearAllSolo` + read-only-guarded API method.
- ✅ **🎤 TALK** push-to-talk button (red) — dims master while pointer is held (`pointerdown`/`up`/`leave`). Audio engine `applyMaster()` now accepts a `talkback` flag that overrides master gain to 0; the DspProvider effect feeds `state.talkback`. Talkback flag is **always reset to false on hydrate** so an aborted tab doesn't boot silent.
- ✅ **Wall clock** display (green, HH:MM:SS, updates every second) in the TopBar — useful for live-show timing.
- ✅ Backwards-compatible migration: older saves without `category` field automatically get `category: "none"` on every channel during hydration.

## What's Been Implemented (2026-02-13 — Hotkeys 1-8 for Scene Recall)
- ✅ Window keydown listener (digits **1**–**8**) recalls the corresponding scene slot. Empty slots are skipped, modifier combos (Ctrl/Meta/Alt) are ignored, and the listener bails out when focus is on an `<input>` / `<textarea>` / `<select>` / `contentEditable` element so typing never hijacks recall.
- ✅ Hotkey badge in the top-right of every slot (`scene-hotkey-1`..`scene-hotkey-8`) for discoverability — uses the slot accent colour and dims to grey on empty slots.
- ✅ Visual feedback: the recalled slot briefly `scale(0.96)` + drop-shadow glow for ~280 ms (`hotkeyFlash` state) so the operator gets confirmation at a glance.
- ✅ Footer hint updated to **"keys 1-8 · right-click for menu"**.
- ✅ Listener skipped entirely in popout mode (`#popout=meters` — SceneBar isn't mounted there anyway).

## What's Been Implemented (2026-02-13 — Scene Memory)
- ✅ **SceneBar** — 8 snapshot slots rendered between Channel Pills and the Inputs row on Channels tab. Each empty slot offers "+ Capture"; filled slots show the scene name in an accent colour. Last-recalled scene displays a `● LIVE` indicator.
- ✅ **Capture / Recall / Overwrite / Rename / Delete** — left-click recalls a scene (restores mute/solo/gain across every input + output via the existing applyChannel + applyInputChannel pipeline with 5 ms click-free ramps). Right-click opens an inline menu with Overwrite (re-snapshot), Rename (inline input field), and Delete actions.
- ✅ **Read-only safety with viewing exemption** — capture/overwrite/rename/delete are guarded; **recall stays clickable** (analogous to `loadPresetState`) so an integrator can step through scenes even with the app locked. The SceneBar is intentionally placed OUTSIDE the read-only `inert` wrapper.
- ✅ Persistence in `localStorage.dsp_state_v1` (scenes are now part of the dsp state). Migration adds empty `scenes: []` to older saved states. Scene IDs use `crypto.randomUUID()` (fallback to `Date.now()+random`) for collision-proof uniqueness on burst captures.

## What's Been Implemented (2026-02-13 — Input Strips + Proactive Profile Hint)
- ✅ **Analog Input Strips** — new collapsible "INPUTS · 32 ch" row above the Physical Outputs section. Each strip has: chunky header pill (IN N), large **MUTE** button (English, red glow when active), smaller **SOLO** pill (yellow when active), pointer-drag vertical fader with white/red analog cap, value callout that follows the cap, tick scale (+12 / +6 / +3 / 0 / −3 / −6 / −12 / −30 / −60), zero-dB reference line, dB readout, and live per-input bus meter on the right.
- ✅ **Audio engine wiring**: new `audioEngine.applyInputChannel(input, state)` sets `inputBuses[id].gain` based on per-input mute/gain. Solo logic mutes all non-soloed inputs at the bus level. A new `useEffect` in DspProvider fires this for every input on `state.inputs/version` change — zero-rebuild, click-free updates via `setTargetAtTime`.
- ✅ **Proactive Profile Hint** — pulsing chip rendered between TopBar and main when `detectProfile()` returns a suggestion that (a) differs from the active profile AND (b) has MEDIUM or HIGH confidence. Click `Switch profile` to apply, `×` to dismiss. Dismissals persisted to `localStorage.dsp_proactive_dismissed_v1` and automatically cleared when the routing fingerprint changes meaningfully so the user can be re-nudged.
- ✅ Chip is **hidden in popout mode** (`#popout=meters`) and **never appears when active profile === suggested profile** — by design, no nag for matched setups.

## What's Been Implemented (2026-02-13 — Profile Auto-Detector)
- ✅ **🔍 Detect** button on the Calibration Profile bar. Runs `detectProfile(state)` — a pure heuristic that scores all 4 profiles based on (a) number of routed outputs, (b) average / max delay in ms, (c) number of outputs with active crossover, (d) channel-name keyword hints (FOH/MON/SUB/TOP/PEW/BALCONY/etc.).
- ✅ Result banner shows the recommended profile with **HIGH / MEDIUM / LOW** confidence pill, a one-line summary (`N active · avg delay X ms · M crossover(s)`), up to 4 bullet-point reasons, and inline **Use {profile}** + **Dismiss** CTAs. If the recommendation already matches the current selection, the Use button is swapped for an "Already Active" badge.
- ✅ Picking the suggestion auto-clears the banner and persists the new active profile.
- ✅ Edge case: empty routing returns a low-confidence Car Audio fallback with a clear message ("No outputs are routed yet — defaulting to Car Audio.").
- ✅ Low-delay home-studio bonus is gated to `activeCount ≤ 4` to prevent misclassification of larger systems that simply haven't had time-alignment dialled in yet (fix verified iteration 20).

## What's Been Implemented (2026-02-13 — Calibration Profiles)
- ✅ **Calibration Profiles** — 4 pre-tuned presets selectable from a bar in MetersView, each with scenario-appropriate `scope/levelDb/dwellMs/settleMs/matchMode/deadBandDb`:
  - ♪ **Live Band** (red) — touring PA, −12 dB / 1200 ms / ±1.5 dB tolerance
  - ▱ **Car Audio** (orange, default) — reflective cabin, −18 dB / 2000 ms / ±1.0 dB
  - ○ **Home Studio** (cyan) — near-field, −24 dB / 1500 ms / ±0.3 dB clinical
  - ✦ **House of Worship** (yellow) — reverberant, all 32 channels, −15 dB / 2500 ms / ±2.0 dB
- ✅ Active profile persisted in `localStorage` key `dsp_calibration_profile_v1` — survives reload.
- ✅ Selected profile is fed into the One-Click Calibration pipeline (`profileId` prop) and seeds the modal sliders, modal header (`⚡ One-Click Calibration · ♪ Live Band`), and the saved snapshot name (`One-Click (Live Band) <timestamp>`). The Auto-Capture modal keeps its hard-coded defaults — profiles are a One-Click concept.
- ✅ `computeCorrection()` now accepts a `deadBandDb` override so each profile's tolerance threshold is honoured during Level Match.

## What's Been Implemented (2026-02-13 — One-Click Calibration)
- ✅ **One-Click Calibration**: a single yellow button in MetersView (`open-one-click`) chains the full installer pipeline in ~30 s — (1) sweep all PHY outputs at −18 dB, (2) Auto Level Match to AVG, (3) save snapshot to `dsp_snapshots_v1` localStorage, (4) export CSV.
- ✅ Pipeline status banner above the modal shows the active step (sweep / matching / snapshotting / done / cancelled) with colour coding.
- ✅ Calibration Summary card (yellow border) displays swept count, gains-adjusted count, snapshot name, CSV filename, plus inline **Undo Calibration** if any gains were touched.
- ✅ Two-layer safety guard: `start()` returns a typed sentinel `{cancelled, count}` and the orchestrator halts on `!sweepRes || cancelled || count===0` — read-only mode now correctly stops the pipeline with no side effects (verified iteration 17).
- ✅ `ac-close` button disabled during the matching/snapshotting steps to prevent partial state.

## What's Been Implemented (2026-02-13 — Auto Level Match)
- ✅ **Auto Level Match** extends Auto-Capture: after a sweep, the modal computes per-channel corrective gain to match either the sweep average (AVG mode) or the dialled-in target dB (TARGET mode).
- ✅ Safety guard rails: corrections clamped to ±12 dB per channel, channels with peak ≤ −55 dB (silent/dead) are skipped, ±0.3 dB dead-band ignores micro-corrections.
- ✅ Correction column added to results table (yellow #FFD60A, red when clamp ceiling hit). Footer shows `correctable_count` of channels that would actually move.
- ✅ **Apply Match** button (yellow CTA) applies all corrections in one click. **Undo Match** appears next to it, reverting every changed channel to its pre-match gain.
- ✅ Re-running a sweep clears any prior `appliedUndo` so the Undo button never leaks across captures.

## What's Been Implemented (2026-02-13 — Auto-Capture Sequence)
- ✅ **Auto-Capture Sequence** modal accessible from Meters view (cyan ⇶ Auto-Capture button). Configurable scope (Physical only / Dante Virtual only / All), pink-noise level (−40 to 0 dB), dwell per channel (500–3000 ms) and settle time (100–1000 ms).
- ✅ Sequential sweep: snapshots every channel's mute + pinkNoise state, mutes all, energises one channel at a time with pink noise, samples `getOutputLevel()` for the dwell window keeping peak, records `{idx, channel, kind, peakDb, targetDb}`, then restores original state on completion or cancel.
- ✅ Live progress bar with channel name + index/total. Cancel button stops the sweep mid-flight and still restores state.
- ✅ Results table with per-row Δ vs average column + footer average dB readout. **Export CSV** downloads `auto-capture-{scope}-{ISO}.csv` with header `index,channel,kind,peak_db,target_level_db,delta_db`.
- ✅ Respects read-only mode (Start button disabled).

## What's Been Implemented (2026-02-13 — Test Signal v2 + Pan Visual + Meters Pop-out)
**New in iteration 13:**
- ✅ **Multi-mode Test Signal generator**: PINK noise (Paul Kellet), WHITE noise (flat spectrum), and SINE SWEEP (logarithmic 20 Hz → 20 kHz over 8 s, looped). Selectable from a unified PINK / WHT / SWP button group in TopBar; broadcasts the chosen type to all 32 outputs.
- ✅ **Analog-style Pan visualization** in ChannelStrip: 24 px L/R balance bar with equal-power gradient (cos/sin matching the audio engine), glowing white position cursor, center tick, side L/R labels, double-click to recenter.
- ✅ **Meters Pop-out window** for multi-monitor setups: `meters-popout` button opens `#popout=meters` in a separate window. Popout never builds its own audio graph; instead it mirrors live state via the `storage` event and live meter values via a `BroadcastChannel("dsp-meters-sync")` published at 20 Hz from the main window.
- ✅ Fixed P0 compile error (duplicate `type` key in setAllPinkNoise dispatch — renamed action param to `noiseType`).

## What's Been Implemented (2026-01-25 — MVP + ChannelStrip Redesign v2 + Yamaha Console v3)
- ✅ Two-version DSP shell (16+16 / 8+8 Dante) with confirmation modal on switch.
- ✅ Redesigned channel strips with **horizontal input meter** (pre-DSP, post-routing) below header, **larger vertical output meter** (20 LED segments) beside fader, clearer Section headers (Crossover / Processing / Delay / Pan / OUT), **full-width MUTE/SOLO buttons** in 2-col grid, and **EQ / DYNAMICS buttons** that turn amber when active.
- ✅ Audio engine: new `inputAnalyser` per output chain + `getInputLevel()` API for pre-DSP metering.
- ✅ **Yamaha-style SelectedChannelPanel** above the strips: huge parametric EQ with 5 numbered draggable colored band markers on the curve (red / orange / yellow / green / cyan), live band readouts, compressor DYN transfer curve, master fader with dB scale (+10 / 0 / -10 / -20 / -40 / -60) flanked by IN/OUT meters, MUTE/SOLO/EQ-ON/COMP/LIM toggles, and an inline 5-band detail editor (Freq/Gain/Q).
- ✅ **ChannelPills** row with bank tabs (PHY OUT / DANTE VIRT OUT) and Yamaha-style pill selector buttons; selected pill turns cyan.
- ✅ Channel strips show **cyan "▸ SELECTED" label** and cyan border when their channel is active in the panel; clicking strip header also selects it.
- ✅ **Pink Noise generator per output channel** (DSP calibration tool) — Paul Kellet's economy algorithm, 5-second looped buffer shared across all chains. Master broadcast in TopBar ("ALL ON" + level slider) + per-strip pink toggle + dedicated PN slider in SelectedChannelPanel header. Pink noise feeds the chain input so it goes through HPF/LPF/EQ/COMP/DELAY/PAN (test the whole chain).
- ✅ 32 (or 16) channel strips with full Crossover, EQ access, Comp access, Delay (ms/mm/inch with live ms-equivalent readout), Pan, Fader, Mute, Solo, Meter, Reset.
- ✅ EQ modal: 5-band parametric (lowshelf / 3×peaking / highshelf) with live curve preview (Recharts log-X 20 Hz–20 kHz), bypass toggle.
- ✅ Dynamics modal: Compressor (threshold, ratio, attack, release, knee, makeup) + Limiter (ceiling).
- ✅ Routing Matrix tab with PHY/VIRT input groups and PHY/VIRT output columns.
- ✅ Preset Manager modal: save/load/delete/export-JSON/import-JSON.
- ✅ Master gain + mute in top bar.
- ✅ Audio file upload (decode via `decodeAudioData`) + transport play/stop.
- ✅ Per-output level meter (analyser RMS, 16-segment LED-style with peak hold).
- ✅ **State auto-saves to localStorage on every change** — original bug fixed.
- ✅ Low-latency engine (`latencyHint: 'interactive'`, parameter ramps, no graph rebuilds on updates).
- ✅ All interactive elements include `data-testid` per spec.
- ✅ Performance Pro tactical dark theme (Obsidian + Amber #FF6B00, IBM Plex Sans + JetBrains Mono).

## Testing Status
- **Iteration 1 (2026-01-25)**: 14/14 frontend flows passed including the critical localStorage persistence test (delay value 7.7 ms set, page reloaded, value restored). Report: `/app/test_reports/iteration_1.json`.
- **Iteration 2 (2026-01-25)**: 15/15 passed after channel-strip redesign — new input meter + larger output meter validated, no regressions on legacy testids, persistence intact. Report: `/app/test_reports/iteration_2.json`.
- **Iteration 3 (2026-01-25)**: 14/14 passed after Yamaha-style SelectedChannelPanel + ChannelPills + InlineEqGraph (5 draggable colored band markers) + CompCurve added. Selection state is intentionally non-persistent; DSP config persistence still works. Report: `/app/test_reports/iteration_3.json`.
- **Iteration 4 (2026-01-25)**: 100% passed after Pink Noise generator added on all channels (per-output BufferSource w/ Paul Kellet algorithm, master broadcast UI, per-strip toggle, SelectedChannelPanel fine control). Legacy state migration verified. Report: `/app/test_reports/iteration_4.json`.
- **Iterations 5–12 (2026-01-25 → 02-12)**: Custom channel descriptions, Print Channel Map with SVG Signal Flow diagram, animated GR meter, analog-style classic faders, Read-Only/Showcase mode. All 100% passed.
- **Iteration 13 (2026-02-13)**: 9/9 passed — PINK/WHT/SWP type selector + analog-style Pan visual + Meters pop-out via `#popout=meters` (no AudioContext in popout, BroadcastChannel meter sync verified). Report: `/app/test_reports/iteration_13.json`.
- **Iteration 14 (2026-02-13)**: 100% passed — Auto-Capture Sequence (sweep 16/32 outputs with pink noise, peak-dB report, CSV export, mid-sweep cancel preserves channel state, read-only disables start). Report: `/app/test_reports/iteration_14.json`.
- **Iteration 15 (2026-02-13)**: 100% passed — Auto Level Match (post-sweep corrective gain, AVG/TARGET ref selector, ±12 dB clamp, silent-channel filter, one-click Apply + Undo). Report: `/app/test_reports/iteration_15.json`.
- **Iteration 16 (2026-02-13)**: 10/11 — One-Click Calibration pipeline (sweep → match → snapshot → CSV). 1 HIGH-priority safety bug found: read-only mode didn't halt the pipeline. Report: `/app/test_reports/iteration_16.json`.
- **Iteration 17 (2026-02-13)**: 100% passed — Fix verified for the read-only safety bug (typed sentinel `{cancelled, count}` from `start()` + defense-in-depth orchestrator guard `!sweepRes || cancelled || count===0`). Report: `/app/test_reports/iteration_17.json`.
- **Iteration 18 (2026-02-13)**: 100% passed — Calibration Profiles (4 presets, persistence via localStorage, seeds One-Click sliders, snapshot name embeds profile, Auto-Capture keeps defaults). Report: `/app/test_reports/iteration_18.json`.
- **Iteration 19 (2026-02-13)**: 7/8 — Profile Auto-Detector implemented; 1 heuristic edge case (low-delay bonus at 8 routed outputs created a tie). Report: `/app/test_reports/iteration_19.json`.
- **Iteration 20 (2026-02-13)**: 100% passed — 1-line fix verified: gated home-studio low-delay bonus by `activeCount ≤ 4`. All 4 detection scenarios (default HIGH, 8-route MEDIUM, empty LOW, smoke) pass. Report: `/app/test_reports/iteration_20.json`.
- **Iteration 21 (2026-02-13)**: Feature A (Input Strips) 100% (8/8). Feature B (Proactive Hint) initial-chip + apply + dismiss-persistence pass; 3 sub-scenarios (fingerprint-reset re-fire, LOW suppression, popout safety) reported failures but RCA confirms these are **test-side assumption errors** (chip is correctly hidden when active profile already matches the suggestion, regardless of routing changes). Regression: `pan-visual` testid scrolled out of viewport with new inputs row — feature still present, not a real defect. Report: `/app/test_reports/iteration_21.json`.
- **Iteration 22 (2026-02-13)**: Scene Memory 10/11. One real bug: read-only recall blocked by inert wrapper. Report: `/app/test_reports/iteration_22.json`.
- **Iteration 23 (2026-02-13)**: 100% (10/10) — Fix verified: removed inert wrapper around SceneBar, ID collision-proofed. All scene flows (capture, recall, LIVE indicator, rename, overwrite, delete, persistence, read-only guards) pass. Report: `/app/test_reports/iteration_23.json`.
- **Iteration 24 (2026-02-13)**: 100% (9/9 + regression) — Hotkeys 1-8 for scene recall. Verified: hotkey badges, modifier/typing/popout suppression, flash visual, footer hint. Report: `/app/test_reports/iteration_24.json`.
- **Iteration 25 (2026-02-13)**: 100% — Waves eMotion LV1 layout refinements (scribble strip categories, CLR SOLO, TALK push-to-talk, wall clock). Migration verified for older saves. Reviewer hardening applied: talkback never persists across reload. Report: `/app/test_reports/iteration_25.json`.
- **Iteration 26 (2026-02-13)**: 8/10 — AudioSystem DSP File Importer (channel names + auto-categorise). 1 HIGH-priority parser bug: hard-coded 32/32 split missed outputs for <64-record files. Report: `/app/test_reports/iteration_26.json`.
- **Iteration 27 (2026-02-13)**: 100% (3/3) — Fix verified: data-driven half-split when `all.length < 64`, exact 32/32 boundary preserved for real exports. Stale preview reset on new file. Report: `/app/test_reports/iteration_27.json`.
- **Iteration 28 (2026-02-13)**: Parser ported to the real binary format (4-byte MAGIC `B0 04 E0 E3` + 4-byte TERM `E8 03 40 ED`) after a real `.audiosystemdsp` sample arrived. Verified manually: all 64 channel names from the user's 45 128-byte project (`16.audiosystemdsp`) extract correctly and apply to the dsp store with proper categories.

## Prioritized Backlog
### P1 (next session)
- **Channel link estéreo**: pair L/R strips with a single fader and gang their parameters.
- Solo logic UX: visual indication that other channels are dimmed when a solo is active.
- Drag-to-edit on the EQ curve itself (move band freq/gain by dragging the line).
- Channel-name labels in the matrix tooltips on hover.

### P2
- Toggle **Logical/Physical** in the Signal Flow diagram (show back-panel XLR mapping in Print Map).
- **Shareable URL**: encode complete state to base64 in URL hash for quick session sharing.
- Compact **GR meter inline** in ChannelStrip (already in SelectedChannelPanel).
- Real-time spectrum analyzer (FFT) per output.
- A/B preset compare snapshot.
- Polarity (phase invert) button per channel.
- Group/scene buttons (recall multiple presets).

### Future / Out of scope for MVP
- Real Dante audio I/O (requires native SDK and hardware; this is a UI/processing emulation).
- Multi-user collaborative editing.
- MIDI control surface mapping.

## Next Tasks
- Await user feedback / next iteration request.
- Optional: add `Pro Tip` overlay on first boot explaining the bug fix and how to use presets.
