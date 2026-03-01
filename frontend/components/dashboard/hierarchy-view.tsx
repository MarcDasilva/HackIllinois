"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/lib/auth/auth-provider";
import { DriveFolderSettingsPanel } from "@/components/dashboard/drive-folder-settings-panel";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFolder = { id: string; name: string; children: DriveFolder[] };

async function fetchSubfolders(
  folderId: string,
  token: string
): Promise<DriveFolder[]> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const fields = encodeURIComponent("files(id,name)");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const files = json.files ?? [];
  return files.map((f: { id: string; name: string }) => ({
    id: f.id,
    name: f.name,
    children: [],
  }));
}

async function buildFolderTree(
  folderId: string,
  name: string,
  token: string
): Promise<DriveFolder> {
  const children = await fetchSubfolders(folderId, token);
  const withChildren = await Promise.all(
    children.map((c) => buildFolderTree(c.id, c.name, token))
  );
  return { id: folderId, name, children: withChildren };
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
const LEVEL_GAP = 220;
const SIBLING_GAP = 80;

function treeToLayout(
  root: DriveFolder,
  startX: number,
  startY: number
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function walk(
    folder: DriveFolder,
    x: number,
    y: number
  ): number {
    const nodeId = folder.id;
    nodes.push({
      id: nodeId,
      type: "default",
      position: { x, y },
      data: { label: folder.name },
      style: {
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
      },
    });
    if (folder.children.length === 0) return y + SIBLING_GAP;
    const childCount = folder.children.length;
    const totalWidth = (childCount - 1) * SIBLING_GAP;
    let childY = y - totalWidth / 2;
    for (const child of folder.children) {
      const nextX = x + LEVEL_GAP;
      edges.push({ id: `${nodeId}-${child.id}`, source: nodeId, target: child.id });
      childY = walk(child, nextX, childY) + SIBLING_GAP;
    }
    return childY;
  }

  walk(root, startX, startY);
  return { nodes, edges };
}

function HierarchyFlowInner() {
  const { providerToken } = useAuth();
  const [rootFolders, setRootFolders] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("root");
  const [selectedFolderName, setSelectedFolderName] = useState<string>("My Drive");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [settingsFolder, setSettingsFolder] = useState<{ id: string; name: string } | null>(null);

  const loadRootFolders = useCallback(async () => {
    if (!providerToken) return;
    try {
      const list = await fetchSubfolders("root", providerToken);
      setRootFolders(list);
    } catch {
      setRootFolders([]);
    }
  }, [providerToken]);

  useEffect(() => {
    loadRootFolders();
  }, [loadRootFolders]);

  const loadHierarchy = useCallback(async () => {
    if (!providerToken) return;
    setLoading(true);
    setError(null);
    try {
      const root =
        selectedFolderId === "root"
          ? { id: "root", name: "My Drive", children: await fetchSubfolders("root", providerToken) }
          : await buildFolderTree(
              selectedFolderId,
              selectedFolderName,
              providerToken
            );
      const withChildren = await Promise.all(
        root.children.map((c) => buildFolderTree(c.id, c.name, providerToken))
      );
      const fullRoot: DriveFolder = { ...root, children: withChildren };
      const { nodes: nextNodes, edges: nextEdges } = treeToLayout(
        fullRoot,
        40,
        200
      );
      setNodes(nextNodes);
      setEdges(nextEdges);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hierarchy");
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  }, [
    providerToken,
    selectedFolderId,
    selectedFolderName,
    setNodes,
    setEdges,
  ]);

  useEffect(() => {
    if (providerToken && selectedFolderId) loadHierarchy();
  }, [providerToken, selectedFolderId, selectedFolderName, loadHierarchy]);

  if (!providerToken) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p className="text-sm">Sign in with Google to view Drive hierarchy.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-3 p-3 border-b shrink-0">
        <label htmlFor="hierarchy-folder" className="text-sm font-medium text-muted-foreground">
          Folder
        </label>
        <select
          id="hierarchy-folder"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-[200px]"
          value={selectedFolderId}
          onChange={(e) => {
            const opt = e.target.selectedOptions?.[0];
            setSelectedFolderId(e.target.value);
            setSelectedFolderName(opt?.text ?? "My Drive");
          }}
        >
          <option value="root">My Drive</option>
          {rootFolders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {loading && <span className="text-muted-foreground text-sm">Loading…</span>}
      </div>
      <div className="flex-1 min-h-0 w-full">
        <ReactFlow
          colorMode="dark"
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_e, node) => {
            const label = typeof node.data?.label === "string" ? node.data.label : "Folder";
            setSettingsFolder({ id: node.id, name: label });
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      {settingsFolder && (
        <DriveFolderSettingsPanel
          open={!!settingsFolder}
          onOpenChange={(open) => !open && setSettingsFolder(null)}
          driveFolderId={settingsFolder.id}
          driveFolderName={settingsFolder.name}
        />
      )}
    </div>
  );
}

export function HierarchyView() {
  return (
    <ReactFlowProvider>
      <HierarchyFlowInner />
    </ReactFlowProvider>
  );
}
