import React, { useEffect, useState } from "react";
import { useDsp, listPresets, savePreset, deletePreset, exportPresetJson, importPresetJson } from "@/lib/dspStore";

const PresetManager = ({ onClose }) => {
  const { state, loadPresetState } = useDsp();
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setPresets(listPresets());
  }, []);

  const refresh = () => setPresets(listPresets());

  const handleSave = () => {
    if (!name.trim()) {
      setStatus({ type: "err", msg: "Enter a preset name first." });
      return;
    }
    savePreset(name.trim(), state);
    refresh();
    setStatus({ type: "ok", msg: `Preset "${name}" saved.` });
    setName("");
  };

  const handleLoad = (p) => {
    loadPresetState(p.state);
    setStatus({ type: "ok", msg: `Loaded preset "${p.name}".` });
  };

  const handleDelete = (n) => {
    deletePreset(n);
    refresh();
    setStatus({ type: "ok", msg: `Deleted "${n}".` });
  };

  const handleExport = (p) => {
    const blob = new Blob([exportPresetJson(p)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.name}.dsp.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const preset = importPresetJson(text);
      savePreset(preset.name, preset.state);
      refresh();
      setStatus({ type: "ok", msg: `Imported "${preset.name}".` });
    } catch (err) {
      setStatus({ type: "err", msg: `Import failed: ${err.message}` });
    }
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="preset-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Preset Manager</div>
            <div className="text-lg font-semibold text-white">Saved Configurations</div>
          </div>
          <button onClick={onClose} data-testid="preset-close" className="text-neutral-400 hover:text-white text-2xl px-2">×</button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name (e.g. Stage Left FOH)"
              className="grow bg-black border border-neutral-800 text-sm font-mono text-white px-3 py-2 outline-none focus:border-[#FF6B00]"
              data-testid="preset-name-input"
            />
            <button
              onClick={handleSave}
              data-testid="preset-save-btn"
              className="px-4 py-2 bg-[#FF6B00] text-black text-xs font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FF8533]"
            >
              Save Current
            </button>
            <label className="px-4 py-2 border border-neutral-700 text-neutral-300 text-xs font-mono uppercase tracking-[0.18em] cursor-pointer hover:border-[#FF6B00] hover:text-white" data-testid="preset-import-btn">
              Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
            </label>
          </div>

          {status && (
            <div
              className={`text-[11px] font-mono ${status.type === "ok" ? "text-[#00FF41]" : "text-[#FF3B30]"}`}
              data-testid="preset-status"
            >
              {status.msg}
            </div>
          )}

          <div className="border border-neutral-800">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-[#141414] text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500">
              <span>Name</span><span>Version</span><span>Saved</span><span></span><span></span>
            </div>
            {presets.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs font-mono text-neutral-500" data-testid="preset-empty">
                No presets saved yet.
              </div>
            ) : (
              presets.map((p) => (
                <div key={p.name} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2 border-t border-neutral-900 text-xs font-mono">
                  <span className="text-white font-bold" data-testid={`preset-row-${p.name}`}>{p.name}</span>
                  <span className="text-neutral-400">{p.state.version}</span>
                  <span className="text-neutral-500">{new Date(p.savedAt).toLocaleString()}</span>
                  <button
                    onClick={() => handleLoad(p)}
                    data-testid={`preset-load-${p.name}`}
                    className="px-2 py-1 border border-neutral-700 text-neutral-300 hover:border-[#FF6B00] hover:text-white text-[10px] uppercase tracking-[0.15em]"
                  >
                    Load
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleExport(p)}
                      data-testid={`preset-export-${p.name}`}
                      className="px-2 py-1 border border-neutral-800 text-neutral-400 hover:text-white text-[10px] uppercase tracking-[0.15em]"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => handleDelete(p.name)}
                      data-testid={`preset-delete-${p.name}`}
                      className="px-2 py-1 border border-neutral-800 text-[#FF3B30] hover:bg-[#FF3B30] hover:text-black text-[10px] uppercase tracking-[0.15em]"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresetManager;
