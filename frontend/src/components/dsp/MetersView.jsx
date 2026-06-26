import React from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";
import Meter from "./Meter";
import SnapshotPanel from "./SnapshotPanel";
import AutoCaptureSequence from "./AutoCaptureSequence";
import { CALIBRATION_PROFILES, loadProfileId, saveProfileId, getProfileById, detectProfile } from "@/lib/calibrationProfiles";

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
  const [autoCaptureOpen, setAutoCaptureOpen] = React.useState(false);
  const [oneClickOpen, setOneClickOpen] = React.useState(false);
  const [profileId, setProfileIdState] = React.useState(loadProfileId);
  const [detection, setDetection] = React.useState(null); // { profileId, confidence, reasons, summary }

  const pickProfile = (id) => {
    setProfileIdState(id);
    saveProfileId(id);
    setDetection(null); // dismiss any pending recommendation once the user picks
  };

  const runDetection = () => {
    setDetection(detectProfile(state));
  };

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
            onClick={() => setOneClickOpen(true)}
            data-testid="open-one-click"
            title="Full calibration in ~30s: sweep all outputs, level-match to average, save snapshot, export CSV"
            className="px-3 py-1.5 bg-[#FFD60A] text-black text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FFE140] transition-colors"
          >
            ⚡ One-Click Calibration
          </button>
          <button
            onClick={() => setAutoCaptureOpen(true)}
            data-testid="open-auto-capture"
            title="Sweep each output with pink noise and measure peak dB — ideal for room calibration / level matching"
            className="px-3 py-1.5 border border-[#00B7FF] text-[#00B7FF] text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#00B7FF] hover:text-black transition-colors"
          >
            ⇶ Auto-Capture
          </button>
          <button
            onClick={() => setSnapshotOpen(true)}
            data-testid="open-snapshot"
            className="px-3 py-1.5 border border-[#FF6B00] text-[#FF6B00] text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#FF6B00] hover:text-black transition-colors"
          >
            ◉ Capture Snapshot
          </button>
        </div>
      </div>

      {/* Calibration Profile selector — feeds One-Click & Auto-Capture defaults */}
      <div className="px-4 py-2 border-b border-neutral-800 bg-[#0d0d0d] flex items-center gap-3 flex-wrap" data-testid="cal-profile-bar">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">Calibration Profile</span>
        <div className="flex gap-1" data-testid="cal-profile-group">
          {CALIBRATION_PROFILES.map((p) => {
            const isActive = p.id === profileId;
            return (
              <button
                key={p.id}
                onClick={() => pickProfile(p.id)}
                data-testid={`cal-profile-${p.id}`}
                title={p.description}
                className="text-[10px] font-mono uppercase tracking-[0.15em] px-3 py-1.5 border font-bold transition-colors flex items-center gap-1.5"
                style={{
                  background: isActive ? p.color : "transparent",
                  color: isActive ? "#000" : p.color,
                  borderColor: isActive ? p.color : "#2A2A2A",
                }}
              >
                <span className="text-base leading-none">{p.icon}</span>
                {p.name}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] font-mono text-neutral-500 ml-2" data-testid="cal-profile-active-desc">
          {(CALIBRATION_PROFILES.find((p) => p.id === profileId) || CALIBRATION_PROFILES[1]).description}
        </span>
        <button
          onClick={runDetection}
          data-testid="cal-detect"
          title="Analyse the current routing/delay/naming and suggest the best-fitting profile"
          className="ml-auto px-3 py-1.5 border border-[#00FF41] text-[#00FF41] text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#00FF41] hover:text-black transition-colors"
        >
          🔍 Detect
        </button>
      </div>

      {/* Detection result banner */}
      {detection && (() => {
        const suggested = getProfileById(detection.profileId);
        const conf = detection.confidence;
        const confColor = conf === "high" ? "#00FF41" : conf === "medium" ? "#FFD60A" : "#FFB800";
        const isAlreadyActive = detection.profileId === profileId;
        return (
          <div
            className="px-4 py-3 border-b border-neutral-800"
            style={{ background: `${suggested.color}10` }}
            data-testid="cal-detect-banner"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-base leading-none" style={{ color: suggested.color }}>{suggested.icon}</span>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em]">
                    <span className="text-neutral-500">Suggested →</span>{" "}
                    <span style={{ color: suggested.color }} data-testid="cal-detect-profile">{suggested.name}</span>{" "}
                    <span
                      className="ml-2 px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ background: confColor, color: "#000" }}
                      data-testid="cal-detect-confidence"
                    >
                      {conf.toUpperCase()} CONFIDENCE
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400 mt-1" data-testid="cal-detect-summary">
                    {detection.summary}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isAlreadyActive ? (
                  <button
                    onClick={() => pickProfile(detection.profileId)}
                    data-testid="cal-detect-apply"
                    className="px-3 py-1.5 font-mono uppercase tracking-[0.18em] text-[10px] font-bold"
                    style={{ background: suggested.color, color: "#000" }}
                  >
                    ✓ Use {suggested.name}
                  </button>
                ) : (
                  <span
                    className="px-3 py-1.5 font-mono uppercase tracking-[0.18em] text-[10px] font-bold border"
                    style={{ borderColor: suggested.color, color: suggested.color }}
                    data-testid="cal-detect-already-active"
                  >
                    Already Active
                  </span>
                )}
                <button
                  onClick={() => setDetection(null)}
                  data-testid="cal-detect-dismiss"
                  className="px-3 py-1.5 border border-neutral-700 text-neutral-400 text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:border-neutral-500 hover:text-neutral-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
            {detection.reasons.length > 0 && (
              <ul className="mt-2 text-[10px] font-mono text-neutral-500 pl-4 list-disc space-y-0.5" data-testid="cal-detect-reasons">
                {detection.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        );
      })()}

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
      {autoCaptureOpen && <AutoCaptureSequence onClose={() => setAutoCaptureOpen(false)} />}
      {oneClickOpen && <AutoCaptureSequence onClose={() => setOneClickOpen(false)} oneClick profileId={profileId} />}
    </div>
  );
};

export default MetersView;
