// Default channel state factory and constants for AudioSystem DSP Web
// This file is intentionally pure (no React) so it can be reused by audio engine.

export const SPEED_OF_SOUND_M_S = 343; // m/s at 20°C, dry air

export const VERSIONS = {
  v16: { id: "v16", label: "DSP 16+16 Dante", physical: 16, virtual: 16 },
  v8: { id: "v8", label: "DSP 8+8 Dante", physical: 8, virtual: 8 },
};

export const EQ_BAND_TYPES = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"];
export const EQ_DEFAULT_FREQS = [60, 250, 1000, 4000, 12000];

export const SLOPE_OPTIONS = [6, 12, 18, 24]; // dB/octave (approximation)

export const defaultEqBands = () =>
  EQ_DEFAULT_FREQS.map((freq, i) => ({
    freq,
    gain: 0,
    q: i === 0 || i === 4 ? 0.7 : 1.0,
    type: EQ_BAND_TYPES[i],
  }));

export const defaultChannel = (idx, kind) => ({
  // kind: 'in_phy' | 'in_virt' | 'out_phy' | 'out_virt'
  id: `${kind}_${idx}`,
  kind,
  index: idx,
  name:
    kind === "in_phy"
      ? `IN ${idx + 1}`
      : kind === "in_virt"
        ? `VIN ${idx + 1}`
        : kind === "out_phy"
          ? `OUT ${idx + 1}`
          : `VOUT ${idx + 1}`,
  description: "", // free text — what this channel is used for (e.g. "Lead Vocal", "Sub L")
  gain: 0, // dB, -60..+12
  mute: false,
  solo: false,
  pan: 0, // -100 (L) .. +100 (R)
  delay: { value: 0, unit: "ms" }, // ms / mm / inch
  eq: { enabled: true, bands: defaultEqBands() },
  crossover: {
    hpf: { enabled: false, freq: 80, slope: 12 },
    lpf: { enabled: false, freq: 16000, slope: 12 },
  },
  comp: {
    enabled: false,
    threshold: -18,
    ratio: 4,
    attack: 10,
    release: 100,
    knee: 6,
    makeup: 0,
  },
  limiter: { enabled: false, ceiling: -0.3 },
  pinkNoise: { enabled: false, level: -20, type: "pink" }, // type: 'pink'|'white'|'sweep'
});

export const buildInitialState = (versionId) => {
  const v = VERSIONS[versionId];
  const inputs = [
    ...Array.from({ length: v.physical }, (_, i) => defaultChannel(i, "in_phy")),
    ...Array.from({ length: v.virtual }, (_, i) => defaultChannel(i, "in_virt")),
  ];
  const outputs = [
    ...Array.from({ length: v.physical }, (_, i) => defaultChannel(i, "out_phy")),
    ...Array.from({ length: v.virtual }, (_, i) => defaultChannel(i, "out_virt")),
  ];
  // matrix[outId] = Set of inputIds routed to that output
  const matrix = {};
  outputs.forEach((o, i) => {
    matrix[o.id] = i < 2 ? [inputs[i].id] : []; // first two outs grab in1/in2 by default
  });
  return {
    version: versionId,
    inputs,
    outputs,
    matrix,
    masterGain: 0,
    masterMute: false,
    scenes: [],
    lastRecalledSceneId: null,
  };
};

// Delay value <-> milliseconds
export const delayToMs = ({ value, unit }) => {
  const v = Number(value) || 0;
  if (unit === "ms") return v;
  if (unit === "mm") return (v / 1000 / SPEED_OF_SOUND_M_S) * 1000;
  if (unit === "inch") return ((v * 0.0254) / SPEED_OF_SOUND_M_S) * 1000;
  return v;
};

export const formatDelay = (d) => {
  const ms = delayToMs(d);
  return `${ms.toFixed(2)} ms`;
};

export const dbToGain = (db) => Math.pow(10, db / 20);
