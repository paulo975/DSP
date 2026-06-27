// Custom SVG EQ chart with draggable band handles. Replaces the static
// Recharts visualisation in EqEditor when the user wants direct on-curve
// editing (FabFilter Pro-Q-style workflow):
//
//   • Drag a handle horizontally → changes the band's centre frequency
//     (log scale 20 Hz → 20 kHz).
//   • Drag vertically            → changes gain (−18 … +18 dB).
//   • Mouse wheel on a handle    → changes Q (Shift = ×4 step).
//   • Double-click a handle      → reset that band (gain 0, default Q).
//
// The chart is pure SVG so we keep total bundle weight low and have full
// control over hit-targets, hover states, and crisp pixel rendering at
// any zoom level. Curve sampling uses the same simplified biquad math
// the rest of the app relies on (see EqEditor's bandGainAt).
import React from "react";

const W = 800;     // logical viewBox width
const H = 280;     // logical viewBox height
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const F_MIN = 20;
const F_MAX = 20000;
const G_MIN = -24;
const G_MAX = 18;
const G_BAND_MIN = -18;
const G_BAND_MAX = 18;
const Q_MIN = 0.1;
const Q_MAX = 10;

// Per-band default Q used by the "double-click to reset" action. Mirrors
// dspDefaults.js: lowshelf/highshelf use Q=0.7, the three peaking bands
// use Q=1.0. We only need a lookup keyed by band type here.
const DEFAULT_Q_FOR = (type) => (type === "peaking" ? 1.0 : 0.7);

// Distinct palette so each band's handle reads at a glance.
const BAND_COLORS = ["#22D3EE", "#A855F7", "#FF6B00", "#FFD60A", "#00FF41"];

// ---- coordinate mappers ----
const freqToX = (f) => PAD_L + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * PLOT_W;
const xToFreq = (x) => F_MIN * Math.pow(F_MAX / F_MIN, (x - PAD_L) / PLOT_W);
const gainToY = (g) => PAD_T + ((G_MAX - g) / (G_MAX - G_MIN)) * PLOT_H;
const yToGain = (y) => G_MAX - ((y - PAD_T) / PLOT_H) * (G_MAX - G_MIN);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Same biquad magnitude approximation used by EqEditor.computeCurve so the
// drawn line matches the audio engine's perceptual output.
const bandGainAt = (band, f) => {
  const ratio = f / band.freq;
  const logRatio = Math.log2(ratio);
  if (band.type === "peaking") {
    const bw = 1 / band.q;
    return band.gain * Math.exp(-Math.pow(logRatio / bw, 2));
  }
  if (band.type === "lowshelf") return band.gain / (1 + Math.exp(2 * logRatio));
  if (band.type === "highshelf") return band.gain / (1 + Math.exp(-2 * logRatio));
  return 0;
};

const computeCurvePoints = (bands, hpf, lpf) => {
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, i / 160);
    let g = 0;
    bands.forEach((b) => (g += bandGainAt(b, f)));
    if (hpf.enabled && f < hpf.freq) g -= 12 * Math.log2(hpf.freq / f);
    if (lpf.enabled && f > lpf.freq) g -= 12 * Math.log2(f / lpf.freq);
    g = clamp(g, G_MIN - 6, G_MAX + 6);
    pts.push([freqToX(f), gainToY(g)]);
  }
  return pts;
};

// Grid frequency lines drawn in the background — pro-audio convention.
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const GRID_GAINS = [-18, -12, -6, 0, 6, 12, 18];
const formatFreqLabel = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

const EqDragChart = ({ bands, hpf, lpf, onBandChange, onBandReset, disabled }) => {
  const svgRef = React.useRef(null);
  const dragRef = React.useRef(null); // { bandIndex, startX, startY }

  const curve = React.useMemo(() => computeCurvePoints(bands, hpf, lpf), [bands, hpf, lpf]);
  const curvePath = React.useMemo(() => {
    if (!curve.length) return "";
    return curve.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  }, [curve]);

  const svgPointFromEvent = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // Map client coords into the viewBox logical space (W × H).
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x: clamp(x, PAD_L, W - PAD_R), y: clamp(y, PAD_T, H - PAD_B) };
  };

  const startDrag = (idx) => (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { bandIndex: idx };
    // Capture pointer so we keep events even if cursor leaves the SVG.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    handleMove(e);
  };
  const handleMove = (e) => {
    if (!dragRef.current) return;
    const { x, y } = svgPointFromEvent(e);
    const freq = clamp(xToFreq(x), F_MIN, F_MAX);
    const gain = clamp(yToGain(y), G_BAND_MIN, G_BAND_MAX);
    onBandChange(dragRef.current.bandIndex, { freq: Math.round(freq), gain: Math.round(gain * 10) / 10 });
  };
  const endDrag = (e) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  // Mouse wheel on a handle → adjust Q. Shift = bigger step.
  const onWheel = (idx) => (e) => {
    if (disabled) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1; // wheel up = larger Q
    const step = (e.shiftKey ? 0.5 : 0.1) * dir;
    const cur = bands[idx]?.q ?? 1;
    const next = clamp(Math.round((cur + step) * 100) / 100, Q_MIN, Q_MAX);
    onBandChange(idx, { q: next });
  };

  const onDoubleClickHandle = (idx) => (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    onBandReset(idx);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-full select-none"
      style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "default" }}
      data-testid="eq-drag-chart"
    >
      {/* Plot background */}
      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#000" stroke="#1f1f1f" />

      {/* Frequency grid + labels */}
      {GRID_FREQS.map((f) => {
        const x = freqToX(f);
        return (
          <g key={`fg-${f}`}>
            <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + PLOT_H} stroke="#1c1c1c" strokeDasharray="2 4" />
            <text x={x} y={H - 8} fontSize={10} textAnchor="middle" fill="#666" fontFamily="JetBrains Mono, monospace">
              {formatFreqLabel(f)}
            </text>
          </g>
        );
      })}
      {/* Gain grid + labels */}
      {GRID_GAINS.map((g) => {
        const y = gainToY(g);
        return (
          <g key={`gg-${g}`}>
            <line x1={PAD_L} y1={y} x2={PAD_L + PLOT_W} y2={y} stroke={g === 0 ? "#444" : "#1c1c1c"} strokeDasharray={g === 0 ? "" : "2 4"} />
            <text x={PAD_L - 6} y={y + 3} fontSize={10} textAnchor="end" fill="#666" fontFamily="JetBrains Mono, monospace">
              {g > 0 ? `+${g}` : g}
            </text>
          </g>
        );
      })}

      {/* Crossover shaded regions (visual cue, not interactive) */}
      {hpf.enabled && (
        <rect x={PAD_L} y={PAD_T} width={Math.max(0, freqToX(hpf.freq) - PAD_L)} height={PLOT_H} fill="#FF6B0011" />
      )}
      {lpf.enabled && (
        <rect x={freqToX(lpf.freq)} y={PAD_T} width={Math.max(0, PAD_L + PLOT_W - freqToX(lpf.freq))} height={PLOT_H} fill="#FF6B0011" />
      )}

      {/* EQ curve */}
      <path d={curvePath} stroke="#FF6B00" strokeWidth={2.5} fill="none" />

      {/* Draggable band handles */}
      {bands.map((b, i) => {
        const x = freqToX(b.freq);
        const y = gainToY(b.gain);
        const color = BAND_COLORS[i] || "#fff";
        const labelOffset = b.gain >= 0 ? 22 : -10;
        return (
          <g key={`bh-${i}`} data-testid={`eq-handle-${i}`}>
            {/* Q radius indicator — wider = lower Q */}
            <circle cx={x} cy={y} r={Math.max(10, 22 / Math.max(0.4, b.q))} fill={color} opacity={0.08} />
            {/* Drop line to baseline for fast freq read */}
            <line x1={x} y1={gainToY(0)} x2={x} y2={y} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
            {/* Handle itself — pointer events live here only */}
            <circle
              cx={x}
              cy={y}
              r={9}
              fill={color}
              stroke="#000"
              strokeWidth={1.5}
              style={{ cursor: disabled ? "not-allowed" : "grab" }}
              onPointerDown={startDrag(i)}
              onPointerMove={handleMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={onWheel(i)}
              onDoubleClick={onDoubleClickHandle(i)}
            />
            <text
              x={x}
              y={y + labelOffset}
              fontSize={10}
              textAnchor="middle"
              fill={color}
              fontFamily="JetBrains Mono, monospace"
              fontWeight={700}
              pointerEvents="none"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default EqDragChart;
