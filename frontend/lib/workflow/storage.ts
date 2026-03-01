// lib/workflow/storage.ts
// Simple localStorage-backed workflow persistence

export interface WorkflowMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  params: Record<string, string>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow extends WorkflowMeta {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const STORAGE_KEY = "velum_workflows";

function readAll(): Workflow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(workflows: Workflow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
}

export function listWorkflows(): WorkflowMeta[] {
  return readAll().map(({ id, name, createdAt, updatedAt }) => ({
    id,
    name,
    createdAt,
    updatedAt,
  }));
}

export function getWorkflow(id: string): Workflow | null {
  return readAll().find((w) => w.id === id) ?? null;
}

export function createWorkflow(name: string): Workflow {
  const now = new Date().toISOString();
  const workflow: Workflow = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
  };
  const all = readAll();
  writeAll([...all, workflow]);
  return workflow;
}

export function saveWorkflow(workflow: Workflow): void {
  const all = readAll();
  const idx = all.findIndex((w) => w.id === workflow.id);
  const updated = { ...workflow, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.push(updated);
  }
  writeAll(all);
}

export function deleteWorkflow(id: string): void {
  writeAll(readAll().filter((w) => w.id !== id));
}
