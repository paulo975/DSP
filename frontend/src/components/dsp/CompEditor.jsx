import React from "react";
import { useDsp } from "@/lib/dspStore";

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500 w-28">{label}</span>
    <div className="grow">{children}</div>
  </div>
);

const Slider = ({ value, min, max, step, onChange, format, testId }) => (
  <div className="flex items-center gap-2">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="grow accent-[#FF6B00]"
      data-testid={testId}
    />
    <span className="text-xs font-mono font-bold text-white w-14 text-right">{format(value)}</span>
  </div>
);

const CompEditor = ({ outputId, onClose }) => {
  const { state, updateOutputDeep } = useDsp();
  const out = state.outputs.find((o) => o.id === outputId);
  if (!out) return null;
  const set = (path, v) => {
    updateOutputDeep(out.id, (o) => {
      const next = JSON.parse(JSON.stringify(o));
      const segs = path.split(".");
      let c = next;
      for (let i = 0; i < segs.length - 1; i++) c = c[segs[i]];
      c[segs[segs.length - 1]] = v;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="comp-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Dynamics</div>
            <div className="text-lg font-semibold text-white">{out.name}</div>
          </div>
          <button onClick={onClose} data-testid="comp-close" className="text-neutral-400 hover:text-white text-2xl px-2">×</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="border border-neutral-800 p-4 bg-[#0f0f0f]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">Compressor</span>
              <button
                onClick={() => set("comp.enabled", !out.comp.enabled)}
                data-testid="comp-enabled"
                className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1 border"
                style={{
                  background: out.comp.enabled ? "#FF6B00" : "transparent",
                  color: out.comp.enabled ? "#000" : "#888",
                  borderColor: out.comp.enabled ? "#FF6B00" : "#2A2A2A",
                }}
              >
                {out.comp.enabled ? "ON" : "OFF"}
              </button>
            </div>
            <Row label="Threshold">
              <Slider value={out.comp.threshold} min={-60} max={0} step={0.5}
                onChange={(v) => set("comp.threshold", v)} format={(v) => `${v.toFixed(1)} dB`} testId="comp-threshold" />
            </Row>
            <Row label="Ratio">
              <Slider value={out.comp.ratio} min={1} max={20} step={0.1}
                onChange={(v) => set("comp.ratio", v)} format={(v) => `${v.toFixed(1)}:1`} testId="comp-ratio" />
            </Row>
            <Row label="Attack">
              <Slider value={out.comp.attack} min={0} max={200} step={0.5}
                onChange={(v) => set("comp.attack", v)} format={(v) => `${v.toFixed(1)} ms`} testId="comp-attack" />
            </Row>
            <Row label="Release">
              <Slider value={out.comp.release} min={5} max={1000} step={1}
                onChange={(v) => set("comp.release", v)} format={(v) => `${Math.round(v)} ms`} testId="comp-release" />
            </Row>
            <Row label="Knee">
              <Slider value={out.comp.knee} min={0} max={40} step={0.5}
                onChange={(v) => set("comp.knee", v)} format={(v) => `${v.toFixed(1)} dB`} testId="comp-knee" />
            </Row>
            <Row label="Makeup">
              <Slider value={out.comp.makeup} min={0} max={24} step={0.1}
                onChange={(v) => set("comp.makeup", v)} format={(v) => `${v.toFixed(1)} dB`} testId="comp-makeup" />
            </Row>
          </div>
          <div className="border border-neutral-800 p-4 bg-[#0f0f0f]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">Limiter</span>
              <button
                onClick={() => set("limiter.enabled", !out.limiter.enabled)}
                data-testid="limiter-enabled"
                className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1 border"
                style={{
                  background: out.limiter.enabled ? "#FF6B00" : "transparent",
                  color: out.limiter.enabled ? "#000" : "#888",
                  borderColor: out.limiter.enabled ? "#FF6B00" : "#2A2A2A",
                }}
              >
                {out.limiter.enabled ? "ON" : "OFF"}
              </button>
            </div>
            <Row label="Ceiling">
              <Slider value={out.limiter.ceiling} min={-12} max={0} step={0.1}
                onChange={(v) => set("limiter.ceiling", v)} format={(v) => `${v.toFixed(1)} dB`} testId="limiter-ceiling" />
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompEditor;
