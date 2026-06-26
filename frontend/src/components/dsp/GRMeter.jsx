import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audioEngine";

/**
 * Gain Reduction (GR) meter — vertical bar where lit segments grow
 * DOWNWARD from the top (0 dB) as the compressor reduces gain.
 * Standard pro-audio convention: -20 dB at the bottom = max shown.
 */
const GRMeter = ({
  outputId,
  enabled = true,
  height = 200,
  width = 22,
  segments = 24,
  maxDb = 20, // bottom of scale
  testId,
}) => {
  const [reduction, setReduction] = useState(0); // dB, ≤ 0
  const [peakHold, setPeakHold] = useState(0);
  const peakRef = useRef(0);
  const peakTsRef = useRef(0);

  useEffect(() => {
    let last = 0;
    let raf;
    const tick = (t) => {
      if (t - last > 33) {
        last = t;
        const v = enabled ? audioEngine.getCompReduction(outputId) : 0;
        setReduction(v);
        // Peak-hold tracks the deepest (most negative) reduction
        if (v < peakRef.current) {
          peakRef.current = v;
          peakTsRef.current = t;
        } else if (t - peakTsRef.current > 1200) {
          peakRef.current = Math.min(0, peakRef.current + 0.4); // decay back toward 0
        }
        setPeakHold(peakRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [outputId, enabled]);

  const magnitude = Math.min(maxDb, Math.max(0, -reduction)) / maxDb; // 0..1
  const peakMag = Math.min(maxDb, Math.max(0, -peakHold)) / maxDb;
  const litCount = Math.round(magnitude * segments);
  const peakIdx = Math.round(peakMag * segments);

  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-neutral-500">GR</span>
      <div
        className="flex flex-col gap-[2px] bg-black border border-neutral-800 p-[2px] relative"
        style={{ width, height }}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isLit = i < litCount;
          const isPeak = i === peakIdx - 1 && peakIdx > litCount;
          // Color escalates with reduction depth (yellow → orange → red)
          const ratio = (i + 1) / segments;
          const color =
            ratio > 0.75 ? "#FF0000" : ratio > 0.45 ? "#FF8800" : "#FFD60A";
          return (
            <div
              key={i}
              className="flex-1 rounded-[1px]"
              style={{
                background: isLit || isPeak ? color : "#161616",
                opacity: isLit ? 1 : isPeak ? 0.65 : 0.3,
                boxShadow: isLit ? `0 0 4px ${color}` : "none",
                transition: "background 30ms linear",
              }}
            />
          );
        })}
      </div>
      <span
        className="text-[10px] font-mono font-bold tabular-nums"
        style={{ color: enabled ? (reduction < -6 ? "#FF8800" : "#FFD60A") : "#444" }}
        data-testid={testId ? `${testId}-db` : undefined}
      >
        {enabled ? `${reduction.toFixed(1)}` : "—"}
      </span>
      <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-neutral-600">dB</span>
    </div>
  );
};

export default GRMeter;
