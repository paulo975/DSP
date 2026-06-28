/**
 * DSPApp — Layout com painel de parâmetros no topo + faders em baixo.
 * Inspirado no AudioSystem DSP 3.0: EQ/Delay visível em cima, canal seleccionado destacado.
 */
import { VERSIONS } from "@/lib/dspDefaults";
import React, { useState } from "react";
import { DspProvider, useDsp } from "@/lib/dspStore";
import TopBar from "@/components/dsp/TopBar";
import ChannelStrip from "@/components/dsp/ChannelStrip";
import InputStrip from "@/components/dsp/InputStrip";
import MatrixRouter from "@/components/dsp/MatrixRouter";
import MetersView from "@/components/dsp/MetersView";
import EqEditor from "@/components/dsp/EqEditor";
import CompEditor from "@/components/dsp/CompEditor";
import PresetManager from "@/components/dsp/PresetManager";
import SelectedChannelPanel from "@/components/dsp/SelectedChannelPanel";
import ChannelMapPrint from "@/components/dsp/ChannelMapPrint";
import DspImportModal from "@/components/dsp/DspImportModal";
import SceneBar from "@/components/dsp/SceneBar";
import ProactiveProfileHint from "@/components/dsp/ProactiveProfileHint";

const T = {
  bg:        "#1e1e1e",
  surface:   "#252525",
  sidebar:   "#1a1a1a",
  canvas:    "#1c1c1c",
  border:    "#383838",
  borderMid: "#404040",
  text:      "#e8e8e8",
  textDim:   "#888",
  textMuted: "#555",
  orange:    "#FF6B00",
  blue:      "#00B7FF",
  green:     "#00FF41",
  yellow:    "#FFD60A",
  red:       "#FF3B30",
  cyan:      "#22D3EE",
  violet:    "#A855F7",
};

// ─── Sidebar esquerda ─────────────────────────────────────────────────────────
const MasterSidebar = ({ tab, setTab }) => {
  const { state, setMaster, clearAllSolo, setTalkback, readOnly } = useDsp();
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");

  const tabs = [
    { id: "inputs",  label: "INPUTS",  color: T.blue },
    { id: "outputs", label: "OUTPUTS", color: T.orange },
    { id: "meters",  label: "METERS",  color: T.green },
    { id: "matrix",  label: "MATRIX",  color: T.textDim },
  ];

  return (
    <div style={{ width: 96, flexShrink: 0, background: T.sidebar, borderRight: `0.5px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
      {/* Brand */}
      <div style={{ padding: "10px", borderBottom: `0.5px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <div style={{ width: 20, height: 20, background: T.orange, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontWeight: "bold", fontSize: 11, color: "#000" }}>A</div>
          <div style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", color: T.text, lineHeight: 1.3 }}>Audio<br/>System DSP</div>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 7, color: T.textMuted, letterSpacing: "0.15em" }}>WEB · V3.1</div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: `0.5px solid ${T.border}` }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
              style={{
                display: "block", width: "100%", padding: "8px 10px",
                background: active ? `${t.color}18` : "transparent",
                borderLeft: active ? `2px solid ${t.color}` : "2px solid transparent",
                borderBottom: `0.5px solid ${T.border}`,
                color: active ? t.color : T.textDim,
                fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
                letterSpacing: "0.15em", textAlign: "left", cursor: "pointer",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Master */}
      <div style={{ padding: "10px", borderBottom: `0.5px solid ${T.border}` }}>
        <div style={{ fontFamily: "monospace", fontSize: 7, color: T.textMuted, letterSpacing: "0.15em", marginBottom: 5 }}>MASTER</div>
        <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: "bold", color: state.masterMute ? T.red : T.text, textAlign: "center", marginBottom: 5 }} data-testid="master-gain-value">
          {state.masterMute ? "MUTE" : state.masterGain.toFixed(1)}
        </div>
        <input type="range" min={-60} max={6} step={0.1} value={state.masterGain} disabled={readOnly}
          onChange={(e) => setMaster({ masterGain: Number(e.target.value) })}
          style={{ width: "100%", accentColor: T.orange, marginBottom: 5 }} data-testid="master-gain" />
        <button onClick={() => setMaster({ masterMute: !state.masterMute })} disabled={readOnly} data-testid="master-mute"
          style={{ display: "block", width: "100%", padding: "5px 0", fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
            border: `0.5px solid ${T.red}`, background: state.masterMute ? T.red : "transparent",
            color: state.masterMute ? "#000" : T.red, cursor: "pointer" }}>
          {state.masterMute ? "MUTED" : "MUTE"}
        </button>
      </div>

      {/* Live controls */}
      <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
        <button onClick={clearAllSolo} disabled={readOnly} data-testid="top-clr-solo"
          style={{ width: "100%", padding: "5px 0", fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
            border: `0.5px solid ${T.yellow}`, background: "transparent", color: T.yellow, cursor: "pointer" }}>
          CLR SOLO
        </button>
        <button onPointerDown={() => setTalkback(true)} onPointerUp={() => setTalkback(false)} onPointerLeave={() => setTalkback(false)}
          disabled={readOnly} data-testid="top-talk"
          style={{ width: "100%", padding: "5px 0", fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
            border: `0.5px solid ${T.red}`, background: state.talkback ? T.red : "transparent",
            color: state.talkback ? "#000" : T.red, cursor: "pointer", userSelect: "none" }}>
          🎤 TALK
        </button>
      </div>

      {/* Clock */}
      <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${T.border}`, textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: T.green }} data-testid="top-clock">
          {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
        </div>
      </div>

      {/* Config */}
      <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${T.border}` }}>
        <VersionButtons />
      </div>

      <div style={{ flex: 1 }} />
      <LockButton />
    </div>
  );
};

const VersionButtons = () => {
  const { state, setVersion, readOnly } = useDsp();
  const [confirm, setConfirm] = useState(null);
  return (
    <>
      <div style={{ fontFamily: "monospace", fontSize: 7, color: T.textMuted, letterSpacing: "0.15em", marginBottom: 5 }}>CONFIG</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {Object.values(VERSIONS).map((v) => {
          const active = state.version === v.id;
          return (
            <button key={v.id} onClick={() => v.id !== state.version && setConfirm(v.id)}
              disabled={readOnly} data-testid={`version-${v.id}`}
              style={{ width: "100%", padding: "4px 0", fontFamily: "monospace", fontSize: 8, fontWeight: "bold",
                border: `0.5px solid ${active ? T.orange : T.border}`, background: active ? T.orange : "transparent",
                color: active ? "#000" : T.textDim, cursor: "pointer" }}>
              {v.label.replace("DSP ", "").replace(" Dante", "")}
            </button>
          );
        })}
      </div>
      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.bg, border: `0.5px solid ${T.borderMid}`, maxWidth: 320, width: "100%", padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>Switch DSP config?</div>
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>O estado actual será reposto.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(null)} data-testid="version-cancel"
                style={{ flex: 1, padding: "8px 0", border: `0.5px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: "monospace", fontSize: 9, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={() => { setVersion(confirm); setConfirm(null); }} data-testid="version-confirm"
                style={{ flex: 1, padding: "8px 0", background: T.orange, border: "none", color: "#000", fontFamily: "monospace", fontSize: 9, fontWeight: "bold", cursor: "pointer" }}>
                Mudar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const LockButton = () => {
  const { readOnly, toggleReadOnly } = useDsp();
  return (
    <div style={{ padding: "8px 10px", borderTop: `0.5px solid ${T.border}` }}>
      <button onClick={toggleReadOnly} data-testid="readonly-toggle"
        style={{ width: "100%", padding: "5px 0", fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
          border: `0.5px solid ${readOnly ? T.yellow : T.border}`, background: readOnly ? T.yellow : "transparent",
          color: readOnly ? "#000" : T.textMuted, cursor: "pointer" }}>
        {readOnly ? "🔒 LOCKED" : "🔓 EDIT"}
      </button>
    </div>
  );
};

// ─── Página INPUTS ─────────────────────────────────────────────────────────────
const InputsPage = () => {
  const { state, readOnly } = useDsp();
  const phyIns  = state.inputs.filter((i) => i.kind === "in_phy");
  const virtIns = state.inputs.filter((i) => i.kind === "in_virt");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.canvas }}>
      {/* PHY */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "4px 12px", background: T.blue, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.2em", color: "#000" }}>
            PHYSICAL INPUTS · {phyIns.length} ch
          </span>
        </div>
        <div style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }} inert={readOnly || undefined} data-testid="inputs-phy-row">
          <div style={{ display: "flex", height: "100%" }}>
            {phyIns.map((i) => <InputStrip key={i.id} input={i} />)}
          </div>
        </div>
      </div>
      <div style={{ height: "0.5px", background: T.cyan, opacity: 0.3, flexShrink: 0 }} />
      {/* DANTE */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "4px 12px", background: T.cyan, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.2em", color: "#000" }}>
            DANTE VIRTUAL INPUTS · {virtIns.length} ch
          </span>
        </div>
        <div style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }} inert={readOnly || undefined} data-testid="inputs-virt-row">
          <div style={{ display: "flex", height: "100%" }}>
            {virtIns.map((i) => <InputStrip key={i.id} input={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Página OUTPUTS: painel de parâmetros no topo + faders em baixo ────────────
const OutputsPage = ({ onOpenEq, onOpenComp, selectedId, onSelect }) => {
  const { state, readOnly } = useDsp();
  const phyOuts  = state.outputs.filter((o) => o.kind === "out_phy");
  const virtOuts = state.outputs.filter((o) => o.kind === "out_virt");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.canvas }}>

      {/* ── PAINEL DE PARÂMETROS (topo) ─────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderBottom: `0.5px solid ${T.border}`,
        background: T.surface,
        overflow: "hidden",
      }}>
        <SelectedChannelPanel
          outputId={selectedId}
          onOpenEq={onOpenEq}
          onOpenComp={onOpenComp}
          onClose={() => onSelect(null)}
        />
      </div>

      {/* ── FADERS (baixo) ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }} inert={readOnly || undefined} data-testid="channels-view">

        {/* PHY outputs */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "3px 12px", background: T.orange, flexShrink: 0 }}>
            <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.2em", color: "#000" }}>
              PHYSICAL OUTPUTS · {phyOuts.length} ch
            </span>
          </div>
          <div style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }}>
            <div style={{ display: "flex", height: "100%" }}>
              {phyOuts.map((o) => (
                <ChannelStrip key={o.id} output={o} onOpenEq={onOpenEq} onOpenComp={onOpenComp}
                  selected={o.id === selectedId} onSelect={onSelect} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: "0.5px", background: T.orange, opacity: 0.2, flexShrink: 0 }} />

        {/* DANTE VIRTUAL outputs */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "3px 12px", background: "#2a1800", borderTop: `0.5px solid ${T.border}`, flexShrink: 0 }}>
            <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.2em", color: "#FF8533" }}>
              DANTE VIRTUAL OUTPUTS · {virtOuts.length} ch
            </span>
          </div>
          <div style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }}>
            <div style={{ display: "flex", height: "100%" }}>
              {virtOuts.map((o) => (
                <ChannelStrip key={o.id} output={o} onOpenEq={onOpenEq} onOpenComp={onOpenComp}
                  selected={o.id === selectedId} onSelect={onSelect} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Shell principal ───────────────────────────────────────────────────────────
const DSPShell = () => {
  const [tab,         setTab]         = useState("outputs");
  const [eqOutId,     setEqOutId]     = useState(null);
  const [compOutId,   setCompOutId]   = useState(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [printOpen,   setPrintOpen]   = useState(false);
  const [importOpen,  setImportOpen]  = useState(false);
  const [selectedId,  setSelectedId]  = useState(null);
  const { readOnly } = useDsp();

  const handleSelect = (id) => setSelectedId((cur) => cur === id ? null : id);

  return (
    <div className="dsp-shell" style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, overflow: "hidden" }} data-testid="dsp-shell">

      <TopBar tab={tab} setTab={setTab} onOpenPresets={() => setPresetsOpen(true)} onOpenPrint={() => setPrintOpen(true)} onOpenImport={() => setImportOpen(true)} />
      <div style={{background:"#FF0000",color:"#fff",textAlign:"center",padding:"8px",fontFamily:"monospace",fontSize:14,fontWeight:"bold"}}>🔴 VERSÃO NOVA CARREGADA — {new Date().toLocaleTimeString()}</div>
      <ProactiveProfileHint />

      {readOnly && (
        <div style={{ background: T.yellow, color: "#000", padding: "3px 16px", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.2em", textAlign: "center", fontWeight: "bold", flexShrink: 0 }} data-testid="readonly-banner">
          🔒 READ-ONLY — Clica LOCKED no sidebar para desbloquear
        </div>
      )}

      <SceneBar />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <MasterSidebar tab={tab} setTab={setTab} />

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {tab === "inputs"  && <InputsPage />}
          {tab === "outputs" && (
            <OutputsPage
              onOpenEq={(id) => setEqOutId(id)}
              onOpenComp={(id) => setCompOutId(id)}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
          {tab === "meters"  && <MetersView />}
          {tab === "matrix"  && (
            <div inert={readOnly || undefined} style={{ flex: 1, overflow: "auto" }}>
              <MatrixRouter />
            </div>
          )}
        </div>
      </div>

      <footer style={{ flexShrink: 0, borderTop: `0.5px solid ${T.border}`, padding: "3px 16px", display: "flex", justifyContent: "space-between", background: T.sidebar }}>
        <span style={{ fontFamily: "monospace", fontSize: 8, color: T.textMuted }}>AudioSystem DSP Web · Web Audio API</span>
        <span style={{ fontFamily: "monospace", fontSize: 8, color: T.textMuted }} data-testid="footer-state-saved">
          {readOnly ? "🔒 Read-Only" : "Auto-saved · localStorage"}
        </span>
      </footer>

      {eqOutId    && <EqEditor outputId={eqOutId} onClose={() => setEqOutId(null)} />}
      {compOutId  && <CompEditor outputId={compOutId} onClose={() => setCompOutId(null)} />}
      {presetsOpen && <PresetManager onClose={() => setPresetsOpen(false)} />}
      {importOpen  && <DspImportModal onClose={() => setImportOpen(false)} />}
      {printOpen   && <div className="print-host"><ChannelMapPrint onClose={() => setPrintOpen(false)} /></div>}
    </div>
  );
};

const DSPApp = () => (
  <DspProvider>
    <DSPShell />
  </DspProvider>
);

export default DSPApp;
