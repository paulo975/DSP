// Scene Memory — 8 snapshot slots that capture every channel's mute / solo /
// gain (input + output) and recall them in a click. Perfect for live mixing
// scenarios: "show prep", "interlude", "main set", "applause", etc.
//
// UX choices:
//   • Empty slots show "+ Capture" CTA. Filled slots show the scene name in
//     the scene's accent colour.
//   • Clicking a filled slot RECALLS it (immediately applies all stored
//     channel states via the existing applyChannel / applyInputChannel
//     pipeline → click-free 5 ms ramps).
//   • Right-click (or long-press on touch) opens an inline overlay with
//     Rename / Overwrite / Delete actions.
//   • A subtle highlight ring marks the last-recalled scene so the operator
//     always knows the live state.
import React from "react";
import { useDsp } from "@/lib/dspStore";

const MAX_SLOTS = 8;

const SceneBar = () => {
  const { state, readOnly, createScene, recallScene, overwriteScene, renameScene, deleteScene } = useDsp();
  const scenes = state.scenes || [];
  const lastId = state.lastRecalledSceneId;
  const [editingId, setEditingId] = React.useState(null);
  const [draftName, setDraftName] = React.useState("");
  const [menuFor, setMenuFor] = React.useState(null);

  // Render exactly MAX_SLOTS cells — first N are filled, rest are empty.
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => scenes[i] || null);

  const handleCapture = (slotIdx) => {
    if (readOnly) return;
    createScene(`Scene ${slotIdx + 1}`);
  };

  const handleRecall = (scene) => {
    recallScene(scene.id);
    setMenuFor(null);
  };

  const startRename = (scene) => {
    setEditingId(scene.id);
    setDraftName(scene.name);
    setMenuFor(null);
  };

  const commitRename = () => {
    if (editingId && draftName.trim()) {
      renameScene(editingId, draftName.trim());
    }
    setEditingId(null);
  };

  return (
    <div
      className="border-b border-neutral-900 bg-[#0c0c0c] flex items-stretch h-12 select-none"
      data-testid="scene-bar"
    >
      <div className="px-3 flex items-center border-r border-neutral-900">
        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">
          Scenes
        </span>
      </div>

      {slots.map((scene, idx) => {
        if (!scene) {
          return (
            <button
              key={`empty-${idx}`}
              onClick={() => handleCapture(idx)}
              disabled={readOnly}
              data-testid={`scene-slot-empty-${idx}`}
              className="flex-1 min-w-[80px] border-r border-neutral-900 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-600 hover:bg-[#141414] hover:text-neutral-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Capture
            </button>
          );
        }

        const isLive = scene.id === lastId;

        return (
          <div
            key={scene.id}
            className="relative flex-1 min-w-[100px] border-r border-neutral-900 group"
            data-testid={`scene-slot-${scene.id}`}
          >
            {editingId === scene.id ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                data-testid={`scene-rename-input-${scene.id}`}
                className="w-full h-full bg-black border-0 px-2 text-[12px] font-bold text-white focus:outline-none focus:ring-2"
                style={{ outline: `1px solid ${scene.color}` }}
              />
            ) : (
              <button
                onClick={() => handleRecall(scene)}
                onContextMenu={(e) => { e.preventDefault(); setMenuFor(menuFor === scene.id ? null : scene.id); }}
                data-testid={`scene-recall-${scene.id}`}
                className="w-full h-full flex flex-col items-center justify-center text-[11px] font-bold uppercase tracking-[0.14em] transition-colors hover:brightness-125"
                style={{
                  background: isLive ? scene.color : `${scene.color}1f`,
                  color: isLive ? "#000" : scene.color,
                  boxShadow: isLive ? `inset 0 0 0 2px ${scene.color}` : "none",
                }}
              >
                <span className="truncate max-w-full px-2" title={scene.name}>{scene.name}</span>
                {isLive && (
                  <span className="text-[8px] font-mono tracking-[0.2em] opacity-75 mt-0.5" data-testid={`scene-live-${scene.id}`}>● LIVE</span>
                )}
              </button>
            )}

            {menuFor === scene.id && (
              <div
                className="absolute right-0 top-full mt-1 z-30 bg-[#101010] border border-neutral-700 shadow-lg w-32"
                data-testid={`scene-menu-${scene.id}`}
                onMouseLeave={() => setMenuFor(null)}
              >
                <button
                  onClick={() => { overwriteScene(scene.id); setMenuFor(null); }}
                  disabled={readOnly}
                  data-testid={`scene-overwrite-${scene.id}`}
                  className="w-full px-3 py-1.5 text-left text-[10px] font-mono uppercase tracking-[0.15em] text-neutral-300 hover:bg-[#1f1f1f] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ⊕ Overwrite
                </button>
                <button
                  onClick={() => startRename(scene)}
                  disabled={readOnly}
                  data-testid={`scene-rename-${scene.id}`}
                  className="w-full px-3 py-1.5 text-left text-[10px] font-mono uppercase tracking-[0.15em] text-neutral-300 hover:bg-[#1f1f1f] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✎ Rename
                </button>
                <button
                  onClick={() => { deleteScene(scene.id); setMenuFor(null); }}
                  disabled={readOnly}
                  data-testid={`scene-delete-${scene.id}`}
                  className="w-full px-3 py-1.5 text-left text-[10px] font-mono uppercase tracking-[0.15em] text-[#FF3B30] hover:bg-[#1f1f1f] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  🗑 Delete
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="px-3 flex items-center text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-600">
        right-click for menu
      </div>
    </div>
  );
};

export default SceneBar;
