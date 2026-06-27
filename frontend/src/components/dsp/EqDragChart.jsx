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
import { audioEngine } from "@/lib/audioEngine";

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
// Smallest zoom window we allow on the X axis — about 1/3 octave. Anything
// tighter is more confusing than helpful for surgical tweaks.
const MIN_ZOOM_SPAN_LOG = 0.10; // log10(Fmax/Fmin) at full zoom-in

// Per-band default Q used by the "double-click to reset" action. Mirrors
// dspDefaults.js: lowshelf/highshelf use Q=0.7, the three peaking bands
// use Q=1.0. We only need a lookup keyed by band type here.
const DEFAULT_Q_FOR = (type) => (type === "peaking" ? 1.0 : 0.7);

// Distinct palette so each band's handle reads at a glance.
const BAND_COLORS = ["#22D3EE", "#A855F7", "#FF6B00", "#FFD60A", "#00FF41"];

// ---- coordinate mappers ----
// The X axis is log-scaled between a *current* visible window
// (`fLo`/`fHi`) so we can zoom & pan. The helpers below close over those
// bounds to keep call sites tidy.
const makeMappers = (fLo, fHi) => {
  const logSpan = Math.log10(fHi / fLo);
  return {
    freqToX: (f) => PAD_L + (Math.log10(f / fLo) / logSpan) * PLOT_W,
    xToFreq: (x) => fLo * Math.pow(fHi / fLo, (x - PAD_L) / PLOT_W),
  };
};
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

const computeCurvePoints = (bands, hpf, lpf, freqToX) => {
  // Always sample across the *full* audible band so the curve stays valid
  // when the user zooms in. The mapper clips off-screen points naturally.
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, i / 240);
    let g = 0;
    bands.forEach((b) => (g += bandGainAt(b, f)));
    if (hpf.enabled && f < hpf.freq) g -= 12 * Math.log2(hpf.freq / f);
    if (lpf.enabled && f > lpf.freq) g -= 12 * Math.log2(f / lpf.freq);
    g = clamp(g, G_MIN - 6, G_MAX + 6);
    pts.push([freqToX(f), gainToY(g)]);
  }
  return pts;
};

// Background frequency-grid candidates. We render whichever ones fall
// inside the current zoom window — keeps the labels readable at every
// zoom level. (Pro-audio convention: octave + half-octave anchors.)
const GRID_FREQS = [
  20, 30, 50, 80, 100, 150, 200, 300, 500, 800, 1000, 1500,
  2000, 3000, 5000, 7000, 10000, 15000, 20000,
];
const GRID_GAINS = [-18, -12, -6, 0, 6, 12, 18];
const formatFreqLabel = (f) => {
  if (f >= 1000) return `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(f)}`;
};

const EqDragChart = ({ outputId, bands, hpf, lpf, onBandChange, onBandReset, disabled }) => {
  const svgRef = React.useRef(null);
  const dragRef = React.useRef(null); // { bandIndex }
  const panRef = React.useRef(null); // { startClientX, startLog }
  // Spectrum FFT (per-output, attached on mount, detached on unmount). The
  // path string is updated via rAF — at ~30 fps and 128 polyline points
  // this is cheap and stays in React's declarative model.
  const fftBufRef = React.useRef(null);
  const [spectrumPath, setSpectrumPath] = React.useState("");

  // Visible frequency window (log-scaled X axis). User pans/zooms inside it.
  const [zoom, setZoom] = React.useState({ fLo: F_MIN, fHi: F_MAX });
  // Live cursor position on the plot — drives the hover tooltip. `null`
  // when the pointer leaves the chart or the user is mid-drag (the tooltip
  // would just chase the band handle and obscure it).
  const [hover, setHover] = React.useState(null);
  const { freqToX, xToFreq } = React.useMemo(
    () => makeMappers(zoom.fLo, zoom.fHi),
    [zoom.fLo, zoom.fHi],
  );
  const isZoomed = !(zoom.fLo <= F_MIN + 0.01 && zoom.fHi >= F_MAX - 0.01);

  // Total chain response at any frequency — sum every band + the crossover
  // roll-offs. Mirrors `computeCurvePoints` so the tooltip reads the same
  // gain the drawn line shows.
  const totalGainAt = React.useCallback(
    (f) => {
      let g = 0;
      bands.forEach((b) => (g += bandGainAt(b, f)));
      if (hpf.enabled && f < hpf.freq) g -= 12 * Math.log2(hpf.freq / f);
      if (lpf.enabled && f > lpf.freq) g -= 12 * Math.log2(f / lpf.freq);
      return g;
    },
    [bands, hpf, lpf],
  );

  const curve = React.useMemo(
    () => computeCurvePoints(bands, hpf, lpf, freqToX),
    [bands, hpf, lpf, freqToX],
  );
  const curvePath = React.useMemo(() => {
    if (!curve.length) return "";
    return curve.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  }, [curve]);

  // ---- Spectrum analyser life-cycle + FFT rendering ----
  // Attach a dedicated high-resolution analyser for this channel when the
  // chart mounts; detach when it unmounts. The rAF loop polls the analyser
  // at ~30 FPS and converts the linear-frequency bins to a log-X polyline
  // that matches the EQ curve's axes. The path is intentionally throttled
  // and capped to ~128 points to keep React updates cheap.
  React.useEffect(() => {
    if (!outputId) return undefined;
    const analyser = audioEngine.attachSpectrum(outputId);
    if (!analyser) return undefined;
    const bins = analyser.frequencyBinCount;
    if (!fftBufRef.current || fftBufRef.current.length !== bins) {
      fftBufRef.current = new Uint8Array(bins);
    }
    const sampleRate = audioEngine.ctx?.sampleRate || 48000;
    const nyquist = sampleRate / 2;
    // Pre-compute the log-spaced sample frequencies once per mount.
    const NPOINTS = 128;
    const sampleFreqs = new Float32Array(NPOINTS);
    for (let i = 0; i < NPOINTS; i++) {
      sampleFreqs[i] = F_MIN * Math.pow(F_MAX / F_MIN, i / (NPOINTS - 1));
    }
    let raf = 0;
    let lastDraw = 0;
    const FRAME_MS = 1000 / 30; // 30 FPS is plenty for spectrum visuals
    const tick = (ts) => {
      raf = requestAnimationFrame(tick);
      if (ts - lastDraw < FRAME_MS) return;
      lastDraw = ts;
      analyser.getByteFrequencyData(fftBufRef.current);
      const buf = fftBufRef.current;
      // Re-mappers — must reflect the latest zoom + curve mappers. We can't
      // close over freqToX here (state-bound) because this effect only runs
      // on mount; instead we recompute the mapper from the current zoom
      // via a ref, but a simpler approach: read it off the SVG attribute
      // each frame. Since zoom changes are rare, recomputing the mappers
      // inline per frame is fine.
      const { freqToX: f2x } = makeMappers(zoomRef.current.fLo, zoomRef.current.fHi);
      let d = "";
      for (let i = 0; i < NPOINTS; i++) {
        const f = sampleFreqs[i];
        // Linear-bin index for this log frequency.
        const idx = Math.min(bins - 1, Math.max(0, Math.round((f / nyquist) * bins)));
        const v = buf[idx] / 255; // 0..1, already byte-domain (~ -90..-10 dB mapped)
        // Map byte-domain value into the chart's gain space so it visually
        // aligns with the EQ curve: 0 → bottom of plot, 1 → ~+18 dB peak.
        const gainEq = -24 + v * 42; // [-24..+18] range
        const x = f2x(f);
        const y = gainToY(gainEq);
        d += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
      setSpectrumPath(d);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audioEngine.detachSpectrum(outputId);
      setSpectrumPath("");
    };
  }, [outputId]);

  // Keep the analyser-effect's view of zoom up to date without retriggering
  // the rAF setup every time the user pans/zooms (which would otherwise
  // cause visible spectrum flicker).
  const zoomRef = React.useRef(zoom);
  React.useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const svgPointFromEvent = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // Map client coords into the viewBox logical space (W × H).
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x: clamp(x, PAD_L, W - PAD_R), y: clamp(y, PAD_T, H - PAD_B) };
  };

  // ----- Band handle interaction -----
  const startDrag = (idx) => (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { bandIndex: idx };
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
  // Stops propagation so it doesn't double-fire the background zoom.
  const onHandleWheel = (idx) => (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
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

  // ----- Background zoom/pan interaction -----
  // Wheel on empty plot area: zoom focal-point on cursor (log-space).
  // Pro-Q-style — the frequency under the cursor stays put while the
  // surrounding range expands/contracts.
  const onBackgroundWheel = (e) => {
    if (disabled) return;
    e.preventDefault();
    const { x } = svgPointFromEvent(e);
    const focal = xToFreq(x); // freq the cursor is over right now
    const factor = e.deltaY > 0 ? 1.25 : 1 / 1.25; // wheel up = zoom in
    const curLog = Math.log10(zoom.fHi / zoom.fLo);
    let newLog = curLog * factor;
    // Clamp the visible span: never tighter than ~1/3 octave, never wider
    // than the full audible band.
    newLog = clamp(newLog, MIN_ZOOM_SPAN_LOG, Math.log10(F_MAX / F_MIN));
    if (Math.abs(newLog - curLog) < 1e-4) return;
    // Keep `focal` at the same fractional X position post-zoom.
    const fracX = (x - PAD_L) / PLOT_W;
    const logFocal = Math.log10(focal);
    let newLo = Math.pow(10, logFocal - newLog * fracX);
    let newHi = Math.pow(10, logFocal + newLog * (1 - fracX));
    // Clamp to absolute bounds; if we'd run off either edge, slide instead.
    if (newLo < F_MIN) {
      newHi *= F_MIN / newLo;
      newLo = F_MIN;
    }
    if (newHi > F_MAX) {
      newLo *= F_MAX / newHi;
      newHi = F_MAX;
    }
    setZoom({ fLo: clamp(newLo, F_MIN, F_MAX / 1.01), fHi: clamp(newHi, F_MIN * 1.01, F_MAX) });
  };

  // Shift+drag on the empty plot area → pan horizontally without changing zoom.
  const onBackgroundPointerDown = (e) => {
    if (disabled || !e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    panRef.current = {
      startClientX: e.clientX,
      startFLo: zoom.fLo,
      startFHi: zoom.fHi,
      widthPx: e.currentTarget.getBoundingClientRect().width,
    };
  };
  const onBackgroundPointerMove = (e) => {
    if (!panRef.current) return;
    const { startClientX, startFLo, startFHi, widthPx } = panRef.current;
    const dxFrac = (e.clientX - startClientX) / widthPx; // 0..1 across the SVG width
    const logShift = -dxFrac * Math.log10(startFHi / startFLo);
    let newLo = Math.pow(10, Math.log10(startFLo) + logShift);
    let newHi = Math.pow(10, Math.log10(startFHi) + logShift);
    if (newLo < F_MIN) {
      newHi *= F_MIN / newLo;
      newLo = F_MIN;
    }
    if (newHi > F_MAX) {
      newLo *= F_MAX / newHi;
      newHi = F_MAX;
    }
    setZoom({ fLo: newLo, fHi: newHi });
  };
  const onBackgroundPointerUp = (e) => {
    if (!panRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    panRef.current = null;
  };

  const resetZoom = () => setZoom({ fLo: F_MIN, fHi: F_MAX });

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-full select-none"
      style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "default" }}
      data-testid="eq-drag-chart"
      onWheel={onBackgroundWheel}
    >
      {/* Plot background — also the hit target for shift+drag panning */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={PLOT_W}
        height={PLOT_H}
        fill="#000"
        stroke="#1f1f1f"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={(e) => {
          onBackgroundPointerMove(e);
          // Track cursor for hover tooltip (only when not panning/dragging
          // a band handle — those interactions own the cursor focus).
          if (panRef.current || dragRef.current) return setHover(null);
          const { x, y } = svgPointFromEvent(e);
          setHover({ x, y });
        }}
        onPointerUp={onBackgroundPointerUp}
        onPointerCancel={onBackgroundPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={resetZoom}
        style={{ cursor: panRef.current ? "grabbing" : isZoomed ? "grab" : "default" }}
        data-testid="eq-bg"
      />

      {/* Frequency grid + labels — only show entries that fit in the window */}
      {GRID_FREQS.filter((f) => f >= zoom.fLo && f <= zoom.fHi).map((f) => {
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

      {/* Live FFT spectrum — drawn first so the EQ curve overlays it.
          Cyan fill + line; semi-transparent so users still see the grid.
          The path is empty when no audio is flowing (analyser not attached
          or AudioContext suspended), so nothing renders in that state. */}
      {spectrumPath && (
        <g pointerEvents="none" data-testid="eq-spectrum">
          <path
            d={`${spectrumPath} L ${W - PAD_R} ${PAD_T + PLOT_H} L ${PAD_L} ${PAD_T + PLOT_H} Z`}
            fill="#22D3EE"
            opacity={0.18}
          />
          <path d={spectrumPath} stroke="#22D3EE" strokeWidth={1.1} fill="none" opacity={0.55} />
        </g>
      )}

      {/* EQ curve */}
      <path d={curvePath} stroke="#FF6B00" strokeWidth={2.5} fill="none" />

      {/* Draggable band handles */}
      {bands.map((b, i) => {
        // Skip handles that fall outside the current zoom window — keeps
        // them from rendering on top of the y-axis labels at high zoom.
        const inView = b.freq >= zoom.fLo && b.freq <= zoom.fHi;
        if (!inView) return null;
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
              onWheel={onHandleWheel(i)}
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

      {/* Zoom indicator (top-right corner) — current range + click-to-reset.
          Only rendered when the user has zoomed away from the full audible band. */}
      {isZoomed && (
        <g data-testid="eq-zoom-indicator" onClick={resetZoom} style={{ cursor: "pointer" }}>
          <rect x={W - PAD_R - 132} y={PAD_T + 4} width={130} height={18} fill="#0a0a0a" stroke="#A855F7" />
          <text
            x={W - PAD_R - 67}
            y={PAD_T + 16}
            fontSize={10}
            textAnchor="middle"
            fill="#A855F7"
            fontFamily="JetBrains Mono, monospace"
            fontWeight={700}
          >
            {formatFreqLabel(zoom.fLo)} – {formatFreqLabel(zoom.fHi)} · RESET
          </text>
        </g>
      )}

      {/* Hover tooltip — live freq + total chain gain under the cursor.
          Positioned near the pointer with a small offset so it doesn't sit
          directly under the user's finger/cursor. Flips to the left edge of
          the cursor when too close to the right margin to avoid clipping. */}
      {hover && (() => {
        const f = clamp(xToFreq(hover.x), zoom.fLo, zoom.fHi);
        const g = totalGainAt(f);
        const labelW = 96;
        const labelH = 26;
        const flipLeft = hover.x + labelW + 18 > W - PAD_R;
        const lx = flipLeft ? hover.x - labelW - 12 : hover.x + 12;
        const ly = clamp(hover.y - labelH - 6, PAD_T + 2, PAD_T + PLOT_H - labelH - 2);
        return (
          <g data-testid="eq-hover-tip" pointerEvents="none">
            {/* Vertical guide line at cursor */}
            <line
              x1={hover.x}
              y1={PAD_T}
              x2={hover.x}
              y2={PAD_T + PLOT_H}
              stroke="#FF6B00"
              strokeWidth={0.75}
              strokeDasharray="3 3"
              opacity={0.55}
            />
            {/* Tooltip body */}
            <rect x={lx} y={ly} width={labelW} height={labelH} fill="#0a0a0a" stroke="#FF6B00" />
            <text
              x={lx + labelW / 2}
              y={ly + 11}
              fontSize={10}
              textAnchor="middle"
              fill="#FF6B00"
              fontFamily="JetBrains Mono, monospace"
              fontWeight={700}
            >
              {f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`}
            </text>
            <text
              x={lx + labelW / 2}
              y={ly + 22}
              fontSize={10}
              textAnchor="middle"
              fill="#fff"
              fontFamily="JetBrains Mono, monospace"
            >
              {`${g >= 0 ? "+" : ""}${g.toFixed(1)} dB`}
            </text>
          </g>
        );
      })()}
    </svg>
  );
};

export default EqDragChart;
