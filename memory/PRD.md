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

## What's Been Implemented (2026-01-25 — MVP)
- ✅ Two-version DSP shell (16+16 / 8+8 Dante) with confirmation modal on switch.
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

## Prioritized Backlog
### P1 (next session)
- Solo logic UX: visual indication that other channels are dimmed when a solo is active.
- Drag-to-edit on the EQ curve itself (move band freq/gain by dragging the line).
- Stereo-link button for paired channels (1+2, 3+4, ...).
- Channel-name labels in the matrix tooltips on hover.

### P2
- Real-time spectrum analyzer (FFT) per output.
- A/B preset compare snapshot.
- Polarity (phase invert) button per channel.
- Group/scene buttons (recall multiple presets).
- Lock/freeze parameter to prevent accidental edits.

### Future / Out of scope for MVP
- Real Dante audio I/O (requires native SDK and hardware; this is a UI/processing emulation).
- Multi-user collaborative editing.
- MIDI control surface mapping.

## Next Tasks
- Await user feedback / next iteration request.
- Optional: add `Pro Tip` overlay on first boot explaining the bug fix and how to use presets.
