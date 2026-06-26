import React from "react";
import { useDsp } from "@/lib/dspStore";
import { VERSIONS, formatDelay } from "@/lib/dspDefaults";
import SignalFlowDiagram from "./SignalFlowDiagram";

const yesNo = (b) => (b ? "✓" : "—");
const fmtDb = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} dB`;
const fmtPan = (p) => (p === 0 ? "C" : p > 0 ? `R${p}` : `L${Math.abs(p)}`);

const ChannelMapPrint = ({ onClose }) => {
  const { state } = useDsp();
  const v = VERSIONS[state.version];
  const printedAt = new Date().toLocaleString();

  // Build routing summary: outputId -> list of input names
  const routingByOut = {};
  Object.entries(state.matrix || {}).forEach(([outId, inIds]) => {
    const names = (inIds || [])
      .map((id) => state.inputs.find((i) => i.id === id)?.name)
      .filter(Boolean);
    if (names.length) routingByOut[outId] = names;
  });

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-6 print:bg-transparent print:backdrop-blur-none print:p-0 print:static" data-testid="print-modal">
      <div className="bg-white text-black w-full max-w-5xl max-h-[92vh] overflow-auto print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print-area" data-testid="print-area">
        {/* Screen-only toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-300 bg-neutral-100 print:hidden">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Print Preview</div>
            <div className="text-lg font-bold">Channel Map</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={triggerPrint}
              data-testid="print-trigger"
              className="px-4 py-2 bg-[#FF6B00] text-black text-xs font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FF8533]"
            >
              ⎙ Print / Save PDF
            </button>
            <button
              onClick={onClose}
              data-testid="print-close"
              className="px-3 py-2 border border-neutral-400 text-neutral-700 text-xs font-mono uppercase tracking-[0.18em] hover:bg-neutral-200"
            >
              Close
            </button>
          </div>
        </div>

        {/* Printable content */}
        <div className="p-6 font-sans">
          {/* Header */}
          <div className="flex items-end justify-between border-b-2 border-black pb-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AudioSystem DSP — Channel Map</h1>
              <div className="text-sm text-neutral-700 mt-1">
                Configuration: <strong>{v.label}</strong> · {v.physical} physical + {v.virtual} virtual per side
              </div>
            </div>
            <div className="text-right text-xs text-neutral-600 font-mono">
              <div>Printed: {printedAt}</div>
              <div>Version: {state.version}</div>
            </div>
          </div>

          {/* Signal Flow Diagram — visual representation of active routing */}
          <SignalFlowDiagram state={state} />

          {/* Outputs table */}
          <h2 className="text-base font-bold mt-2 mb-2 uppercase tracking-wide">Output Channels</h2>
          <table className="w-full text-[10px] border-collapse mb-6" data-testid="print-outputs-table">
            <thead>
              <tr className="bg-neutral-200 text-left">
                <th className="border border-neutral-400 px-2 py-1">#</th>
                <th className="border border-neutral-400 px-2 py-1">Type</th>
                <th className="border border-neutral-400 px-2 py-1">Name</th>
                <th className="border border-neutral-400 px-2 py-1">Purpose / Description</th>
                <th className="border border-neutral-400 px-2 py-1 text-right">Gain</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">Pan</th>
                <th className="border border-neutral-400 px-2 py-1 text-right">Delay</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">HPF</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">LPF</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">EQ</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">Comp</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">Lim</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">Mute</th>
                <th className="border border-neutral-400 px-2 py-1">Routed From</th>
              </tr>
            </thead>
            <tbody>
              {state.outputs.map((o, i) => (
                <tr key={o.id} className={i % 2 ? "bg-neutral-50" : ""} data-testid={`print-out-row-${o.id}`}>
                  <td className="border border-neutral-300 px-2 py-1 font-mono">{i + 1}</td>
                  <td className="border border-neutral-300 px-2 py-1 font-mono">
                    {o.kind === "out_phy" ? "PHY" : "VIRT"}
                  </td>
                  <td className="border border-neutral-300 px-2 py-1 font-mono font-bold">{o.name}</td>
                  <td className="border border-neutral-300 px-2 py-1 italic">{o.description || "—"}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">{fmtDb(o.gain)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-center font-mono">{fmtPan(o.pan)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">{formatDelay(o.delay)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-center font-mono">
                    {o.crossover.hpf.enabled ? `${Math.round(o.crossover.hpf.freq)}Hz` : "—"}
                  </td>
                  <td className="border border-neutral-300 px-2 py-1 text-center font-mono">
                    {o.crossover.lpf.enabled ? `${Math.round(o.crossover.lpf.freq)}Hz` : "—"}
                  </td>
                  <td className="border border-neutral-300 px-2 py-1 text-center">{yesNo(o.eq.enabled)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-center">{yesNo(o.comp.enabled)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-center">{yesNo(o.limiter.enabled)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-center">{yesNo(o.mute)}</td>
                  <td className="border border-neutral-300 px-2 py-1 text-[9px]">
                    {routingByOut[o.id]?.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Inputs table — simpler since inputs don't have the full DSP chain */}
          <h2 className="text-base font-bold mt-4 mb-2 uppercase tracking-wide">Input Channels</h2>
          <table className="w-full text-[10px] border-collapse mb-6" data-testid="print-inputs-table">
            <thead>
              <tr className="bg-neutral-200 text-left">
                <th className="border border-neutral-400 px-2 py-1">#</th>
                <th className="border border-neutral-400 px-2 py-1">Type</th>
                <th className="border border-neutral-400 px-2 py-1">Name</th>
                <th className="border border-neutral-400 px-2 py-1">Purpose / Description</th>
                <th className="border border-neutral-400 px-2 py-1">Routes To</th>
              </tr>
            </thead>
            <tbody>
              {state.inputs.map((inp, i) => {
                const dests = state.outputs
                  .filter((o) => (state.matrix[o.id] || []).includes(inp.id))
                  .map((o) => o.name);
                return (
                  <tr key={inp.id} className={i % 2 ? "bg-neutral-50" : ""}>
                    <td className="border border-neutral-300 px-2 py-1 font-mono">{i + 1}</td>
                    <td className="border border-neutral-300 px-2 py-1 font-mono">
                      {inp.kind === "in_phy" ? "PHY" : "VIRT"}
                    </td>
                    <td className="border border-neutral-300 px-2 py-1 font-mono font-bold">{inp.name}</td>
                    <td className="border border-neutral-300 px-2 py-1 italic">{inp.description || "—"}</td>
                    <td className="border border-neutral-300 px-2 py-1 text-[9px]">{dests.join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer / signature line */}
          <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
            <div>
              <div className="border-b border-black h-8" />
              <div className="text-neutral-600 mt-1">Configured by</div>
            </div>
            <div>
              <div className="border-b border-black h-8" />
              <div className="text-neutral-600 mt-1">Date / Signature</div>
            </div>
          </div>
          <div className="text-[9px] text-neutral-500 mt-4 text-center print:fixed print:bottom-2 print:inset-x-0">
            AudioSystem DSP Web — generated {printedAt}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelMapPrint;
