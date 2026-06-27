// Proactive Profile Hint — a discreet pulsing chip that surfaces a calibration
// profile recommendation whenever the user has materially changed routing /
// delays / crossovers / channel names AND the current active profile no longer
// fits. Designed to teach the platform's capabilities without nagging:
//   • Only shows when confidence >= MEDIUM (no LOW-confidence noise).
//   • Dismissals are remembered per suggested profile until the routing
//     fingerprint changes again — so the user never sees the same nag twice.
//   • Hidden in popout mode (#popout=meters).
import React from "react";
import { useDsp } from "@/lib/dspStore";
import {
  detectProfile,
  loadProfileId,
  saveProfileId,
  getProfileById,
} from "@/lib/calibrationProfiles";

const DISMISS_KEY = "dsp_proactive_dismissed_v1";

const loadDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}");
  } catch {
    return {};
  }
};

// Fingerprint the part of state that matters for detection. If the fingerprint
// changes the dismissal map can be safely cleared for the matching profile.
const fingerprintState = (state) => {
  const m = state?.matrix || {};
  const routed = Object.entries(m)
    .filter(([, ins]) => Array.isArray(ins) && ins.length > 0)
    .map(([k]) => k)
    .sort()
    .join(",");
  const xover = (state?.outputs || []).reduce(
    (n, o) => n + ((o.crossover?.hpf?.enabled ? 1 : 0) + (o.crossover?.lpf?.enabled ? 1 : 0)),
    0,
  );
  return `${routed}|${xover}`;
};

const ProactiveProfileHint = () => {
  const { state } = useDsp();
  const [activeId, setActiveId] = React.useState(loadProfileId);
  const [dismissed, setDismissed] = React.useState(loadDismissed);
  const [lastFp, setLastFp] = React.useState(() => fingerprintState(state));

  // Keep activeId in sync with localStorage in case MetersView changes it.
  React.useEffect(() => {
    const id = setInterval(() => {
      const cur = loadProfileId();
      if (cur !== activeId) setActiveId(cur);
    }, 500);
    return () => clearInterval(id);
  }, [activeId]);

  // Whenever the detection fingerprint changes meaningfully, reset dismissals
  // so a previously-dismissed nudge can re-fire if the state shifts again.
  React.useEffect(() => {
    const fp = fingerprintState(state);
    if (fp !== lastFp) {
      setLastFp(fp);
      // Don't blow away dismissals on every minor edit — only clear the entry
      // for the *currently* suggested profile so the user can be re-nudged.
      const det = detectProfile(state);
      if (dismissed[det.profileId]) {
        const next = { ...dismissed };
        delete next[det.profileId];
        setDismissed(next);
        try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
      }
    }
  }, [state, lastFp, dismissed]);

  // Bail out for the popout window.
  if (typeof window !== "undefined" && window.location.hash === "#popout=meters") return null;

  const det = detectProfile(state);
  const isDifferent = det.profileId !== activeId;
  const isConfident = det.confidence === "high" || det.confidence === "medium";
  if (!isDifferent || !isConfident || dismissed[det.profileId]) return null;

  const suggested = getProfileById(det.profileId);
  const apply = () => {
    saveProfileId(det.profileId);
    setActiveId(det.profileId);
  };
  const dismiss = () => {
    const next = { ...dismissed, [det.profileId]: Date.now() };
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
  };

  return (
    <div
      className="px-3 py-1 flex items-center justify-center gap-2 border-b border-neutral-900 bg-black"
      data-testid="proactive-hint"
    >
      <span
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.18em] font-bold animate-pulse"
        style={{
          background: `${suggested.color}1a`,
          color: suggested.color,
          boxShadow: `0 0 0 1px ${suggested.color}66`,
        }}
      >
        💡 Your setup looks like {suggested.name} ({det.confidence})
      </span>
      <button
        onClick={apply}
        data-testid="proactive-apply"
        className="px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] font-bold rounded-sm"
        style={{ background: suggested.color, color: "#000" }}
      >
        Switch profile
      </button>
      <button
        onClick={dismiss}
        data-testid="proactive-dismiss"
        className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 hover:text-neutral-200"
      >
        ×
      </button>
    </div>
  );
};

export default ProactiveProfileHint;
