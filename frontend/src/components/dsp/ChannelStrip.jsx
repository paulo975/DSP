import React from "react";
import { useDsp } from "@/lib/dspStore";
import { formatDelay } from "@/lib/dspDefaults";
import Knob from "./Knob";
import Meter from "./Meter";

const SectionLabel = ({ children }) => (
  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500 text-center py-1 border-t border-neutral-800 mt-1">
    {children}
  </div>
);

const SmallBtn = ({ active, danger, solo, onClick, children, testId, title }) => (
  <button
    onClick={onClick}
    title={title}
    data-testid={testId}
    className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 border transition-colors"
    style={{
      background: active
        ? danger
          ? "#FF3B30"
          : solo
            ? "#FFD60A"
            : "#FF6B00"
        : "transparent",
      color: active ? (solo ? "#000" : "#000") : "#888",
      borderColor: active ? (danger ? "#FF3B30" : solo ? "#FFD60A" : "#FF6B00") : "#2A2A2A",
    }}
  >
    {children}
  </button>
);

const ChannelStrip = ({ output, onOpenEq, onOpenComp }) => {
  const { updateOutput, updateOutputDeep, resetChannel } = useDsp();

  const setField = (patch) => updateOutput(output.id, patch);
  const setDeep = (path, value) => {
    updateOutputDeep(output.id, (o) => {
      const next = JSON.parse(JSON.stringify(o));
      let cur = next;
      const segs = path.split(".");
      for (let i = 0; i < segs.length - 1; i++) cur = cur[segs[i]];
      cur[segs[segs.length - 1]] = value;
      return next;
    });
  };

  const isVirtual = output.kind === "out_virt";
  const tid = (s) => `out-${output.kind}-${output.index}-${s}`;

  return (
    <div
      className="flex flex-col w-32 shrink-0 border-r border-neutral-800 bg-[#0F0F0F]"
      data-testid={`channel-strip-${output.id}`}
    >
      {/* Header */}
      <div
        className="px-2 py-1.5 border-b border-neutral-800 flex items-center justify-between"
        style={{ background: isVirtual ? "#1a1208" : "#141414" }}
      >
        <input
          value={output.name}
          onChange={(e) => setField({ name: e.target.value })}
          className="bg-transparent text-xs font-mono font-bold text-white w-full outline-none focus:bg-black/40 px-1"
          data-testid={tid("name")}
        />
      </div>
      <div className="text-[8px] font-mono uppercase tracking-[0.18em] text-center py-0.5"
        style={{ color: isVirtual ? "#FF8533" : "#666" }}>
        {isVirtual ? "DANTE VIRT" : "PHYSICAL"}
      </div>

      {/* Mute / Solo */}
      <div className="flex gap-1 px-2 pt-2">
        <SmallBtn active={output.mute} danger onClick={() => setField({ mute: !output.mute })} testId={tid("mute")}>
          M
        </SmallBtn>
        <SmallBtn active={output.solo} solo onClick={() => setField({ solo: !output.solo })} testId={tid("solo")}>
          S
        </SmallBtn>
        <button
          onClick={() => resetChannel(output.id)}
          title="Reset channel"
          data-testid={tid("reset")}
          className="ml-auto text-[10px] font-mono text-neutral-500 hover:text-white"
        >
          ↺
        </button>
      </div>

      {/* Crossover */}
      <SectionLabel>Crossover</SectionLabel>
      <div className="flex justify-around py-1">
        <Knob
          label="HPF"
          value={output.crossover.hpf.freq}
          min={20}
          max={2000}
          step={1}
          unit="Hz"
          format={(v) => Math.round(v)}
          onChange={(v) => setDeep("crossover.hpf.freq", v)}
          testId={tid("hpf-freq")}
          accent={output.crossover.hpf.enabled ? "#FF6B00" : "#555"}
          size={42}
        />
        <Knob
          label="LPF"
          value={output.crossover.lpf.freq}
          min={500}
          max={20000}
          step={10}
          unit="Hz"
          format={(v) => Math.round(v)}
          onChange={(v) => setDeep("crossover.lpf.freq", v)}
          testId={tid("lpf-freq")}
          accent={output.crossover.lpf.enabled ? "#FF6B00" : "#555"}
          size={42}
        />
      </div>
      <div className="flex justify-around px-2 pb-1 gap-1">
        <SmallBtn
          active={output.crossover.hpf.enabled}
          onClick={() => setDeep("crossover.hpf.enabled", !output.crossover.hpf.enabled)}
          testId={tid("hpf-en")}
        >
          HPF
        </SmallBtn>
        <SmallBtn
          active={output.crossover.lpf.enabled}
          onClick={() => setDeep("crossover.lpf.enabled", !output.crossover.lpf.enabled)}
          testId={tid("lpf-en")}
        >
          LPF
        </SmallBtn>
      </div>

      {/* EQ button */}
      <SectionLabel>EQ</SectionLabel>
      <button
        onClick={() => onOpenEq(output.id)}
        data-testid={tid("open-eq")}
        className="mx-2 my-1 px-2 py-1 border border-neutral-700 text-[10px] font-mono uppercase tracking-[0.15em] text-neutral-300 hover:border-[#FF6B00] hover:text-white"
      >
        Edit · 5 bands
      </button>

      {/* Compressor button */}
      <SectionLabel>Dyn</SectionLabel>
      <button
        onClick={() => onOpenComp(output.id)}
        data-testid={tid("open-comp")}
        className="mx-2 my-1 px-2 py-1 border border-neutral-700 text-[10px] font-mono uppercase tracking-[0.15em] text-neutral-300 hover:border-[#FF6B00] hover:text-white"
      >
        {output.comp.enabled ? "COMP ON" : "COMP"}
        {output.limiter.enabled ? " · LIM" : ""}
      </button>

      {/* Delay (the CRITICAL feature) */}
      <SectionLabel>Delay</SectionLabel>
      <div className="px-2 pb-1">
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.1"
            value={output.delay.value}
            onChange={(e) => setDeep("delay.value", Number(e.target.value))}
            className="w-full bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-1 py-0.5 outline-none focus:border-[#FF6B00]"
            data-testid={tid("delay-value")}
          />
          <select
            value={output.delay.unit}
            onChange={(e) => setDeep("delay.unit", e.target.value)}
            className="bg-black border border-neutral-800 text-[10px] font-mono text-white px-1 py-0.5 outline-none focus:border-[#FF6B00]"
            data-testid={tid("delay-unit")}
          >
            <option value="ms">ms</option>
            <option value="mm">mm</option>
            <option value="inch">in</option>
          </select>
        </div>
        <div className="text-[9px] font-mono text-neutral-500 text-right mt-0.5" data-testid={tid("delay-ms")}>
          ≈ {formatDelay(output.delay)}
        </div>
      </div>

      {/* Pan */}
      <SectionLabel>Pan</SectionLabel>
      <div className="px-2 py-1">
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={output.pan}
          onChange={(e) => setField({ pan: Number(e.target.value) })}
          className="w-full accent-[#FF6B00]"
          data-testid={tid("pan")}
        />
        <div className="flex justify-between text-[9px] font-mono text-neutral-500">
          <span>L</span>
          <span className="text-white">{output.pan === 0 ? "C" : output.pan > 0 ? `R${output.pan}` : `L${Math.abs(output.pan)}`}</span>
          <span>R</span>
        </div>
      </div>

      {/* Fader + Meter */}
      <SectionLabel>Level</SectionLabel>
      <div className="flex justify-center items-end gap-2 px-2 pb-2 grow">
        <div className="flex flex-col items-center grow">
          <input
            type="range"
            min={-60}
            max={12}
            step={0.1}
            value={output.gain}
            onChange={(e) => setField({ gain: Number(e.target.value) })}
            className="appearance-none bg-transparent accent-[#FF6B00] cursor-pointer"
            style={{
              writingMode: "vertical-lr",
              direction: "rtl",
              WebkitAppearance: "slider-vertical",
              height: 120,
              width: 18,
            }}
            data-testid={`out-${output.kind}-${output.index}-fader`}
          />
          <span className="text-[10px] font-mono font-bold text-white mt-1" data-testid={`out-${output.kind}-${output.index}-gain-value`}>
            {output.gain.toFixed(1)} dB
          </span>
        </div>
        <Meter outputId={output.id} testId={`out-${output.kind}-${output.index}-meter`} />
      </div>
    </div>
  );
};

export default ChannelStrip;
