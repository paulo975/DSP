// Small status pill shown in the TopBar that indicates whether the
// hardware bridge is reachable and whether it can see the physical
// DSP. Three states:
//
//   ⚫ Bridge offline    — no local asdp_bridge daemon running
//   🟡 Bridge online     — daemon is up but hasn't seen the DSP yet
//   🟢 Bridge ↔ DSP      — daemon is up AND the DSP is replying
//
// The indicator subscribes to hwBridge status updates and re-renders.
// Clicking it surfaces a quick help popup pointing users to start the
// bridge daemon on their PC.
import React from "react";
import { hwBridge } from "@/lib/dspHardwareBridge";

const HardwareBridgeIndicator = () => {
  const [status, setStatus] = React.useState(hwBridge.status());
  const [showHelp, setShowHelp] = React.useState(false);

  React.useEffect(() => hwBridge.onStatus(setStatus), []);

  const { color, label, tip } = status.connected
    ? status.dspSeen
      ? { color: "#00FF41", label: "Bridge ↔ DSP", tip: "Connected to local bridge AND the DSP is responding." }
      : { color: "#FFD60A", label: "Bridge ON · DSP ?", tip: "Bridge daemon is up but hasn't seen the DSP yet. Check the Ethernet cable and the DSP IP." }
    : { color: "#666", label: "Bridge OFFLINE", tip: "Local bridge daemon isn't running. Click for instructions." };

  return (
    <>
      <button
        onClick={() => setShowHelp((v) => !v)}
        title={tip}
        data-testid="hw-bridge-indicator"
        className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border flex items-center gap-2"
        style={{ borderColor: color, color }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: color, boxShadow: status.connected ? `0 0 6px ${color}` : "none" }}
        />
        {label}
      </button>
      {showHelp && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
          onClick={() => setShowHelp(false)}
          data-testid="hw-bridge-help"
        >
          <div
            className="max-w-lg bg-[#0a0a0a] border border-neutral-700 p-6 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[#00FF41] font-mono uppercase tracking-[0.2em] text-xs mb-3">
              ASDP Bridge — Hardware connection
            </div>
            <p className="text-neutral-300 mb-3">
              The web app talks to your physical AudioSystem DSP through a
              small Python daemon running on your Mac. To start it:
            </p>
            <pre className="bg-black border border-neutral-800 p-3 text-[11px] text-[#22D3EE] overflow-x-auto mb-3">{`# in Terminal:
cd asdp_bridge
pip3 install -r requirements.txt
python3 asdp_bridge.py`}</pre>
            <p className="text-neutral-400 text-xs mb-3">
              Or build a clickable <code>ASDP-Bridge.app</code> with PyInstaller
              (one command, see <code>asdp_bridge/README.md</code>).
            </p>
            <div className="text-[10px] text-neutral-500 mb-4">
              Current status:&nbsp;
              <span style={{ color }}>{label}</span>
              &nbsp;· DSP seen: {status.dspSeen ? "yes" : "no"}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { hwBridge.connect(); setShowHelp(false); }}
                className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border border-[#00FF41] text-[#00FF41] hover:bg-[#00FF41] hover:text-black"
                data-testid="hw-bridge-retry"
              >
                Retry
              </button>
              <button
                onClick={() => setShowHelp(false)}
                className="text-[10px] font-mono uppercase tracking-[0.18em] px-3 py-1.5 border border-neutral-600 text-neutral-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HardwareBridgeIndicator;
