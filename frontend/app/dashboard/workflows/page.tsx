"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import {
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  listWorkflows,
  createWorkflow,
  deleteWorkflow,
  type WorkflowMeta,
} from "@/lib/workflow/storage";
import {
  IconGitBranch,
  IconPlus,
  IconTrash,
  IconArrowRight,
  IconClockHour4,
} from "@tabler/icons-react";

const SIDEBAR_WIDTH = "calc(var(--spacing) * 72)";

function PageLayout({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <div
      className="flex flex-col flex-1 min-h-svh transition-[margin-left] duration-200 ease-linear"
      style={{ marginLeft: open ? SIDEBAR_WIDTH : "0px" }}
    >
      {children}
    </div>
  );
}

function WorkflowsContent() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    setWorkflows(listWorkflows());
  }, []);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const wf = createWorkflow(name);
    setNewName("");
    setCreating(false);
    router.push(`/dashboard/workflows/${wf.id}/edit`);
  }

  function handleDelete(id: string) {
    deleteWorkflow(id);
    setWorkflows(listWorkflows());
    setDeleteTarget(null);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full">
      {/* Header row */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Workflows</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Build and manage your loan approval pipelines.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <IconPlus size={16} />
          New Workflow
        </button>
      </div>

      {/* Create modal */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreating(false);
          }}
        >
          <div
            className="rounded-xl border border-zinc-800 p-6 w-full max-w-md shadow-2xl"
            style={{ background: "#0a0a0a" }}
          >
            <h3 className="text-lg font-semibold text-white mb-1">
              Name your workflow
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Give your workflow a descriptive name to find it later.
            </p>
            <input
              autoFocus
              className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 mb-4"
              placeholder="e.g. Personal Loan Approval"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Create &amp; Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            className="rounded-xl border border-zinc-800 p-6 w-full max-w-sm shadow-2xl"
            style={{ background: "#0a0a0a" }}
          >
            <h3 className="text-lg font-semibold text-white mb-1">
              Delete workflow?
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {workflows.length === 0 && (
        <div
          className="rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center py-20 text-center"
        >
          <IconGitBranch size={40} className="text-zinc-600 mb-4" />
          <p className="text-white font-medium mb-1">No workflows yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Create your first workflow to get started.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <IconPlus size={16} />
            New Workflow
          </button>
        </div>
      )}

      {/* Workflow grid */}
      {workflows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="group relative rounded-xl border border-zinc-800 p-5 flex flex-col gap-4 hover:border-zinc-600 transition-colors"
              style={{ background: "#0a0a0a" }}
            >
              {/* Icon + name */}
              <div className="flex items-start gap-3">
                <div
                  className="rounded-lg p-2 shrink-0"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <IconGitBranch size={18} className="text-zinc-300" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{wf.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <IconClockHour4 size={11} />
                    {formatDate(wf.updatedAt)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto">
                <Link
                  href={`/dashboard/workflows/${wf.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  Open Editor
                  <IconArrowRight size={12} />
                </Link>
                <button
                  onClick={() => setDeleteTarget(wf.id)}
                  className="rounded-lg border border-zinc-700 p-1.5 text-zinc-500 hover:border-red-800 hover:text-red-400 transition-colors"
                  aria-label="Delete workflow"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* "+ New" card */}
          <button
            onClick={() => setCreating(true)}
            className="rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center gap-2 py-10 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <IconPlus size={22} />
            <span className="text-sm">New Workflow</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const { user, signOut } = useAuth();
  const displayUser = {
    name: user?.user_metadata?.full_name ?? user?.email ?? "User",
    email: user?.email ?? "",
    avatar: user?.user_metadata?.avatar_url,
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": SIDEBAR_WIDTH,
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={displayUser} onSignOut={signOut} />
      <PageLayout>
        <SiteHeader title="Workflows" />
        <WorkflowsContent />
      </PageLayout>
    </SidebarProvider>
  );
}
