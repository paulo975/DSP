import React, { useMemo } from "react";

/**
 * Signal flow diagram for the Print Channel Map.
 * Renders an SVG with inputs (left) → DSP middle block → outputs (right),
 * with curved bezier connectors for each route in state.matrix.
 *
 * Designed for print: pure SVG with high-contrast strokes and no animations.
 * Only shows ACTIVE routes (sources that route to at least one destination,
 * and outputs that have at least one source) to keep the diagram readable.
 * If matrix is empty, shows a placeholder message.
 */

const ROW_H = 14;
const COL_INPUT_X = 40;
const COL_OUTPUT_X = 660;
const DSP_BOX_X = 290;
const DSP_BOX_W = 140;

const inputAccent = (k) => (k === "in_phy" ? "#00B7FF" : "#0066AA");
const outputAccent = (k) => (k === "out_phy" ? "#FF6B00" : "#AA4500");

const SignalFlowDiagram = ({ state }) => {
  const { activeInputs, activeOutputs, routes, height } = useMemo(() => {
    // Active outputs = those with at least one route source
    const activeOuts = state.outputs.filter((o) => (state.matrix[o.id] || []).length > 0);
    // Active inputs = those that are referenced by at least one active output
    const referencedInputIds = new Set();
    activeOuts.forEach((o) => (state.matrix[o.id] || []).forEach((id) => referencedInputIds.add(id)));
    const activeIns = state.inputs.filter((i) => referencedInputIds.has(i.id));

    // Layout: assign each active input/output a Y position
    const inputPos = {};
    activeIns.forEach((i, idx) => {
      inputPos[i.id] = 60 + idx * ROW_H;
    });
    const outputPos = {};
    activeOuts.forEach((o, idx) => {
      outputPos[o.id] = 60 + idx * ROW_H;
    });

    const routeList = [];
    activeOuts.forEach((o) => {
      (state.matrix[o.id] || []).forEach((inId) => {
        if (inputPos[inId] != null) {
          routeList.push({
            inId,
            outId: o.id,
            x1: COL_INPUT_X + 8,
            y1: inputPos[inId],
            x2: COL_OUTPUT_X - 8,
            y2: outputPos[o.id],
          });
        }
      });
    });

    const h = Math.max(180, Math.max(activeIns.length, activeOuts.length) * ROW_H + 100);
    return {
      activeInputs: activeIns.map((i) => ({ ...i, _y: inputPos[i.id] })),
      activeOutputs: activeOuts.map((o) => ({ ...o, _y: outputPos[o.id] })),
      routes: routeList,
      height: h,
    };
  }, [state]);

  if (routes.length === 0) {
    return (
      <div className="border border-neutral-300 bg-neutral-50 p-4 mb-4 text-center text-xs text-neutral-500" data-testid="signal-flow-empty">
        Signal Flow Diagram — no active routing. Configure routes in the Matrix tab to populate this view.
      </div>
    );
  }

  return (
    <div className="mb-4" data-testid="signal-flow-diagram">
      <h2 className="text-base font-bold mb-2 uppercase tracking-wide">Signal Flow</h2>
      <div className="border border-neutral-400 bg-white">
        <svg width="100%" viewBox={`0 0 720 ${height}`} preserveAspectRatio="xMidYMin meet">
          {/* Column headers */}
          <text x={COL_INPUT_X} y={36} fontSize={11} fontWeight="bold" textAnchor="middle" fill="#00B7FF">
            INPUTS
          </text>
          <text x={DSP_BOX_X + DSP_BOX_W / 2} y={36} fontSize={11} fontWeight="bold" textAnchor="middle" fill="#000">
            DSP CHAIN
          </text>
          <text x={COL_OUTPUT_X} y={36} fontSize={11} fontWeight="bold" textAnchor="middle" fill="#FF6B00">
            OUTPUTS
          </text>

          {/* DSP center block */}
          <rect
            x={DSP_BOX_X}
            y={50}
            width={DSP_BOX_W}
            height={height - 80}
            fill="#fafafa"
            stroke="#000"
            strokeWidth={1.5}
          />
          {["EQ · 5 BANDS", "CROSSOVER", "COMP / LIM", "DELAY", "PAN · GAIN"].map((label, i) => (
            <g key={label}>
              <rect
                x={DSP_BOX_X + 10}
                y={70 + i * 28}
                width={DSP_BOX_W - 20}
                height={20}
                fill="#fff"
                stroke="#888"
                strokeWidth={0.75}
              />
              <text
                x={DSP_BOX_X + DSP_BOX_W / 2}
                y={70 + i * 28 + 14}
                fontSize={9}
                textAnchor="middle"
                fill="#333"
                fontFamily="monospace"
              >
                {label}
              </text>
            </g>
          ))}

          {/* Routes (drawn first so labels sit on top) */}
          {routes.map((r) => {
            const midX1 = (r.x1 + DSP_BOX_X) / 2;
            const midX2 = (DSP_BOX_X + DSP_BOX_W + r.x2) / 2;
            const path = `M ${r.x1},${r.y1} C ${midX1},${r.y1} ${DSP_BOX_X - 20},${(r.y1 + r.y2) / 2} ${DSP_BOX_X},${(r.y1 + r.y2) / 2} M ${DSP_BOX_X + DSP_BOX_W},${(r.y1 + r.y2) / 2} C ${midX2},${(r.y1 + r.y2) / 2} ${midX2},${r.y2} ${r.x2},${r.y2}`;
            return (
              <path
                key={`${r.inId}->${r.outId}`}
                d={path}
                stroke="#FF6B00"
                strokeWidth={1.2}
                fill="none"
                opacity={0.6}
                data-testid={`flow-route-${r.inId}-${r.outId}`}
              />
            );
          })}

          {/* Input rows */}
          {activeInputs.map((i) => (
            <g key={i.id}>
              <circle cx={COL_INPUT_X} cy={i._y} r={3.5} fill={inputAccent(i.kind)} />
              <text
                x={COL_INPUT_X - 10}
                y={i._y + 3.5}
                fontSize={9}
                textAnchor="end"
                fill="#000"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {i.description && (
                  <tspan fill="#666" fontStyle="italic" fontSize={7.5} fontWeight="normal">
                    {i.description.length > 20 ? `${i.description.slice(0, 20)}…` : i.description}
                    {" · "}
                  </tspan>
                )}
                {i.name}
              </text>
            </g>
          ))}

          {/* Output rows */}
          {activeOutputs.map((o) => (
            <g key={o.id}>
              <circle cx={COL_OUTPUT_X} cy={o._y} r={3.5} fill={outputAccent(o.kind)} />
              <text
                x={COL_OUTPUT_X + 10}
                y={o._y + 3.5}
                fontSize={9}
                textAnchor="start"
                fill="#000"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {o.name}
                {o.description && (
                  <tspan fill="#666" fontStyle="italic" fontSize={7.5} fontWeight="normal">
                    {"  · "}
                    {o.description.length > 20 ? `${o.description.slice(0, 20)}…` : o.description}
                  </tspan>
                )}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="text-[9px] text-neutral-500 mt-1 italic">
        Showing {activeInputs.length} active input{activeInputs.length === 1 ? "" : "s"} → {activeOutputs.length} active output{activeOutputs.length === 1 ? "" : "s"} via {routes.length} route{routes.length === 1 ? "" : "s"}. Unrouted channels are omitted for clarity.
      </div>
    </div>
  );
};

export default SignalFlowDiagram;
