// Round-trip safe exporter for AudioSystem DSP project files.
//
// We DO NOT know the byte layout of the ~42 KB DSP processing block
// (EQ / compressor / delay / routing matrix etc.) and cannot synthesise
// it from scratch without risking a corrupted file that bricks the
// hardware. Strategy:
//
//   1. The user MUST first IMPORT a real .audiosystemdsp file — the raw
//      ArrayBuffer of that file is kept in memory as a "template".
//   2. On export, we only PATCH the 32 input + 32 output channel-name
//      fields inside the template at their known offsets. Every other
//      byte is preserved verbatim.
//   3. The patched buffer is returned and the caller triggers a
//      browser download with the chosen filename.
//
// Reverse-engineered record layout (from /tmp/16.audiosystemdsp, 45 128 B):
//
//   File header   : 20 bytes
//   Input records : 32 × 40 bytes  (offset 20 → 1299)
//     MAGIC(4) preHeader(6) NAME(16) pad(2) TERM(4) index(2) tail(6)
//                                    ^^^^^^^^^^^^^ patched here
//   DSP block     : 42 612 bytes    (offset 1300 → 43911) -- UNTOUCHED
//   Output records: 32 × 34 bytes   (offset 43912 → 44999)
//     MAGIC(4) preHeader(4) NAME(16) pad(6) index(2) flags(2)
//                                    ^^^^^^^^^^^^^ patched here
//   Trailer       : 128 bytes of zeros
//
// Offsets verified by scanning for the magic sequence B0 04 E0 E3.
const MAGIC = [0xB0, 0x04, 0xE0, 0xE3];
const NAME_LEN = 16;
const INPUT_RECORD_SIZE = 40;
const OUTPUT_RECORD_SIZE = 34;
const INPUT_NAME_OFFSET = 10;  // bytes from MAGIC start
const OUTPUT_NAME_OFFSET = 8;
const INPUT_COUNT = 32;
const OUTPUT_COUNT = 32;

// Locate every magic-prefixed record in the buffer in file order.
// Returns the byte offset where each MAGIC begins.
const findRecordOffsets = (bytes) => {
  const offsets = [];
  for (let i = 0; i < bytes.length - 4; i++) {
    if (
      bytes[i] === MAGIC[0] &&
      bytes[i + 1] === MAGIC[1] &&
      bytes[i + 2] === MAGIC[2] &&
      bytes[i + 3] === MAGIC[3]
    ) {
      offsets.push(i);
    }
  }
  return offsets;
};

// Encode an ASCII string into a fixed-width slot, null-padded right.
// Non-ASCII characters are stripped (the hardware UI only renders ASCII).
const writeNameAt = (bytes, offset, name) => {
  const ascii = String(name || "").replace(/[^\x20-\x7E]/g, "");
  for (let i = 0; i < NAME_LEN; i++) {
    bytes[offset + i] = i < ascii.length ? ascii.charCodeAt(i) : 0x00;
  }
};

// Patch a source template buffer with the supplied input/output names.
//
//   sourceBuffer : ArrayBuffer of the originally imported file
//   inputNames   : string[] up to 32 entries (extras ignored)
//   outputNames  : string[] up to 32 entries
//
// Returns a NEW ArrayBuffer (the source buffer is not mutated).
export const patchBufferWithNames = (sourceBuffer, inputNames, outputNames) => {
  if (!sourceBuffer || !(sourceBuffer instanceof ArrayBuffer)) {
    throw new Error("A source .audiosystemdsp buffer is required to export.");
  }
  // Copy so we never mutate the caller's template.
  const out = sourceBuffer.slice(0);
  const bytes = new Uint8Array(out);
  const offsets = findRecordOffsets(bytes);
  if (offsets.length < INPUT_COUNT + OUTPUT_COUNT) {
    throw new Error(
      `Template contains only ${offsets.length} records — expected ${INPUT_COUNT + OUTPUT_COUNT}.`,
    );
  }
  // First 32 magic positions = inputs, next 32 = outputs (file order).
  for (let i = 0; i < INPUT_COUNT; i++) {
    if (inputNames[i] == null) continue;
    const recOff = offsets[i];
    // Sanity: don't overflow the record by writing past the next magic.
    const next = offsets[i + 1] ?? recOff + INPUT_RECORD_SIZE;
    if (recOff + INPUT_NAME_OFFSET + NAME_LEN > next) continue;
    writeNameAt(bytes, recOff + INPUT_NAME_OFFSET, inputNames[i]);
  }
  for (let i = 0; i < OUTPUT_COUNT; i++) {
    if (outputNames[i] == null) continue;
    const recOff = offsets[INPUT_COUNT + i];
    const next = offsets[INPUT_COUNT + i + 1] ?? recOff + OUTPUT_RECORD_SIZE;
    if (recOff + OUTPUT_NAME_OFFSET + NAME_LEN > next) continue;
    writeNameAt(bytes, recOff + OUTPUT_NAME_OFFSET, outputNames[i]);
  }
  return out;
};

// Trigger a browser download of the patched buffer.
export const downloadDspFile = (buffer, filename = "export.audiosystemdsp") => {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the object URL on next tick — Safari/Firefox revoke too early
  // if called synchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ----- Persistence of the source template -----
// We base64-encode the ~45 KB template into localStorage so the user can
// reload the page and still export. Key kept separate from `dsp_state_v1`
// so the working state stays small and JSON-safe.
const TEMPLATE_KEY = "dsp_source_template_v1";

const bufferToBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

const base64ToBuffer = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

export const saveSourceTemplate = (buffer, fileName) => {
  try {
    const payload = {
      fileName: fileName || "imported.audiosystemdsp",
      size: buffer.byteLength,
      data: bufferToBase64(buffer),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("[dspBinaryExporter] Failed to persist template:", err);
    return false;
  }
};

export const loadSourceTemplate = () => {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return {
      fileName: parsed.fileName,
      size: parsed.size,
      savedAt: parsed.savedAt,
      buffer: base64ToBuffer(parsed.data),
    };
  } catch (err) {
    console.warn("[dspBinaryExporter] Failed to read template:", err);
    return null;
  }
};

export const clearSourceTemplate = () => {
  try {
    localStorage.removeItem(TEMPLATE_KEY);
  } catch {
    // ignore — quota / disabled storage
  }
};
