// Drag-and-drop or browse-to-upload modal that consumes an AudioSystem DSP
// binary project file and applies the 32 input + 32 output channel names to
// the current dsp state. Best-effort — see /app/frontend/src/lib/
// dspBinaryImporter.js for the parser scope and known limitations.
import React from "react";
import { useDsp } from "@/lib/dspStore";
import { parseDantDspNames, guessCategory } from "@/lib/dspBinaryImporter";

const DspImportModal = ({ onClose }) => {
  const { state, updateInput, updateOutput, readOnly } = useDsp();
  const [parsed, setParsed] = React.useState(null);
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState(null);
  const [applyCategories, setApplyCategories] = React.useState(true);
  const [applied, setApplied] = React.useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setApplied(false);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const result = parseDantDspNames(buf);
      if (result.totalFound < 2) {
        setError(`Only ${result.totalFound} channel name(s) recognised — file may not be a valid AudioSystem DSP project.`);
        setParsed(null);
        return;
      }
      setParsed(result);
    } catch (e) {
      setError(`Failed to read file: ${e?.message || e}`);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const apply = () => {
    if (!parsed || readOnly) return;
    // Inputs
    state.inputs.forEach((ch, idx) => {
      const newName = parsed.inputs[idx];
      if (!newName) return;
      const patch = { name: newName };
      if (applyCategories) patch.category = guessCategory(newName);
      updateInput(ch.id, patch);
    });
    // Outputs
    state.outputs.forEach((ch, idx) => {
      const newName = parsed.outputs[idx];
      if (!newName) return;
      const patch = { name: newName };
      if (applyCategories) patch.category = guessCategory(newName);
      updateOutput(ch.id, patch);
    });
    setApplied(true);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" data-testid="dsp-import-modal">
      <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#22D3EE]">⇩ Import DSP File</div>
            <div className="text-lg font-semibold text-white">AudioSystem DSP project → channel names</div>
            <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
              Reads 32 input + 32 output names. EQ / delay / routing / dynamics import is not yet supported (proprietary format).
            </div>
          </div>
          <button onClick={onClose} data-testid="dsp-import-close" className="text-neutral-400 hover:text-white text-2xl px-2">×</button>
        </div>

        {/* Dropzone */}
        <div className="p-4 space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="border-2 border-dashed border-neutral-800 hover:border-[#22D3EE] transition-colors p-6 text-center cursor-pointer"
            onClick={() => document.getElementById("dsp-import-file")?.click()}
            data-testid="dsp-import-dropzone"
          >
            <input
              id="dsp-import-file"
              type="file"
              className="hidden"
              accept="*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              data-testid="dsp-import-input"
            />
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-400">
              {fileName ? `📄 ${fileName}` : "Drop a .dsp file here or click to browse"}
            </div>
          </div>

          {error && (
            <div className="text-[11px] font-mono text-[#FF3B30]" data-testid="dsp-import-error">{error}</div>
          )}

          {parsed && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="text-[11px] font-mono text-neutral-400">
                  Recognised <span className="text-[#22D3EE] font-bold" data-testid="dsp-import-found">{parsed.totalFound}</span> name(s):{" "}
                  <span className="text-white">{parsed.inputs.length}</span> input(s){" + "}
                  <span className="text-white">{parsed.outputs.length}</span> output(s).
                </div>
                <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.15em] text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyCategories}
                    onChange={(e) => setApplyCategories(e.target.checked)}
                    data-testid="dsp-import-apply-categories"
                  />
                  Auto-tag categories
                </label>
              </div>

              {/* Two-column preview */}
              <div className="grid grid-cols-2 gap-4 max-h-[44vh] overflow-auto border border-neutral-800 p-3 bg-black/30" data-testid="dsp-import-preview">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#00B7FF] mb-2">Inputs</div>
                  <ul className="space-y-0.5">
                    {parsed.inputs.map((n, i) => (
                      <li key={`in-${i}`} className="flex justify-between text-[11px] font-mono">
                        <span className="text-neutral-500 w-6 tabular-nums">{i + 1}</span>
                        <span className="grow text-white truncate">{n}</span>
                        {applyCategories && guessCategory(n) !== "none" && (
                          <span className="ml-2 px-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[#22D3EE]">
                            {guessCategory(n)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#FF6B00] mb-2">Outputs</div>
                  <ul className="space-y-0.5">
                    {parsed.outputs.map((n, i) => (
                      <li key={`out-${i}`} className="flex justify-between text-[11px] font-mono">
                        <span className="text-neutral-500 w-6 tabular-nums">{i + 1}</span>
                        <span className="grow text-white truncate">{n}</span>
                        {applyCategories && guessCategory(n) !== "none" && (
                          <span className="ml-2 px-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[#FF6B00]">
                            {guessCategory(n)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {applied && (
                <div className="text-[11px] font-mono text-[#00FF41]" data-testid="dsp-import-applied">
                  ✓ Names applied to {parsed.inputs.length + parsed.outputs.length} channels. Close to inspect.
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-neutral-800 px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} data-testid="dsp-import-cancel" className="px-3 py-2 border border-neutral-700 text-neutral-400 text-[10px] font-mono uppercase tracking-[0.18em] hover:border-neutral-500 hover:text-white">
            {applied ? "Done" : "Cancel"}
          </button>
          <button
            onClick={apply}
            disabled={!parsed || readOnly || applied}
            data-testid="dsp-import-apply"
            className="px-4 py-2 bg-[#22D3EE] text-black text-[10px] font-mono uppercase tracking-[0.18em] font-bold hover:bg-[#67E8F9] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✓ Apply Names
          </button>
        </div>
      </div>
    </div>
  );
};

export default DspImportModal;
