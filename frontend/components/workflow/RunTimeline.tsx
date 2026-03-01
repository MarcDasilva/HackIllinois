"use client";
/**
 * components/workflow/RunTimeline.tsx
 * Bottom panel showing execution timeline and logs for a workflow run.
 */

import { NODE_MAP } from "@/lib/workflow/node-registry";
import type { NodeRunResult } from "@/lib/workflow/types";

interface Props {
  nodeResults: NodeRunResult[];
  runStatus: "idle" | "running" | "done" | "error";
  totalDuration?: number;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "text-zinc-500",
  running: "text-yellow-400",
  done: "text-emerald-400",
  error: "text-red-400",
  skipped: "text-zinc-600",
};

const STATUS_BG: Record<string, string> = {
  pending: "bg-zinc-700",
  running: "bg-yellow-400 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-red-500",
  skipped: "bg-zinc-700",
};

export function RunTimeline({ nodeResults, runStatus, totalDuration, onClose }: Props) {
  if (nodeResults.length === 0 && runStatus === "idle") return null;

  return (
    <div className="border-t border-white/8 bg-zinc-950 flex flex-col" style={{ height: 220 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-300">Run Timeline</span>
          {runStatus === "running" && (
            <span className="flex items-center gap-1.5 text-[11px] text-yellow-400">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Running…
            </span>
          )}
          {runStatus === "done" && (
            <span className="text-[11px] text-emerald-400">
              ✓ Completed{totalDuration ? ` in ${(totalDuration / 1000).toFixed(1)}s` : ""}
            </span>
          )}
          {runStatus === "error" && (
            <span className="text-[11px] text-red-400">✗ Finished with errors</span>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-white text-xs">✕</button>
      </div>

      {/* Timeline rows */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {runStatus === "running" && nodeResults.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-zinc-600">Starting execution…</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-zinc-600">
                <th className="text-left px-4 py-1.5 font-medium w-6">#</th>
                <th className="text-left px-2 py-1.5 font-medium">Node</th>
                <th className="text-left px-2 py-1.5 font-medium w-20">Status</th>
                <th className="text-left px-2 py-1.5 font-medium w-16">Duration</th>
                <th className="text-left px-2 py-1.5 font-medium">Output Preview</th>
                <th className="text-left px-2 py-1.5 font-medium">Logs</th>
              </tr>
            </thead>
            <tbody>
              {nodeResults.map((nr, i) => {
                const def = NODE_MAP.get(nr.nodeType);
                const outputPreview = Object.entries(nr.output)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 30)}`)
                  .join(" | ");
                const lastLog = nr.logs[nr.logs.length - 1] ?? "";
                return (
                  <tr key={nr.nodeId} className="border-b border-white/5 hover:bg-white/2">
                    <td className="px-4 py-1.5 text-zinc-600">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_BG[nr.status]}`} />
                        <span className="text-zinc-200 font-medium">{def?.label ?? nr.nodeType}</span>
                      </div>
                    </td>
                    <td className={`px-2 py-1.5 font-medium ${STATUS_COLOR[nr.status]}`}>{nr.status}</td>
                    <td className="px-2 py-1.5 text-zinc-500 font-mono">
                      {nr.durationMs > 0 ? `${nr.durationMs}ms` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-500 font-mono max-w-xs">
                      {nr.status === "error" ? (
                        <span className="text-red-400">{nr.error?.slice(0, 60)}</span>
                      ) : (
                        <span className="truncate block">{outputPreview || "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-600 font-mono max-w-xs">
                      <span className="truncate block">{lastLog}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
