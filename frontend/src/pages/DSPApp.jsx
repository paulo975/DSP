import { VERSIONS } from "@/lib/dspDefaults";
/**
 * DSPApp — Waves eMotion LV1 layout.
 *
 * Tab structure:
 *   INPUTS    — página 1: todos os input strips (phy + dante)
 *   OUTPUTS   — página 2: todos os output strips (phy + dante)
 *   METERS    — vue de metros
 *   MATRIX    — routing matrix
 *
 * Visual language:
 *   - Fundo base #141414 (não preto puro)
 *   - Bordas 0.5px, cor #282828
 *   - Superfícies: #1A1A1A (strips), #111 (sidebar), #0E0E0E (canvas)
 */
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

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:        "#141414",   // fundo base — não preto puro
  surface:   "#1A1A1A",   // superfície de strips
  sidebar:   "#111111",   // sidebar
  canvas:    "#0E0E0E",   // canvas principal (ligeiramente mais escuro)
  header:    "#0B0B0B",   // header de secção
  border:    "#282828",   // borda padrão (0.5px)
  borderMid: "#323232",   // borda média
  text:      "#E8E8E8",   // texto primário
  textDim:   "#888888",   // texto secundário
  textMuted: "#444444",   // texto muito suave
  orange:    "#FF6B00",
  blue:      "#00B7FF",
  green:     "#00FF41",
  yellow:    "#FFD60A",
  red:       "#FF3B30",
  pink:      "#FF7AC6",
  violet:    "#A855F7",
  cyan:      "#22D3EE",
};

// ─── Sidebar esquerda — Master + controles globais ────────────────────────────
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
    <div
      className="flex flex-col shrink-0"
      style={{ width: 96, background: T.sidebar, borderRight: `0.5px solid ${T.border}` }}
      data-testid="master-sidebar"
    >
      {/* Brand */}
      <div style={{ padding: "10px 10px 8px", borderBottom: `0.5px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 20, height: 20, background: T.orange, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontWeight: "bold", fontSize: 11, color: "#000", flexShrink: 0 }}>A</div>
          <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: T.text, lineHeight: 1.3 }}>Audio<br/>System DSP</div>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 7, color: T.textMuted, letterSpacing: "0.15em" }}>WEB · V3.1</div>
      </div>

      {/* Navegação (tabs verticais) */}
      <div style={{ borderBottom: `0.5px solid ${T.border}` }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 10px",
                background: active ? `${t.color}15` : "transparent",
                borderLeft: active ? `2px solid ${t.color}` : "2px solid transparent",
                borderBottom: `0.5px solid ${T.border}`,
                color: active ? t.color : T.textDim,
                fontFamily: "monospace",
                fontSize: 9,
                fontWeight: "bold",
                letterSpacing: "0.15em",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 120ms",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Master gain */}
      <div style={{ padding: "10px", borderBottom: `0.5px solid ${T.border}` }}>
        <div style={{ fontFamily: "monospace", fontSize: 7, color: T.textMuted, letterSpacing: "0.15em", marginBottom: 6 }}>MASTER</div>
        <div
          style={{ fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: state.masterMute ? T.red : T.text, textAlign: "center", marginBottom: 6, letterSpacing: "-0.02em" }}
          data-testid="master-gain-value"
        >
          {state.masterMute ? "MUTE" : state.masterGain.toFixed(1)}
        </div>
        <input
          type="range" min={-60} max={6} step={0.1}
          value={state.masterGain} disabled={readOnly}
          onChange={(e) => setMaster({ masterGain: Number(e.target.value) })}
          style={{ width: "100%", accentColor: T.orange, opacity: readOnly ? 0.4 : 1, marginBottom: 6 }}
          data-testid="master-gain"
        />
        <button
          onClick={() => setMaster({ masterMute: !state.masterMute })}
          disabled={readOnly}
          data-testid="master-mute"
          style={{
            display: "block", width: "100%", padding: "5px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.15em",
            border: `0.5px solid ${T.red}`,
            background: state.masterMute ? T.red : "transparent",
            color: state.masterMute ? "#000" : T.red,
            cursor: "pointer", opacity: readOnly ? 0.4 : 1,
          }}
        >
          {state.masterMute ? "MUTED" : "MUTE"}
        </button>
      </div>

      {/* CLR SOLO + TALK */}
      <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          onClick={clearAllSolo} disabled={readOnly}
          data-testid="top-clr-solo"
          style={{
            width: "100%", padding: "5px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.12em",
            border: `0.5px solid ${T.yellow}`, background: "transparent", color: T.yellow,
            cursor: "pointer", opacity: readOnly ? 0.4 : 1,
          }}
        >
          CLR SOLO
        </button>
        <button
          onPointerDown={() => setTalkback(true)}
          onPointerUp={() => setTalkback(false)}
          onPointerLeave={() => setTalkback(false)}
          disabled={readOnly}
          data-testid="top-talk"
          style={{
            width: "100%", padding: "5px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.12em",
            border: `0.5px solid ${T.red}`,
            background: state.talkback ? T.red : "transparent",
            color: state.talkback ? "#000" : T.red,
            cursor: "pointer", userSelect: "none",
            boxShadow: state.talkback ? `0 0 10px ${T.red}66` : "none",
            opacity: readOnly ? 0.4 : 1,
          }}
        >
          🎤 TALK
        </button>
      </div>

      {/* Relógio */}
      <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${T.border}`, textAlign: "center" }}>
        <div
          style={{ fontFamily: "monospace", fontSize: 13, color: T.green, letterSpacing: "0.05em" }}
          data-testid="top-clock"
        >
          {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
        </div>
      </div>

      {/* Version */}
      <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${T.border}` }}>
        <VersionButtons />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Lock */}
      <LockButton />
    </div>
  );
};

const VersionButtons = () => {
  const { state, setVersion, readOnly } = useDsp();
  const [confirm, setConfirm] = useState(null);


  return (
    <>
      <div style={{ fontFamily: "monospace", fontSize: 7, color: T.textMuted, letterSpacing: "0.15em", marginBottom: 6 }}>CONFIG</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {Object.values(VERSIONS).map((v) => {
          const active = state.version === v.id;
          return (
            <button
              key={v.id}
              onClick={() => v.id !== state.version && setConfirm(v.id)}
              disabled={readOnly}
              data-testid={`version-${v.id}`}
              style={{
                width: "100%", padding: "4px 0",
                fontFamily: "monospace", fontSize: 8, fontWeight: "bold",
                border: `0.5px solid ${active ? T.orange : T.border}`,
                background: active ? T.orange : "transparent",
                color: active ? "#000" : T.textDim,
                cursor: "pointer", opacity: readOnly ? 0.4 : 1,
              }}
            >
              {v.label.replace("DSP ", "").replace(" Dante", "")}
            </button>
          );
        })}
      </div>
      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: T.bg, border: `0.5px solid ${T.borderMid}`, maxWidth: 360, width: "100%", padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>Switch DSP config?</div>
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>Current state will be reset. Save a preset first if needed.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(null)} data-testid="version-cancel"
                style={{ flex: 1, padding: "8px 0", border: `0.5px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: "monospace", fontSize: 9, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { setVersion(confirm); setConfirm(null); }} data-testid="version-confirm"
                style={{ flex: 1, padding: "8px 0", background: T.orange, border: "none", color: "#000", fontFamily: "monospace", fontSize: 9, fontWeight: "bold", cursor: "pointer" }}>
                Switch
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
      <button
        onClick={toggleReadOnly}
        data-testid="readonly-toggle"
        style={{
          width: "100%", padding: "5px 0",
          fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.12em",
          border: `0.5px solid ${readOnly ? T.yellow : T.border}`,
          background: readOnly ? T.yellow : "transparent",
          color: readOnly ? "#000" : T.textMuted,
          cursor: "pointer",
        }}
      >
        {readOnly ? "🔒 LOCKED" : "🔓 EDIT"}
      </button>
    </div>
  );
};

// ─── Página INPUTS ────────────────────────────────────────────────────────────
const InputsPage = () => {
  const { state, readOnly } = useDsp();
  const phyIns  = state.inputs.filter((i) => i.kind === "in_phy");
  const virtIns = state.inputs.filter((i) => i.kind === "in_virt");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.canvas }}>
      {/* Phy inputs */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <div style={{ padding: "4px 12px", background: T.blue, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.2em", color: "#000" }}>
            PHYSICAL INPUTS · {phyIns.length} ch
          </span>
        </div>
        <div
          style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }}
          data-testid="inputs-phy-row"
          inert={readOnly || undefined}
        >
          <div style={{ display: "flex", height: "100%" }}>
            {phyIns.map((i) => <InputStrip key={i.id} input={i} />)}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "0.5px", background: T.cyan, opacity: 0.3, flexShrink: 0 }} />

      {/* Dante inputs */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <div style={{ padding: "4px 12px", background: T.cyan, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.2em", color: "#000" }}>
            DANTE VIRTUAL INPUTS · {virtIns.length} ch
          </span>
        </div>
        <div
          style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }}
          data-testid="inputs-virt-row"
          inert={readOnly || undefined}
        >
          <div style={{ display: "flex", height: "100%" }}>
            {virtIns.map((i) => <InputStrip key={i.id} input={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Página OUTPUTS ───────────────────────────────────────────────────────────
const OutputsPage = ({ onOpenEq, onOpenComp, selectedId, onSelect }) => {
  const { state, readOnly } = useDsp();
  const phyOuts  = state.outputs.filter((o) => o.kind === "out_phy");
  const virtOuts = state.outputs.filter((o) => o.kind === "out_virt");

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: T.canvas }}>
      {/* Console strips */}
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
        inert={readOnly || undefined}
        data-testid="channels-view"
      >
        {/* PHY outputs */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ padding: "4px 12px", background: T.orange, flexShrink: 0 }}>
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

        {/* Divider */}
        <div style={{ height: "0.5px", background: T.orange, opacity: 0.25, flexShrink: 0 }} />

        {/* DANTE VIRTUAL outputs */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ padding: "4px 12px", flexShrink: 0, background: "#1e1000", borderTop: `0.5px solid ${T.border}` }}>
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

      {/* Drawer de detalhe do canal seleccionado */}
      {selectedId && (
        <div
          style={{
            width: 300, flexShrink: 0,
            borderLeft: `0.5px solid ${T.blue}`,
            background: "#0A0F14",
            overflowY: "auto",
          }}
          data-testid="channel-drawer"
        >
          <SelectedChannelPanel
            outputId={selectedId}
            onOpenEq={onOpenEq}
            onOpenComp={onOpenComp}
            onClose={() => onSelect(null)}
          />
        </div>
      )}
    </div>
  );
};

// ─── Shell principal ──────────────────────────────────────────────────────────
const DSPShell = () => {
  const [tab,        setTab]        = useState("outputs");
  const [eqOutId,    setEqOutId]    = useState(null);
  const [compOutId,  setCompOutId]  = useState(null);
  const [presetsOpen,setPresetsOpen]= useState(false);
  const [printOpen,  setPrintOpen]  = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const { readOnly } = useDsp();

  const handleSelect = (id) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div
      className="dsp-shell"
      style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, overflow: "hidden" }}
      data-testid="dsp-shell"
    >
      {/* ── TOP BAR ─────────────────────────────── */}
      <TopBar
        tab={tab} setTab={setTab}
        onOpenPresets={() => setPresetsOpen(true)}
        onOpenPrint={() => setPrintOpen(true)}
        onOpenImport={() => setImportOpen(true)}
      />

      <ProactiveProfileHint />

      {/* ── READ-ONLY BANNER ────────────────────── */}
      {readOnly && (
        <div
          style={{ background: T.yellow, color: "#000", padding: "4px 16px", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.2em", textAlign: "center", fontWeight: "bold", borderBottom: `0.5px solid #a08800`, flexShrink: 0 }}
          data-testid="readonly-banner"
        >
          🔒 READ-ONLY — Click LOCKED in sidebar to unlock
        </div>
      )}

      {/* ── SCENE BAR ───────────────────────────── */}
      <SceneBar />

      {/* ── MAIN BODY ───────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <MasterSidebar tab={tab} setTab={setTab} />

        {/* Content */}
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

      {/* ── FOOTER ──────────────────────────────── */}
      <footer
        style={{ flexShrink: 0, borderTop: `0.5px solid ${T.border}`, padding: "4px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: T.sidebar }}
      >
        <span style={{ fontFamily: "monospace", fontSize: 8, color: T.textMuted, letterSpacing: "0.15em" }}>
          AudioSystem DSP Web · Web Audio API
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 8, color: T.textMuted, letterSpacing: "0.15em" }} data-testid="footer-state-saved">
          {readOnly ? "🔒 Read-Only" : "Auto-saved · localStorage"}
        </span>
      </footer>

      {/* ── MODALS ──────────────────────────────── */}
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
import { useToast } from "@/hooks/use-toast";

// Dentro do componente:
const { toast } = useToast();

// Algures no JSX:
<button onClick={() => toast({ title: "Teste ✅", description: "Toast a funcionar!" })}>
  Testar Toast
</button>
