import React, { useMemo } from "react";
import { useDsp } from "@/lib/dspStore";

const groupLabel = (kind) =>
  kind === "in_phy"
    ? "Physical Inputs"
    : kind === "in_virt"
      ? "Dante Virtual Inputs"
      : kind === "out_phy"
        ? "Physical Outputs"
        : "Dante Virtual Outputs";

const MatrixRouter = () => {
  const { state, toggleRoute, clearRoutes } = useDsp();

  const inputs = state.inputs;
  const outputs = state.outputs;

  const groupedInputs = useMemo(() => {
    const phy = inputs.filter((i) => i.kind === "in_phy");
    const virt = inputs.filter((i) => i.kind === "in_virt");
    return [
      { label: "PHY IN", items: phy },
      { label: "VIRT IN", items: virt },
    ];
  }, [inputs]);

  return (
    <div className="p-4 h-full overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Routing Matrix</h2>
          <p className="text-xs text-neutral-500 mt-0.5 font-mono">
            Click a cell to route an INPUT → OUTPUT. Inspired by Dante Controller.
          </p>
        </div>
        <button
          onClick={clearRoutes}
          data-testid="matrix-clear-all"
          className="text-[11px] font-mono uppercase tracking-[0.15em] px-3 py-1.5 border border-neutral-700 text-neutral-300 hover:border-[#FF6B00] hover:text-white"
        >
          Clear All Routes
        </button>
      </div>

      <div className="inline-block min-w-full border border-neutral-800 bg-[#0A0A0A]">
        <div className="flex">
          {/* Top-left corner label */}
          <div className="w-28 shrink-0 border-r border-b border-neutral-800 bg-[#141414] p-2 flex items-center justify-center">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-500">IN ↓ / OUT →</span>
          </div>
          {/* Header row: outputs */}
          <div className="flex">
            {outputs.map((o) => (
              <div
                key={o.id}
                className={`w-8 h-16 shrink-0 border-r border-b border-neutral-800 flex items-end justify-center p-1 ${
                  o.kind === "out_virt" ? "bg-[#1a1208]" : "bg-[#141414]"
                }`}
                title={o.name}
              >
                <span
                  className="text-[9px] font-mono text-white"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {o.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Rows per input group */}
        {groupedInputs.map((g) => (
          <React.Fragment key={g.label}>
            <div className="flex">
              <div className="w-28 shrink-0 border-r border-b border-neutral-800 bg-black px-2 py-1">
                <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#FF6B00]">
                  {g.label}
                </span>
              </div>
              <div className="grow border-b border-neutral-800 bg-black" />
            </div>
            {g.items.map((inp) => (
              <div key={inp.id} className="flex">
                <div
                  className={`w-28 shrink-0 border-r border-b border-neutral-800 px-2 py-1 flex items-center ${
                    inp.kind === "in_virt" ? "bg-[#1a1208]" : "bg-[#141414]"
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold text-white">{inp.name}</span>
                </div>
                {outputs.map((o) => {
                  const routed = (state.matrix[o.id] || []).includes(inp.id);
                  return (
                    <button
                      key={o.id + inp.id}
                      onClick={() => toggleRoute(o.id, inp.id)}
                      data-testid={`route-${inp.id}-${o.id}`}
                      title={`${inp.name} → ${o.name}`}
                      className="w-8 h-8 shrink-0 border-r border-b border-neutral-800 flex items-center justify-center transition-colors hover:bg-neutral-900"
                      style={{ background: routed ? "#FF6B00" : undefined }}
                    >
                      {routed && (
                        <div className="w-2.5 h-2.5 bg-black" style={{ boxShadow: "0 0 4px #000" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-4 text-[10px] font-mono text-neutral-500 leading-relaxed">
        <div>• Each cell = one route from an INPUT (row) to an OUTPUT (column).</div>
        <div>• Multiple inputs can be summed into a single output.</div>
        <div>• Routes are saved instantly and persist across sessions.</div>
      </div>
    </div>
  );
};

export default MatrixRouter;
