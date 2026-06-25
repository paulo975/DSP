import React, { useCallback, useRef, useState, useEffect } from "react";

/**
 * Compact horizontal knob/slider for DSP parameter editing.
 * - Drag up/down to change value (vertical drag = +/- delta).
 * - Double-click to reset to default.
 */
const Knob = ({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = "",
  defaultValue = 0,
  format = (v) => v.toFixed(1),
  onChange,
  testId,
  accent = "#FF6B00",
  size = 56,
}) => {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max]);

  const onPointerDown = (e) => {
    e.preventDefault();
    setDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
    ref.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = useCallback(
    (e) => {
      if (!dragging) return;
      const dy = startY.current - e.clientY;
      const range = max - min;
      const speed = e.shiftKey ? 0.2 : 1;
      const delta = (dy / 120) * range * speed;
      const next = clamp(
        Math.round((startVal.current + delta) / step) * step,
      );
      onChange(Number(next.toFixed(4)));
    },
    [dragging, max, min, step, clamp, onChange],
  );

  const onPointerUp = () => setDragging(false);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragging, onPointerMove]);

  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270; // -135deg .. +135deg

  return (
    <div className="flex flex-col items-center select-none" data-testid={testId}>
      {label && (
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500 mb-1">
          {label}
        </span>
      )}
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onChange(defaultValue)}
        className={`relative cursor-ns-resize touch-none ${dragging ? "ring-1 ring-[var(--accent-color)]" : ""}`}
        style={{ width: size, height: size, "--accent-color": accent }}
      >
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="#161616" stroke="#2A2A2A" strokeWidth="2" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeDasharray={`${pct * 207} 207`}
            strokeDashoffset="-52"
            transform="rotate(135 50 50)"
            opacity={0.85}
          />
          <g transform={`rotate(${angle} 50 50)`}>
            <line x1="50" y1="50" x2="50" y2="18" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="50" cy="50" r="6" fill="#0A0A0A" stroke={accent} strokeWidth="1.5" />
        </svg>
      </div>
      <span className="mt-1 text-[10px] font-mono font-bold text-white">
        {format(value)}
        {unit && <span className="text-neutral-500 ml-0.5">{unit}</span>}
      </span>
    </div>
  );
};

export default Knob;
