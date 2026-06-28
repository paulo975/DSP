/**
 * TopBar — slim (h-10), fundo #111, bordas 0.5px.
 * Apenas: transport de áudio, test signal, utilitários, bridge indicator.
 * Tabs e master movidos para o sidebar esquerdo.
 */
import React, { useRef, useState } from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";
import { patchBufferWithNames, downloadDspFile, loadSourceTemplate, clearSourceTemplate } from "@/lib/dspBinaryExporter";
import { buildShareUrl } from "@/lib/dspShareLink";
import HardwareBridgeIndicator from "./HardwareBridgeIndicator";

const T = {
  bg: "#1a1a1a", border: "#383838", text: "#E8E8E8",
  textDim: "#888", textMuted: "#444",
  orange: "#FF6B00", green: "#00FF41", red: "#FF3B30",
  yellow: "#FFD60A", violet: "#A855F7", cyan: "#22D3EE", pink: "#FF7AC6",
};

const Btn = ({ onClick, disabled, color, children, testId, title }) => (
  <button
    onClick={onClick} disabled={disabled}
    data-testid={testId} title={title}
    style={{
      padding: "3px 8px",
      fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.12em",
      border: `0.5px solid ${color || T.border}`,
      background: "transparent",
      color: color || T.textDim,
      cursor: "pointer", whiteSpace: "nowrap",
      opacity: disabled ? 0.3 : 1,
    }}
  >
    {children}
  </button>
);

const Sep = () => (
  <div style={{ width: "0.5px", alignSelf: "stretch", background: T.border, margin: "0 4px" }} />
);

const TopBar = ({ tab, setTab, onOpenPresets, onOpenPrint, onOpenImport }) => {
  const { state, setAllPinkNoise, readOnly } = useDsp();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [playing,  setPlaying]  = useState(false);
  const [msg,      setMsg]      = useState(null);
  const [template, setTemplate] = useState(() => loadSourceTemplate());

  React.useEffect(() => { setTemplate(loadSourceTemplate()); }, [state.inputs, state.outputs]);

  const pinkAllOn = state.outputs.length > 0 && state.outputs.every((o) => o.pinkNoise?.enabled);
  const pinkLevel = state.outputs[0]?.pinkNoise?.level ?? -20;
  const pinkType  = state.outputs[0]?.pinkNoise?.type  ?? "pink";

  const toast = (kind, text, ms = 3500) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), ms);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    try { await audioEngine.loadFile(f); } catch {}
  };

  const togglePlay = () => {
    if (playing) { audioEngine.stopFile(); setPlaying(false); }
    else { audioEngine.playFile(state); setPlaying(true); }
  };

  const handleExport = () => {
    const tpl = loadSourceTemplate();
    if (!tpl) { toast("err", "Import a .audiosystemdsp file first."); return; }
    try {
      const patched = patchBufferWithNames(tpl.buffer, state.inputs.map(c => c.name), state.outputs.map(c => c.name));
      const base  = (tpl.fileName || "export").replace(/\.audiosystemdsp$/i, "");
      const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
      downloadDspFile(patched, `${base}-${stamp}.audiosystemdsp`);
      toast("ok", `Exported ${patched.byteLength} B`);
    } catch (e) { toast("err", `Export failed: ${e?.message}`); }
  };

  const handleShare = async () => {
    try {
      const url = buildShareUrl(state);
      let ok = false;
      if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(url); ok = true; } catch {} }
      if (!ok) {
        const ta = Object.assign(document.createElement("textarea"), { value: url, style: "position:fixed;opacity:0" });
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); document.body.removeChild(ta);
      }
      try { window.history.replaceState({}, "", url); } catch {}
      const kb = (url.length / 1024).toFixed(1);
      toast(ok ? "ok" : "err", ok ? `Copied share link (${kb} KB)` : `Couldn't copy — link in URL bar`);
    } catch (e) { toast("err", `Share failed: ${e?.message}`); }
  };

  return (
    <header style={{
      flexShrink: 0, background: T.bg,
      borderBottom: `0.5px solid ${T.border}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 8px", gap: 4 }}>

        {/* ── Transport de áudio ── */}
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} data-testid="audio-file-input" />
        <Btn onClick={() => fileRef.current?.click()} testId="audio-file-btn">LOAD</Btn>
        <Btn
          onClick={togglePlay} disabled={!fileName} testId="audio-play-btn"
          color={playing ? T.green : T.textDim}
        >
          {playing ? "■ STOP" : "▶ PLAY"}
        </Btn>
        {fileName && (
          <span style={{ fontFamily: "monospace", fontSize: 8, color: T.textMuted, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            data-testid="audio-file-name">
            {fileName}
          </span>
        )}

        <Sep />

        {/* ── Test signal ── */}
        <span style={{ fontFamily: "monospace", fontSize: 7, color: pinkAllOn ? T.pink : T.textMuted, letterSpacing: "0.12em" }}>SIG</span>
        <div style={{ display: "flex", border: `0.5px solid ${T.border}` }} data-testid="pn-type-group">
          {[{ id: "pink", label: "PNK" }, { id: "white", label: "WHT" }, { id: "sweep", label: "SWP" }].map((t) => (
            <button key={t.id}
              onClick={() => setAllPinkNoise(pinkAllOn || undefined, pinkLevel, t.id)}
              disabled={readOnly}
              data-testid={`pn-type-${t.id}`}
              style={{
                padding: "3px 6px",
                fontFamily: "monospace", fontSize: 7, fontWeight: "bold", letterSpacing: "0.1em",
                borderRight: `0.5px solid ${T.border}`, background: pinkType === t.id ? T.pink : "transparent",
                color: pinkType === t.id ? "#000" : T.textMuted,
                cursor: "pointer", opacity: readOnly ? 0.4 : 1,
              }}>{t.label}</button>
          ))}
        </div>
        <Btn onClick={() => setAllPinkNoise(!pinkAllOn, pinkLevel)} disabled={readOnly}
          color={pinkAllOn ? T.pink : T.textMuted} testId="pn-master-toggle">
          {pinkAllOn ? "ON" : "OFF"}
        </Btn>
        <input
          type="range" min={-60} max={0} step={0.5} value={pinkLevel} disabled={readOnly}
          onChange={(e) => setAllPinkNoise(pinkAllOn || undefined, Number(e.target.value))}
          style={{ width: 64, accentColor: T.pink, opacity: readOnly ? 0.4 : 1 }}
          data-testid="pn-master-level"
        />
        <span style={{ fontFamily: "monospace", fontSize: 8, color: T.text, minWidth: 36, textAlign: "right" }}
          data-testid="pn-master-level-value">
          {pinkLevel.toFixed(0)} dB
        </span>

        <Sep />

        {/* ── Utilitários (direita) ── */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <Btn onClick={onOpenImport} color={T.cyan} testId="open-import">⇩ IMPORT</Btn>
          <Btn onClick={handleExport} disabled={!template || readOnly} color={T.violet} testId="open-export">⇧ EXPORT</Btn>
          {template && (
            <button
              onClick={() => { if (window.confirm("Clear template?")) { clearSourceTemplate(); setTemplate(null); } }}
              data-testid="clear-template"
              style={{ padding: "3px 5px", border: `0.5px solid ${T.border}`, background: "transparent", color: T.textMuted, fontFamily: "monospace", fontSize: 9, cursor: "pointer" }}>
              ✕
            </button>
          )}
          <Btn onClick={handleShare} color={T.green} testId="open-share">🔗 SHARE</Btn>
          <Btn onClick={onOpenPresets} color={T.orange} testId="open-presets">PRESETS</Btn>
          <Btn onClick={onOpenPrint} color={T.textDim} testId="open-print">⎙ MAP</Btn>
          <Sep />
          <HardwareBridgeIndicator />
        </div>
      </div>

      {/* Toast de feedback */}
      {msg && (
        <div style={{
          padding: "3px 12px",
          fontFamily: "monospace", fontSize: 8, letterSpacing: "0.15em",
          borderTop: `0.5px solid ${msg.kind === "ok" ? T.green + "33" : T.red + "33"}`,
          background: msg.kind === "ok" ? `${T.green}08` : `${T.red}08`,
          color: msg.kind === "ok" ? T.green : T.red,
        }} data-testid="export-msg">
          {msg.text}
        </div>
      )}
    </header>
  );
};

export default TopBar;
