import React, { useState } from "react";
import { DspProvider, useDsp } from "@/lib/dspStore";
import TopBar from "@/components/dsp/TopBar";
import ChannelStrip from "@/components/dsp/ChannelStrip";
import MatrixRouter from "@/components/dsp/MatrixRouter";
import EqEditor from "@/components/dsp/EqEditor";
import CompEditor from "@/components/dsp/CompEditor";
import PresetManager from "@/components/dsp/PresetManager";
import SelectedChannelPanel from "@/components/dsp/SelectedChannelPanel";
import ChannelPills from "@/components/dsp/ChannelPills";

const ChannelsView = ({ onOpenEq, onOpenComp, selectedId, onSelect, bank, setBank }) => {
  const { state } = useDsp();
  const phyOuts = state.outputs.filter((o) => o.kind === "out_phy");
  const virtOuts = state.outputs.filter((o) => o.kind === "out_virt");

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]" data-testid="channels-view">
      {/* Yamaha-style selected channel hero panel */}
      <SelectedChannelPanel
        outputId={selectedId}
        onOpenEq={onOpenEq}
        onOpenComp={onOpenComp}
        onClose={() => onSelect(null)}
      />

      {/* Channel selector pills + bank tabs */}
      <ChannelPills
        selectedId={selectedId}
        onSelect={onSelect}
        bank={bank}
        setBank={setBank}
      />

      {/* Channel strips (overview / bank) */}
      <div className="overflow-x-auto grow">
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
  const [selectedId, setSelectedId] = useState(null);
  const [bank, setBank] = useState("phy");

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0A] text-white" data-testid="dsp-shell">
      <TopBar tab={tab} setTab={setTab} onOpenPresets={() => setPresetsOpen(true)} />
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
        {tab === "matrix" && <MatrixRouter />}
      </main>
      <footer className="border-t border-neutral-800 px-4 py-1.5 flex justify-between items-center bg-black">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-600">
          AudioSystem DSP Web · low-latency engine (Web Audio API · interactive)
        </span>
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-600" data-testid="footer-state-saved">
          State auto-saved to local storage
        </span>
      </footer>

      {eqOutId && <EqEditor outputId={eqOutId} onClose={() => setEqOutId(null)} />}
      {compOutId && <CompEditor outputId={compOutId} onClose={() => setCompOutId(null)} />}
      {presetsOpen && <PresetManager onClose={() => setPresetsOpen(false)} />}
    </div>
  );
};

const DSPApp = () => (
  <DspProvider>
    <DSPShell />
  </DspProvider>
);

export default DSPApp;
