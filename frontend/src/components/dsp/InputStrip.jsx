// Analog console-style Input Strip — mute pill, value callout and a vertical
// fader with the classic white/red cap + central tick scale.
// Inspired by the reference photo provided by the user (Yamaha/Allen & Heath
// touchscreen surfaces). One strip per physical/Dante input.
import React from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";
import { getCategory } from "@/lib/channelCategories";

// Live RMS-derived meter for an input bus. Reads from the existing engine
// analyser via requestAnimationFrame — keeps the visual cheap (no React state
// per frame, mutates a ref + DOM directly).
const InputBusMeter = ({ inputId }) => {
  const fillRef = React.useRef(null);
  React.useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      const lvl = audioEngine.getInputBusLevel(inputId) || 0;
      // Smooth peak-decay for a meaty-looking VU response.
      last = Math.max(lvl, last * 0.92);
      const db = last <= 0 ? -60 : 20 * Math.log10(last);
      const pct = Math.max(0, Math.min(1, (db + 60) / 60)); // -60..0 → 0..1
      if (fillRef.current) {
        fillRef.current.style.height = `${pct * 100}%`;
        fillRef.current.style.background = db > -2 ? "#FF3B30" : db > -6 ? "#FFB800" : "#00FF41";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inputId]);
  return (
    <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-black/60 border-l border-neutral-900 overflow-hidden">
      <div ref={fillRef} className="absolute bottom-0 left-0 right-0" style={{ height: "0%" }} />
    </div>
  );
};

// Convert a dB value (-60..+12) to a normalised vertical position (0..1) using
// the same audio-taper curve faders feel right at: cubic toward the bottom.
const dbToPct = (db) => {
  // Map -60 → 0, 0 → 0.75, +12 → 1.0 (so 0 dB sits ~3/4 up like a real console)
  const clamped = Math.max(-60, Math.min(12, db));
  if (clamped >= 0) return 0.75 + ((clamped / 12) * 0.25);
  return 0.75 * ((clamped + 60) / 60);
};
const pctToDb = (pct) => {
  const p = Math.max(0, Math.min(1, pct));
  if (p >= 0.75) return ((p - 0.75) / 0.25) * 12;
  return (p / 0.75) * 60 - 60;
};

const SCALE_TICKS = [12, 6, 3, 0, -3, -6, -12, -30, -60];

const InputStrip = ({ input }) => {
  const { updateInput, readOnly } = useDsp();
  const trackRef = React.useRef(null);

  const tid = (k) => `in-${input.id}-${k}`;
  const display = input.mute ? "MUTE" : input.gain.toFixed(0);

  // Pointer drag on the fader track — gives a buttery, touch-friendly feel
  // without relying on the native <input range> appearance.
  const onPointerDown = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const onMove = (ev) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (y == null) return;
      const pct = 1 - (y - rect.top) / rect.height;
      updateInput(input.id, { gain: Math.round(pctToDb(pct) * 10) / 10 });
    };
    onMove(e); // jump-to position on initial click
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Equivalent of "double-click to unity" on most consoles.
  const onTrackDoubleClick = () => { if (!readOnly) updateInput(input.id, { gain: 0 }); };

  const pct = dbToPct(input.gain);

  return (
    <div className="w-[88px] bg-[#0a0a0a] border-r border-neutral-900 flex flex-col items-center pt-2 pb-3 select-none" data-testid={tid("strip")}>
      {/* Scribble strip — colour-coded category tag (Waves eMotion LV1 style) */}
      {(() => {
        const cat = getCategory(input.category);
        if (cat.id === "none") return null;
        return (
          <div
            className="w-[74px] h-3 mb-1 flex items-center justify-center text-[8px] font-mono font-bold uppercase tracking-[0.2em] text-black rounded-sm"
            style={{ background: cat.color }}
            data-testid={tid("category-tag")}
          >
            {cat.name}
          </div>
        );
      })()}

      {/* Header pill — channel label */}
      <div
        className="w-[74px] h-7 rounded-sm bg-[#1a1a1a] border border-neutral-800 flex items-center justify-center mb-3"
        data-testid={tid("label")}
      >
        <span className="text-[13px] font-semibold tracking-wider text-neutral-200">{input.name}</span>
      </div>

      {/* MUTE pill — large touch target like the reference photo */}
      <button
        onClick={() => updateInput(input.id, { mute: !input.mute })}
        disabled={readOnly}
        data-testid={tid("mute")}
        className="w-[74px] h-9 rounded-md flex items-center justify-center mb-3 font-bold text-[12px] tracking-[0.18em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: input.mute ? "#FF3B30" : "#222",
          color: input.mute ? "#000" : "#bbb",
          boxShadow: input.mute ? "0 0 0 1px #FF3B30, 0 0 12px rgba(255,59,48,0.4)" : "inset 0 -2px 0 rgba(0,0,0,0.4)",
        }}
      >
        MUTE
      </button>

      {/* Solo — small, secondary action */}
      <button
        onClick={() => updateInput(input.id, { solo: !input.solo })}
        disabled={readOnly}
        data-testid={tid("solo")}
        className="w-[74px] h-6 rounded-sm mb-3 font-bold text-[9px] tracking-[0.2em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: input.solo ? "#FFD60A" : "transparent",
          color: input.solo ? "#000" : "#666",
          border: `1px solid ${input.solo ? "#FFD60A" : "#2a2a2a"}`,
        }}
      >
        SOLO
      </button>

      {/* Fader assembly — track + scale ticks + cap + callout + bus meter */}
      <div className="relative w-[74px] grow flex justify-center" data-testid={tid("fader-wrap")}>
        {/* Track background */}
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onDoubleClick={onTrackDoubleClick}
          className="relative w-3 h-full bg-black border border-neutral-800 cursor-ns-resize"
          data-testid={tid("fader-track")}
          role="slider"
          aria-valuemin={-60}
          aria-valuemax={12}
          aria-valuenow={input.gain}
          aria-label={`${input.name} fader`}
          style={{ touchAction: "none" }}
        >
          {/* Zero-dB reference line */}
          <div
            className="absolute left-[-3px] right-[-3px] h-px bg-[#FF6B00]/70"
            style={{ bottom: `${dbToPct(0) * 100}%` }}
          />
        </div>

        {/* Tick marks + numeric labels (right-side, like the reference) */}
        <div className="absolute right-[10px] top-0 bottom-0 w-7 pointer-events-none">
          {SCALE_TICKS.map((tick) => (
            <div
              key={tick}
              className="absolute left-0 right-0 flex items-center gap-1"
              style={{ bottom: `${dbToPct(tick) * 100}%`, transform: "translateY(50%)" }}
            >
              <span className="block w-1.5 h-px bg-neutral-600" />
              <span
                className="text-[9px] font-mono leading-none"
                style={{ color: tick === 0 ? "#FF6B00" : "#666" }}
              >
                {tick > 0 ? `+${tick}` : tick}
              </span>
            </div>
          ))}
        </div>

        {/* Callout box showing the current dB value, attached to the cap */}
        <div
          className="absolute pointer-events-none transition-[bottom] duration-[60ms]"
          style={{
            bottom: `calc(${pct * 100}% - 10px)`,
            left: "0",
          }}
        >
          <div
            className="bg-[#101010] border border-neutral-700 px-1 py-0.5 rounded-sm font-mono text-[10px] font-bold text-white tabular-nums min-w-[28px] text-center"
            data-testid={tid("value-callout")}
          >
            {display}
          </div>
          {/* Triangular pointer */}
          <div
            className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0"
            style={{
              borderTop: "4px solid transparent",
              borderBottom: "4px solid transparent",
              borderLeft: "4px solid #2a2a2a",
            }}
          />
        </div>

        {/* Fader cap (white pill with red center line) — classic console look */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-[bottom] duration-[60ms]"
          style={{ bottom: `calc(${pct * 100}% - 11px)` }}
          data-testid={tid("fader-cap")}
        >
          <div className="w-7 h-[22px] rounded-md flex items-center justify-center" style={{
            background: "linear-gradient(180deg, #f6f6f6 0%, #cfcfcf 50%, #888 100%)",
            boxShadow: "0 1px 0 #fff inset, 0 -1px 0 rgba(0,0,0,0.5) inset, 0 4px 8px rgba(0,0,0,0.7)",
          }}>
            <div className="w-px h-[14px] bg-[#FF3B30]" />
          </div>
        </div>

        {/* Live input bus meter — right-side thin VU */}
        <InputBusMeter inputId={input.id} />
      </div>

      {/* dB readout (always visible at strip foot for screen reading) */}
      <div className="mt-2 text-[10px] font-mono text-neutral-500 tabular-nums" data-testid={tid("readout")}>
        {input.mute ? "—" : `${input.gain.toFixed(1)} dB`}
      </div>
    </div>
  );
};

export default InputStrip;
