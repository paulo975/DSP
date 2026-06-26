import React from "react";
import { useDsp } from "@/lib/dspStore";

/**
 * Yamaha-style channel selector pills row.
 * - Compact horizontal list of channels (current bank).
 * - Click selects the channel into the SelectedChannelPanel.
 * - Bank tabs above narrow down to PHY OUT or VIRT OUT.
 */
const ChannelPills = ({ selectedId, onSelect, bank, setBank }) => {
  const { state } = useDsp();

  const groups = [
    { id: "phy", label: "PHY OUT", items: state.outputs.filter((o) => o.kind === "out_phy") },
    { id: "virt", label: "DANTE VIRT OUT", items: state.outputs.filter((o) => o.kind === "out_virt") },
  ];
  const active = groups.find((g) => g.id === bank) || groups[0];

  return (
    <div className="border-b border-neutral-800 bg-black" data-testid="channel-pills">
      <div className="flex items-stretch">
        {/* Bank tabs */}
        <div className="flex items-stretch border-r border-neutral-800">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setBank(g.id)}
              data-testid={`pill-bank-${g.id}`}
              className="px-4 text-[10px] font-mono uppercase tracking-[0.18em] border-b-2 transition-colors"
              style={{
                borderColor: bank === g.id ? "#00B7FF" : "transparent",
                color: bank === g.id ? "#fff" : "#777",
                background: bank === g.id ? "#0f0f0f" : "transparent",
              }}
            >
              {g.label} · {g.items.length}
            </button>
          ))}
        </div>

        {/* Channel pills */}
        <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto grow">
          {active.items.map((o) => {
            const isSelected = o.id === selectedId;
            const muted = o.mute;
            const tip = o.description ? `${o.name} — ${o.description}` : o.name;
            return (
              <button
                key={o.id}
                onClick={() => onSelect(o.id)}
                data-testid={`pill-${o.id}`}
                title={tip}
                className="shrink-0 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.1em] border transition-colors min-w-[64px] flex flex-col items-center leading-tight"
                style={{
                  background: isSelected ? "#00B7FF" : muted ? "#2a0a0a" : "#0f0f0f",
                  color: isSelected ? "#000" : muted ? "#FF3B30" : "#fff",
                  borderColor: isSelected ? "#00B7FF" : muted ? "#FF3B30" : "#2a2a2a",
                }}
              >
                <span>{o.name}</span>
                {o.description && (
                  <span
                    className="text-[8px] font-normal normal-case tracking-normal truncate w-full mt-0.5"
                    style={{ color: isSelected ? "#001a2a" : "#999" }}
                    data-testid={`pill-${o.id}-desc`}
                  >
                    {o.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChannelPills;
