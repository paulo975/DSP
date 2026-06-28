/**
 * ChannelStrip — output channel.
 * Layout: scribble strip → nome → barra de atalhos → meter+fader → MUTE → SOLO
 * Barra de atalhos: HPF · LPF · EQ · COMP · DLY · LINK · RESET
 */
import React from "react";
import { useDsp } from "@/lib/dspStore";
import { formatDelay } from "@/lib/dspDefaults";
import { getCategory } from "@/lib/channelCategories";
import Meter from "./Meter";

const T = {
  surface:   "#252525",
  surface2:  "#2a2a2a",
  border:    "#383838",
  text:      "#e8e8e8",
  textDim:   "#888",
  textMuted: "#555",
  orange:    "#FF6B00",
  amber:     "#FF8533",
  blue:      "#00B7FF",
  green:     "#00FF41",
  yellow:    "#FFD60A",
  red:       "#FF3B30",
  violet:    "#A855F7",
  cyan:      "#22D3EE",
};

// Botão de atalho de função
const FnBtn = ({ label, active, color, onClick, title }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      flex: 1,
      padding: "3px 0",
      fontFamily: "monospace",
      fontSize: 7,
      fontWeight: "bold",
      letterSpacing: "0.05em",
      border: `0.5px solid ${active ? color : "#333"}`,
      background: active ? `${color}22` : "transparent",
      color: active ? color : "#444",
      cursor: "pointer",
      transition: "all 100ms",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </button>
);

const ChannelStrip = ({ output, onOpenEq, onOpenComp, selected, onSelect }) => {
  const { state, updateOutput, updateOutputDeep, resetChannel,
          linkChannels, unlinkChannels, readOnly } = useDsp();

  const set  = (patch) => updateOutput(output.id, patch);
  const deep = (path, val) => updateOutputDeep(output.id, (o) => {
    const n = JSON.parse(JSON.stringify(o));
    const segs = path.split(".");
    let cur = n;
    for (let i = 0; i < segs.length - 1; i++) cur = cur[segs[i]];
    cur[segs[segs.length - 1]] = val;
    return n;
  });

  const partner = output.linkedTo
    ? state.outputs.find((o) => o.id === output.linkedTo)
    : null;

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
  const accent  = cat.id !== "none" ? cat.color : isVirt ? T.amber : T.orange;

  const eqActive  = output.eq?.enabled && output.eq?.bands?.some((b) => b.gain !== 0);
  const dynActive = output.comp?.enabled || output.limiter?.enabled;
  const dlyActive = (output.delay?.value || 0) > 0;
  const hpfOn    = output.crossover?.hpf?.enabled;
  const lpfOn    = output.crossover?.lpf?.enabled;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        width: 80, flexShrink: 0,
        background: selected ? "#0e1c2a" : T.surface,
        borderRight: `0.5px solid ${selected ? T.blue + "66" : T.border}`,
        boxShadow: selected ? `inset 0 0 0 1px ${T.blue}22` : "none",
        transition: "background 120ms",
      }}
      data-testid={`channel-strip-${output.id}`}
    >
      {/* ── Scribble strip cor ── */}
      <div style={{ height: 4, flexShrink: 0, background: accent }} />

      {/* ── Header: número + nome editável ── */}
      <div
        onClick={() => onSelect?.(output.id)}
        style={{
          padding: "4px 6px 3px",
          borderBottom: `0.5px solid ${T.border}`,
          background: selected ? "#081420" : "#202020",
          cursor: "pointer",
        }}
        data-testid={tid("header")}
      >
        <div style={{ fontFamily: "monospace", fontSize: 7, fontWeight: "bold", color: accent, letterSpacing: "0.1em", marginBottom: 2 }}>
          {isVirt ? "DAN" : "PHY"} {output.index + 1}
        </div>
        <input
          value={output.name}
          onChange={(e) => set({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          maxLength={10}
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none",
            fontFamily: "monospace", fontSize: 11, fontWeight: "bold",
            color: selected ? T.blue : T.text,
            padding: 0, cursor: "text",
          }}
          data-testid={tid("name")}
          title="Clica para editar o nome do canal"
        />
      </div>

      {/* ── Barra de atalhos de função ── */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${T.border}`, flexShrink: 0 }}>
        <FnBtn label="HPF" active={hpfOn} color={T.cyan}
          title={`HPF ${output.crossover?.hpf?.freq || 80} Hz`}
          onClick={() => deep("crossover.hpf.enabled", !hpfOn)} />
        <FnBtn label="LPF" active={lpfOn} color={T.cyan}
          title={`LPF ${output.crossover?.lpf?.freq || 16000} Hz`}
          onClick={() => deep("crossover.lpf.enabled", !lpfOn)} />
        <FnBtn label="EQ" active={eqActive} color={T.orange}
          title="Abrir editor EQ paramétrico"
          onClick={() => onOpenEq(output.id)} />
        <FnBtn label="DYN" active={dynActive} color={T.violet}
          title="Abrir Compressor/Limiter"
          onClick={() => onOpenComp(output.id)} />
        <FnBtn label="DLY" active={dlyActive} color={T.blue}
          title={`Delay: ${formatDelay(output.delay)}`}
          onClick={() => onSelect?.(output.id)} />
      </div>

      {/* ── Meter + Fader ── */}
      <div style={{ display: "flex", gap: 4, padding: "5px 5px 2px", flex: 1 }}>
        <Meter
          outputId={output.id} source="out" orient="v"
          height={170} width={10} segments={24}
          testId={tid("meter")}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          {/* dB readout */}
          <div
            style={{
              fontFamily: "monospace", fontSize: 10, fontWeight: "bold",
              color: output.mute ? T.red : T.text,
              textAlign: "center", marginBottom: 3, width: "100%",
            }}
            data-testid={tid("gain-value")}
          >
            {output.mute ? "M" : output.gain.toFixed(1)}
          </div>
          {/* Fader vertical */}
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
      <div style={{ padding: "3px 5px 2px", flexShrink: 0 }}>
        <button
          onClick={() => set({ mute: !output.mute })}
          data-testid={tid("mute")}
          style={{
            display: "block", width: "100%", padding: "5px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold", letterSpacing: "0.12em",
            border: `0.5px solid ${T.red}`,
            background: output.mute ? T.red : "transparent",
            color: output.mute ? "#000" : T.red,
            cursor: "pointer",
            boxShadow: output.mute ? `0 0 8px ${T.red}55` : "none",
          }}
        >MUTE</button>
      </div>

      {/* ── SOLO ── */}
      <div style={{ padding: "0 5px 3px", flexShrink: 0 }}>
        <button
          onClick={() => set({ solo: !output.solo })}
          data-testid={tid("solo")}
          style={{
            display: "block", width: "100%", padding: "3px 0",
            fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
            border: `0.5px solid ${output.solo ? T.yellow : "#333"}`,
            background: output.solo ? T.yellow : "transparent",
            color: output.solo ? "#000" : "#555",
            cursor: "pointer",
          }}
        >SOLO</button>
      </div>

      {/* ── LINK + RESET ── */}
      <div style={{ padding: "0 5px 5px", display: "flex", gap: 3, flexShrink: 0 }}>
        <button onClick={handleLink} data-testid={tid("link")}
          title={partner ? `Linked com ${partner.name}` : "Stereo-link com canal adjacente"}
          style={{
            flex: 1, padding: "3px 0",
            fontFamily: "monospace", fontSize: 8,
            border: `0.5px solid ${partner ? T.violet : "#2a2a2a"}`,
            background: partner ? `${T.violet}15` : "transparent",
            color: partner ? T.violet : "#333", cursor: "pointer",
          }}>🔗</button>
        <button onClick={() => resetChannel(output.id)} data-testid={tid("reset")}
          title="Repor canal para os valores por defeito"
          style={{
            padding: "3px 5px",
            fontFamily: "monospace", fontSize: 9,
            border: `0.5px solid #2a2a2a`, background: "transparent",
            color: "#333", cursor: "pointer",
          }}>↺</button>
      </div>
    </div>
  );
};

export default ChannelStrip;
