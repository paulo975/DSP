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
const MATCH_DEADBAND_DB = 0.3; // ignore micro-corrections (audibly inaudible)

// Compute per-channel correction (dB) needed to bring its measured peak up to
// the chosen reference (average of the sweep or the target level used during
// capture). Returns 0 for channels considered silent/dead.
const computeCorrection = (row, refDb) => {
  if (!Number.isFinite(row.peakDb) || row.peakDb <= MATCH_FLOOR_DB) return 0;
  const raw = refDb - row.peakDb;
  if (Math.abs(raw) < MATCH_DEADBAND_DB) return 0;
  return Math.max(-MATCH_CLAMP_DB, Math.min(MATCH_CLAMP_DB, raw));
};

const clampGain = (g) => Math.max(-60, Math.min(12, g));

const AutoCaptureSequence = ({ onClose }) => {
  const { state, updateOutput, updateOutputDeep, readOnly } = useDsp();
  const [scope, setScope] = useState("phy");
  const [levelDb, setLevelDb] = useState(-18);
  const [dwellMs, setDwellMs] = useState(1500);
  const [settleMs, setSettleMs] = useState(300);
  const [matchMode, setMatchMode] = useState("avg"); // 'avg' | 'target' — Auto Level Match reference
  const [appliedUndo, setAppliedUndo] = useState(null); // { changes: [{id, oldGain}], appliedAt } — enables Undo
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ idx: 0, total: 0, currentName: "" });
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
    if (readOnly) { setError("App is in read-only mode — unlock first."); return; }
    if (running) return;
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

  // How many channels would actually move if Apply is pressed (i.e. survive
  // the silent/dead-band/clamp filter). Used to gate the Apply button.
  const correctableCount = (avg == null)
    ? 0
    : results.reduce((n, r) => n + (computeCorrection(r, refDb) !== 0 ? 1 : 0), 0);

  const applyLevelMatch = () => {
    if (readOnly || avg == null) return;
    const changes = [];
    results.forEach((r) => {
      const correction = computeCorrection(r, refDb);
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
      return;
    }
    setError(null);
    setAppliedUndo({ changes, appliedAt: new Date().toISOString() });
  };

  const undoLevelMatch = () => {
    if (!appliedUndo) return;
    appliedUndo.changes.forEach((c) => updateOutput(c.id, { gain: c.oldGain }));
    setAppliedUndo(null);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="auto-capture-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00B7FF]">Auto-Capture Sequence</div>
            <div className="text-lg font-semibold text-white">Sweep · Measure · Export</div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            data-testid="ac-close"
            className="text-neutral-400 hover:text-white text-2xl px-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

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
                  const correction = computeCorrection(r, refDb);
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
