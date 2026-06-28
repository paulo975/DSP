/**
 * ChannelStrip — output channel, Waves eMotion LV1 style.
 * Fundo #1A1A1A, bordas 0.5px #282828, sem preto puro.
 */
import React from "react";
import { useDsp } from "@/lib/dspStore";
import { formatDelay } from "@/lib/dspDefaults";
import { getCategory } from "@/lib/channelCategories";
import Meter from "./Meter";

const T = {
  bg:       "#141414",
  surface:  "#252525",
  border:   "#383838",
  text:     "#E8E8E8",
  textDim:  "#888888",
  textMuted:"#444444",
  orange:   "#FF6B00",
  blue:     "#00B7FF",
  green:    "#00FF41",
  yellow:   "#FFD60A",
  red:      "#FF3B30",
  violet:   "#A855F7",
  amber:    "#FF8533",
};

const ChannelStrip = ({ output, onOpenEq, onOpenComp, selected, onSelect }) => {
  const { state, updateOutput, updateOutputDeep, resetChannel,
          linkChannels, unlinkChannels, readOnly } = useDsp();

  const set   = (patch) => updateOutput(output.id, patch);
  const deep  = (path, val) => updateOutputDeep(output.id, (o) => {
    const n = JSON.parse(JSON.stringify(o));
    const segs = path.split(".");
    let cur = n;
    for (let i = 0; i < segs.length - 1; i++) cur = cur[segs[i]];
    cur[segs[segs.length - 1]] = val;
    return n;
  });

  const partner = output.linkedTo ? state.outputs.find((o) => o.id === output.linkedTo) : null;
  const findCand = () => {
    const same = state.outputs.filter((c) => c.kind === output.kind);
    const i = same.findIndex((c) => c.id === output.id);
    return same[i + 1] || same[i - 1] || null;
  };
  const handleLink = () => {
    if (readOnly) return;
    if (output.linkedTo) { unlinkChannels(output.id); return; }
    const cand = findCand();
    if (cand) linkChannels(output.id, cand.id);
  };

  const isVirt  = output.kind === "out_virt";
  const tid     = (s) => `out-${output.kind}-${output.index}-${s}`;
  const cat     = getCategory(output.category);
  const accent  = isVirt ? T.amber : T.orange;
  const chAccent = cat.id !== "none" ? cat.color : accent;

  const eqActive  = output.eq?.enabled && output.eq?.bands?.some((b) => b.gain !== 0);
  const dynActive = output.comp?.enabled || output.limiter?.enabled;
  const dlyActive = (output.delay?.value || 0) > 0;
  const hpfOn     = output.crossover?.hpf?.enabled;
  const lpfOn     = output.crossover?.lpf?.enabled;

  const bdr = (color, alpha = 1) => `0.5px solid ${color}${alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, "0") : ""}`;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        width: 72, flexShrink: 0,
        background: selected ? "#0C1620" : T.surface,
        borderRight: `0.5px solid ${selected ? T.blue + "55" : T.border}`,
        boxShadow: selected ? `inset 0 0 0 1px ${T.blue}22` : "none",
        transition: "background 120ms",
      }}
      data-testid={`channel-strip-${output.id}`}
    >
      {/* ── Scribble strip de cor ── */}
      <div style={{ height: 3, flexShrink: 0, background: chAccent }} />

      {/* ── Header ── */}
      <div
        onClick={() => onSelect?.(output.id)}
        style={{
          padding: "5px 6px 4px",
          borderBottom: `0.5px solid ${selected ? T.blue + "55" : T.border}`,
          background: selected ? "#081018" : "#141414",
          cursor: "pointer",
        }}
        data-testid={tid("header")}
      >
        <div style={{ fontFamily: "monospace", fontSize: 7, fontWeight: "bold", color: chAccent, letterSpacing: "0.12em", marginBottom: 2 }}>
          {isVirt ? "DAN" : "PHY"} {output.index + 1}
        </div>
        <input
          value={output.name}
          onChange={(e) => set({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          maxLength={8}
          style={{
            background: "transparent", border: "none", outline: "none",
            fontFamily: "monospace", fontSize: 11, fontWeight: "bold",
            color: selected ? T.blue : T.text,
            width: "100%", letterSpacing: "-0.01em",
          }}
          data-testid={tid("name")}
        />
      </div>

      {/* ── Meter + Fader ── */}
      <div style={{ display: "flex", gap: 4, padding: "6px 6px 2px", flex: 1 }}>
        {/* Meter vertical */}
        <Meter
          outputId={output.id} source="out" orient="v"
          height={190} width={10} segments={26}
          testId={tid("meter")}
        />

        {/* Fader */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          {/* dB readout */}
          <div
            style={{
              fontFamily: "monospace", fontSize: 10, fontWeight: "bold",
              color: output.mute ? T.red : T.text,
              textAlign: "center", marginBottom: 4, letterSpacing: "-0.01em",
              width: "100%",
            }}
            data-testid={tid("gain-value")}
          >
            {output.mute ? "M" : output.gain.toFixed(1)}
          </div>

          {/* Slider vertical */}
          <div style={{ flex: 1, display: "flex", alignItems: "stretch", justifyContent: "center", width: "100%" }}>
            <input
              type="range" min={-60} max={12} step={0.1}
              value={output.gain}
              onChange={(e) => set({ gain: Number(e.target.value) })}
              className="vertical-fader"
              style={{
                writingMode: "vertical-lr", direction: "rtl",
                height: "100%", minHeight: 120, width: 22,
                background: "transparent", cursor: "pointer",
                opacity: output.mute ? 0.35 : 1,
              }}
              data-testid={tid("fader")}
            />
          </div>
        </div>
      </div>

      {/* ── MUTE ── */}
      <div style={{ padding: "4px 6px 2px" }}>
        <button
          onClick={() => set({ mute: !output.mute })}
          data-testid={tid("mute")}
          style={{
            display: "block", width: "100%", padding: "5px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.12em",
            border: bdr(T.red),
            background: output.mute ? T.red : "transparent",
            color: output.mute ? "#000" : T.red,
            cursor: "pointer",
            boxShadow: output.mute ? `0 0 8px ${T.red}55` : "none",
          }}
        >
          MUTE
        </button>
      </div>

      {/* ── SOLO ── */}
      <div style={{ padding: "2px 6px 4px" }}>
        <button
          onClick={() => set({ solo: !output.solo })}
          data-testid={tid("solo")}
          style={{
            display: "block", width: "100%", padding: "4px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.12em",
            border: bdr(output.solo ? T.yellow : "#303030"),
            background: output.solo ? T.yellow : "transparent",
            color: output.solo ? "#000" : "#555",
            cursor: "pointer",
          }}
        >
          SOLO
        </button>
      </div>

      {/* ── Badges EQ / DYN / DLY ── */}
      <div style={{ padding: "0 6px 4px", display: "flex", flexWrap: "wrap", gap: 2 }}>
        <button onClick={() => onOpenEq(output.id)} data-testid={tid("open-eq")}
          style={{
            fontFamily: "monospace", fontSize: 7, fontWeight: "bold",
            padding: "2px 3px", border: bdr(eqActive ? T.orange : "#2a2a2a"),
            background: eqActive ? `${T.orange}15` : "transparent",
            color: eqActive ? T.orange : "#444", cursor: "pointer",
          }}>EQ</button>
        <button onClick={() => onOpenComp(output.id)} data-testid={tid("open-comp")}
          style={{
            fontFamily: "monospace", fontSize: 7, fontWeight: "bold",
            padding: "2px 3px", border: bdr(dynActive ? T.orange : "#2a2a2a"),
            background: dynActive ? `${T.orange}15` : "transparent",
            color: dynActive ? T.orange : "#444", cursor: "pointer",
          }}>DYN</button>
        <div title={formatDelay(output.delay)}
          style={{
            fontFamily: "monospace", fontSize: 7,
            padding: "2px 3px", border: bdr(dlyActive ? T.blue : "#2a2a2a"),
            background: dlyActive ? `${T.blue}12` : "transparent",
            color: dlyActive ? T.blue : "#444",
          }}>DLY</div>
        {(hpfOn || lpfOn) && (
          <div style={{ fontFamily: "monospace", fontSize: 7, padding: "2px 3px", border: bdr(T.violet), background: `${T.violet}10`, color: T.violet }}>
            {hpfOn && lpfOn ? "XOV" : hpfOn ? "HPF" : "LPF"}
          </div>
        )}
      </div>

      {/* ── LINK + RESET ── */}
      <div style={{ padding: "0 6px 6px", display: "flex", gap: 3 }}>
        <button onClick={handleLink} data-testid={tid("link")}
          title={partner ? `Linked to ${partner.name} — click to unlink` : "Stereo-link with adjacent channel"}
          style={{
            flex: 1, padding: "3px 0",
            fontFamily: "monospace", fontSize: 8,
            border: bdr(partner ? T.violet : "#262626"),
            background: partner ? `${T.violet}12` : "transparent",
            color: partner ? T.violet : "#383838", cursor: "pointer",
          }}>🔗</button>
        <button onClick={() => resetChannel(output.id)} data-testid={tid("reset")}
          title="Reset channel"
          style={{
            padding: "3px 5px",
            fontFamily: "monospace", fontSize: 9,
            border: bdr("#262626"), background: "transparent",
            color: "#383838", cursor: "pointer",
          }}>↺</button>
      </div>
    </div>
  );
};

export default ChannelStrip;
