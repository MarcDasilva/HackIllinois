"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  IconFile,
  IconFileTypePdf,
  IconFileTypeDocx,
  IconPhoto,
  IconTrash,
  IconUpload,
  IconX,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = "calc(var(--spacing) * 72)";
const STORAGE_KEY = "velum_minted_documents";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MintedDocument {
  id: string;
  name: string;
  type: string;      // MIME type
  ext: string;       // e.g. "pdf"
  size: number;      // bytes
  mintedAt: string;  // ISO date
  dataUrl: string;   // base64 data URL
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readDocs(): MintedDocument[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveDocs(docs: MintedDocument[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "text/plain": "txt",
    "text/csv": "csv",
  };
  return map[mime] ?? mime.split("/").pop() ?? "bin";
}

function DocIcon({ ext, size = 20 }: { ext: string; size?: number }) {
  const cls = `shrink-0`;
  if (ext === "pdf") return <IconFileTypePdf size={size} className={cls} style={{ color: "#f87171" }} />;
  if (ext === "docx" || ext === "doc") return <IconFileTypeDocx size={size} className={cls} style={{ color: "#60a5fa" }} />;
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
    return <IconPhoto size={size} className={cls} style={{ color: "#a78bfa" }} />;
  return <IconFile size={size} className={cls} style={{ color: "#9ca3af" }} />;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: "success" | "error" | "warn";
  message: string;
}

function ToastBanner({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const bg =
          t.type === "success"
            ? "rgba(16,185,129,0.15)"
            : t.type === "error"
            ? "rgba(239,68,68,0.15)"
            : "rgba(234,179,8,0.15)";
        const border =
          t.type === "success"
            ? "rgba(16,185,129,0.4)"
            : t.type === "error"
            ? "rgba(239,68,68,0.4)"
            : "rgba(234,179,8,0.4)";
        const Icon =
          t.type === "success" ? IconCheck : t.type === "error" ? IconX : IconAlertTriangle;
        const iconColor =
          t.type === "success" ? "#10b981" : t.type === "error" ? "#ef4444" : "#eab308";
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
            style={{
              background: bg,
              border: `1px solid ${border}`,
              color: "#e5e7eb",
              minWidth: 280,
            }}
          >
            <Icon size={16} style={{ color: iconColor }} className="shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              className="shrink-0 opacity-60 hover:opacity-100"
              onClick={() => dismiss(t.id)}
            >
              <IconX size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({
  doc,
  onConfirm,
  onCancel,
}: {
  doc: MintedDocument;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl p-6 flex flex-col gap-5"
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(239,68,68,0.12)" }}
          >
            <IconTrash size={18} style={{ color: "#ef4444" }} />
          </div>
          <div>
            <p className="font-semibold text-white">Delete document?</p>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              &ldquo;{doc.name}&rdquo; will be permanently removed from the document vault.
            </p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "#ef4444", color: "#fff" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onMint }: { onMint: (doc: MintedDocument) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [minting, setMinting] = useState(false);

  const ACCEPTED = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "text/plain",
    "text/csv",
  ];

  async function processFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      return { error: `Unsupported type: ${file.type || file.name}` };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: "File exceeds 10 MB limit" };
    }
    return new Promise<{ doc?: MintedDocument; error?: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const ext = extFromMime(file.type);
        const doc: MintedDocument = {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          ext,
          size: file.size,
          mintedAt: new Date().toISOString(),
          dataUrl,
        };
        resolve({ doc });
      };
      reader.onerror = () => resolve({ error: "Failed to read file" });
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setMinting(true);
    for (const file of Array.from(files)) {
      const result = await processFile(file);
      if (result.doc) {
        onMint(result.doc);
      }
    }
    setMinting(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-4 rounded-2xl p-10 transition-all cursor-pointer select-none"
      style={{
        border: `2px dashed ${draggingOver ? "#b8a060" : "rgba(255,255,255,0.15)"}`,
        background: draggingOver ? "rgba(184,160,96,0.05)" : "rgba(255,255,255,0.02)",
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
      onDragLeave={() => setDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        className="flex items-center justify-center w-14 h-14 rounded-2xl"
        style={{ background: "rgba(184,160,96,0.1)", border: "1px solid rgba(184,160,96,0.25)" }}
      >
        {minting ? (
          <div
            className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(184,160,96,0.3)", borderTopColor: "#b8a060" }}
          />
        ) : (
          <IconUpload size={24} style={{ color: "#b8a060" }} />
        )}
      </div>
      <div className="text-center">
        <p className="font-medium text-white">
          {minting ? "Minting document…" : "Drop files here or click to upload"}
        </p>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          PDF, DOCX, images, TXT, CSV — up to 10 MB each
        </p>
      </div>
    </div>
  );
}

// ─── Document Card ────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: MintedDocument;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-xl group transition-colors"
      style={{
        background: "#0a0a0a",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <DocIcon ext={doc.ext} size={28} />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{doc.name}</p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {doc.ext.toUpperCase()} &middot; {formatBytes(doc.size)} &middot; Minted {formatDate(doc.mintedAt)}
        </p>
      </div>

      {/* Badge */}
      <span
        className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-full"
        style={{
          background: "rgba(184,160,96,0.1)",
          border: "1px solid rgba(184,160,96,0.25)",
          color: "#b8a060",
        }}
      >
        {doc.id.slice(0, 8)}
      </span>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
        title="Delete document"
      >
        <IconTrash size={15} />
      </button>
    </div>
  );
}

// ─── Inner Layout ─────────────────────────────────────────────────────────────

function DocumentsInner({ user, onSignOut }: { user: { name: string; email: string; avatar?: string }; onSignOut: () => void }) {
  const [docs, setDocs] = useState<MintedDocument[]>([]);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  // Load on mount
  useEffect(() => {
    setDocs(readDocs());
  }, []);

  function addToast(type: Toast["type"], message: string) {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  function handleMint(doc: MintedDocument) {
    setDocs((prev) => {
      const next = [doc, ...prev];
      saveDocs(next);
      return next;
    });
    addToast("success", `"${doc.name}" minted successfully`);
  }

  function handleDelete(id: string) {
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveDocs(next);
      return next;
    });
    setToDeleteId(null);
    addToast("success", "Document deleted");
  }

  const docToDelete = docs.find((d) => d.id === toDeleteId) ?? null;

  return (
    <>
      <SiteHeader title="Documents" />
      <div className="flex flex-col gap-8 p-6 max-w-3xl mx-auto w-full">

        {/* Upload zone */}
        <UploadZone onMint={handleMint} />

        {/* Document list */}
        {docs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16 rounded-2xl"
            style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.01)" }}
          >
            <IconFile size={36} style={{ color: "rgba(255,255,255,0.2)" }} />
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
              No documents minted yet
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              Upload a file above to add it to your document vault
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              Document Vault — {docs.length} {docs.length === 1 ? "file" : "files"}
            </p>
            {docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onDelete={() => setToDeleteId(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {docToDelete && (
        <DeleteModal
          doc={docToDelete}
          onConfirm={() => handleDelete(toDeleteId!)}
          onCancel={() => setToDeleteId(null)}
        />
      )}

      {/* Toast notifications */}
      <ToastBanner toasts={toasts} dismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const sidebarUser = {
    name: user.displayName ?? user.email ?? "User",
    email: user.email ?? "",
    avatar: user.photoURL ?? undefined,
  };

  return (
    <SidebarProvider
      style={{ "--sidebar-width": SIDEBAR_WIDTH } as React.CSSProperties}
    >
      <AppSidebar user={sidebarUser} onSignOut={signOut} />
      <div className="flex flex-col flex-1 min-h-screen">
        <DocumentsInner user={sidebarUser} onSignOut={signOut} />
      </div>
    </SidebarProvider>
  );
}
