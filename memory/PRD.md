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
