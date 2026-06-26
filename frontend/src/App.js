import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DSPApp from "@/pages/DSPApp";

function App() {
  const isPopout = typeof window !== "undefined" && window.location.hash === "#popout=meters";
  if (isPopout) {
    // Lazy-load MetersView in popout mode; reuse the existing DspProvider for state.
    const { DspProvider } = require("@/lib/dspStore");
    const MetersView = require("@/components/dsp/MetersView").default;
    return (
      <div className="App" style={{ background: "#0a0a0a", color: "#fff" }}>
        <DspProvider>
          <div className="h-screen flex flex-col">
            <div className="px-4 py-2 border-b border-neutral-800 bg-black flex items-center gap-3">
              <div className="w-5 h-5 bg-[#00B7FF] flex items-center justify-center font-mono text-black font-bold text-xs">M</div>
              <span className="text-sm font-bold text-white">Meters — Pop-out View</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500 ml-2">
                Synced via localStorage · Live audio runs in main window
              </span>
            </div>
            <div className="grow overflow-hidden">
              <MetersView />
            </div>
          </div>
        </DspProvider>
      </div>
    );
  }
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DSPApp />} />
          <Route path="*" element={<DSPApp />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
