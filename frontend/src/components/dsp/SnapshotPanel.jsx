import React, { useState, useMemo, useEffect } from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";

const SNAPSHOT_KEY = "dsp_snapshots_v1";

const loadSnapshots = () => {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("[SnapshotPanel] load failed:", err);
    return [];
  }
};

const saveSnapshotsList = (list) => {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[SnapshotPanel] save failed:", err);
  }
};

const kindLabel = (k) =>
  k === "in_phy" ? "IN PHY" : k === "in_virt" ? "IN VIRT" : k === "out_phy" ? "OUT PHY" : "OUT VIRT";

const formatDb = (db) => (db <= -60 ? "−∞" : `${db.toFixed(1)}`);

const captureCurrentSnapshot = (inputs, outputs) => {
  const rows = [];
  [...inputs, ...outputs].forEach((c) => {
    const entry = audioEngine.getPeak(c.id);
    const db = entry ? entry.peakDb : -Infinity;
    rows.push({
      id: c.id,
      name: c.name,
      kind: c.kind,
      db: Number.isFinite(db) ? db : -60,
    });
  });
  return rows;
};

const toCsv = (snap) => {
  const lines = ["channel,kind,peak_db"];
  snap.rows.forEach((r) => lines.push(`"${r.name}","${kindLabel(r.kind)}",${r.db.toFixed(2)}`));
  return lines.join("\n");
};

const downloadFile = (filename, content, mime = "text/plain") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const SnapshotPanel = ({ onClose }) => {
  const { state } = useDsp();
  const [current, setCurrent] = useState(null); // { takenAt, rows }
  const [saved, setSaved] = useState(loadSnapshots());
  const [name, setName] = useState("");
  const [sortBy, setSortBy] = useState("db"); // 'db' | 'name' | 'kind'
  const [sortDir, setSortDir] = useState("desc");
  const [compareWith, setCompareWith] = useState(null); // saved snapshot to diff against
  const [status, setStatus] = useState(null);

  const doCapture = () => {
    const rows = captureCurrentSnapshot(state.inputs, state.outputs);
    setCurrent({ takenAt: new Date().toISOString(), rows });
    setStatus({ ok: true, msg: `Captured ${rows.length} channels at ${new Date().toLocaleTimeString()}` });
  };

  const doSave = () => {
    if (!current) {
      setStatus({ ok: false, msg: "Capture a snapshot first." });
      return;
    }
    if (!name.trim()) {
      setStatus({ ok: false, msg: "Enter a name to save the snapshot." });
      return;
    }
    const entry = {
      name: name.trim(),
      savedAt: current.takenAt,
      version: state.version,
      rows: current.rows,
    };
    const next = [...saved.filter((s) => s.name !== entry.name), entry];
    saveSnapshotsList(next);
    setSaved(next);
    setStatus({ ok: true, msg: `Saved as "${entry.name}".` });
    setName("");
  };

  const doDelete = (n) => {
    const next = saved.filter((s) => s.name !== n);
    saveSnapshotsList(next);
    setSaved(next);
    if (compareWith?.name === n) setCompareWith(null);
  };

  const doLoad = (snap) => {
    setCurrent({ takenAt: snap.savedAt, rows: snap.rows });
    setStatus({ ok: true, msg: `Loaded "${snap.name}" — viewing saved snapshot.` });
  };

  const doExport = (snap) => {
    const safeName = snap.name?.replace(/[^a-z0-9._-]/gi, "_") || "snapshot";
    downloadFile(`${safeName}.csv`, toCsv(snap), "text/csv");
  };

  const rows = useMemo(() => {
    if (!current) return [];
    const r = [...current.rows];
    const cmp = compareWith?.rows
      ? new Map(compareWith.rows.map((row) => [row.id, row.db]))
      : null;
    r.forEach((row) => {
      row._delta = cmp?.has(row.id) ? row.db - cmp.get(row.id) : null;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    r.sort((a, b) => {
      if (sortBy === "db") return (a.db - b.db) * dir;
      if (sortBy === "name") return a.name.localeCompare(b.name) * dir;
      if (sortBy === "kind") return a.kind.localeCompare(b.kind) * dir;
      return 0;
    });
    return r;
  }, [current, sortBy, sortDir, compareWith]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="snapshot-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Meter Snapshot</div>
            <div className="text-lg font-semibold text-white">Freeze · Compare · Export levels</div>
          </div>
          <button onClick={onClose} data-testid="snapshot-close" className="text-neutral-400 hover:text-white text-2xl px-2">×</button>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-neutral-800 bg-black/60">
          <button
            onClick={doCapture}
            data-testid="snapshot-capture"
            className="px-3 py-1.5 bg-[#FF6B00] text-black text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FF8533]"
          >
            ◉ Capture Now
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Snapshot name (e.g. Room A Baseline)"
            className="grow min-w-[180px] bg-black border border-neutral-800 text-xs font-mono text-white px-3 py-1.5 outline-none focus:border-[#FF6B00]"
            data-testid="snapshot-name-input"
          />
          <button
            onClick={doSave}
            data-testid="snapshot-save"
            disabled={!current}
            className="px-3 py-1.5 border border-neutral-700 text-neutral-300 text-[10px] font-mono uppercase tracking-[0.18em] hover:border-white hover:text-white disabled:opacity-30"
          >
            Save
          </button>
          {current && (
            <button
              onClick={() => doExport({ name: name || "snapshot", rows: current.rows })}
              data-testid="snapshot-export-current"
              className="px-3 py-1.5 border border-neutral-700 text-neutral-300 text-[10px] font-mono uppercase tracking-[0.18em] hover:border-[#FF6B00] hover:text-[#FF6B00]"
            >
              Export CSV
            </button>
          )}
          <select
            value={compareWith?.name || ""}
            onChange={(e) => {
              const v = e.target.value;
              setCompareWith(v ? saved.find((s) => s.name === v) : null);
            }}
            className="bg-black border border-neutral-800 text-[10px] font-mono text-white px-2 py-1.5 outline-none focus:border-[#FF6B00] uppercase tracking-[0.15em]"
            data-testid="snapshot-compare-select"
          >
            <option value="">Compare ▾ (none)</option>
            {saved.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {status && (
          <div
            className={`px-4 py-1.5 text-[11px] font-mono ${status.ok ? "text-[#00FF41]" : "text-[#FF3B30]"}`}
            data-testid="snapshot-status"
          >
            {status.msg}
          </div>
        )}

        {/* Current snapshot table */}
        <div className="grow overflow-auto">
          {!current ? (
            <div className="h-full min-h-[200px] flex items-center justify-center text-xs font-mono uppercase tracking-[0.2em] text-neutral-500" data-testid="snapshot-empty">
              No snapshot captured yet — press ◉ Capture Now
            </div>
          ) : (
            <table className="w-full text-xs font-mono" data-testid="snapshot-table">
              <thead className="sticky top-0 bg-[#141414] border-b border-neutral-800">
                <tr className="text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-white" onClick={() => toggleSort("name")} data-testid="snapshot-sort-name">
                    Channel {sortBy === "name" && (sortDir === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-white" onClick={() => toggleSort("kind")} data-testid="snapshot-sort-kind">
                    Kind {sortBy === "kind" && (sortDir === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-white" onClick={() => toggleSort("db")} data-testid="snapshot-sort-db">
                    Peak dB {sortBy === "db" && (sortDir === "asc" ? "▲" : "▼")}
                  </th>
                  {compareWith && (
                    <th className="px-3 py-2 text-right text-[#FFB800]">
                      Δ vs {compareWith.name}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sev =
                    r.db > -2 ? "#FF3B30" : r.db > -6 ? "#FFB800" : r.db > -40 ? "#00FF41" : "#666";
                  const deltaColor =
                    r._delta == null ? "#666" : Math.abs(r._delta) < 0.5 ? "#999" : r._delta > 0 ? "#FFB800" : "#00B7FF";
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-neutral-900 hover:bg-black/40"
                      data-testid={`snapshot-row-${r.id}`}
                    >
                      <td className="px-3 py-1.5 text-white font-bold">{r.name}</td>
                      <td className="px-3 py-1.5 text-neutral-400">{kindLabel(r.kind)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold" style={{ color: sev }}>
                        {formatDb(r.db)} dB
                      </td>
                      {compareWith && (
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: deltaColor }}>
                          {r._delta == null ? "—" : `${r._delta >= 0 ? "+" : ""}${r._delta.toFixed(1)} dB`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Saved snapshots list */}
        <div className="border-t border-neutral-800 bg-black/60">
          <div className="px-4 py-2 text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
            Saved Snapshots · {saved.length}
          </div>
          <div className="max-h-32 overflow-auto">
            {saved.length === 0 ? (
              <div className="px-4 py-3 text-[11px] font-mono text-neutral-600">No saved snapshots yet.</div>
            ) : (
              saved.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-2 px-4 py-1.5 border-t border-neutral-900 text-xs font-mono"
                  data-testid={`snapshot-saved-${s.name}`}
                >
                  <span className="text-white font-bold grow truncate" title={s.name}>{s.name}</span>
                  <span className="text-neutral-500 text-[10px]">{s.version}</span>
                  <span className="text-neutral-500 text-[10px]">{new Date(s.savedAt).toLocaleString()}</span>
                  <button
                    onClick={() => doLoad(s)}
                    data-testid={`snapshot-load-${s.name}`}
                    className="px-2 py-0.5 border border-neutral-700 text-neutral-300 hover:border-[#FF6B00] hover:text-white text-[10px] uppercase tracking-[0.15em]"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => doExport(s)}
                    data-testid={`snapshot-export-${s.name}`}
                    className="px-2 py-0.5 border border-neutral-800 text-neutral-400 hover:text-white text-[10px] uppercase tracking-[0.15em]"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => doDelete(s.name)}
                    data-testid={`snapshot-delete-${s.name}`}
                    className="px-2 py-0.5 border border-neutral-800 text-[#FF3B30] hover:bg-[#FF3B30] hover:text-black text-[10px] uppercase tracking-[0.15em]"
                  >
                    Del
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotPanel;
