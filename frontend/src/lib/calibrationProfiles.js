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

// Profile Auto-Detector — looks at the current dsp state (routing density,
// average channel delay, crossover usage and naming hints) and recommends the
// best-fitting calibration profile with a confidence score and human-readable
// reasons. Pure function — no React, no localStorage.
const SPEED_OF_SOUND = 343; // m/s, used for unit conversion only

const delayMs = (d) => {
  if (!d) return 0;
  const v = Number(d.value) || 0;
  if (d.unit === "ms") return v;
  if (d.unit === "mm") return (v / 1000 / SPEED_OF_SOUND) * 1000;
  if (d.unit === "inch") return ((v * 0.0254) / SPEED_OF_SOUND) * 1000;
  return v;
};

export const detectProfile = (state) => {
  const outputs = state?.outputs ?? [];
  const matrix = state?.matrix ?? {};
  const reasons = [];
  const scores = { "live-band": 0, "car-audio": 0, "home-studio": 0, "house-of-worship": 0 };

  // 1. Active outputs (those with at least one routed input).
  const activeOuts = outputs.filter((o) => (matrix[o.id] || []).length > 0);
  const activeCount = activeOuts.length;

  if (activeCount === 0) {
    return {
      profileId: "car-audio",
      confidence: "low",
      margin: 0,
      scores,
      reasons: ["No outputs are routed yet — defaulting to Car Audio."],
      summary: "0 active outputs",
    };
  }

  // 2. Delay statistics.
  const delays = activeOuts.map((o) => delayMs(o.delay));
  const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
  const maxDelay = Math.max(...delays);

  // 3. Crossover usage.
  const xoverCount = activeOuts.filter((o) => o.hpf?.enabled || o.lpf?.enabled).length;

  // 4. Naming hints — case-insensitive keyword matching across channel name+description.
  const allText = outputs
    .map((o) => `${o.name || ""} ${o.description || ""}`)
    .join(" ")
    .toUpperCase();
  const kwLive = /\b(FOH|MON|WEDGE|STAGE|MAIN|TOP|MID|SUB|LR)\b/.test(allText);
  const kwCar = /\b(DASH|DOOR|TWEET|MIDBASS|REAR|CAR|CAB)\b/.test(allText);
  const kwWorship = /\b(DELAY|FILL|BALCONY|PEW|NAVE|ALTAR|CHANCEL|CHURCH)\b/.test(allText);

  // Scoring — empirical weights tuned for the 4 profiles.
  if (activeCount <= 4) {
    scores["home-studio"] += 3;
    reasons.push(`Only ${activeCount} active output(s) → near-field setup`);
  } else if (activeCount <= 8) {
    scores["car-audio"] += 2;
    scores["live-band"] += 1;
    reasons.push(`${activeCount} active outputs → small/medium system`);
  } else if (activeCount <= 16) {
    scores["live-band"] += 3;
    reasons.push(`${activeCount} active outputs → installed/FOH PA`);
  } else {
    scores["house-of-worship"] += 3;
    reasons.push(`${activeCount} active outputs → large distributed system`);
  }

  if (avgDelay < 2 && maxDelay < 5) {
    scores["home-studio"] += 2;
    reasons.push(`Very low delay (avg ${avgDelay.toFixed(1)} ms)`);
  } else if (avgDelay < 8) {
    scores["car-audio"] += 2;
    reasons.push(`Moderate delay (avg ${avgDelay.toFixed(1)} ms) — car/time-aligned`);
  } else if (avgDelay < 20) {
    scores["live-band"] += 2;
    reasons.push(`Stage-PA delay range (avg ${avgDelay.toFixed(1)} ms)`);
  } else {
    scores["house-of-worship"] += 3;
    reasons.push(`High delay (avg ${avgDelay.toFixed(1)} ms) — distributed / delay zones`);
  }

  if (xoverCount >= 4) {
    scores["live-band"] += 2;
    reasons.push(`${xoverCount} crossover(s) active → multi-way PA`);
  } else if (xoverCount >= 2) {
    scores["car-audio"] += 1;
    reasons.push(`${xoverCount} crossover(s) → 2/3-way speakers`);
  }

  if (kwLive) { scores["live-band"] += 2; reasons.push("Names hint at stage rig (FOH/MON/SUB/TOP)"); }
  if (kwCar) { scores["car-audio"] += 2; reasons.push("Names hint at car audio (dash/door/sub)"); }
  if (kwWorship) { scores["house-of-worship"] += 3; reasons.push("Names hint at worship space (delay/fill/balcony)"); }

  // Pick highest-score profile, derive confidence from the margin over runner-up.
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [winner, topScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? 0;
  const margin = topScore - secondScore;
  const confidence = margin >= 4 ? "high" : margin >= 2 ? "medium" : "low";

  return {
    profileId: winner,
    confidence,
    margin,
    scores,
    reasons: reasons.slice(0, 4),
    summary: `${activeCount} active · avg delay ${avgDelay.toFixed(1)} ms · ${xoverCount} crossover(s)`,
  };
};
