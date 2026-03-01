"use client";
/**
 * components/workflow/WorkflowNode.tsx
 * Custom React Flow node that renders a Velum block as a visually bold, color-coded tile.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_MAP, CATEGORY_HEADER_COLORS, type NodeCategory } from "@/lib/workflow/node-registry";

type NodeRunStatus = "pending" | "running" | "done" | "error" | "skipped";

interface WorkflowNodeData {
  type: string;
  params?: Record<string, unknown>;
  runStatus?: NodeRunStatus;
  [key: string]: unknown;
}

const STATUS_RING: Record<NodeRunStatus, string> = {
  pending: "",
  running: "ring-2 ring-yellow-400/80 ring-offset-1 ring-offset-zinc-900",
  done: "ring-2 ring-emerald-500/80 ring-offset-1 ring-offset-zinc-900",
  error: "ring-2 ring-red-500/80 ring-offset-1 ring-offset-zinc-900",
  skipped: "ring-1 ring-zinc-600/50",
};

const STATUS_DOT: Record<NodeRunStatus, string> = {
  pending: "bg-zinc-600",
  running: "bg-yellow-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-400",
  skipped: "bg-zinc-700",
};

const STATUS_LABEL: Record<NodeRunStatus, string> = {
  pending: "",
  running: "Running…",
  done: "Done",
  error: "Error",
  skipped: "Skipped",
};

const CAT_ICON: Record<string, string> = {
  Documents: "◻",
  Images: "◼",
  Banking: "◈",
  Crypto: "◉",
  Logic: "◇",
  Output: "◎",
};

// Port type abbreviations for the port labels
const PORT_TYPE_BADGE: Record<string, string> = {
  hash: "hash",
  json: "{}",
  file: "file",
  string: "str",
  number: "num",
  boolean: "bool",
  any: "any",
};

export const WorkflowNodeComponent = memo(function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const def = NODE_MAP.get(nodeData.type as string);

  if (!def) {
    return (
      <div className="bg-zinc-800 border border-red-500/40 rounded-xl px-4 py-3 min-w-[200px]">
        <p className="text-xs text-red-400">Unknown block: {nodeData.type as string}</p>
      </div>
    );
  }

  const runStatus: NodeRunStatus = (nodeData.runStatus as NodeRunStatus) ?? "pending";
  const headerColor = CATEGORY_HEADER_COLORS[def.category as NodeCategory];

  return (
    <div
      className={`relative bg-zinc-900 border rounded-2xl min-w-[210px] max-w-[260px] shadow-xl overflow-visible transition-all
        ${selected ? "border-white/30 shadow-white/10" : "border-white/10 hover:border-white/20"}
        ${STATUS_RING[runStatus]}
      `}
    >
      {/* Input handles — left side */}
      {def.inputs.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: `${((i + 1) / (def.inputs.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-zinc-700 !border-2 !border-zinc-500 hover:!bg-white hover:!border-white transition-colors !rounded-full"
          title={`${port.label} (${port.type})${port.required ? " — required" : ""}`}
        />
      ))}

      {/* Colored header band */}
      <div className={`${headerColor} rounded-t-2xl px-3 py-2.5`}>
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-base leading-none">{CAT_ICON[def.category] ?? "◈"}</span>
          <span className="text-white text-xs font-bold leading-tight tracking-wide">{def.label}</span>
        </div>
        <p className="text-white/60 text-[10px] mt-0.5 leading-tight line-clamp-1">{def.category}</p>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Description */}
        <p className="text-zinc-500 text-[10px] leading-tight line-clamp-2">{def.description}</p>

        {/* Ports section */}
        {(def.inputs.length > 0 || def.outputs.length > 0) && (
          <div className="flex gap-2">
            {/* Inputs */}
            {def.inputs.length > 0 && (
              <div className="flex-1 space-y-1">
                {def.inputs.map((port) => (
                  <div key={port.id} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
                    <span className="text-[10px] text-zinc-400 truncate flex-1">{port.label}</span>
                    {port.required && <span className="text-[9px] text-red-400/70">*</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Outputs */}
            {def.outputs.length > 0 && (
              <div className={`space-y-1 ${def.inputs.length > 0 ? "flex-1 text-right" : "flex-1"}`}>
                {def.outputs.map((port) => (
                  <div key={port.id} className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-zinc-400 truncate">{port.label}</span>
                    <span className={`text-[8px] font-mono px-0.5 rounded text-zinc-600`}>
                      {PORT_TYPE_BADGE[port.type] ?? port.type}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status bar (shown when not pending) */}
      {runStatus !== "pending" && (
        <div className="px-3 py-1.5 border-t border-white/5 rounded-b-2xl flex items-center gap-1.5 bg-zinc-900/80">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[runStatus]}`} />
          <span className={`text-[10px] font-medium ${
            runStatus === "done" ? "text-emerald-400" :
            runStatus === "error" ? "text-red-400" :
            runStatus === "running" ? "text-yellow-400" : "text-zinc-500"
          }`}>{STATUS_LABEL[runStatus]}</span>
        </div>
      )}

      {/* Output handles — right side */}
      {def.outputs.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{ top: `${((i + 1) / (def.outputs.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-400 hover:!bg-amber-400 hover:!border-amber-300 transition-colors !rounded-full"
          title={`${port.label} (${port.type})`}
        />
      ))}
    </div>
  );
});
