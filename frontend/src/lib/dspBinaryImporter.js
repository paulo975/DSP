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
// Real AudioSystem DSP project file layout (reverse-engineered from sample
// 16.audiosystemdsp, 45 128 bytes, 32 in + 32 out):
//
//   Input record  (40 bytes): MAGIC(4) header(6) name(16) TERM(4) tail(10)
//   Output record (34 bytes): MAGIC(4) header(4) name(16) TERM(4) tail(6)
//
// MAGIC = B0 04 E0 E3
// TERM  = E8 03 40 ED
// Name is ASCII, null-padded right.
const MAGIC = [0xB0, 0x04, 0xE0, 0xE3];
const TERM = [0xE8, 0x03, 0x40, 0xED];
const NAME_MAX_LEN = 24; // bytes between magic and term — safe upper bound

// Find every magic-prefixed name record in the buffer and return them as
// trimmed ASCII strings in file order. We scan for the 4-byte magic, then
// read printable ASCII bytes up to the next 4-byte terminator (or the next
// magic — whichever comes first).
const findAllNames = (bytes) => {
  const names = [];
  const isMagicAt = (i) => bytes[i] === MAGIC[0] && bytes[i + 1] === MAGIC[1] && bytes[i + 2] === MAGIC[2] && bytes[i + 3] === MAGIC[3];
  const isTermAt = (i) => bytes[i] === TERM[0] && bytes[i + 1] === TERM[1] && bytes[i + 2] === TERM[2] && bytes[i + 3] === TERM[3];
  for (let i = 0; i < bytes.length - 4; i++) {
    if (!isMagicAt(i)) continue;
    // Scan window: from end-of-magic to either next term or next magic.
    const start = i + 4;
    let end = Math.min(start + NAME_MAX_LEN + 4, bytes.length - 4);
    for (let j = start; j < end; j++) {
      if (isTermAt(j)) { end = j; break; }
      if (isMagicAt(j)) { end = j; break; }
    }
    // Decode ASCII printable characters only; skip header/tail nulls + control bytes.
    let s = "";
    for (let j = start; j < end; j++) {
      const c = bytes[j];
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
  // Real AudioSystem DSP exports are 32 inputs + 32 outputs (64 records).
  // For shorter/test files, do a half-split so the operator sees both
  // columns populated instead of all names piling onto inputs.
  let inputs;
  let outputs;
  if (all.length >= 64) {
    inputs = all.slice(0, 32);
    outputs = all.slice(32, 64);
  } else {
    const half = Math.ceil(all.length / 2);
    inputs = all.slice(0, half);
    outputs = all.slice(half);
  }
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
