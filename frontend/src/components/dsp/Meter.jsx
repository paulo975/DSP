import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audioEngine";

/**
 * Segmented level meter (vertical or horizontal) reading from the audio engine.
 * - source: "in" | "out" — which analyser to read
 * - orient: "v" | "h"
 */
const Meter = ({
  outputId,
  source = "out",
  orient = "v",
  segments = 16,
  height = 120,
  width = 12,
  testId,
}) => {
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
        const v =
          source === "in"
            ? audioEngine.getInputLevel(outputId)
            : audioEngine.getOutputLevel(outputId);
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
  }, [outputId, source]);

  const litCount = Math.round(level * segments);
  const peakIdx = Math.round(peak * segments);
  const flexDir = orient === "v" ? "flex-col-reverse" : "flex-row";

  return (
    <div
      className={`flex ${flexDir} gap-[2px] bg-black border border-neutral-800 p-[2px]`}
      style={orient === "v" ? { height, width } : { width, height }}
      data-testid={testId}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const isLit = i < litCount;
        const isPeak = i === peakIdx - 1 && peakIdx > litCount;
        const color =
          i >= segments - 2
            ? "#FF0000"
            : i >= segments - 5
              ? "#FFB800"
              : "#00FF41";
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              background: isLit || isPeak ? color : "#1a1a1a",
              opacity: isLit ? 1 : isPeak ? 0.7 : 0.3,
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
