// Global DSP state via React context + reducer.
// Persists to localStorage and keeps the audio engine in sync.
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { buildInitialState, VERSIONS } from "./dspDefaults";
import { audioEngine } from "./audioEngine";

const STORAGE_KEY = "dsp_state_v1";
const PRESETS_KEY = "dsp_presets_v1";

// Default scene accent palette — picked so each scene reads clearly when
// arranged in a row of 8 slots.
const SCENE_COLORS = ["#FF6B00", "#00B7FF", "#FFD60A", "#FF3B30", "#00FF41", "#FF7AC6", "#A855F7", "#22D3EE"];

// Popout window mode: the meters pop-out shouldn't run its own audio graph or
// overwrite localStorage. It only mirrors state from the main window via the
// `storage` event + meter levels via BroadcastChannel (see audioEngine).
const IS_POPOUT = typeof window !== "undefined" && window.location.hash === "#popout=meters";

const DspContext = createContext(null);

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.version || !VERSIONS[parsed.version]) return null;
    // Migrate older states that pre-date some channel fields.
    parsed.outputs = (parsed.outputs || []).map((o) => ({
      ...o,
      description: o.description ?? "",
      pinkNoise: {
        enabled: o.pinkNoise?.enabled ?? false,
        level: o.pinkNoise?.level ?? -20,
        type: o.pinkNoise?.type ?? "pink",
      },
    }));
    parsed.inputs = (parsed.inputs || []).map((i) => ({
      ...i,
      description: i.description ?? "",
    }));
    // Scenes were added later — default to an empty list to keep older saves
    // loadable.
    parsed.scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    parsed.lastRecalledSceneId = parsed.lastRecalledSceneId ?? null;
    return parsed;
  } catch (err) {
    console.warn("[dspStore] Failed to load state from localStorage:", err);
    return null;
  }
};

const reducer = (state, action) => {
  switch (action.type) {
    case "init": {
      return action.state;
    }
    case "setVersion": {
      return buildInitialState(action.version);
    }
    case "updateOutput": {
      const outputs = state.outputs.map((o) =>
        o.id === action.id ? { ...o, ...action.patch } : o,
      );
      return { ...state, outputs };
    }
    case "updateOutputDeep": {
      const outputs = state.outputs.map((o) =>
        o.id === action.id ? action.fn(o) : o,
      );
      return { ...state, outputs };
    }
    case "updateInput": {
      const inputs = state.inputs.map((i) =>
        i.id === action.id ? { ...i, ...action.patch } : i,
      );
      return { ...state, inputs };
    }
    case "toggleRoute": {
      const { outId, inId } = action;
      const cur = state.matrix[outId] || [];
      const next = cur.includes(inId)
        ? cur.filter((x) => x !== inId)
        : [...cur, inId];
      return { ...state, matrix: { ...state.matrix, [outId]: next } };
    }
    case "clearRoutes": {
      const matrix = {};
      state.outputs.forEach((o) => (matrix[o.id] = []));
      return { ...state, matrix };
    }
    case "setMaster": {
      return { ...state, ...action.patch };
    }
    case "loadPreset": {
      return action.state;
    }
    case "resetChannel": {
      const fresh = buildInitialState(state.version);
      const freshOut = fresh.outputs.find((o) => o.id === action.id);
      if (!freshOut) return state;
      const outputs = state.outputs.map((o) => (o.id === action.id ? freshOut : o));
      return { ...state, outputs };
    }
    case "setAllPinkNoise": {
      const outputs = state.outputs.map((o) => ({
        ...o,
        pinkNoise: {
          enabled: action.enabled !== undefined ? action.enabled : o.pinkNoise?.enabled ?? false,
          level: action.level !== undefined ? action.level : o.pinkNoise?.level ?? -20,
          type: action.noiseType !== undefined ? action.noiseType : o.pinkNoise?.type ?? "pink",
        },
      }));
      return { ...state, outputs };
    }
    // ---------- Scenes (snapshot recall of mute/solo/gain across all channels) ----------
    case "createScene": {
      const captureCh = (c) => ({ id: c.id, mute: c.mute, gain: c.gain, solo: c.solo });
      const scene = {
        // crypto.randomUUID gives absolute uniqueness — Date.now()+Math.random()
        // burst-safe but theoretically collidable.
        id: action.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `scene-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
        name: action.name || `Scene ${(state.scenes?.length || 0) + 1}`,
        color: action.color || SCENE_COLORS[(state.scenes?.length || 0) % SCENE_COLORS.length],
        inputs: state.inputs.map(captureCh),
        outputs: state.outputs.map(captureCh),
        createdAt: new Date().toISOString(),
      };
      return { ...state, scenes: [...(state.scenes || []), scene] };
    }
    case "overwriteScene": {
      const captureCh = (c) => ({ id: c.id, mute: c.mute, gain: c.gain, solo: c.solo });
      const scenes = (state.scenes || []).map((s) =>
        s.id === action.id
          ? { ...s, inputs: state.inputs.map(captureCh), outputs: state.outputs.map(captureCh), updatedAt: new Date().toISOString() }
          : s,
      );
      return { ...state, scenes };
    }
    case "renameScene": {
      const scenes = (state.scenes || []).map((s) =>
        s.id === action.id ? { ...s, name: action.name } : s,
      );
      return { ...state, scenes };
    }
    case "deleteScene": {
      return {
        ...state,
        scenes: (state.scenes || []).filter((s) => s.id !== action.id),
        lastRecalledSceneId: state.lastRecalledSceneId === action.id ? null : state.lastRecalledSceneId,
      };
    }
    case "recallScene": {
      const scene = (state.scenes || []).find((s) => s.id === action.id);
      if (!scene) return state;
      const merge = (cur, saved) => (saved ? { ...cur, mute: saved.mute, gain: saved.gain, solo: saved.solo } : cur);
      const inputs = state.inputs.map((i) => merge(i, scene.inputs.find((x) => x.id === i.id)));
      const outputs = state.outputs.map((o) => merge(o, scene.outputs.find((x) => x.id === o.id)));
      return { ...state, inputs, outputs, lastRecalledSceneId: action.id };
    }
    default:
      return state;
  }
};

export const DspProvider = ({ children }) => {
  const initial = useMemo(() => loadFromStorage() || buildInitialState("v16"), []);
  const [state, dispatch] = useReducer(reducer, initial);
  const [readOnly, setReadOnly] = useState(false); // UI-only "showcase / lock" mode
  const builtForVersionRef = useRef(null);

  // Persist (skipped in popout — popout only reads state, never writes it)
  useEffect(() => {
    if (IS_POPOUT) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("[dspStore] Failed to persist state to localStorage:", err);
    }
  }, [state]);

  // Popout: re-hydrate from localStorage whenever the main window saves.
  useEffect(() => {
    if (!IS_POPOUT) return undefined;
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.version && VERSIONS[parsed.version]) {
          dispatch({ type: "init", state: parsed });
        }
      } catch (err) {
        console.warn("[dspStore] Failed to sync state from storage event:", err);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // (Re)build audio graph only when version changes or first mount.
  // In popout mode we never build a local audio graph — meter values are
  // received from the main window via BroadcastChannel inside audioEngine.
  useEffect(() => {
    if (IS_POPOUT) return;
    if (builtForVersionRef.current !== state.version) {
      audioEngine.buildGraph(state);
      builtForVersionRef.current = state.version;
    }
  }, [state]);

  // Apply per-output parameter updates on every state change (no rebuild => zero added latency)
  useEffect(() => {
    if (builtForVersionRef.current !== state.version) return;
    state.outputs.forEach((o) => audioEngine.applyChannel(o));
    audioEngine.applyMaster(state.masterGain, state.masterMute);
    audioEngine.applySoloLogic(state);
  }, [state.outputs, state.masterGain, state.masterMute, state.version]);

  // Apply per-input fader/mute/solo to the input buses (zero rebuild cost).
  useEffect(() => {
    if (builtForVersionRef.current !== state.version) return;
    state.inputs.forEach((i) => audioEngine.applyInputChannel(i, state));
  }, [state.inputs, state.version]);

  // Routing changes
  useEffect(() => {
    if (builtForVersionRef.current !== state.version) return;
    audioEngine.applyRouting(state);
  }, [state]);

  const api = useMemo(() => {
    // Guard mutating actions when in read-only mode. Selectors stay untouched.
    // Whitelisted: `loadPresetState` is a user-initiated read action that we want
    // to keep usable even while locked (loading a preset is "viewing" it).
    const guard = (fn) => (...args) => {
      if (readOnly) {
        console.info("[dspStore] action ignored: app is in read-only mode");
        return;
      }
      return fn(...args);
    };
    return {
      state,
      dispatch,
      readOnly,
      setReadOnly,
      toggleReadOnly: () => setReadOnly((v) => !v),
      // helpers — all wrapped by the read-only guard
      updateOutput: guard((id, patch) => dispatch({ type: "updateOutput", id, patch })),
      updateOutputDeep: guard((id, fn) => dispatch({ type: "updateOutputDeep", id, fn })),
      updateInput: guard((id, patch) => dispatch({ type: "updateInput", id, patch })),
      toggleRoute: guard((outId, inId) => dispatch({ type: "toggleRoute", outId, inId })),
      clearRoutes: guard(() => dispatch({ type: "clearRoutes" })),
      setVersion: guard((version) => dispatch({ type: "setVersion", version })),
      setMaster: guard((patch) => dispatch({ type: "setMaster", patch })),
      resetChannel: guard((id) => dispatch({ type: "resetChannel", id })),
      setAllPinkNoise: guard((enabled, level, noiseType) => dispatch({ type: "setAllPinkNoise", enabled, level, noiseType })),
      // Scene memory — see reducer cases above.
      createScene: guard((name, color) => dispatch({ type: "createScene", name, color })),
      overwriteScene: guard((id) => dispatch({ type: "overwriteScene", id })),
      renameScene: guard((id, name) => dispatch({ type: "renameScene", id, name })),
      deleteScene: guard((id) => dispatch({ type: "deleteScene", id })),
      // Recall is allowed in read-only because it's a "viewing" action of a stored
      // snapshot — same logic as loadPresetState. (Could be guarded if needed.)
      recallScene: (id) => dispatch({ type: "recallScene", id }),
      // Unguarded: user-initiated viewing actions.
      loadPresetState: (s) => dispatch({ type: "loadPreset", state: s }),
    };
  }, [state, readOnly]);

  return <DspContext.Provider value={api}>{children}</DspContext.Provider>;
};

export const useDsp = () => {
  const v = useContext(DspContext);
  if (!v) throw new Error("useDsp must be used within DspProvider");
  return v;
};

// ---------- Presets persistence ----------
export const listPresets = () => {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("[dspStore] Failed to load presets from localStorage:", err);
    return [];
  }
};

export const savePreset = (name, state) => {
  const presets = listPresets();
  const stamp = new Date().toISOString();
  const existingIdx = presets.findIndex((p) => p.name === name);
  const entry = { name, state, savedAt: stamp };
  if (existingIdx >= 0) presets[existingIdx] = entry;
  else presets.push(entry);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
};

export const deletePreset = (name) => {
  const presets = listPresets().filter((p) => p.name !== name);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
};

export const exportPresetJson = (preset) => JSON.stringify(preset, null, 2);

export const importPresetJson = (raw) => {
  const parsed = JSON.parse(raw);
  if (!parsed?.state?.version || !VERSIONS[parsed.state.version]) {
    throw new Error("Invalid preset file");
  }
  return parsed;
};
