import React, { useRef, useState } from "react";
import { useDsp } from "@/lib/dspStore";
import { VERSIONS } from "@/lib/dspDefaults";
import { audioEngine } from "@/lib/audioEngine";

const TopBar = ({ tab, setTab, onOpenPresets, onOpenPrint }) => {
  const { state, setVersion, setMaster, setAllPinkNoise, readOnly, toggleReadOnly } = useDsp();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showVersionConfirm, setShowVersionConfirm] = useState(null);

  // Derive pink noise master state from outputs:
  // "ALL ON" = every output has pinkNoise.enabled === true.
  const pinkAllOn = state.outputs.length > 0 && state.outputs.every((o) => o.pinkNoise?.enabled);
  // Master level slider mirrors first output's level (they're broadcast together).
  const pinkLevel = state.outputs[0]?.pinkNoise?.level ?? -20;
  const pinkType = state.outputs[0]?.pinkNoise?.type ?? "pink";

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    try {
      await audioEngine.loadFile(f);
    } catch (err) {
      console.error("File load failed", err);
    }
  };

  const togglePlay = () => {
    if (playing) {
      audioEngine.stopFile();
      setPlaying(false);
    } else {
      audioEngine.playFile(state);
      setPlaying(true);
    }
  };

  const handleVersionSelect = (vid) => {
    if (vid !== state.version) setShowVersionConfirm(vid);
  };

  const confirmVersion = () => {
    if (playing) audioEngine.stopFile();
    setPlaying(false);
    setVersion(showVersionConfirm);
    setShowVersionConfirm(null);
  };

  const tabs = [
    { id: "channels", label: "Channels" },
    { id: "meters", label: "Meters" },
    { id: "matrix", label: "Routing Matrix" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800 bg-black">
      <div className="flex items-stretch h-14">
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 border-r border-neutral-800">
          <div className="w-7 h-7 bg-[#FF6B00] flex items-center justify-center font-mono text-black font-bold text-sm">A</div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white tracking-tight">AudioSystem DSP</div>
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">Web · v3.1</div>
          </div>
        </div>

        {/* Lock / Read-Only toggle */}
        <div className="flex items-center px-3 border-r border-neutral-800">
          <button
            onClick={toggleReadOnly}
            data-testid="readonly-toggle"
            title={readOnly ? "Currently LOCKED — click to unlock for editing" : "Lock app to prevent accidental edits (showcase mode)"}
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border font-bold transition-colors flex items-center gap-1.5"
            style={{
              background: readOnly ? "#FFD60A" : "transparent",
              color: readOnly ? "#000" : "#999",
              borderColor: readOnly ? "#FFD60A" : "#2A2A2A",
            }}
          >
            <span style={{ fontSize: 13 }}>{readOnly ? "🔒" : "🔓"}</span>
            {readOnly ? "LOCKED" : "EDITABLE"}
          </button>
        </div>

        {/* Version selector */}
        <div className="flex items-center gap-1 px-4 border-r border-neutral-800">
          {Object.values(VERSIONS).map((v) => (
            <button
              key={v.id}
              onClick={() => handleVersionSelect(v.id)}
              disabled={readOnly}
              data-testid={`version-${v.id}`}
              className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: state.version === v.id ? "#FF6B00" : "transparent",
                color: state.version === v.id ? "#000" : "#999",
                borderColor: state.version === v.id ? "#FF6B00" : "#2A2A2A",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-stretch border-r border-neutral-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className="px-5 text-xs font-semibold tracking-tight border-b-2 transition-colors"
              style={{
                borderColor: tab === t.id ? "#FF6B00" : "transparent",
                color: tab === t.id ? "#fff" : "#999",
                background: tab === t.id ? "#0F0F0F" : "transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* File / transport */}
        <div className="flex items-center gap-2 px-4 border-r border-neutral-800">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={onFile}
            data-testid="audio-file-input"
          />
          <button
            onClick={() => fileRef.current?.click()}
            data-testid="audio-file-btn"
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border border-neutral-700 text-neutral-300 hover:border-[#FF6B00] hover:text-white"
          >
            Load Audio
          </button>
          <button
            onClick={togglePlay}
            disabled={!fileName}
            data-testid="audio-play-btn"
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border disabled:opacity-30"
            style={{
              background: playing ? "#00FF41" : "transparent",
              color: playing ? "#000" : "#fff",
              borderColor: playing ? "#00FF41" : "#2A2A2A",
            }}
          >
            {playing ? "■ Stop" : "▶ Play"}
          </button>
          <span className="text-[10px] font-mono text-neutral-500 truncate max-w-[180px]" data-testid="audio-file-name">
            {fileName || "no file"}
          </span>
        </div>

        {/* Pink Noise (test signal generator — broadcasts to ALL output chain inputs) */}
        <div className="flex items-center gap-2 px-4 border-r border-neutral-800">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em]" style={{ color: pinkAllOn ? "#FF7AC6" : "#666" }}>
            Pink Noise
          </span>
          <button
            onClick={() => setAllPinkNoise(!pinkAllOn, pinkLevel)}
            disabled={readOnly}
            data-testid="pn-master-toggle"
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: pinkAllOn ? "#FF7AC6" : "transparent",
              color: pinkAllOn ? "#000" : "#888",
              borderColor: pinkAllOn ? "#FF7AC6" : "#2A2A2A",
            }}
          >
            {pinkAllOn ? "ALL ON" : "ALL OFF"}
          </button>
          <input
            type="range"
            min={-60}
            max={0}
            step={0.5}
            value={pinkLevel}
            disabled={readOnly}
            onChange={(e) => {
              const v = Number(e.target.value);
              setAllPinkNoise(pinkAllOn || undefined, v);
            }}
            className="w-20 accent-[#FF7AC6] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="pn-master-level"
          />
          <span className="text-[10px] font-mono font-bold text-white w-12 text-right" data-testid="pn-master-level-value">
            {pinkLevel.toFixed(1)} dB
          </span>
        </div>

        {/* Master */}
        <div className="flex items-center gap-3 px-4 ml-auto border-l border-neutral-800">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500">Master</span>
          <input
            type="range"
            min={-60}
            max={6}
            step={0.1}
            value={state.masterGain}
            disabled={readOnly}
            onChange={(e) => setMaster({ masterGain: Number(e.target.value) })}
            className="w-28 accent-[#FF6B00] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="master-gain"
          />
          <span className="text-xs font-mono font-bold text-white w-14 text-right" data-testid="master-gain-value">
            {state.masterGain.toFixed(1)} dB
          </span>
          <button
            onClick={() => setMaster({ masterMute: !state.masterMute })}
            disabled={readOnly}
            data-testid="master-mute"
            className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] px-3 py-1.5 border disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: state.masterMute ? "#FF3B30" : "transparent",
              color: state.masterMute ? "#000" : "#999",
              borderColor: state.masterMute ? "#FF3B30" : "#2A2A2A",
            }}
          >
            {state.masterMute ? "MUTED" : "MUTE"}
          </button>
          <button
            onClick={onOpenPresets}
            data-testid="open-presets"
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-black"
          >
            Presets
          </button>
          <button
            onClick={onOpenPrint}
            data-testid="open-print"
            title="Print or save a PDF channel map with descriptions, gains, routing, etc."
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border border-neutral-700 text-neutral-300 hover:border-white hover:text-white"
          >
            ⎙ Map
          </button>
        </div>
      </div>

      {showVersionConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="version-confirm-modal">
          <div className="bg-[#0a0a0a] border border-neutral-800 max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Switch DSP Configuration?</h3>
            <p className="text-sm text-neutral-400 mb-4">
              Loading <span className="text-white font-mono font-bold">{VERSIONS[showVersionConfirm].label}</span> will reset the current channel state. Save your work as a preset first if needed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowVersionConfirm(null)}
                data-testid="version-cancel"
                className="px-4 py-2 border border-neutral-700 text-neutral-300 text-xs font-mono uppercase tracking-[0.18em]"
              >
                Cancel
              </button>
              <button
                onClick={confirmVersion}
                data-testid="version-confirm"
                className="px-4 py-2 bg-[#FF6B00] text-black text-xs font-mono uppercase tracking-[0.18em] font-bold"
              >
                Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default TopBar;
