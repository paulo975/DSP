/**
 * InputStrip — input channel, Waves eMotion LV1 style.
 * Fundo #1A1A1A, bordas 0.5px, sem preto puro.
 */
import React from "react";
import { useDsp } from "@/lib/dspStore";
import { audioEngine } from "@/lib/audioEngine";
import { getCategory } from "@/lib/channelCategories";

const T = {
  surface:  "#1A1A1A",
  border:   "#282828",
  text:     "#E8E8E8",
  textDim:  "#888888",
  textMuted:"#444444",
  blue:     "#00B7FF",
  cyan:     "#22D3EE",
  green:    "#00FF41",
  yellow:   "#FFD60A",
  red:      "#FF3B30",
  violet:   "#A855F7",
  orange:   "#FF6B00",
};

const findCand = (ch, all) => {
  const same = all.filter((c) => c.kind === ch.kind);
  const i    = same.findIndex((c) => c.id === ch.id);
  return same[i + 1] || same[i - 1] || null;
};

// Meter rápido com DOM directo (sem re-renders React)
const BusMeter = ({ inputId }) => {
  const fillRef = React.useRef(null);
  React.useEffect(() => {
    let raf = 0, last = 0;
    const tick = () => {
      const lvl = audioEngine.getInputBusLevel(inputId) || 0;
      last = Math.max(lvl, last * 0.92);
      const db  = last <= 0 ? -60 : 20 * Math.log10(last);
      const pct = Math.max(0, Math.min(1, (db + 60) / 60));
      if (fillRef.current) {
        fillRef.current.style.height = `${pct * 100}%`;
        fillRef.current.style.background = db > -2 ? T.red : db > -6 ? "#FFB800" : T.green;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inputId]);
  return (
    <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, background: "#0a0a0a", borderLeft: `0.5px solid ${T.border}`, overflow: "hidden" }}>
      <div ref={fillRef} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "0%" }} />
    </div>
  );
};

// Curva audio-taper: 0dB fica a 75% do track
const dbToPct = (db) => {
  const c = Math.max(-60, Math.min(12, db));
  return c >= 0 ? 0.75 + (c / 12) * 0.25 : 0.75 * ((c + 60) / 60);
};
const pctToDb = (p) => {
  const v = Math.max(0, Math.min(1, p));
  return v >= 0.75 ? ((v - 0.75) / 0.25) * 12 : (v / 0.75) * 60 - 60;
};

const InputStrip = ({ input }) => {
  const { state, updateInput, linkChannels, unlinkChannels, readOnly } = useDsp();
  const trackRef = React.useRef(null);
  const dragging = React.useRef(false);

  const tid     = (k) => `in-${input.id}-${k}`;
  const partner = input.linkedTo ? state.inputs.find((c) => c.id === input.linkedTo) : null;
  const cat     = getCategory(input.category);
  const isVirt  = input.kind === "in_virt";
  const accent  = cat.id !== "none" ? cat.color : isVirt ? T.cyan : T.blue;

  const handleLink = () => {
    if (readOnly) return;
    if (input.linkedTo) { unlinkChannels(input.id); return; }
    const cand = findCand(input, state.inputs);
    if (cand) linkChannels(input.id, cand.id);
  };

  // Drag no track do fader
  const startDrag = (e) => {
    if (readOnly) return;
    dragging.current = true;
    const track = trackRef.current;
    if (!track) return;
    const move = (ev) => {
      if (!dragging.current) return;
      const rect = track.getBoundingClientRect();
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      updateInput(input.id, { gain: parseFloat(pctToDb(pct).toFixed(1)) });
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    move(e);
  };

  const thumbPct = dbToPct(input.gain);
  const bdr = (col) => `0.5px solid ${col}`;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        width: 60, flexShrink: 0,
        background: T.surface,
        borderRight: bdr(T.border),
      }}
      data-testid={`input-strip-${input.id}`}
    >
      {/* Scribble strip */}
      <div style={{ height: 3, flexShrink: 0, background: accent }} />

      {/* Header */}
      <div style={{ padding: "4px 5px 3px", borderBottom: bdr(T.border), background: "#141414", flexShrink: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: 7, fontWeight: "bold", color: accent, letterSpacing: "0.1em", marginBottom: 1 }}>
          {isVirt ? "DAN" : "IN"} {input.index + 1}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {input.name}
        </div>
      </div>

      {/* Fader track + meter lateral */}
      <div
        ref={trackRef}
        onMouseDown={startDrag}
        style={{
          flex: 1, margin: "6px 5px 4px",
          background: "#0E0E0E",
          border: bdr(T.border),
          position: "relative",
          minHeight: 130,
          cursor: "ns-resize",
          overflow: "hidden",
        }}
        data-testid={tid("fader-track")}
      >
        <BusMeter inputId={input.id} />

        {/* 0dB reference line */}
        <div style={{
          position: "absolute", left: 0, right: 8,
          height: "0.5px", background: `${T.orange}50`,
          bottom: `${dbToPct(0) * 100}%`,
          pointerEvents: "none",
        }} />

        {/* Thumb */}
        <div
          style={{
            position: "absolute", left: 4, right: 10,
            height: 18,
            bottom: `calc(${thumbPct * 100}% - 9px)`,
            transition: "bottom 30ms linear",
          }}
          data-testid={tid("thumb")}
        >
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, #3a3a3a, #c0c0c0, #e8e8e8, #c0c0c0, #303030)",
            borderRadius: 1,
            boxShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }} />
          {/* Linha central de posição */}
          <div style={{
            position: "absolute", top: "50%", left: 0, right: 0,
            height: "0.5px", background: "rgba(255,255,255,0.7)",
            pointerEvents: "none",
          }} />
        </div>
      </div>

      {/* Gain readout */}
      <div style={{
        fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
        textAlign: "center", marginBottom: 4, letterSpacing: "-0.01em",
        color: input.mute ? T.red : T.textDim,
        flexShrink: 0,
      }}
        data-testid={tid("gain-value")}
      >
        {input.mute ? "M" : `${input.gain > 0 ? "+" : ""}${input.gain.toFixed(0)}`}
      </div>

      {/* MUTE */}
      <div style={{ padding: "0 5px 3px", flexShrink: 0 }}>
        <button
          onClick={() => updateInput(input.id, { mute: !input.mute })}
          data-testid={tid("mute")}
          style={{
            display: "block", width: "100%", padding: "4px 0",
            fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.1em",
            border: bdr(T.red),
            background: input.mute ? T.red : "transparent",
            color: input.mute ? "#000" : T.red,
            cursor: "pointer",
          }}
        >
          MUTE
        </button>
      </div>

      {/* SOLO */}
      <div style={{ padding: "0 5px 3px", flexShrink: 0 }}>
        <button
          onClick={() => updateInput(input.id, { solo: !input.solo })}
          data-testid={tid("solo")}
          style={{
            display: "block", width: "100%", padding: "3px 0",
            fontFamily: "monospace", fontSize: 8, fontWeight: "bold", letterSpacing: "0.1em",
            border: bdr(input.solo ? T.yellow : "#2a2a2a"),
            background: input.solo ? T.yellow : "transparent",
            color: input.solo ? "#000" : "#484848",
            cursor: "pointer",
          }}
        >
          SOLO
        </button>
      </div>

      {/* LINK */}
      <div style={{ padding: "0 5px 6px", flexShrink: 0 }}>
        <button
          onClick={handleLink}
          data-testid={tid("link")}
          style={{
            display: "block", width: "100%", padding: "3px 0",
            fontFamily: "monospace", fontSize: 8,
            border: bdr(partner ? T.violet : "#262626"),
            background: partner ? `${T.violet}12` : "transparent",
            color: partner ? T.violet : "#303030",
            cursor: "pointer",
          }}
        >
          🔗
        </button>
      </div>
    </div>
  );
};

export default InputStrip;
