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
import ChannelPills from "@/components/dsp/ChannelPills";
import ChannelMapPrint from "@/components/dsp/ChannelMapPrint";
import ProactiveProfileHint from "@/components/dsp/ProactiveProfileHint";
import SceneBar from "@/components/dsp/SceneBar";

const ChannelsView = ({ onOpenEq, onOpenComp, selectedId, onSelect, bank, setBank }) => {
  const { state, readOnly } = useDsp();
  const phyOuts = state.outputs.filter((o) => o.kind === "out_phy");
  const virtOuts = state.outputs.filter((o) => o.kind === "out_virt");
  const phyIns = state.inputs.filter((i) => i.kind === "in_phy");
  const virtIns = state.inputs.filter((i) => i.kind === "in_virt");
  const [showInputs, setShowInputs] = useState(true);

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]" data-testid="channels-view">
      {/* Yamaha-style selected channel hero panel — wrapped in inert when read-only.
          We keep the panel visible/selectable but make its inputs non-interactive. */}
      <div inert={readOnly || undefined} data-testid="channels-edit-region">
        <SelectedChannelPanel
          outputId={selectedId}
          onOpenEq={onOpenEq}
          onOpenComp={onOpenComp}
          onClose={() => onSelect(null)}
        />
      </div>

      {/* Channel selector pills + bank tabs (kept interactive — purely navigation) */}
      <ChannelPills
        selectedId={selectedId}
        onSelect={onSelect}
        bank={bank}
        setBank={setBank}
      />

      {/* Scene Memory bar — 8 slots, live recall, right-click for menu */}
      <div inert={readOnly || undefined}>
        <SceneBar />
      </div>

      {/* Inputs section — collapsible analog-style input strips */}
      <div inert={readOnly || undefined} className="border-b border-neutral-900">
        <button
          onClick={() => setShowInputs((v) => !v)}
          data-testid="inputs-collapse"
          className="w-full px-3 py-1.5 bg-[#00B7FF] text-black text-[10px] font-mono font-bold uppercase tracking-[0.2em] flex items-center justify-between hover:bg-[#33CBFF] transition-colors"
        >
          <span>Inputs · {phyIns.length + virtIns.length}ch</span>
          <span>{showInputs ? "▼" : "▶"}</span>
        </button>
        {showInputs && (
          <div className="overflow-x-auto bg-[#080808]" data-testid="inputs-row">
            <div className="flex h-[360px]">
              {phyIns.map((i) => <InputStrip key={i.id} input={i} />)}
              <div className="w-1 bg-[#FF8533]/40" />
              {virtIns.map((i) => <InputStrip key={i.id} input={i} />)}
            </div>
          </div>
        )}
      </div>

      {/* Channel strips below — also inert during read-only */}
      <div inert={readOnly || undefined} className="overflow-x-auto grow">
        <div className="flex h-full">
          <div className="flex flex-col border-r border-[#FF6B00]/30">
            <div className="px-3 py-1.5 bg-[#FF6B00] text-black text-[10px] font-mono font-bold uppercase tracking-[0.2em]">
              Physical Outputs · {phyOuts.length}ch
            </div>
            <div className="flex grow">
              {phyOuts.map((o) => (
                <ChannelStrip
                  key={o.id}
                  output={o}
                  onOpenEq={onOpenEq}
                  onOpenComp={onOpenComp}
                  selected={o.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="px-3 py-1.5 bg-[#FF8533]/20 text-[#FF8533] text-[10px] font-mono font-bold uppercase tracking-[0.2em] border-b border-neutral-800">
              Dante Virtual Outputs · {virtOuts.length}ch
            </div>
            <div className="flex grow">
              {virtOuts.map((o) => (
                <ChannelStrip
                  key={o.id}
                  output={o}
                  onOpenEq={onOpenEq}
                  onOpenComp={onOpenComp}
                  selected={o.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DSPShell = () => {
  const [tab, setTab] = useState("channels");
  const [eqOutId, setEqOutId] = useState(null);
  const [compOutId, setCompOutId] = useState(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [bank, setBank] = useState("phy");
  const { readOnly } = useDsp();

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0A] text-white dsp-shell" data-testid="dsp-shell">
      <TopBar tab={tab} setTab={setTab} onOpenPresets={() => setPresetsOpen(true)} onOpenPrint={() => setPrintOpen(true)} />
      <ProactiveProfileHint />
      {readOnly && (
        <div
          className="px-4 py-1 text-center text-[10px] font-mono uppercase tracking-[0.2em] font-bold border-b"
          style={{ background: "#FFD60A", color: "#000", borderBottomColor: "#a08800" }}
          data-testid="readonly-banner"
        >
          🔒 Read-Only / Showcase Mode — edits are locked. Click the LOCKED button in the top bar to unlock.
        </div>
      )}
      <main className="grow overflow-hidden">
        {tab === "channels" && (
          <ChannelsView
            onOpenEq={(id) => setEqOutId(id)}
            onOpenComp={(id) => setCompOutId(id)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            bank={bank}
            setBank={setBank}
          />
        )}
        {tab === "meters" && <MetersView />}
        {tab === "matrix" && (
          <div inert={readOnly || undefined} className="h-full">
            <MatrixRouter />
          </div>
        )}
      </main>
      <footer className="border-t border-neutral-800 px-4 py-1.5 flex justify-between items-center bg-black">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-600">
          AudioSystem DSP Web · low-latency engine (Web Audio API · interactive)
        </span>
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-600" data-testid="footer-state-saved">
          {readOnly ? "🔒 Read-Only — state preserved" : "State auto-saved to local storage"}
        </span>
      </footer>

      {eqOutId && <EqEditor outputId={eqOutId} onClose={() => setEqOutId(null)} />}
      {compOutId && <CompEditor outputId={compOutId} onClose={() => setCompOutId(null)} />}
      {presetsOpen && <PresetManager onClose={() => setPresetsOpen(false)} />}
      {printOpen && (
        <div className="print-host">
          <ChannelMapPrint onClose={() => setPrintOpen(false)} />
        </div>
      )}
    </div>
  );
};

const DSPApp = () => (
  <DspProvider>
    <DSPShell />
  </DspProvider>
);

export default DSPApp;
