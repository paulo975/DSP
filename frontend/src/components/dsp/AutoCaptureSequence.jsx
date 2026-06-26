// Auto-Capture Sequence — sweeps the selected output channels one at a time,
// injects pink noise at a fixed level, samples the output meter, and produces
// a per-channel peak-dB report ready to export as CSV.
//
// Use case (pro install / car-audio tuning):
//   1. Aim a calibrated mic at the rig.
//   2. Run the sequence → each speaker is energised in isolation.
//   3. Compare peak dB across channels to detect mismatched levels / dead spots
//      / wiring errors without manually toggling 16 mute/solo buttons.
import React, { useState, useRef, useEffect } from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";
import { captureCurrentSnapshot, loadSnapshots, saveSnapshotsList } from "./SnapshotPanel";
import { getProfileById } from "@/lib/calibrationProfiles";

const SCOPE_OPTIONS = [
  { id: "phy", label: "Physical Only" },
  { id: "virt", label: "Dante Virtual Only" },
  { id: "all", label: "All Outputs" },
];

const levelToDb = (lvl) => (lvl <= 0 ? -Infinity : Math.max(-60, 20 * Math.log10(lvl)));
const formatDb = (db) => (db <= -60 || !Number.isFinite(db) ? "−∞" : `${db.toFixed(1)} dB`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const downloadCsv = (filename, rows) => {
  const head = "index,channel,kind,peak_db,target_level_db,delta_db";
  const body = rows
    .map((r) => `${r.idx},"${r.name}","${r.kind}",${r.peakDb.toFixed(2)},${r.targetDb.toFixed(2)},${(r.peakDb - r.targetDb).toFixed(2)}`)
    .join("\n");
  const blob = new Blob([`${head}\n${body}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Level-Match constants — keep the auto-correction conservative so a single
// wiring error or a dead channel can't push faders to the rails.
const MATCH_CLAMP_DB = 12; // maximum |correction| per channel
const MATCH_FLOOR_DB = -55; // peaks at or below this are treated as "silent" → no correction
const MATCH_DEADBAND_DB_DEFAULT = 0.3; // ignore micro-corrections (audibly inaudible)

// Compute per-channel correction (dB) needed to bring its measured peak up to
// the chosen reference (average of the sweep or the target level used during
// capture). Returns 0 for channels considered silent/dead. The dead-band can be
// overridden per calibration profile (e.g. House of Worship uses ±2 dB).
const computeCorrection = (row, refDb, deadBandDb = MATCH_DEADBAND_DB_DEFAULT) => {
  if (!Number.isFinite(row.peakDb) || row.peakDb <= MATCH_FLOOR_DB) return 0;
  const raw = refDb - row.peakDb;
  if (Math.abs(raw) < deadBandDb) return 0;
  return Math.max(-MATCH_CLAMP_DB, Math.min(MATCH_CLAMP_DB, raw));
};

const clampGain = (g) => Math.max(-60, Math.min(12, g));

const AutoCaptureSequence = ({ onClose, oneClick = false, profileId = null }) => {
  const { state, updateOutput, updateOutputDeep, readOnly } = useDsp();
  const profile = profileId ? getProfileById(profileId) : null;
  // When a profile is supplied, its parameters override the defaults so the
  // user can run One-Click without touching any slider.
  const [scope, setScope] = useState(profile?.scope ?? "phy");
  const [levelDb, setLevelDb] = useState(profile?.levelDb ?? -18);
  const [dwellMs, setDwellMs] = useState(profile?.dwellMs ?? 1500);
  const [settleMs, setSettleMs] = useState(profile?.settleMs ?? 300);
  const [matchMode, setMatchMode] = useState(profile?.matchMode ?? "avg");
  const [appliedUndo, setAppliedUndo] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ idx: 0, total: 0, currentName: "" });
  // One-Click pipeline phase: 'idle' | 'sweep' | 'matching' | 'snapshotting' | 'done' | 'cancelled'
  const [ocPhase, setOcPhase] = useState("idle");
  const [results, setResults] = useState([]); // [{idx, id, name, kind, peakDb, targetDb}]
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const targets = state.outputs.filter((o) => {
    if (scope === "phy") return o.kind === "out_phy";
    if (scope === "virt") return o.kind === "out_virt";
    return true;
  });

  useEffect(() => () => { cancelRef.current = true; }, []);

  const start = async () => {
    if (readOnly) {
      setError("App is in read-only mode — unlock first.");
      return { cancelled: true, count: 0 };
    }
    if (running) return { cancelled: true, count: 0 };
    setError(null);
    setResults([]);
    setAppliedUndo(null);
    setRunning(true);
    cancelRef.current = false;

    // Snapshot the bits we'll mutate so we can restore on finish/cancel.
    const original = state.outputs.map((o) => ({
      id: o.id,
      mute: o.mute,
      pinkEnabled: o.pinkNoise?.enabled ?? false,
      pinkLevel: o.pinkNoise?.level ?? -20,
    }));

    // Mute everything (silences existing pink noise / file playback) so the
    // measurement isolates one channel at a time.
    state.outputs.forEach((o) => {
      updateOutputDeep(o.id, (cur) => ({
        ...cur,
        mute: true,
        pinkNoise: { ...(cur.pinkNoise || { type: "pink" }), enabled: false, level: levelDb },
      }));
    });

    const collected = [];
    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      const out = targets[i];
      setProgress({ idx: i + 1, total: targets.length, currentName: out.name });

      // Solo current: unmute it, enable its pink noise at target level.
      updateOutputDeep(out.id, (cur) => ({
        ...cur,
        mute: false,
        pinkNoise: { ...(cur.pinkNoise || { type: "pink" }), enabled: true, level: levelDb },
      }));

      // Let the chain settle (delay/compressor attack/etc).
      await sleep(settleMs);
      if (cancelRef.current) break;

      // Sample output meter for `dwellMs`, keep peak.
      let peak = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < dwellMs) {
        if (cancelRef.current) break;
        const lvl = audioEngine.getOutputLevel(out.id);
        if (lvl > peak) peak = lvl;
        await sleep(40);
      }
      const peakDb = levelToDb(peak);
      collected.push({
        idx: i + 1,
        id: out.id,
        name: out.name,
        kind: out.kind,
        peakDb: Number.isFinite(peakDb) ? peakDb : -60,
        targetDb: levelDb,
      });
      setResults([...collected]);

      // Mute current again before moving on.
      updateOutputDeep(out.id, (cur) => ({
        ...cur,
        mute: true,
        pinkNoise: { ...(cur.pinkNoise || { type: "pink" }), enabled: false },
      }));
    }

    // Restore original mute + pink noise state on every output.
    original.forEach((orig) => {
      updateOutputDeep(orig.id, (cur) => ({
        ...cur,
        mute: orig.mute,
        pinkNoise: {
          ...(cur.pinkNoise || { type: "pink" }),
          enabled: orig.pinkEnabled,
          level: orig.pinkLevel,
        },
      }));
    });

    setRunning(false);
    setProgress({ idx: 0, total: 0, currentName: "" });
    // Tell the One-Click orchestrator whether the sweep finished cleanly.
    return { cancelled: cancelRef.current, count: collected.length };
  };

  const cancel = () => { cancelRef.current = true; };

  const exportCsv = () => {
    if (!results.length) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadCsv(`auto-capture-${scope}-${ts}.csv`, results);
  };

  const avg = results.length
    ? results.reduce((s, r) => s + r.peakDb, 0) / results.length
    : null;

  // Reference level for Auto Level Match: average of the sweep, or the target
  // dB the user dialled in at capture time.
  const refDb = matchMode === "target" ? levelDb : avg;
  const deadBandDb = profile?.deadBandDb ?? MATCH_DEADBAND_DB_DEFAULT;

  // How many channels would actually move if Apply is pressed (i.e. survive
  // the silent/dead-band/clamp filter). Used to gate the Apply button.
  const correctableCount = (avg == null)
    ? 0
    : results.reduce((n, r) => n + (computeCorrection(r, refDb, deadBandDb) !== 0 ? 1 : 0), 0);

  const applyLevelMatch = () => {
    if (readOnly || avg == null) return { applied: 0 };
    const changes = [];
    results.forEach((r) => {
      const correction = computeCorrection(r, refDb, deadBandDb);
      if (correction === 0) return;
      const out = state.outputs.find((o) => o.id === r.id);
      if (!out) return;
      const oldGain = out.gain;
      const newGain = clampGain(oldGain + correction);
      changes.push({ id: r.id, oldGain, newGain });
      updateOutput(r.id, { gain: newGain });
    });
    if (changes.length === 0) {
      setError("All channels already within the dead-band — nothing to adjust.");
      return { applied: 0 };
    }
    setError(null);
    setAppliedUndo({ changes, appliedAt: new Date().toISOString() });
    return { applied: changes.length };
  };

  const undoLevelMatch = () => {
    if (!appliedUndo) return;
    appliedUndo.changes.forEach((c) => updateOutput(c.id, { gain: c.oldGain }));
    setAppliedUndo(null);
  };

  // One-Click Calibration orchestrator: sweep → level-match → snapshot → CSV
  // Sequentially chains existing helpers so the integrator gets a complete
  // calibration in ~30 seconds with a single button press.
  const [ocSummary, setOcSummary] = useState(null); // { swept, matched, snapshot, csv }
  const startedOneClickRef = useRef(false);

  const runOneClickPipeline = async () => {
    if (startedOneClickRef.current) return;
    startedOneClickRef.current = true;
    setOcSummary(null);
    setOcPhase("sweep");

    // 1. Sweep
    const sweepRes = await start();
    // Halt the pipeline if the sweep was cancelled, blocked (read-only) or
    // produced zero samples — prevents snapshot/CSV side-effects on a
    // locked app.
    if (!sweepRes || sweepRes.cancelled || sweepRes.count === 0) {
      setOcPhase("cancelled");
      return;
    }

    // 2. Auto Level Match (AVG mode)
    setOcPhase("matching");
    await sleep(150); // let React flush results state before computing corrections
    const matchRes = applyLevelMatch();

    // 3. Snapshot to the saved-snapshots store
    setOcPhase("snapshotting");
    await sleep(120);
    const snapName = `One-Click${profile ? ` (${profile.name})` : ""} ${new Date().toLocaleString()}`;
    const rows = captureCurrentSnapshot(state.inputs, state.outputs);
    const snap = {
      id: `one-click-${Date.now()}`,
      name: snapName,
      takenAt: new Date().toISOString(),
      rows,
    };
    const list = loadSnapshots();
    saveSnapshotsList([snap, ...list]);

    // 4. CSV
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const csvName = `one-click-calibration-${ts}.csv`;
    downloadCsv(csvName, results.length ? results : []);

    setOcSummary({
      swept: sweepRes?.count ?? 0,
      matched: matchRes?.applied ?? 0,
      snapshot: snapName,
      csv: csvName,
    });
    setOcPhase("done");
  };

  // Auto-fire the One-Click pipeline once on mount when the modal is opened in
  // oneClick mode. Guarded by startedOneClickRef so a re-render doesn't restart.
  useEffect(() => {
    if (!oneClick) return;
    const t = setTimeout(() => { runOneClickPipeline(); }, 200);
    return () => clearTimeout(t);
  }, [oneClick]);

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="auto-capture-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div
              className="text-[10px] font-mono uppercase tracking-[0.2em]"
              style={{ color: profile?.color || (oneClick ? "#FFD60A" : "#00B7FF") }}
            >
              {oneClick ? `⚡ One-Click Calibration${profile ? ` · ${profile.icon} ${profile.name}` : ""}` : "Auto-Capture Sequence"}
            </div>
            <div className="text-lg font-semibold text-white">
              {oneClick ? "Sweep → Match → Snapshot → CSV" : "Sweep · Measure · Export"}
            </div>
            {profile && oneClick && (
              <div className="text-[10px] font-mono text-neutral-500 mt-0.5" data-testid="oc-profile-desc">
                {profile.description} · level {profile.levelDb} dB · dwell {profile.dwellMs} ms · tolerance ±{profile.deadBandDb} dB
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={running || ocPhase === "matching" || ocPhase === "snapshotting"}
            data-testid="ac-close"
            className="text-neutral-400 hover:text-white text-2xl px-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

        {/* One-Click pipeline status banner */}
        {oneClick && (
          <div
            className="px-4 py-2 border-b border-neutral-800 text-[10px] font-mono uppercase tracking-[0.18em] flex items-center justify-between"
            style={{
              background: ocPhase === "done" ? "rgba(255,214,10,0.08)" : "rgba(0,183,255,0.06)",
            }}
            data-testid="oc-phase-banner"
          >
            <span className="text-neutral-400">
              {ocPhase === "idle" && "Starting…"}
              {ocPhase === "sweep" && <span style={{ color: "#00B7FF" }}>▮ Step 1/4 · Sweeping channels with pink noise</span>}
              {ocPhase === "matching" && <span style={{ color: "#FFD60A" }}>▮▮ Step 2/4 · Applying Level Match (AVG)</span>}
              {ocPhase === "snapshotting" && <span style={{ color: "#FF6B00" }}>▮▮▮ Step 3/4 · Saving snapshot</span>}
              {ocPhase === "done" && <span style={{ color: "#00FF41" }}>✓ Step 4/4 · Calibration complete — CSV downloaded</span>}
              {ocPhase === "cancelled" && <span style={{ color: "#FF3B30" }}>✕ Cancelled by user — original state restored</span>}
            </span>
            <span data-testid="oc-phase-id" className="text-neutral-600">phase: {ocPhase}</span>
          </div>
        )}

        {/* Config */}
        <div className="px-4 py-3 border-b border-neutral-800 bg-black/60 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">Scope</label>
            <div className="flex border border-neutral-800" data-testid="ac-scope-group">
              {SCOPE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  disabled={running}
                  data-testid={`ac-scope-${s.id}`}
                  className="text-[10px] font-mono uppercase tracking-[0.15em] px-3 py-1.5 border-r last:border-r-0 border-neutral-800 font-bold transition-colors disabled:opacity-40"
                  style={{
                    background: scope === s.id ? "#00B7FF" : "transparent",
                    color: scope === s.id ? "#000" : "#888",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono text-neutral-500" data-testid="ac-target-count">
              · {targets.length} channels
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-[11px] font-mono">
            <label className="flex items-center gap-2">
              <span className="uppercase tracking-[0.18em] text-neutral-500">Level</span>
              <input
                type="range"
                min={-40}
                max={0}
                step={1}
                value={levelDb}
                disabled={running}
                onChange={(e) => setLevelDb(Number(e.target.value))}
                className="w-32 accent-[#FF7AC6] disabled:opacity-40"
                data-testid="ac-level"
              />
              <span className="text-white font-bold w-14 text-right" data-testid="ac-level-value">{levelDb} dB</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="uppercase tracking-[0.18em] text-neutral-500">Dwell</span>
              <input
                type="range"
                min={500}
                max={3000}
                step={100}
                value={dwellMs}
                disabled={running}
                onChange={(e) => setDwellMs(Number(e.target.value))}
                className="w-28 accent-[#00B7FF] disabled:opacity-40"
                data-testid="ac-dwell"
              />
              <span className="text-white font-bold w-14 text-right">{dwellMs} ms</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="uppercase tracking-[0.18em] text-neutral-500">Settle</span>
              <input
                type="range"
                min={100}
                max={1000}
                step={50}
                value={settleMs}
                disabled={running}
                onChange={(e) => setSettleMs(Number(e.target.value))}
                className="w-24 accent-[#00B7FF] disabled:opacity-40"
                data-testid="ac-settle"
              />
              <span className="text-white font-bold w-14 text-right">{settleMs} ms</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {!running ? (
              <button
                onClick={start}
                disabled={readOnly || targets.length === 0}
                data-testid="ac-start"
                className="px-4 py-2 bg-[#00B7FF] text-black text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#33CBFF] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ▶ Start Sequence
              </button>
            ) : (
              <button
                onClick={cancel}
                data-testid="ac-cancel"
                className="px-4 py-2 bg-[#FF3B30] text-black text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FF5547]"
              >
                ■ Cancel
              </button>
            )}
            {results.length > 0 && !running && (
              <button
                onClick={exportCsv}
                data-testid="ac-export-csv"
                className="px-3 py-2 border border-neutral-700 text-neutral-300 text-[10px] font-mono uppercase tracking-[0.18em] hover:border-[#FF6B00] hover:text-[#FF6B00]"
              >
                Export CSV
              </button>
            )}
            {/* Auto Level Match — appears after a sweep finishes. Adjusts each
                channel's gain so all measured peaks land on the chosen reference
                (sweep average by default, or the dialled-in target level). */}
            {results.length > 0 && !running && !appliedUndo && (
              <>
                <div className="flex items-center gap-1 ml-2" data-testid="ac-match-group">
                  <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500">Match to</span>
                  <button
                    onClick={() => setMatchMode("avg")}
                    data-testid="ac-match-avg"
                    className="text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 border font-bold"
                    style={{
                      background: matchMode === "avg" ? "#FFD60A" : "transparent",
                      color: matchMode === "avg" ? "#000" : "#888",
                      borderColor: matchMode === "avg" ? "#FFD60A" : "#2A2A2A",
                    }}
                  >
                    AVG
                  </button>
                  <button
                    onClick={() => setMatchMode("target")}
                    data-testid="ac-match-target"
                    className="text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 border font-bold"
                    style={{
                      background: matchMode === "target" ? "#FFD60A" : "transparent",
                      color: matchMode === "target" ? "#000" : "#888",
                      borderColor: matchMode === "target" ? "#FFD60A" : "#2A2A2A",
                    }}
                  >
                    TARGET
                  </button>
                </div>
                <button
                  onClick={applyLevelMatch}
                  disabled={readOnly || correctableCount === 0}
                  data-testid="ac-apply-match"
                  title={readOnly ? "Unlock the app to apply" : `Adjusts ${correctableCount} channel(s) by up to ±${MATCH_CLAMP_DB} dB`}
                  className="px-3 py-2 bg-[#FFD60A] text-black text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FFE140] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ✦ Apply Match ({correctableCount})
                </button>
              </>
            )}
            {appliedUndo && !running && (
              <button
                onClick={undoLevelMatch}
                data-testid="ac-undo-match"
                title={`Revert ${appliedUndo.changes.length} channel gain change(s) applied ${new Date(appliedUndo.appliedAt).toLocaleTimeString()}`}
                className="px-3 py-2 border-2 border-[#FFD60A] text-[#FFD60A] text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FFD60A] hover:text-black ml-2"
              >
                ↶ Undo Match ({appliedUndo.changes.length})
              </button>
            )}
            {error && (
              <span className="text-[11px] font-mono text-[#FF3B30]" data-testid="ac-error">{error}</span>
            )}
          </div>

          {running && (
            <div className="space-y-1" data-testid="ac-progress">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-[#00B7FF] uppercase tracking-[0.18em]">
                  ▮ Capturing {progress.currentName}
                </span>
                <span className="text-white tabular-nums">{progress.idx} / {progress.total}</span>
              </div>
              <div className="h-1.5 bg-black border border-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-[#00B7FF] transition-[width] duration-200"
                  style={{ width: progress.total ? `${(progress.idx / progress.total) * 100}%` : "0%" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="grow overflow-auto">
          {ocSummary && oneClick && (
            <div
              className="m-3 p-4 border-2 border-[#FFD60A] bg-[#FFD60A]/5"
              data-testid="oc-summary"
            >
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#FFD60A] mb-2">
                ⚡ Calibration Summary
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="text-neutral-400">Channels swept</div>
                <div className="text-white font-bold text-right tabular-nums" data-testid="oc-sum-swept">{ocSummary.swept}</div>
                <div className="text-neutral-400">Gains adjusted</div>
                <div className="text-white font-bold text-right tabular-nums" data-testid="oc-sum-matched">{ocSummary.matched}</div>
                <div className="text-neutral-400">Snapshot saved</div>
                <div className="text-white font-bold text-right truncate" data-testid="oc-sum-snapshot">{ocSummary.snapshot}</div>
                <div className="text-neutral-400">CSV exported</div>
                <div className="text-white font-bold text-right truncate" data-testid="oc-sum-csv">{ocSummary.csv}</div>
              </div>
              {appliedUndo && (
                <div className="mt-3 pt-3 border-t border-[#FFD60A]/30 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-neutral-400">
                    Don&apos;t like the result? Roll back every gain change in one click.
                  </span>
                  <button
                    onClick={undoLevelMatch}
                    data-testid="oc-undo"
                    className="px-3 py-1.5 border border-[#FFD60A] text-[#FFD60A] text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FFD60A] hover:text-black"
                  >
                    ↶ Undo Calibration
                  </button>
                </div>
              )}
            </div>
          )}
          {results.length === 0 ? (
            <div className="h-full min-h-[200px] flex items-center justify-center text-xs font-mono uppercase tracking-[0.2em] text-neutral-500 text-center px-6" data-testid="ac-empty">
              Configure scope/level/dwell, point a calibrated mic at the rig, then press ▶ Start Sequence.<br/>
              Each output is energised in isolation with pink noise and its peak measured.
            </div>
          ) : (
            <table className="w-full text-xs font-mono" data-testid="ac-results-table">
              <thead className="sticky top-0 bg-[#141414] border-b border-neutral-800">
                <tr className="text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-right">Peak</th>
                  <th className="px-3 py-2 text-right">Target</th>
                  <th className="px-3 py-2 text-right">Δ vs avg</th>
                  <th className="px-3 py-2 text-right text-[#FFD60A]">
                    Correction ({matchMode === "target" ? "→ target" : "→ avg"})
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const delta = avg != null ? r.peakDb - avg : 0;
                  const sevPeak = r.peakDb > -2 ? "#FF3B30" : r.peakDb > -6 ? "#FFB800" : r.peakDb > -50 ? "#00FF41" : "#666";
                  const deltaColor = Math.abs(delta) < 1 ? "#888" : Math.abs(delta) < 3 ? "#FFB800" : "#FF3B30";
                  const correction = computeCorrection(r, refDb, deadBandDb);
                  const corrColor = correction === 0
                    ? "#555"
                    : Math.abs(correction) >= MATCH_CLAMP_DB - 0.01 ? "#FF3B30" : "#FFD60A";
                  return (
                    <tr key={r.id} className="border-b border-neutral-900 hover:bg-black/40" data-testid={`ac-row-${r.id}`}>
                      <td className="px-3 py-1.5 text-neutral-500 tabular-nums">{r.idx}</td>
                      <td className="px-3 py-1.5 text-white font-bold">{r.name}</td>
                      <td className="px-3 py-1.5 text-neutral-400">{r.kind === "out_phy" ? "PHY" : "VIRT"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold" style={{ color: sevPeak }}>
                        {formatDb(r.peakDb)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{r.targetDb} dB</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: deltaColor }}>
                        {delta >= 0 ? "+" : ""}{delta.toFixed(1)} dB
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold" style={{ color: corrColor }} data-testid={`ac-correction-${r.id}`}>
                        {correction === 0 ? "—" : `${correction > 0 ? "+" : ""}${correction.toFixed(1)} dB`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {avg != null && (
                <tfoot className="bg-[#101010] border-t border-neutral-800">
                  <tr className="text-[10px] font-mono">
                    <td className="px-3 py-2 text-neutral-500" colSpan={3}>
                      <span className="uppercase tracking-[0.18em]">Average</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-[#00B7FF]" data-testid="ac-avg-db">
                      {formatDb(avg)}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-500">—</td>
                    <td className="px-3 py-2 text-right text-neutral-500">—</td>
                    <td className="px-3 py-2 text-right text-[#FFD60A] tabular-nums" data-testid="ac-correctable-count">
                      {correctableCount} ch
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoCaptureSequence;
