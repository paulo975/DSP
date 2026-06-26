import React from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";
import Meter from "./Meter";
import SnapshotPanel from "./SnapshotPanel";

const dbFromLevel = (lvl) => {
  if (lvl <= 0) return -Infinity;
  // Approximation: meter level 0..1 mapped to ~ -60..0 dBFS
  return Math.max(-60, 20 * Math.log10(lvl));
};

const MeterColumn = ({ channel, source, accent, testId }) => {
  const isMuted = channel.mute;
  return (
    <div
      className="flex flex-col items-center gap-1 w-12 shrink-0 px-1 py-2 border-r border-neutral-900 hover:bg-black/40 transition-colors"
      data-testid={testId}
    >
      <div className="text-[8px] font-mono font-bold uppercase tracking-[0.15em] text-white truncate w-full text-center" title={channel.name}>
        {channel.name}
      </div>
      <div className="text-[8px] font-mono uppercase tracking-[0.2em]" style={{ color: accent }}>
        {channel.kind === "in_phy" ? "PHY" : channel.kind === "in_virt" ? "VIRT" : channel.kind === "out_phy" ? "PHY" : "VIRT"}
      </div>
      <Meter
        outputId={channel.id}
        source={source}
        orient="v"
        height={220}
        width={14}
        segments={32}
      />
      <MeterPeakDb channelId={channel.id} source={source} testId={`${testId}-db`} />
      {isMuted && (
        <span className="text-[8px] font-mono font-bold text-[#FF3B30] uppercase tracking-[0.15em]">MUTE</span>
      )}
    </div>
  );
};

// Compact peak-dB readout polled on RAF (kept in a child to limit Meter rerenders).
const MeterPeakDb = ({ channelId, source, testId }) => {
  const [peak, setPeak] = React.useState(-Infinity);
  React.useEffect(() => {
    let p = 0;
    let lastDrop = performance.now();
    let lastDecay = performance.now();
    let raf;
    const tick = (t) => {
      const lvl =
        source === "in"
          ? audioEngine.getInputLevel(channelId)
          : source === "inputBus"
            ? audioEngine.getInputBusLevel(channelId)
            : audioEngine.getOutputLevel(channelId);
      if (lvl > p) {
        p = lvl;
        lastDrop = t;
      } else if (t - lastDrop > 1500 && t - lastDecay > 50) {
        // Rate-limited decay (~20 Hz) for a smoother pro peak-hold feel.
        p = Math.max(0, p * 0.95);
        lastDecay = t;
      }
      const db = dbFromLevel(p);
      audioEngine.recordPeak(channelId, p, db);
      setPeak(db);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [channelId, source]);
  const v = peak === -Infinity ? "−∞" : peak.toFixed(0);
  return (
    <span className="text-[9px] font-mono font-bold text-neutral-300 tabular-nums" data-testid={testId}>
      {v}
    </span>
  );
};

const SectionHeader = ({ label, count, color }) => (
  <div
    className="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-3"
    style={{ background: "#0c0c0c" }}
  >
    <div className="w-1 h-4" style={{ background: color }} />
    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white">{label}</span>
    <span className="text-[10px] font-mono uppercase tracking-[0.15em]" style={{ color }}>
      · {count} ch
    </span>
  </div>
);

const ScaleColumn = () => (
  <div className="flex flex-col items-end pr-2 py-2 select-none border-r border-neutral-900 w-10 shrink-0">
    <div className="text-[8px] font-mono uppercase tracking-[0.15em] text-neutral-500 mb-1">dBFS</div>
    <div className="h-[244px] flex flex-col justify-between text-[9px] font-mono text-neutral-500 tabular-nums">
      <span>0</span>
      <span>-3</span>
      <span>-6</span>
      <span>-12</span>
      <span>-20</span>
      <span>-30</span>
      <span>-40</span>
      <span>-50</span>
      <span>-60</span>
    </div>
  </div>
);

const MetersView = () => {
  const { state } = useDsp();
  const [snapshotOpen, setSnapshotOpen] = React.useState(false);

  const inPhy = state.inputs.filter((i) => i.kind === "in_phy");
  const inVirt = state.inputs.filter((i) => i.kind === "in_virt");
  const outPhy = state.outputs.filter((o) => o.kind === "out_phy");
  const outVirt = state.outputs.filter((o) => o.kind === "out_virt");

  return (
    <div className="h-full overflow-auto bg-[#0a0a0a]" data-testid="meters-view">
      <div className="px-4 py-3 border-b border-neutral-800 bg-black flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white tracking-tight">All Channels · Meters</h2>
          <button
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#popout=meters`;
              window.open(url, "dsp-meters-popout", "width=1100,height=720,toolbar=no,location=no");
            }}
            data-testid="meters-popout"
            title="Open Meters in a separate window (for multi-monitor setups)"
            className="px-3 py-1 border border-neutral-700 text-neutral-300 text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:border-[#00B7FF] hover:text-[#00B7FF] transition-colors"
          >
            ↗ Pop Out
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-[10px] font-mono text-neutral-500">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2" style={{ background: "#00FF41" }} /> nominal</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2" style={{ background: "#FFB800" }} /> headroom</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2" style={{ background: "#FF0000" }} /> clip</div>
          </div>
          <button
            onClick={() => setSnapshotOpen(true)}
            data-testid="open-snapshot"
            className="px-3 py-1.5 border border-[#FF6B00] text-[#FF6B00] text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FF6B00] hover:text-black transition-colors"
          >
            ◉ Capture Snapshot
          </button>
        </div>
      </div>

      {/* Inputs section */}
      <SectionHeader label="Inputs" count={inPhy.length + inVirt.length} color="#00B7FF" />
      <div className="flex bg-[#080808]">
        <ScaleColumn />
        {inPhy.map((c) => (
          <MeterColumn key={c.id} channel={c} source="inputBus" accent="#00B7FF" testId={`meter-${c.id}`} />
        ))}
        <div className="w-px bg-[#1f1f1f]" />
        {inVirt.map((c) => (
          <MeterColumn key={c.id} channel={c} source="inputBus" accent="#FF8533" testId={`meter-${c.id}`} />
        ))}
      </div>

      {/* Outputs section */}
      <SectionHeader label="Outputs" count={outPhy.length + outVirt.length} color="#FF6B00" />
      <div className="flex bg-[#080808]">
        <ScaleColumn />
        {outPhy.map((c) => (
          <MeterColumn key={c.id} channel={c} source="out" accent="#FF6B00" testId={`meter-${c.id}`} />
        ))}
        <div className="w-px bg-[#1f1f1f]" />
        {outVirt.map((c) => (
          <MeterColumn key={c.id} channel={c} source="out" accent="#FF8533" testId={`meter-${c.id}`} />
        ))}
      </div>

      <div className="px-4 py-3 text-[10px] font-mono text-neutral-600 leading-relaxed">
        <div>• Input meters read the raw input bus signal (file source goes to IN 1/2; other inputs are silent unless routed by an external source).</div>
        <div>• Output meters read the post-DSP, pre-master output (after EQ/comp/delay/pan/gain).</div>
        <div>• Use <span className="text-[#FF7AC6]">Pink Noise</span> in the top bar to inject test signals into every output simultaneously.</div>
        <div>• Click <span className="text-[#FF6B00]">◉ Capture Snapshot</span> to freeze the current dB readout of all channels for calibration / documentation.</div>
      </div>

      {snapshotOpen && <SnapshotPanel onClose={() => setSnapshotOpen(false)} />}
    </div>
  );
};

export default MetersView;
