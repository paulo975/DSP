// Shareable URL — encode the current DSP state into a base64 URL param.
// The recipient can paste the link in any browser/PC and reproduce the
// full mix (channel names, faders, EQ, delays, routing, scenes).
//
// IMPORTANT: a naïvely JSON-encoded state is ~50 KB which the K8s
// ingress + Cloudflare in front of the app reject as HTTP 414
// "URI Too Long". To keep the URL well under that limit we compact the
// payload by storing only what *differs* from the version's default
// state. A pristine setup ships in ~300 B; a heavily customised one
// in ~3-6 KB — comfortable under the ~8 KB ingress ceiling.
import { buildInitialState, VERSIONS } from "./dspDefaults";

const SHARE_KEY = "share";
const STATE_KEY = "dsp_state_v1";

const utf8ToBase64 = (str) => btoa(unescape(encodeURIComponent(str)));
const base64ToUtf8 = (b64) => decodeURIComponent(escape(atob(b64)));

// Cheap deep-equality based on JSON stringify — fine here because the
// state graph is pure data (no functions, no Date, no Symbol).
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Reduce the full state to a compact diff against the initial defaults.
const compactState = (state) => {
  const initial = buildInitialState(state.version);
  const initIn = new Map(initial.inputs.map((c) => [c.id, c]));
  const initOut = new Map(initial.outputs.map((c) => [c.id, c]));
  // Only ship channels that differ from default.
  const inDiff = state.inputs.filter((c) => !eq(c, initIn.get(c.id)));
  const outDiff = state.outputs.filter((c) => !eq(c, initOut.get(c.id)));
  // Matrix: only ship entries that differ from the initial routing.
  const matrixDiff = {};
  const initialMatrix = initial.matrix || {};
  for (const [k, v] of Object.entries(state.matrix || {})) {
    if (!eq(v, initialMatrix[k] || [])) matrixDiff[k] = v;
  }
  // 1-letter keys shave another ~5 % off the encoded length.
  return {
    v: state.version,
    g: state.masterGain ?? 0,
    M: !!state.masterMute,
    i: inDiff,
    o: outDiff,
    m: matrixDiff,
    s: state.scenes || [],
    l: state.lastRecalledSceneId ?? null,
  };
};

const expandState = (compact) => {
  if (!compact?.v || !VERSIONS[compact.v]) return null;
  const base = buildInitialState(compact.v);
  const inMap = new Map((compact.i || []).map((c) => [c.id, c]));
  const outMap = new Map((compact.o || []).map((c) => [c.id, c]));
  return {
    ...base,
    masterGain: compact.g ?? 0,
    masterMute: !!compact.M,
    inputs: base.inputs.map((c) => inMap.get(c.id) || c),
    outputs: base.outputs.map((c) => outMap.get(c.id) || c),
    matrix: { ...base.matrix, ...(compact.m || {}) },
    scenes: compact.s || [],
    lastRecalledSceneId: compact.l ?? null,
    talkback: false, // never carry transient state across a share
  };
};

// Build a shareable URL containing the current state.
export const buildShareUrl = (state) => {
  const json = JSON.stringify(compactState(state));
  const b64 = utf8ToBase64(json);
  const u = new URL(window.location.href);
  u.searchParams.set(SHARE_KEY, b64);
  u.hash = "";
  return u.toString();
};

// Read & decode the ?share= payload from the current URL (or null).
export const readShareFromUrl = () => {
  try {
    const u = new URL(window.location.href);
    const b64 = u.searchParams.get(SHARE_KEY);
    if (!b64) return null;
    const json = base64ToUtf8(b64);
    const compact = JSON.parse(json);
    return expandState(compact);
  } catch (err) {
    console.warn("[dspShareLink] Failed to decode ?share= payload:", err);
    return null;
  }
};

// Strip the share param from the URL without reloading.
export const clearShareFromUrl = () => {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(SHARE_KEY)) return;
    u.searchParams.delete(SHARE_KEY);
    window.history.replaceState({}, "", u.toString());
  } catch {
    // history API unavailable in some embed contexts
  }
};

// If the URL contains a share payload, hydrate it into localStorage NOW
// so the normal boot path picks it up. Strips the param after applying.
export const applyShareIfPresent = () => {
  const incoming = readShareFromUrl();
  if (!incoming) return false;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(incoming));
    clearShareFromUrl();
    return true;
  } catch (err) {
    console.warn("[dspShareLink] Failed to apply share to localStorage:", err);
    return false;
  }
};
