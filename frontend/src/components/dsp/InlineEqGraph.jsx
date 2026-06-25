import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Colored band markers like Yamaha Rivage / CL series
const BAND_COLORS = ["#FF3B30", "#FF6B00", "#FFD60A", "#00FF41", "#00B7FF"];

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const DB_MIN = -24;
const DB_MAX = 18;

const freqToX = (freq, width) => {
  const t = Math.log(freq / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
  return Math.max(0, Math.min(width, t * width));
};
const xToFreq = (x, width) => {
  const t = x / width;
  return Math.round(FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t));
};
const dbToY = (db, height) =>
  height - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * height;
const yToDb = (y, height) => DB_MAX - (y / height) * (DB_MAX - DB_MIN);

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

const InlineEqGraph = ({ output, onChangeBand, width = 640, height = 240 }) => {
  const svgRef = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const draggingRef = useRef(null);

  const { eq, crossover } = output;

  // Compute response curve
  const pathD = useMemo(() => {
    const steps = 128;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const f = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, i / steps);
      let g = 0;
      eq.bands.forEach((b) => (g += bandGainAt(b, f)));
      if (crossover.hpf.enabled && f < crossover.hpf.freq) {
        g -= 12 * Math.log2(crossover.hpf.freq / f);
      }
      if (crossover.lpf.enabled && f > crossover.lpf.freq) {
        g -= 12 * Math.log2(f / crossover.lpf.freq);
      }
      g = Math.max(DB_MIN, Math.min(DB_MAX, g));
      const x = freqToX(f, width);
      const y = dbToY(g, height);
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
    }
    return d;
  }, [eq, crossover, width, height]);

  const onPointerDown = (idx) => (e) => {
    e.preventDefault();
    setDraggingIdx(idx);
    draggingRef.current = idx;
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = useCallback(
    (e) => {
      const idx = draggingRef.current;
      if (idx === null || idx === undefined) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(height, e.clientY - rect.top));
      const f = Math.max(FREQ_MIN, Math.min(FREQ_MAX, xToFreq(x, width)));
      const g = Math.max(DB_MIN, Math.min(DB_MAX, Math.round(yToDb(y, height) * 10) / 10));
      onChangeBand(idx, { freq: f, gain: g });
    },
    [width, height, onChangeBand],
  );

  const onPointerUp = useCallback(() => {
    setDraggingIdx(null);
    draggingRef.current = null;
  }, []);

  useEffect(() => {
    if (draggingIdx === null) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingIdx, onPointerMove, onPointerUp]);

  // Gridlines / labels
  const freqTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const dbTicks = [-24, -12, 0, 12];

  return (
    <div className="relative bg-black border border-neutral-800" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block touch-none"
        data-testid="inline-eq-graph"
      >
        {/* Gridlines */}
        {freqTicks.map((f) => (
          <line
            key={`vx-${f}`}
            x1={freqToX(f, width)}
            x2={freqToX(f, width)}
            y1={0}
            y2={height}
            stroke="#1a1a1a"
            strokeWidth={1}
          />
        ))}
        {dbTicks.map((db) => (
          <line
            key={`hy-${db}`}
            x1={0}
            x2={width}
            y1={dbToY(db, height)}
            y2={dbToY(db, height)}
            stroke={db === 0 ? "#2A2A2A" : "#171717"}
            strokeWidth={db === 0 ? 1.5 : 1}
            strokeDasharray={db === 0 ? "" : "2 4"}
          />
        ))}
        {/* Frequency labels */}
        {freqTicks
          .filter((f) => [20, 100, 1000, 10000, 20000].includes(f))
          .map((f) => (
            <text
              key={`tx-${f}`}
              x={freqToX(f, width) + 3}
              y={height - 4}
              fontSize={9}
              fontFamily="JetBrains Mono"
              fill="#555"
            >
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          ))}
        {/* dB labels */}
        {dbTicks.map((db) => (
          <text
            key={`ty-${db}`}
            x={4}
            y={dbToY(db, height) - 2}
            fontSize={9}
            fontFamily="JetBrains Mono"
            fill="#555"
          >
            {db > 0 ? `+${db}` : db}
          </text>
        ))}
        {/* HPF / LPF guides */}
        {crossover.hpf.enabled && (
          <line
            x1={freqToX(crossover.hpf.freq, width)}
            x2={freqToX(crossover.hpf.freq, width)}
            y1={0}
            y2={height}
            stroke="#FF3B30"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}
        {crossover.lpf.enabled && (
          <line
            x1={freqToX(crossover.lpf.freq, width)}
            x2={freqToX(crossover.lpf.freq, width)}
            y1={0}
            y2={height}
            stroke="#00B7FF"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}
        {/* Response area + curve */}
        <path d={`${pathD} L ${width},${dbToY(0, height)} L 0,${dbToY(0, height)} Z`} fill="#FF6B00" opacity={0.08} />
        <path d={pathD} stroke="#FF6B00" strokeWidth={2.5} fill="none" />
        {/* Draggable band markers */}
        {eq.bands.map((b, i) => {
          const x = freqToX(b.freq, width);
          const y = dbToY(b.gain, height);
          const color = BAND_COLORS[i] || "#FF6B00";
          return (
            <g
              key={i}
              transform={`translate(${x},${y})`}
              onPointerDown={onPointerDown(i)}
              className="cursor-grab active:cursor-grabbing"
              data-testid={`eq-band-marker-${i}`}
            >
              <circle r={draggingIdx === i ? 16 : 13} fill={color} opacity={0.18} />
              <circle r={11} fill={color} stroke="#000" strokeWidth={1.5} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontFamily="JetBrains Mono"
                fontWeight="bold"
                fill="#000"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Band readouts row at top */}
      <div className="absolute top-1 left-1 right-1 flex justify-around gap-1 pointer-events-none">
        {eq.bands.map((b, i) => (
          <div
            key={i}
            className="px-1.5 py-0.5 bg-black/80 border text-[9px] font-mono"
            style={{ borderColor: BAND_COLORS[i], color: BAND_COLORS[i] }}
            data-testid={`eq-band-readout-${i}`}
          >
            <span className="font-bold">{i + 1}</span>
            <span className="text-white ml-1">{Math.round(b.freq)}Hz</span>
            <span className="text-white ml-1">{b.gain >= 0 ? "+" : ""}{b.gain.toFixed(1)}dB</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InlineEqGraph;
export { BAND_COLORS };
