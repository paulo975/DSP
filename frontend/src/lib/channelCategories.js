// Channel categories — small per-channel tag used to colour-code the strip
// scribble strip (Waves eMotion LV1 style). User-assignable from the Selected
// Channel panel. Stored on each channel as `category: <id>` and defaults to
// `"none"` for existing/new channels.
export const CHANNEL_CATEGORIES = [
  { id: "none", name: "None", color: "transparent", textColor: "#666" },
  { id: "mic", name: "Mic", color: "#22D3EE" }, // cyan
  { id: "vox", name: "Vox", color: "#FF7AC6" }, // pink
  { id: "drum", name: "Drum", color: "#FFD60A" }, // yellow
  { id: "bass", name: "Bass", color: "#A855F7" }, // violet
  { id: "gtr", name: "Gtr", color: "#FF6B00" }, // orange
  { id: "key", name: "Key", color: "#00FF41" }, // green
  { id: "fx", name: "FX", color: "#FF3B30" }, // red
  { id: "aux", name: "Aux", color: "#94A3B8" }, // slate
];

export const getCategory = (id) =>
  CHANNEL_CATEGORIES.find((c) => c.id === id) || CHANNEL_CATEGORIES[0];
