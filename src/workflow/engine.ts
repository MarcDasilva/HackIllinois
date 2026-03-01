/**
 * src/workflow/engine.ts
 *
 * Workflow execution engine — runs on the backend.
 * Topological sort (Kahn's) + per-node execution with output propagation.
 */

import { NODE_MAP } from "./node-registry";

export interface WorkflowNode {
  id: string;
  type: string;
  data: {
    params?: Record<string, unknown>;
    [key: string]: unknown;
  };
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export type NodeRunStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface NodeRunResult {
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  logs: string[];
  output: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface RunResult {
  status: "done" | "error";
  nodeResults: NodeRunResult[];
  finalOutput: Record<string, unknown>;
  error?: string;
}

// ─── Topological sort (Kahn's algorithm) ─────────────────────────────────────

export function topoSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): { order: string[]; hasCycle: boolean } {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }

  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const neighbor of adj.get(cur) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return { order, hasCycle: order.length !== nodes.length };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string[] {
  const errors: string[] = [];
  const { hasCycle } = topoSort(nodes, edges);
  if (hasCycle) {
    errors.push("Workflow contains a cycle — remove the circular connection.");
  }

  const connectedTargets = new Set(edges.map((e) => `${e.target}:${e.targetHandle}`));
  for (const node of nodes) {
    const def = NODE_MAP.get(node.type);
    if (!def) continue;
    for (const port of def.inputs) {
      if (port.required && !connectedTargets.has(`${node.id}:${port.id}`)) {
        errors.push(
          `Node "${def.label}" (${node.id.slice(0, 8)}): required input "${port.label}" is not connected.`
        );
      }
    }
  }

  return errors;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Promise<RunResult> {
  const { order, hasCycle } = topoSort(nodes, edges);

  if (hasCycle) {
    return { status: "error", nodeResults: [], finalOutput: {}, error: "Cycle detected." };
  }

  const nodeMap = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  const nodeResults: NodeRunResult[] = [];

  const inputEdges = new Map<string, Array<{ from: string; fromHandle: string; toHandle: string }>>();
  for (const e of edges) {
    if (!inputEdges.has(e.target)) inputEdges.set(e.target, []);
    inputEdges.get(e.target)!.push({ from: e.source, fromHandle: e.sourceHandle, toHandle: e.targetHandle });
  }

  let finalOutput: Record<string, unknown> = {};

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const def = NODE_MAP.get(node.type);

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const logs: string[] = [];

    if (!def) {
      const result: NodeRunResult = {
        nodeId, nodeType: node.type, status: "error",
        logs: [`Unknown node type: ${node.type}`],
        output: {}, error: `Unknown node type: ${node.type}`,
        startedAt, finishedAt: new Date().toISOString(), durationMs: 0,
      };
      nodeResults.push(result);
      continue;
    }

    logs.push(`Starting ${def.label}…`);

    const inputs: Record<string, unknown> = {};
    for (const edge of inputEdges.get(nodeId) ?? []) {
      const sourceOutput = nodeOutputs.get(edge.from) ?? {};
      inputs[edge.toHandle] = sourceOutput[edge.fromHandle];
    }

    try {
      const params = node.data?.params ?? {};
      const output = await def.run(inputs, params as Record<string, unknown>);
      nodeOutputs.set(nodeId, output);
      finalOutput = { ...finalOutput, ...output };
      logs.push(`Completed in ${Date.now() - startMs}ms`);
      for (const [k, v] of Object.entries(output)) {
        const preview = typeof v === "string" ? v.slice(0, 80) : JSON.stringify(v)?.slice(0, 80);
        logs.push(`  → ${k}: ${preview}`);
      }
      nodeResults.push({
        nodeId, nodeType: node.type, status: "done", logs, output,
        startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startMs,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logs.push(`Error: ${errorMsg}`);
      nodeResults.push({
        nodeId, nodeType: node.type, status: "error", logs, output: {}, error: errorMsg,
        startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startMs,
      });
    }
  }

  const hasError = nodeResults.some((r) => r.status === "error");
  return { status: hasError ? "error" : "done", nodeResults, finalOutput };
}
