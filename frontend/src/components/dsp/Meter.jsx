import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audioEngine";

/**
 * Segmented vertical level meter for a given output channel.
 * Polls the analyser at ~30fps for low CPU usage.
 */
const SEGMENTS = 16;

const Meter = ({ outputId, testId, height = 120 }) => {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const rafRef = useRef(null);
  const peakRef = useRef(0);
  const peakResetRef = useRef(0);

  useEffect(() => {
    let last = 0;
    const tick = (t) => {
      if (t - last > 33) {
        last = t;
        const v = audioEngine.getOutputLevel(outputId);
        setLevel(v);
        if (v > peakRef.current) {
          peakRef.current = v;
          peakResetRef.current = t;
        } else if (t - peakResetRef.current > 1200) {
          peakRef.current = Math.max(0, peakRef.current - 0.02);
        }
        setPeak(peakRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [outputId]);

  const litCount = Math.round(level * SEGMENTS);
  const peakIdx = Math.round(peak * SEGMENTS);

  return (
    <div
      className="flex flex-col-reverse gap-[2px] w-3 bg-black border border-neutral-800 p-[2px]"
      style={{ height }}
      data-testid={testId}
    >
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const isLit = i < litCount;
        const isPeak = i === peakIdx - 1 && peakIdx > litCount;
        const color =
          i >= SEGMENTS - 2
            ? "#FF0000"
            : i >= SEGMENTS - 5
              ? "#FFB800"
              : "#00FF41";
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              background: isLit || isPeak ? color : "#1a1a1a",
              opacity: isLit ? 1 : isPeak ? 0.7 : 0.35,
              boxShadow: isLit ? `0 0 4px ${color}` : "none",
              transition: "background 30ms linear",
            }}
          />
        );
      })}
    </div>
  );
};

export default Meter;
