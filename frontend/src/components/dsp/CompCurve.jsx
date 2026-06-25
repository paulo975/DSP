import React, { useMemo } from "react";

/**
 * Compressor transfer curve visualization (input dB -> output dB).
 * Shows threshold, ratio, knee. Yamaha DYN-style mini-chart.
 */
const CompCurve = ({ comp, limiter, width = 180, height = 180 }) => {
  const pad = 18;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const dbToX = (db) => pad + ((db + 60) / 60) * w; // -60..0
  const dbToY = (db) => pad + h - ((db + 60) / 60) * h;

  const path = useMemo(() => {
    const points = [];
    const T = comp.threshold;
    const R = comp.enabled ? comp.ratio : 1;
    const K = comp.knee;
    const ceil = limiter.enabled ? limiter.ceiling : 0;
    for (let i = -60; i <= 0; i += 1) {
      let out = i;
      const overshoot = i - T;
      if (overshoot > K / 2) {
        out = T + overshoot / R;
      } else if (overshoot > -K / 2) {
        const x = overshoot + K / 2;
        const softR = 1 + (R - 1) * (x / K);
        out = T + overshoot / softR;
      }
      if (limiter.enabled && out > ceil) out = ceil;
      out = Math.max(-60, Math.min(0, out));
      points.push([i, out]);
    }
    return points
      .map(([i, o], idx) => `${idx === 0 ? "M" : "L"}${dbToX(i).toFixed(1)},${dbToY(o).toFixed(1)}`)
      .join(" ");
  }, [comp.enabled, comp.threshold, comp.ratio, comp.knee, limiter.enabled, limiter.ceiling]);

  return (
    <svg width={width} height={height} className="bg-black border border-neutral-800" data-testid="comp-curve">
      {/* Grid */}
      {[-48, -36, -24, -12, 0].map((db) => (
        <React.Fragment key={db}>
          <line x1={dbToX(db)} x2={dbToX(db)} y1={pad} y2={pad + h} stroke="#171717" />
          <line x1={pad} x2={pad + w} y1={dbToY(db)} y2={dbToY(db)} stroke="#171717" />
        </React.Fragment>
      ))}
      {/* Unity line */}
      <line x1={dbToX(-60)} y1={dbToY(-60)} x2={dbToX(0)} y2={dbToY(0)} stroke="#2A2A2A" strokeDasharray="2 3" />
      {/* Threshold marker */}
      <line
        x1={dbToX(comp.threshold)}
        x2={dbToX(comp.threshold)}
        y1={pad}
        y2={pad + h}
        stroke="#FFD60A"
        strokeDasharray="2 3"
        opacity={0.6}
      />
      {/* Compression curve */}
      <path
        d={path}
        stroke={comp.enabled || limiter.enabled ? "#00FF41" : "#666"}
        strokeWidth={2}
        fill="none"
      />
      {/* Labels */}
      <text x={pad + 4} y={pad + 12} fontSize={8} fontFamily="JetBrains Mono" fill="#555">
        OUT dB
      </text>
      <text x={pad + w - 38} y={pad + h - 4} fontSize={8} fontFamily="JetBrains Mono" fill="#555">
        IN dB
      </text>
      <text x={dbToX(comp.threshold) + 3} y={pad + 12} fontSize={8} fontFamily="JetBrains Mono" fill="#FFD60A">
        T {comp.threshold.toFixed(0)}
      </text>
    </svg>
  );
};

export default CompCurve;
