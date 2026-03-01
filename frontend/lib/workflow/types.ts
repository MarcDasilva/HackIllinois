/**
 * lib/workflow/types.ts
 *
 * Shared types for workflow graph nodes/edges and run results (used by frontend
 * UI components). The actual engine lives on the backend (src/workflow/engine.ts).
 */

// ─── Graph types (mirrors ReactFlow node/edge shape) ──────────────────────────

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { params: Record<string, unknown> };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

// ─── Run result types ─────────────────────────────────────────────────────────

export type NodeRunStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface NodeRunResult {
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs: number;
  output: Record<string, unknown>;
  logs: string[];
  error?: string;
}

export interface WorkflowRunResult {
  status: "done" | "error";
  nodeResults: NodeRunResult[];
}
