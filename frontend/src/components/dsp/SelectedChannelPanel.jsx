import React from "react";
import { useDsp } from "@/lib/dspStore";
import { formatDelay } from "@/lib/dspDefaults";
import { CHANNEL_CATEGORIES } from "@/lib/channelCategories";
import InlineEqGraph, { BAND_COLORS } from "./InlineEqGraph";
import CompCurve from "./CompCurve";
import GRMeter from "./GRMeter";
import Meter from "./Meter";

const Pill = ({ label, value, suffix, testId }) => (
  <div className="px-2 py-1 bg-black border border-neutral-800" data-testid={testId}>
    <div className="text-[8px] font-mono uppercase tracking-[0.18em] text-neutral-500">{label}</div>
    <div className="text-xs font-mono font-bold text-white">{value}{suffix ? <span className="text-neutral-500 ml-1">{suffix}</span> : null}</div>
  </div>
);

const SmallToggle = ({ label, active, color = "#FF6B00", textActive = "#000", onClick, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] px-2 py-1 border transition-colors"
    style={{
      background: active ? color : "transparent",
      color: active ? textActive : "#888",
      borderColor: active ? color : "#2A2A2A",
    }}
  >
    {label}
  </button>
);

const SelectedChannelPanel = ({ outputId, onOpenEq, onOpenComp, onClose }) => {
  const { state, updateOutput, updateOutputDeep, resetChannel } = useDsp();
  const out = state.outputs.find((o) => o.id === outputId);
  if (!out) {
    return (
      <div className="border-b-2 border-[#00B7FF] bg-[#0a0a0a] px-4 py-6 flex items-center justify-center text-neutral-500 text-xs font-mono uppercase tracking-[0.2em]">
        Click a channel name below to inspect / edit it here
      </div>
    );
  }

  const setField = (patch) => updateOutput(out.id, patch);
  const setDeep = (path, value) => {
    updateOutputDeep(out.id, (o) => {
      const next = JSON.parse(JSON.stringify(o));
      const segs = path.split(".");
      let cur = next;
      for (let i = 0; i < segs.length - 1; i++) cur = cur[segs[i]];
      cur[segs[segs.length - 1]] = value;
      return next;
    });
  };
  const setBand = (idx, patch) => {
    updateOutputDeep(out.id, (o) => {
      const next = JSON.parse(JSON.stringify(o));
      next.eq.bands[idx] = { ...next.eq.bands[idx], ...patch };
      return next;
    });
  };

  const isVirtual = out.kind === "out_virt";
  const accent = isVirtual ? "#FF8533" : "#00B7FF";

  return (
    <div
      className="border-b-2 bg-gradient-to-b from-[#0a0a0a] to-[#050505]"
      style={{ borderBottomColor: accent }}
      data-testid="selected-channel-panel"
    >
      {/* Top header strip */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-800 bg-black">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center font-mono font-bold text-sm" style={{ background: accent, color: "#000" }}>
            {out.kind === "out_phy" ? "P" : "V"}
          </div>
          <div className="grow">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: accent }}>
              {isVirtual ? "Dante Virtual Output" : "Physical Output"} · ch {out.index + 1}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={out.name}
                onChange={(e) => setField({ name: e.target.value })}
                className="bg-transparent text-xl font-bold text-white outline-none focus:bg-black/40 px-1 -mx-1 rounded-sm w-32"
                data-testid="sel-channel-name"
              />
              <input
                value={out.description || ""}
                onChange={(e) => setField({ description: e.target.value })}
                placeholder="Purpose / role…"
                maxLength={64}
                className="bg-black/60 border border-neutral-800 text-xs font-mono text-[#00B7FF] placeholder:text-neutral-600 px-2 py-1 outline-none focus:border-[#00B7FF] w-56"
                data-testid="sel-channel-description"
                title="Free-text description: what is this channel used for?"
              />
              {/* Category color picker — scribble strip colour for this channel */}
              <div className="flex items-center gap-1" data-testid="sel-category-group">
                <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500">Cat</span>
                {CHANNEL_CATEGORIES.map((c) => {
                  const active = (out.category || "none") === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setField({ category: c.id })}
                      data-testid={`sel-category-${c.id}`}
                      title={c.name}
                      className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
                      style={{
                        background: c.id === "none" ? "transparent" : c.color,
                        border: `1.5px solid ${active ? "#fff" : c.id === "none" ? "#444" : "transparent"}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 ml-4">
          <SmallToggle label="MUTE" active={out.mute} color="#FF3B30" onClick={() => setField({ mute: !out.mute })} testId="sel-mute" />
          <SmallToggle label="SOLO" active={out.solo} color="#FFD60A" onClick={() => setField({ solo: !out.solo })} testId="sel-solo" />
          <SmallToggle label="EQ ON" active={out.eq.enabled} onClick={() => setDeep("eq.enabled", !out.eq.enabled)} testId="sel-eq-enabled" />
          <SmallToggle label="COMP" active={out.comp.enabled} onClick={() => setDeep("comp.enabled", !out.comp.enabled)} testId="sel-comp-enabled" />
          <SmallToggle label="LIM" active={out.limiter.enabled} onClick={() => setDeep("limiter.enabled", !out.limiter.enabled)} testId="sel-lim-enabled" />
          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3 ml-1">
            <SmallToggle
              label={out.pinkNoise?.enabled ? "PINK ON" : "PINK"}
              active={out.pinkNoise?.enabled}
              color="#FF7AC6"
              onClick={() => setDeep("pinkNoise.enabled", !out.pinkNoise?.enabled)}
              testId="sel-pink-toggle"
            />
            <input
              type="range"
              min={-60}
              max={0}
              step={0.5}
              value={out.pinkNoise?.level ?? -20}
              onChange={(e) => setDeep("pinkNoise.level", Number(e.target.value))}
              className="w-24 accent-[#FF7AC6]"
              data-testid="sel-pink-level"
              title="Pink noise level"
            />
            <span className="text-[10px] font-mono font-bold w-12 text-right" style={{ color: out.pinkNoise?.enabled ? "#FF7AC6" : "#666" }} data-testid="sel-pink-level-value">
              {(out.pinkNoise?.level ?? -20).toFixed(1)} dB
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => resetChannel(out.id)}
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1 border border-neutral-700 text-neutral-400 hover:text-white hover:border-white"
            data-testid="sel-reset"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1 border border-neutral-700 text-neutral-400 hover:text-white"
            data-testid="sel-close"
          >
            Close ×
          </button>
        </div>
      </div>

      {/* Body: 3 columns */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 p-3">
        {/* Column 1: EQ + crossover row */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1 px-1">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
              Parametric EQ · drag points to tune
            </div>
            <button
              onClick={() => onOpenEq(out.id)}
              className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#FF6B00] hover:text-white"
              data-testid="sel-open-eq-modal"
            >
              Open Modal ↗
            </button>
          </div>
          <InlineEqGraph output={out} onChangeBand={setBand} width={640} height={240} />

          {/* Crossover row + delay/pan compact */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            <div className="border border-neutral-800 bg-[#0c0c0c] p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono uppercase tracking-[0.18em]" style={{ color: out.crossover.hpf.enabled ? "#FF3B30" : "#555" }}>HPF</span>
                <SmallToggle label={out.crossover.hpf.enabled ? "ON" : "OFF"} active={out.crossover.hpf.enabled}
                  color="#FF3B30" onClick={() => setDeep("crossover.hpf.enabled", !out.crossover.hpf.enabled)} testId="sel-hpf-toggle" />
              </div>
              <input type="number" min={20} max={2000} value={Math.round(out.crossover.hpf.freq)}
                onChange={(e) => setDeep("crossover.hpf.freq", Number(e.target.value))}
                className="w-full bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-1.5 py-1 outline-none focus:border-[#FF6B00]"
                data-testid="sel-hpf-freq" />
              <div className="text-[9px] text-neutral-500 mt-0.5 font-mono">Hz</div>
            </div>
            <div className="border border-neutral-800 bg-[#0c0c0c] p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono uppercase tracking-[0.18em]" style={{ color: out.crossover.lpf.enabled ? "#00B7FF" : "#555" }}>LPF</span>
                <SmallToggle label={out.crossover.lpf.enabled ? "ON" : "OFF"} active={out.crossover.lpf.enabled}
                  color="#00B7FF" onClick={() => setDeep("crossover.lpf.enabled", !out.crossover.lpf.enabled)} testId="sel-lpf-toggle" />
              </div>
              <input type="number" min={500} max={20000} value={Math.round(out.crossover.lpf.freq)}
                onChange={(e) => setDeep("crossover.lpf.freq", Number(e.target.value))}
                className="w-full bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-1.5 py-1 outline-none focus:border-[#FF6B00]"
                data-testid="sel-lpf-freq" />
              <div className="text-[9px] text-neutral-500 mt-0.5 font-mono">Hz</div>
            </div>
            <div className="border border-neutral-800 bg-[#0c0c0c] p-2">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#FF6B00] mb-1">Delay</div>
              <div className="flex gap-1">
                <input type="number" step="0.1" value={out.delay.value}
                  onChange={(e) => setDeep("delay.value", Number(e.target.value))}
                  className="grow min-w-0 bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-1.5 py-1 outline-none focus:border-[#FF6B00]"
                  data-testid="sel-delay-value" />
                <select value={out.delay.unit} onChange={(e) => setDeep("delay.unit", e.target.value)}
                  className="bg-black border border-neutral-800 text-[10px] font-mono text-white px-1 outline-none"
                  data-testid="sel-delay-unit">
                  <option value="ms">ms</option><option value="mm">mm</option><option value="inch">in</option>
                </select>
              </div>
              <div className="text-[9px] text-neutral-500 mt-0.5 font-mono text-right" data-testid="sel-delay-ms">
                ≈ {formatDelay(out.delay)}
              </div>
            </div>
            <div className="border border-neutral-800 bg-[#0c0c0c] p-2">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#FF6B00] mb-1">Pan L/R</div>
              <input type="range" min={-100} max={100} step={1} value={out.pan}
                onChange={(e) => setField({ pan: Number(e.target.value) })}
                className="w-full accent-[#FF6B00]" data-testid="sel-pan" />
              <div className="flex justify-between text-[9px] font-mono mt-0.5">
                <span className="text-neutral-600">L</span>
                <span className="text-white font-bold">{out.pan === 0 ? "C" : out.pan > 0 ? `R${out.pan}` : `L${Math.abs(out.pan)}`}</span>
                <span className="text-neutral-600">R</span>
              </div>
            </div>
          </div>

          {/* Band detail table */}
          <div className="grid grid-cols-5 gap-2 mt-2">
            {out.eq.bands.map((b, i) => (
              <div key={i} className="border bg-[#0c0c0c] p-2"
                style={{ borderColor: BAND_COLORS[i] + "40" }}
                data-testid={`sel-band-${i}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="w-5 h-5 flex items-center justify-center font-mono font-bold text-[10px]" style={{ background: BAND_COLORS[i], color: "#000" }}>
                    {i + 1}
                  </div>
                  <span className="text-[8px] font-mono uppercase text-neutral-500">{b.type === "peaking" ? "PEAK" : b.type === "lowshelf" ? "L.SH" : "H.SH"}</span>
                </div>
                <div className="text-[8px] font-mono uppercase tracking-[0.15em] text-neutral-500">Freq</div>
                <input type="number" value={Math.round(b.freq)} min={20} max={20000}
                  onChange={(e) => setBand(i, { freq: Number(e.target.value) })}
                  className="w-full bg-black border border-neutral-800 text-[11px] font-mono font-bold text-white px-1 py-0.5 outline-none focus:border-[#FF6B00] mb-1"
                  data-testid={`sel-band-${i}-freq`} />
                <div className="text-[8px] font-mono uppercase tracking-[0.15em] text-neutral-500">Gain</div>
                <input type="number" step="0.1" value={b.gain} min={-18} max={18}
                  onChange={(e) => setBand(i, { gain: Number(e.target.value) })}
                  className="w-full bg-black border border-neutral-800 text-[11px] font-mono font-bold text-white px-1 py-0.5 outline-none focus:border-[#FF6B00] mb-1"
                  data-testid={`sel-band-${i}-gain`} />
                <div className="text-[8px] font-mono uppercase tracking-[0.15em] text-neutral-500">Q</div>
                <input type="number" step="0.1" value={b.q} min={0.1} max={10}
                  onChange={(e) => setBand(i, { q: Number(e.target.value) })}
                  className="w-full bg-black border border-neutral-800 text-[11px] font-mono font-bold text-white px-1 py-0.5 outline-none focus:border-[#FF6B00]"
                  data-testid={`sel-band-${i}-q`} />
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Dynamics (DYN1=COMP visualization) + live GR meter */}
        <div className="w-[260px]">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">DYN · Comp/Lim</span>
            <button onClick={() => onOpenComp(out.id)}
              className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#FF6B00] hover:text-white"
              data-testid="sel-open-comp-modal">
              Open Modal ↗
            </button>
          </div>
          <div className="flex gap-2 items-start">
            <CompCurve comp={out.comp} limiter={out.limiter} width={200} height={200} />
            <GRMeter
              outputId={out.id}
              enabled={out.comp.enabled || out.limiter.enabled}
              height={200}
              width={20}
              segments={24}
              testId="sel-gr-meter"
            />
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <Pill label="Thr" value={out.comp.threshold.toFixed(1)} suffix="dB" testId="sel-pill-thr" />
            <Pill label="Ratio" value={`${out.comp.ratio.toFixed(1)}:1`} testId="sel-pill-ratio" />
            <Pill label="Att" value={out.comp.attack.toFixed(0)} suffix="ms" testId="sel-pill-att" />
            <Pill label="Rel" value={out.comp.release.toFixed(0)} suffix="ms" testId="sel-pill-rel" />
            <Pill label="Knee" value={out.comp.knee.toFixed(1)} suffix="dB" testId="sel-pill-knee" />
            <Pill label="Mk" value={out.comp.makeup.toFixed(1)} suffix="dB" testId="sel-pill-mk" />
          </div>
        </div>

        {/* Column 3: Fader + dual meters */}
        <div className="w-[150px] border border-neutral-800 bg-[#0c0c0c] p-2 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500">Master Fader</span>
            <span className="text-xs font-mono font-bold text-white" data-testid="sel-gain-value">
              {out.gain.toFixed(1)} dB
            </span>
          </div>
          <div className="flex justify-center items-stretch gap-2 grow">
            {/* IN meter */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-mono uppercase tracking-[0.18em] text-neutral-500">IN</span>
              <Meter outputId={out.id} source="in" orient="v" height={220} width={14} segments={24} testId="sel-input-meter" />
            </div>
            {/* Fader with scale */}
            <div className="flex items-stretch gap-1">
              <div className="flex flex-col justify-between text-[8px] font-mono text-neutral-600 py-1 select-none">
                <span>+10</span><span>0</span><span>-10</span><span>-20</span><span>-40</span><span>-60</span>
              </div>
              <input
                type="range"
                min={-60}
                max={12}
                step={0.1}
                value={out.gain}
                onChange={(e) => setField({ gain: Number(e.target.value) })}
                className="appearance-none bg-transparent accent-[#FF6B00] cursor-pointer vertical-fader"
                style={{
                  writingMode: "vertical-lr",
                  direction: "rtl",
                  height: 220,
                  width: 26,
                }}
                data-testid="sel-fader"
              />
            </div>
            {/* OUT meter */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-mono uppercase tracking-[0.18em] text-neutral-500">OUT</span>
              <Meter outputId={out.id} source="out" orient="v" height={220} width={14} segments={24} testId="sel-output-meter" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectedChannelPanel;
