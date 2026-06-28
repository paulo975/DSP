import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DSPApp from "@/pages/DSPApp";

function App() {
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
