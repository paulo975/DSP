// Best-effort importer for AudioSystem DSP binary project files.
//
// The proprietary format is undocumented — we only have a single sample +
// the hardware datasheet (no byte-layout). Reverse-engineering the EQ/
// delay/routing blocks requires multiple known samples and is deliberately
// deferred (see /app/memory/PRD.md backlog).
//
// What we CAN extract reliably right now: the 32 input + 32 output channel
// names, because they are stored as ASCII inside fixed-format records
// prefixed with the magic byte sequence 0xB0 0xE0 0xE3 and terminated by
// 0xE8 0x40 0xED. The ordering observed: first 32 records = inputs,
// remaining records = outputs (in the same physical → virtual order).
const MAGIC = [0xB0, 0xE0, 0xE3];
const TERM = [0xE8, 0x40, 0xED];
const NAME_MAX_LEN = 32; // generous — names observed are <= ~12 chars
const NAME_MIN_OFFSET = 3; // skip the magic itself
const NAME_TRIM_OFFSET = 6; // observed: the name starts ~6 spaces after the magic

// Find every magic-prefixed name record in the buffer and return them as
// trimmed ASCII strings in file order.
const findAllNames = (bytes) => {
  const names = [];
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] !== MAGIC[0] || bytes[i + 1] !== MAGIC[1] || bytes[i + 2] !== MAGIC[2]) continue;
    // Search forward for the terminator OR another magic — whichever comes first.
    const start = i + NAME_MIN_OFFSET;
    let end = Math.min(start + NAME_MAX_LEN, bytes.length - 3);
    for (let j = start; j < end; j++) {
      if (bytes[j] === TERM[0] && bytes[j + 1] === TERM[1] && bytes[j + 2] === TERM[2]) { end = j; break; }
      if (bytes[j] === MAGIC[0] && bytes[j + 1] === MAGIC[1] && bytes[j + 2] === MAGIC[2]) { end = j; break; }
    }
    // ASCII-decode, strip nulls, collapse runs of whitespace, trim.
    let s = "";
    for (let j = start; j < end; j++) {
      const c = bytes[j];
      // Filter control bytes; keep printable ASCII (32..126).
      if (c >= 32 && c <= 126) s += String.fromCharCode(c);
    }
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > 0) names.push(s);
  }
  return names;
};

export const parseDantDspNames = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const all = findAllNames(bytes);
  // Defensive: pad to multiples of 32 if needed (some files might be 16+16
  // depending on configuration). The Channels view assumes 32+32, so we
  // slice to that length.
  const inputs = all.slice(0, 32);
  const outputs = all.slice(32, 64);
  return {
    inputs,
    outputs,
    totalFound: all.length,
    raw: all,
  };
};

// Map a set of imported names onto reasonable category tags (best-effort
// heuristic — names match cinema/Atmos / live-PA conventions). Returns an
// id from /app/frontend/src/lib/channelCategories.js.
const CATEGORY_RULES = [
  { match: /SUB|LFE/i, cat: "bass" },
  { match: /VOX|MIC|VOCAL|LEAD/i, cat: "vox" },
  { match: /KICK|SNARE|TOM|HAT|CYM|OH|DRUM/i, cat: "drum" },
  { match: /BASS/i, cat: "bass" },
  { match: /GTR|GUITAR/i, cat: "gtr" },
  { match: /KEY|PIANO|SYNTH|ORG/i, cat: "key" },
  { match: /FX|REVERB|DELAY|FX|VERB/i, cat: "fx" },
  { match: /AUX|SEND/i, cat: "aux" },
  { match: /^FRONT|^CENTER|^SURR|^WIDE|^REAR|^TOP|^L\b|^R\b|^C\b/i, cat: "mic" },
];

export const guessCategory = (name) => {
  for (const r of CATEGORY_RULES) if (r.match.test(name)) return r.cat;
  return "none";
};
