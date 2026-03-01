"use client";

/**
 * app/dashboard/workflows/[id]/edit/page.tsx
 *
 * Full React Flow workflow editor.
 * No sidebar — full-screen 3-column layout:
 *   Left: block library | Center: canvas | Right: node inspector
 * Top bar: breadcrumb, editable name, save status, Import/Export, Run.
 * Wallet setup only appears inside NodeInspector when a Crypto node is selected.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAuth } from "@/lib/auth/auth-provider";
import { WorkflowNodeComponent } from "@/components/workflow/WorkflowNode";
import { BlockLibrary } from "@/components/workflow/BlockLibrary";
import { NodeInspector } from "@/components/workflow/NodeInspector";
import { RunTimeline } from "@/components/workflow/RunTimeline";
import { NODE_MAP } from "@/lib/workflow/node-registry";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { NodeRunResult } from "@/lib/workflow/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowData {
  id: string;
  name: string;
  template: string;
  nodes_json: string;
  edges_json: string;
}

type RunStatus = "idle" | "running" | "done" | "error";

const NODE_TYPES = { workflowNode: WorkflowNodeComponent };

// ─── Editor page ──────────────────────────────────────────────────────────────

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { signOut } = useAuth();

  // ── Workflow meta ──────────────────────────────────────────────────────────
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");

  // ── Wallet pubkey (set from NodeInspector when a Crypto node is configured) ─
  const [walletPubkey, setWalletPubkey] = useState("");

  // ── React Flow state ───────────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null);

  // ── Selection & inspector ──────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ── Run state ──────────────────────────────────────────────────────────────
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [nodeResults, setNodeResults] = useState<NodeRunResult[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runStart, setRunStart] = useState<number>(0);

  // ── Load workflow ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    apiGet<WorkflowData>(`/workflows/${id}`)
      .then((wf) => {
        setWorkflow(wf);
        setWorkflowName(wf.name);
        const loadedNodes = (JSON.parse(wf.nodes_json || "[]") as Node[]).map((n) => ({
          ...n,
          type: "workflowNode",
        }));
        const loadedEdges = JSON.parse(wf.edges_json || "[]") as Edge[];
        setNodes(loadedNodes);
        setEdges(loadedEdges);
      })
      .catch(() => router.push("/dashboard/workflows"));
  }, [id, setNodes, setEdges, router]);

  // ── Auto-save (debounced 1.2s) ─────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      const nodes_json = JSON.stringify(
        nodes.map((n) => ({ id: n.id, type: n.data.type ?? n.type, position: n.position, data: n.data }))
      );
      const edges_json = JSON.stringify(edges);
      try {
        await apiPatch(`/workflows/${id}`, { nodes_json, edges_json });
      } catch { /* ignore save errors silently */ }
      setSaveStatus("saved");
    }, 1200);
  }, [nodes, edges, id]);

  useEffect(() => {
    if (workflow) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── Add node from library ──────────────────────────────────────────────────
  function addNodeOfType(type: string, position?: { x: number; y: number }) {
    const def = NODE_MAP.get(type);
    if (!def) return;

    const defaultParams: Record<string, unknown> = {};
    for (const p of def.params) {
      if (p.default !== undefined) defaultParams[p.id] = p.default;
    }
    // Pre-fill wallet pubkey if already set
    if (walletPubkey && (type === "WalletConnect" || type === "WriteAttestation")) {
      defaultParams.mockPubkey = walletPubkey;
    }

    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pos = position ?? { x: 200 + Math.random() * 200, y: 200 + Math.random() * 100 };

    const newNode: Node = {
      id: nodeId,
      type: "workflowNode",
      position: pos,
      data: { type, label: def.label, params: defaultParams },
    };
    setNodes((prev) => [...prev, newNode]);
  }

  // ── Drop from drag ─────────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/workflow-node-type");
    if (!type || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = reactFlowInstance?.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    }) ?? { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
    addNodeOfType(type, position);
  }

  // ── Connect edges ──────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({
      ...connection,
      animated: true,
      style: { stroke: "#f59e0b", strokeWidth: 2 },
    }, eds)),
    [setEdges]
  );

  // ── Update node param ──────────────────────────────────────────────────────
  function handleParamChange(nodeId: string, paramId: string, value: unknown) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, params: { ...(n.data.params as Record<string, unknown> ?? {}), [paramId]: value } } }
          : n
      )
    );
  }

  // ── Run workflow ───────────────────────────────────────────────────────────
  async function handleRun() {
    if (runStatus === "running") return;

    const nodes_json = JSON.stringify(
      nodes.map((n) => ({ id: n.id, type: n.data.type ?? n.type, position: n.position, data: n.data }))
    );
    const edges_json = JSON.stringify(edges);
    try { await apiPatch(`/workflows/${id}`, { nodes_json, edges_json }); } catch { /* ignore */ }

    setRunStatus("running");
    setNodeResults([]);
    setShowTimeline(true);
    setRunError(null);
    setRunStart(Date.now());
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, runStatus: "pending" } })));

    try {
      const data = await apiPost<{ nodeResults?: NodeRunResult[]; error?: string }>(`/workflows/${id}/run`);
      const results: NodeRunResult[] = data.nodeResults ?? [];
      setNodeResults(results);

      const statusMap = new Map(results.map((r) => [r.nodeId, r.status]));
      setNodes((prev) =>
        prev.map((n) => ({ ...n, data: { ...n.data, runStatus: statusMap.get(n.id) ?? "pending" } }))
      );
      setRunStatus(results.some((r) => r.status === "error") ? "error" : "done");
    } catch (err) {
      setRunStatus("error");
      setRunError(String(err));
    }
  }

  // ── Export / Import ────────────────────────────────────────────────────────
  function handleExport() {
    const payload = {
      name: workflowName,
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.type ?? n.type, position: n.position, data: n.data })),
      edges,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const payload = JSON.parse(text) as { nodes?: Node[]; edges?: Edge[]; name?: string };
        if (payload.nodes) setNodes(payload.nodes.map((n) => ({ ...n, type: "workflowNode" })));
        if (payload.edges) setEdges(payload.edges);
        if (payload.name) setWorkflowName(payload.name);
      } catch {
        alert("Invalid workflow JSON.");
      }
    };
    input.click();
  }

  // ── Save name ──────────────────────────────────────────────────────────────
  async function saveName() {
    setEditingName(false);
    if (!workflowName.trim()) return;
    try { await apiPatch(`/workflows/${id}`, { name: workflowName.trim() }); } catch { /* ignore */ }
  }

  // ── Selected node ──────────────────────────────────────────────────────────
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodeResult = nodeResults.find((r) => r.nodeId === selectedNodeId) ?? null;

  if (!workflow) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading editor…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/8 bg-zinc-950 shrink-0">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push("/dashboard/workflows")}
          className="text-zinc-500 hover:text-white text-xs transition-colors"
        >
          ← Workflows
        </button>
        <span className="text-zinc-700">/</span>

        {/* Workflow name */}
        {editingName ? (
          <input
            autoFocus
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="bg-transparent border-b border-white/20 text-sm text-white focus:outline-none min-w-[120px]"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm font-semibold text-white hover:text-zinc-300 transition-colors truncate max-w-[200px]"
            title="Click to rename"
          >
            {workflowName}
          </button>
        )}

        {/* Save status */}
        <span className={`text-[10px] ${
          saveStatus === "saved" ? "text-zinc-600" :
          saveStatus === "saving" ? "text-yellow-500" : "text-orange-400"
        }`}>
          {saveStatus === "saved" ? "● Saved" : saveStatus === "saving" ? "● Saving…" : "● Unsaved"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleImport}
            className="text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5"
          >
            Import
          </button>
          <button
            onClick={handleExport}
            className="text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5"
          >
            Export
          </button>
          <button
            onClick={handleRun}
            disabled={runStatus === "running" || nodes.length === 0}
            className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors ${
              runStatus === "running"
                ? "bg-yellow-500/20 text-yellow-400 cursor-wait"
                : "bg-amber-400 text-zinc-900 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {runStatus === "running" ? (
              <><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> Running…</>
            ) : "▶ Run"}
          </button>
          <button
            onClick={signOut}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-1"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {runStatus === "error" && runError && (
        <div className="flex items-center gap-3 px-4 py-2 bg-red-900/20 border-b border-red-500/20 shrink-0">
          <span className="text-red-400 text-xs">✗ {runError}</span>
          <button
            onClick={() => { setRunStatus("idle"); setRunError(null); }}
            className="ml-auto text-xs text-red-400 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main 3-column layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Block library */}
        <BlockLibrary onAddNode={addNodeOfType} />

        {/* Center: Canvas + timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={reactFlowWrapper}
            className="flex-1 bg-zinc-950"
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={(inst) => setReactFlowInstance(inst)}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              nodeTypes={NODE_TYPES}
              fitView
              deleteKeyCode="Backspace"
              defaultEdgeOptions={{ animated: true, style: { stroke: "#f59e0b", strokeWidth: 2 } }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
              <Controls className="[&_button]:bg-zinc-800 [&_button]:border-zinc-700 [&_button]:text-zinc-300" />
              <MiniMap
                nodeColor={(n) => {
                  const def = NODE_MAP.get((n.data as { type?: string }).type ?? "");
                  const colors: Record<string, string> = {
                    Documents: "#3b82f6",
                    Images: "#a855f7",
                    Banking: "#10b981",
                    Crypto: "#8b5cf6",
                    Logic: "#f59e0b",
                    Output: "#ef4444",
                  };
                  return def ? (colors[def.category] ?? "#6b7280") : "#6b7280";
                }}
                style={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.06)" }}
              />
              {nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="mt-24 text-center pointer-events-none">
                    <p className="text-zinc-600 text-sm">Drag blocks from the left panel onto the canvas</p>
                    <p className="text-zinc-700 text-xs mt-1">or click a block to add it at the center</p>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* Bottom: Run timeline */}
          {showTimeline && (
            <RunTimeline
              nodeResults={nodeResults}
              runStatus={runStatus}
              totalDuration={runStatus !== "running" ? Date.now() - runStart : undefined}
              onClose={() => setShowTimeline(false)}
            />
          )}
        </div>

        {/* Right: Node inspector */}
        <NodeInspector
          node={selectedNode as { id: string; type: string; data: { params?: Record<string, unknown>; [key: string]: unknown } } | null}
          runResult={selectedNodeResult}
          onParamChange={handleParamChange}
          onClose={() => setSelectedNodeId(null)}
          walletPubkey={walletPubkey}
          onWalletChange={setWalletPubkey}
        />
      </div>
    </div>
  );
}
