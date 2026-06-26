// Calibration Profiles — pre-tuned capture parameters for the most common
// install scenarios. Each profile drives One-Click Calibration AND Auto-Capture
// so the integrator can pick the room/context once and skip dialling sliders.
//
// Tweak these numbers based on field experience — they are conservative by
// design (longer dwell on reflective spaces, tighter dead-band on near-field).
export const CALIBRATION_PROFILES = [
  {
    id: "live-band",
    name: "Live Band",
    icon: "♪",
    description: "Touring / stage PA — wide dynamic range, fast settle",
    scope: "phy",
    levelDb: -12,
    dwellMs: 1200,
    settleMs: 200,
    matchMode: "avg",
    deadBandDb: 1.5, // ±1.5 dB tolerance — acceptable for live mix
    color: "#FF3B30",
  },
  {
    id: "car-audio",
    name: "Car Audio",
    icon: "▱",
    description: "Reflective cabin — extra settle for low-end build-up",
    scope: "phy",
    levelDb: -18,
    dwellMs: 2000,
    settleMs: 500,
    matchMode: "avg",
    deadBandDb: 1.0,
    color: "#FF6B00",
  },
  {
    id: "home-studio",
    name: "Home Studio",
    icon: "○",
    description: "Near-field monitoring — low SPL, precise matching",
    scope: "phy",
    levelDb: -24,
    dwellMs: 1500,
    settleMs: 300,
    matchMode: "target",
    deadBandDb: 0.3, // ±0.3 dB — clinical accuracy
    color: "#00B7FF",
  },
  {
    id: "house-of-worship",
    name: "House of Worship",
    icon: "✦",
    description: "Reverberant space, distributed speakers — long settle",
    scope: "all",
    levelDb: -15,
    dwellMs: 2500,
    settleMs: 800,
    matchMode: "avg",
    deadBandDb: 2.0, // ±2 dB — reflective venue, don't chase noise
    color: "#FFD60A",
  },
];

const PROFILE_KEY = "dsp_calibration_profile_v1";

export const loadProfileId = () => {
  try {
    return localStorage.getItem(PROFILE_KEY) || "car-audio";
  } catch (err) {
    console.warn("[calibrationProfiles] load failed:", err);
    return "car-audio";
  }
};

export const saveProfileId = (id) => {
  try {
    localStorage.setItem(PROFILE_KEY, id);
  } catch (err) {
    console.warn("[calibrationProfiles] save failed:", err);
  }
};

export const getProfileById = (id) =>
  CALIBRATION_PROFILES.find((p) => p.id === id) || CALIBRATION_PROFILES[1];
