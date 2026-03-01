"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { TEMPLATES } from "@/lib/workflow/templates";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

interface Workflow {
  id: string;
  name: string;
  template: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_ICONS: Record<string, string> = {
  blank: "□",
  "document-verify": "◉",
};

const TEMPLATE_COLORS: Record<string, string> = {
  blank: "from-zinc-800 to-zinc-900",
  "document-verify": "from-blue-900/60 to-zinc-900",
};

export default function WorkflowsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTemplate, setCreateTemplate] = useState("blank");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Workflow[]>("/workflows");
      setWorkflows(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  useEffect(() => {
    if (showCreate) setTimeout(() => nameInputRef.current?.focus(), 80);
  }, [showCreate]);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const wf = await apiPost<Workflow>("/workflows", {
        name: createName.trim(),
        template: createTemplate,
      });
      router.push(`/dashboard/workflows/${wf.id}/edit`);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDelete(`/workflows/${id}`);
    } catch { /* ignore */ }
    setDeleteId(null);
    fetchWorkflows();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top nav */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b border-white/8 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold text-lg tracking-tight">Velum</span>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-300 text-sm font-medium">Workflows</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 hidden sm:block">{displayName}</span>
          <button
            onClick={signOut}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Build verifiable attestation flows with drag-and-drop blocks.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3">
            <span className="text-red-400 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-xs text-red-400 hover:text-red-300">Dismiss</button>
          </div>
        )}

        {/* Workflow grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-xl bg-zinc-900 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="text-6xl mb-6 opacity-10">◈</div>
            <p className="text-zinc-400 text-sm mb-2">No workflows yet.</p>
            <p className="text-zinc-600 text-xs mb-8">Click the + button in the corner to create one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className={`relative group rounded-xl border border-white/10 bg-gradient-to-br ${TEMPLATE_COLORS[wf.template] ?? TEMPLATE_COLORS.blank} p-5 cursor-pointer hover:border-white/25 hover:shadow-lg transition-all`}
                onClick={() => router.push(`/dashboard/workflows/${wf.id}/edit`)}
              >
                <div className="text-3xl mb-3 opacity-50">{TEMPLATE_ICONS[wf.template] ?? "◈"}</div>
                <h3 className="font-semibold text-white text-sm truncate">{wf.name}</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  {TEMPLATES.find((t) => t.name === wf.template)?.label ?? "Custom"} &middot; {formatDate(wf.updated_at)}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteId(wf.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all text-xs px-2 py-1 rounded hover:bg-red-500/10"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Golden FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-8 right-8 z-30 w-14 h-14 rounded-full bg-amber-400 hover:bg-amber-300 text-zinc-900 text-2xl font-bold shadow-2xl shadow-amber-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Create workflow"
      >
        +
      </button>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">New Workflow</h2>
            <p className="text-xs text-zinc-400 mb-5">Give your workflow a name and choose a starting template.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Workflow Name</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g. Income Verification Flow"
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-2">Template</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setCreateTemplate(t.name)}
                      className={`text-left rounded-lg border p-3 transition-all ${
                        createTemplate === t.name
                          ? "border-amber-400/60 bg-amber-400/5"
                          : "border-white/10 bg-zinc-800/50 hover:border-white/20"
                      }`}
                    >
                      <div className="text-lg mb-1">{TEMPLATE_ICONS[t.name] ?? "◈"}</div>
                      <div className="text-xs font-medium text-white">{t.label}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 leading-tight line-clamp-2">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-white rounded-lg border border-white/10 hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createName.trim() || creating}
                  className="flex-1 py-2.5 text-sm font-semibold bg-amber-400 text-zinc-900 rounded-lg hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? "Creating…" : "Create →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-2">Delete workflow?</h2>
            <p className="text-sm text-zinc-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 text-sm rounded-lg border border-white/10 text-zinc-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
