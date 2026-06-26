import React from "react";
import { useDsp } from "@/lib/dspStore";
import { formatDelay } from "@/lib/dspDefaults";
import Knob from "./Knob";
import Meter from "./Meter";

const Section = ({ title, children, accent = "#666" }) => (
  <div className="border-t border-neutral-800">
    <div
      className="text-[9px] font-mono uppercase tracking-[0.2em] py-1 px-2 flex items-center justify-between"
      style={{ color: accent, background: "#0c0c0c" }}
    >
      <span>{title}</span>
    </div>
    <div className="px-2 py-1.5">{children}</div>
  </div>
);

const Btn = ({ active, color = "#FF6B00", textActive = "#000", onClick, children, testId, title, full }) => (
  <button
    onClick={onClick}
    title={title}
    data-testid={testId}
    className={`text-[10px] font-mono font-bold uppercase tracking-[0.15em] py-1 border transition-all ${full ? "w-full" : "px-2"} hover:brightness-125`}
    style={{
      background: active ? color : "transparent",
      color: active ? textActive : "#888",
      borderColor: active ? color : "#2A2A2A",
    }}
  >
    {children}
  </button>
);

const ChannelStrip = ({ output, onOpenEq, onOpenComp, selected, onSelect }) => {
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
  const accentTone = isVirtual ? "#FF8533" : "#FF6B00";

  return (
    <div
      className="flex flex-col w-36 shrink-0 border-r bg-[#0F0F0F] transition-colors"
      style={{ borderRightColor: selected ? "#00B7FF" : "#262626", boxShadow: selected ? "inset 0 2px 0 0 #00B7FF" : "none" }}
      data-testid={`channel-strip-${output.id}`}
    >
      {/* ----- Header (clickable to select) ----- */}
      <div
        onClick={() => onSelect?.(output.id)}
        className="px-2 pt-1.5 pb-2 border-b-2 cursor-pointer hover:bg-black/40"
        style={{
          background: selected ? "#001a2a" : isVirtual ? "#1a1208" : "#141414",
          borderBottomColor: selected ? "#00B7FF" : accentTone,
        }}
      >
        {/* Description / purpose — free-text annotation for the channel role */}
        <input
          value={output.description || ""}
          onChange={(e) => setField({ description: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Purpose…"
          maxLength={32}
          className="w-full bg-black/60 border border-neutral-800 text-[10px] font-mono text-[#00B7FF] placeholder:text-neutral-700 px-1 py-0.5 outline-none focus:border-[#00B7FF] mb-1"
          data-testid={tid("description")}
          title="Describe what this channel is used for (e.g. 'Lead Vocal', 'Sub L')"
        />
        <div className="flex items-center justify-between">
          <div className="flex flex-col grow min-w-0">
            <span
              className="text-[8px] font-mono uppercase tracking-[0.2em] truncate"
              style={{ color: selected ? "#00B7FF" : accentTone }}
            >
              {selected ? "▸ SELECTED" : isVirtual ? "DANTE VIRT" : "PHYSICAL"}
            </span>
            <input
              value={output.name}
              onChange={(e) => setField({ name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent text-sm font-mono font-bold text-white w-full outline-none focus:bg-black/40 px-0.5 -mx-0.5 rounded-sm"
              data-testid={tid("name")}
            />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); resetChannel(output.id); }}
            title="Reset channel"
            data-testid={tid("reset")}
            className="text-xs font-mono text-neutral-500 hover:text-white shrink-0 px-1.5"
          >
            ↺
          </button>
        </div>
      </div>

      {/* ----- Input meter (pre-DSP, post-routing) ----- */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-black/40 border-b border-neutral-800">
        <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-neutral-500 w-4">IN</span>
        <Meter
          outputId={output.id}
          source="in"
          orient="h"
          width={104}
          height={8}
          segments={20}
          testId={tid("input-meter")}
        />
      </div>

      {/* ----- Mute / Solo ----- */}
      <div className="grid grid-cols-2 gap-1 px-2 pt-2">
        <Btn active={output.mute} color="#FF3B30" onClick={() => setField({ mute: !output.mute })} testId={tid("mute")} full>
          MUTE
        </Btn>
        <Btn active={output.solo} color="#FFD60A" onClick={() => setField({ solo: !output.solo })} testId={tid("solo")} full>
          SOLO
        </Btn>
      </div>

      {/* ----- Test signal (pink/white/sweep) per-channel toggle ----- */}
      <div className="px-2 pt-1">
        <Btn
          active={output.pinkNoise?.enabled}
          color="#FF7AC6"
          onClick={() => setDeep("pinkNoise.enabled", !output.pinkNoise?.enabled)}
          testId={tid("pink-noise")}
          full
        >
          {output.pinkNoise?.enabled
            ? `▮▮ ${(output.pinkNoise?.type || "pink").toUpperCase()} ${output.pinkNoise.level.toFixed(0)}`
            : `▮ ${(output.pinkNoise?.type || "pink").toUpperCase()} OFF`}
        </Btn>
      </div>

      {/* ----- Crossover ----- */}
      <Section title="Crossover" accent={accentTone}>
        <div className="flex justify-around mb-2">
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
            size={44}
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
            size={44}
          />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Btn
            active={output.crossover.hpf.enabled}
            onClick={() => setDeep("crossover.hpf.enabled", !output.crossover.hpf.enabled)}
            testId={tid("hpf-en")}
            full
          >
            HPF
          </Btn>
          <Btn
            active={output.crossover.lpf.enabled}
            onClick={() => setDeep("crossover.lpf.enabled", !output.crossover.lpf.enabled)}
            testId={tid("lpf-en")}
            full
          >
            LPF
          </Btn>
        </div>
      </Section>

      {/* ----- EQ / Dynamics ----- */}
      <Section title="Processing" accent={accentTone}>
        <button
          onClick={() => onOpenEq(output.id)}
          data-testid={tid("open-eq")}
          className="w-full px-2 py-1.5 border text-[10px] font-mono font-bold uppercase tracking-[0.15em] mb-1 transition-colors"
          style={{
            borderColor: output.eq.enabled ? "#FF6B00" : "#2A2A2A",
            color: output.eq.enabled ? "#FF6B00" : "#888",
          }}
        >
          EQ · 5 BANDS
        </button>
        <button
          onClick={() => onOpenComp(output.id)}
          data-testid={tid("open-comp")}
          className="w-full px-2 py-1.5 border text-[10px] font-mono font-bold uppercase tracking-[0.15em] transition-colors"
          style={{
            borderColor: output.comp.enabled || output.limiter.enabled ? "#FF6B00" : "#2A2A2A",
            color: output.comp.enabled || output.limiter.enabled ? "#FF6B00" : "#888",
          }}
        >
          {output.comp.enabled && output.limiter.enabled
            ? "COMP · LIM"
            : output.comp.enabled
              ? "COMP ON"
              : output.limiter.enabled
                ? "LIM ON"
                : "DYNAMICS"}
        </button>
      </Section>

      {/* ----- Delay (the CRITICAL feature) ----- */}
      <Section title="Delay" accent={accentTone}>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.1"
            value={output.delay.value}
            onChange={(e) => setDeep("delay.value", Number(e.target.value))}
            className="grow min-w-0 bg-black border border-neutral-800 text-sm font-mono font-bold text-white px-1.5 py-1 outline-none focus:border-[#FF6B00]"
            data-testid={tid("delay-value")}
          />
          <select
            value={output.delay.unit}
            onChange={(e) => setDeep("delay.unit", e.target.value)}
            className="bg-black border border-neutral-800 text-[10px] font-mono text-white px-1 py-1 outline-none focus:border-[#FF6B00]"
            data-testid={tid("delay-unit")}
          >
            <option value="ms">ms</option>
            <option value="mm">mm</option>
            <option value="inch">in</option>
          </select>
        </div>
        <div className="text-[10px] font-mono text-neutral-500 text-right mt-1" data-testid={tid("delay-ms")}>
          ≈ {formatDelay(output.delay)}
        </div>
      </Section>

      {/* ----- Pan (analog-style L/R balance meter) ----- */}
      <Section title="Pan" accent={accentTone}>
        {(() => {
          // Equal-power pan visual — same math the audio engine uses.
          const pNorm = (output.pan + 100) / 200; // 0..1
          const angle = pNorm * (Math.PI / 2);
          const lGain = Math.cos(angle);
          const rGain = Math.sin(angle);
          const lPct = lGain * 50; // 0..50% (half-width)
          const rPct = rGain * 50;
          return (
            <div
              className="relative h-6 bg-black border border-neutral-800 mb-1 overflow-hidden cursor-pointer select-none"
              onDoubleClick={() => setField({ pan: 0 })}
              title="Double-click to recenter"
              data-testid={tid("pan-visual")}
            >
              {/* L gain bar (grows leftward from center) */}
              <div
                className="absolute top-0 bottom-0 transition-[width] duration-75"
                style={{
                  right: "50%",
                  width: `${lPct}%`,
                  background: `linear-gradient(to left, ${output.pan <= 0 ? "#FF6B00" : "#6B3000"}, ${output.pan <= 0 ? "#7a3300" : "#2a1300"})`,
                  opacity: 0.85,
                }}
              />
              {/* R gain bar (grows rightward from center) */}
              <div
                className="absolute top-0 bottom-0 transition-[width] duration-75"
                style={{
                  left: "50%",
                  width: `${rPct}%`,
                  background: `linear-gradient(to right, ${output.pan >= 0 ? "#FF6B00" : "#6B3000"}, ${output.pan >= 0 ? "#7a3300" : "#2a1300"})`,
                  opacity: 0.85,
                }}
              />
              {/* Center tick */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/40" />
              {/* Position cursor (head) */}
              <div
                className="absolute top-0 bottom-0 w-[2px] transition-[left] duration-75"
                style={{
                  left: `${pNorm * 100}%`,
                  background: "#FFFFFF",
                  boxShadow: "0 0 6px #FFFFFF, 0 0 14px #FF6B00",
                  transform: "translateX(-50%)",
                }}
              />
              {/* Side labels */}
              <span className="absolute top-0 left-1 text-[8px] font-mono font-bold text-neutral-600 leading-none pt-[2px] pointer-events-none">L</span>
              <span className="absolute top-0 right-1 text-[8px] font-mono font-bold text-neutral-600 leading-none pt-[2px] pointer-events-none">R</span>
            </div>
          );
        })()}
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={output.pan}
          onDoubleClick={() => setField({ pan: 0 })}
          onChange={(e) => setField({ pan: Number(e.target.value) })}
          className="w-full accent-[#FF6B00]"
          data-testid={tid("pan")}
          title="Double-click slider or bar to recenter"
        />
        <div className="flex justify-between text-[9px] font-mono mt-0.5">
          <span className="text-neutral-600">L</span>
          <span className="text-white font-bold" data-testid={tid("pan-value")}>
            {output.pan === 0 ? "C" : output.pan > 0 ? `R${output.pan}` : `L${Math.abs(output.pan)}`}
          </span>
          <span className="text-neutral-600">R</span>
        </div>
      </Section>

      {/* ----- Fader + Output Meter ----- */}
      <div className="border-t border-neutral-800 px-2 pt-1.5 pb-2 grow flex flex-col">
        <div className="text-[9px] font-mono uppercase tracking-[0.2em] py-1 flex items-center justify-between" style={{ color: accentTone }}>
          <span>OUT</span>
          <span className="text-white font-bold" data-testid={tid("gain-value")}>
            {output.gain.toFixed(1)} dB
          </span>
        </div>
        <div className="flex justify-center items-stretch gap-2 grow">
          <input
            type="range"
            min={-60}
            max={12}
            step={0.1}
            value={output.gain}
            onChange={(e) => setField({ gain: Number(e.target.value) })}
            className="appearance-none bg-transparent accent-[#FF6B00] cursor-pointer vertical-fader"
            style={{
              writingMode: "vertical-lr",
              direction: "rtl",
              height: 140,
              width: 22,
            }}
            data-testid={tid("fader")}
          />
          <Meter
            outputId={output.id}
            source="out"
            orient="v"
            height={140}
            width={16}
            segments={20}
            testId={tid("meter")}
          />
        </div>
      </div>
    </div>
  );
};

export default ChannelStrip;
