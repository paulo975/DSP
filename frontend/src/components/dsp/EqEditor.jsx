import React, { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, ReferenceLine, CartesianGrid, Tooltip } from "recharts";
import { useDsp } from "@/lib/dspStore";
import EqDragChart from "./EqDragChart";

// Per-band default Q used when the user double-clicks a handle to reset the
// band. Mirrors dspDefaults.js — keep these in sync.
const DEFAULT_Q = (type) => (type === "peaking" ? 1.0 : 0.7);

// Module-level constants — stable references, safe to use as Recharts props
// without per-render allocation.
const CHART_MARGIN = { top: 10, right: 20, left: 0, bottom: 10 };
const X_DOMAIN = [20, 20000];
const X_TICKS = [20, 100, 1000, 10000, 20000];
const Y_DOMAIN = [-24, 18];
const Y_TICKS = [-24, -12, 0, 12];
const MONO_TICK = { fontFamily: "JetBrains Mono, monospace" };
const TOOLTIP_STYLE = { background: "#0a0a0a", border: "1px solid #2A2A2A", fontFamily: "JetBrains Mono" };
const formatXTick = (v) => (v >= 1000 ? `${v / 1000}k` : v);
const formatYTick = (v) => `${v}`;
const formatTooltipLabel = (v) => `${Math.round(v)} Hz`;
const formatTooltipValue = (v) => [`${v.toFixed(1)} dB`, "Gain"];

// Biquad gain magnitude approximation per band (simplified peaking / shelving response)
const bandGainAt = (band, f) => {
  const ratio = f / band.freq;
  const logRatio = Math.log2(ratio);
  if (band.type === "peaking") {
    const bw = 1 / band.q;
    return band.gain * Math.exp(-Math.pow(logRatio / bw, 2));
  }
  if (band.type === "lowshelf") {
    // negative log ratio means below freq -> apply gain
    return band.gain / (1 + Math.exp(2 * logRatio));
  }
  if (band.type === "highshelf") {
    return band.gain / (1 + Math.exp(-2 * logRatio));
  }
  return 0;
};

const computeCurve = (bands, hpf, lpf) => {
  const points = [];
  for (let i = 0; i <= 80; i++) {
    const f = 20 * Math.pow(1000, i / 80); // 20Hz to 20kHz log
    let g = 0;
    bands.forEach((b) => (g += bandGainAt(b, f)));
    // crossover approximation: -12dB/oct rolloff outside band
    if (hpf.enabled && f < hpf.freq) {
      g -= 12 * Math.log2(hpf.freq / f);
    }
    if (lpf.enabled && f > lpf.freq) {
      g -= 12 * Math.log2(f / lpf.freq);
    }
    points.push({ freq: f, gain: Math.max(-30, Math.min(20, g)) });
  }
  return points;
};

const EqEditor = ({ outputId, onClose }) => {
  const { state, updateOutputDeep, readOnly } = useDsp();
  const out = state.outputs.find((o) => o.id === outputId);
  const [chartMode, setChartMode] = React.useState("drag"); // 'drag' | 'static'
  const curve = useMemo(
    () => (out ? computeCurve(out.eq.bands, out.crossover.hpf, out.crossover.lpf) : []),
    [out],
  );
  if (!out) return null;

  const setBand = (i, patch) => {
    updateOutputDeep(out.id, (o) => {
      const next = JSON.parse(JSON.stringify(o));
      next.eq.bands[i] = { ...next.eq.bands[i], ...patch };
      return next;
    });
  };
  const resetBand = (i) => {
    updateOutputDeep(out.id, (o) => {
      const next = JSON.parse(JSON.stringify(o));
      const type = next.eq.bands[i].type;
      next.eq.bands[i] = { ...next.eq.bands[i], gain: 0, q: DEFAULT_Q(type) };
      return next;
    });
  };

  const toggleEnabled = () => {
    updateOutputDeep(out.id, (o) => ({ ...o, eq: { ...o.eq, enabled: !o.eq.enabled } }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="eq-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-5xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Parametric EQ</div>
            <div className="text-lg font-semibold text-white">{out.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-neutral-800" data-testid="eq-mode-group">
              <button
                onClick={() => setChartMode("drag")}
                data-testid="eq-mode-drag"
                title="Interactive — drag handles to edit · wheel = Q · double-click = reset"
                className="text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 font-bold transition-colors border-r last:border-r-0 border-neutral-800"
                style={{
                  background: chartMode === "drag" ? "#A855F7" : "transparent",
                  color: chartMode === "drag" ? "#000" : "#888",
                }}
              >
                Drag
              </button>
              <button
                onClick={() => setChartMode("static")}
                data-testid="eq-mode-static"
                title="Static curve preview (Recharts) — use the sliders below for fine-tuning"
                className="text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 font-bold transition-colors"
                style={{
                  background: chartMode === "static" ? "#A855F7" : "transparent",
                  color: chartMode === "static" ? "#000" : "#888",
                }}
              >
                Static
              </button>
            </div>
            <button
              onClick={toggleEnabled}
              data-testid="eq-enable-toggle"
              className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border"
              style={{
                background: out.eq.enabled ? "#FF6B00" : "transparent",
                color: out.eq.enabled ? "#000" : "#888",
                borderColor: out.eq.enabled ? "#FF6B00" : "#2A2A2A",
              }}
            >
              {out.eq.enabled ? "Bypass: OFF" : "Bypass: ON"}
            </button>
            <button onClick={onClose} data-testid="eq-close" className="text-neutral-400 hover:text-white text-2xl px-2">
              ×
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="h-72 bg-black border border-neutral-900 p-2" data-testid="eq-chart">
            {chartMode === "drag" ? (
              <EqDragChart
                bands={out.eq.bands}
                hpf={out.crossover.hpf}
                lpf={out.crossover.lpf}
                onBandChange={setBand}
                onBandReset={resetBand}
                disabled={readOnly}
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={CHART_MARGIN}>
                  <CartesianGrid stroke="#1f1f1f" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="freq"
                    scale="log"
                    domain={X_DOMAIN}
                    ticks={X_TICKS}
                    type="number"
                    tickFormatter={formatXTick}
                    stroke="#666"
                    fontSize={10}
                    tick={MONO_TICK}
                  />
                  <YAxis
                    domain={Y_DOMAIN}
                    ticks={Y_TICKS}
                    stroke="#666"
                    fontSize={10}
                    tick={MONO_TICK}
                    tickFormatter={formatYTick}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={formatTooltipLabel}
                    formatter={formatTooltipValue}
                  />
                  <ReferenceLine y={0} stroke="#444" />
                  <Line type="monotone" dataKey="gain" stroke="#FF6B00" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          {chartMode === "drag" && (
            <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500" data-testid="eq-drag-hint">
              Drag handle = freq + gain · Mouse wheel = Q (Shift = ×5) · Double-click = reset band
            </div>
          )}

          <div className="grid grid-cols-5 gap-3 mt-4">
            {out.eq.bands.map((b, i) => (
              <div key={i} className="border border-neutral-800 bg-[#0f0f0f] p-3" data-testid={`eq-band-${i}`}>
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#FF6B00] mb-2">
                  Band {i + 1} · {b.type}
                </div>
                <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-neutral-500">Freq</label>
                <input
                  type="number"
                  value={Math.round(b.freq)}
                  min={20}
                  max={20000}
                  onChange={(e) => setBand(i, { freq: Number(e.target.value) })}
                  className="w-full bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-1 py-0.5 outline-none focus:border-[#FF6B00] mb-2"
                  data-testid={`eq-band-${i}-freq`}
                />
                <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-neutral-500">Gain (dB)</label>
                <input
                  type="range"
                  min={-18}
                  max={18}
                  step={0.1}
                  value={b.gain}
                  onChange={(e) => setBand(i, { gain: Number(e.target.value) })}
                  className="w-full accent-[#FF6B00]"
                  data-testid={`eq-band-${i}-gain`}
                />
                <div className="text-[10px] font-mono font-bold text-white text-center" data-testid={`eq-band-${i}-gain-value`}>
                  {b.gain.toFixed(1)} dB
                </div>
                <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-neutral-500 mt-1 block">Q</label>
                <input
                  type="range"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={b.q}
                  onChange={(e) => setBand(i, { q: Number(e.target.value) })}
                  className="w-full accent-[#FF6B00]"
                  data-testid={`eq-band-${i}-q`}
                />
                <div className="text-[10px] font-mono font-bold text-white text-center">{b.q.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EqEditor;
