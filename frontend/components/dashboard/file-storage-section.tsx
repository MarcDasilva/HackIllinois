"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, File, FilePlus, Folder, FolderOpen, FolderPlus, Trash2, X, Send, Download, Loader2, Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STORAGE_DRAG_TYPE, type StorageDragPayload } from "@/lib/drag-types";
import { GoogleDriveSection } from "@/components/dashboard/google-drive-section";
import { ToastError } from "@/components/dashboard/toast-error";
import { buildMintTransaction, sha256Hex } from "@/lib/solana-mint";

type Tab = "local" | "drive";

type FolderRow = { id: string; name: string; parent_id: string | null };
type FileRow = {
  id: string;
  name: string;
  folder_id: string | null;
  size: number | null;
  mime_type: string | null;
  storage_path?: string | null;
};

function getSupabase() {
  try { return createClient(); } catch { return null; }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FolderNodeProps = {
  folder: FolderRow;
  folders: FolderRow[];
  files: FileRow[];
  depth: number;
  selectedFolderId: string | null;
  selectedFileIds: Set<string>;
  onToggleFile: (id: string) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDeleteFile: (id: string) => void;
};

function FolderNode({
  folder,
  folders,
  files,
  depth,
  selectedFolderId,
  selectedFileIds,
  onToggleFile,
  onSelect,
  onDelete,
  onDeleteFile,
}: FolderNodeProps) {
  const [open, setOpen] = useState(false);
  const children = folders.filter((f) => f.parent_id === folder.id);
  const folderFiles = files.filter((f) => f.folder_id === folder.id);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = children.length > 0 || folderFiles.length > 0;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1 py-1 cursor-pointer text-sm hover:bg-muted/50",
          isSelected && "bg-muted"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => { setOpen((v) => !v); onSelect(folder.id); }}
      >
        <span className="shrink-0 text-muted-foreground w-4">
          {hasChildren
            ? open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
            : null}
        </span>
        {open
          ? <FolderOpen className="size-4 shrink-0 text-white" />
          : <Folder className="size-4 shrink-0 text-white" />}
        <span className="flex-1 truncate">{folder.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
          aria-label={`Delete ${folder.name}`}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {open && (
        <ul>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              files={files}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              selectedFileIds={selectedFileIds}
              onToggleFile={onToggleFile}
              onSelect={onSelect}
              onDelete={onDelete}
              onDeleteFile={onDeleteFile}
            />
          ))}
          {folderFiles.map((file) => (
            <FileNode
              key={file.id}
              file={file}
              depth={depth + 1}
              selected={selectedFileIds.has(file.id)}
              onToggle={() => onToggleFile(file.id)}
              onDelete={onDeleteFile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FileNode({
  file,
  depth,
  selected,
  onToggle,
  onDelete,
}: {
  file: FileRow;
  depth: number;
  selected: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setDragging(true);
    const payload: StorageDragPayload = {
      id: file.id,
      name: file.name,
      size: file.size,
      mime_type: file.mime_type,
    };
    e.dataTransfer.setData(STORAGE_DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <li
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      className="group flex items-center gap-1 px-1 py-1 text-sm text-muted-foreground hover:bg-muted/30 rounded-md cursor-grab active:cursor-grabbing"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="w-4 shrink-0 flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onToggle(); }}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-border"
          aria-label={`Select ${file.name}`}
        />
      </span>
      <File className="size-4 shrink-0 text-white" />
      <span className="flex-1 truncate">{file.name}</span>
      {!dragging && file.size ? <span className="text-xs text-muted-foreground/60 shrink-0 mr-1">{formatSize(file.size)}</span> : null}
      {!dragging && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
          aria-label={`Delete ${file.name}`}
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </li>
  );
}

export function FileStorageSection() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("local");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hardenedResults, setHardenedResults] = useState<Array<{ originalName: string; hardenedName: string; data: string }>>([]);
  const [mintingIndex, setMintingIndex] = useState<number | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintedHashes, setMintedHashes] = useState<Set<string>>(new Set());
  const [resultHashes, setResultHashes] = useState<(string | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const apiBase = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_LAVA_API_URL ?? "http://localhost:3001") : "";

  const toggleFileSelection = useCallback((id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) { setLoading(false); return; }
    setError(null);
    const fRes = await supabase.from("folders").select("id, name, parent_id").eq("user_id", user.id).order("name");
    if (fRes.error) setError(fRes.error.message);
    setFolders(fRes.data ?? []);

    let fiRes = await supabase.from("storage_files").select("id, name, folder_id, size, mime_type, storage_path").eq("user_id", user.id).order("name");
    if (fiRes.error) {
      const fallback = await supabase.from("storage_files").select("id, name, folder_id, size, mime_type").eq("user_id", user.id).order("name");
      if (fallback.error) {
        setError(fallback.error.message);
        setFiles([]);
      } else {
        setFiles((fallback.data ?? []).map((r) => ({ ...r, storage_path: null })));
        setError("Run migration 20260228180000_add_storage_path to enable uploads.");
      }
    } else {
      setFiles(fiRes.data ?? []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const loadMintedHashes = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) return;
    const { data } = await supabase
      .from("wallet_history")
      .select("content_hash")
      .eq("user_id", user.id)
      .eq("type", "minted")
      .not("content_hash", "is", null);
    setMintedHashes(new Set((data ?? []).map((r) => (r as { content_hash: string }).content_hash)));
  }, [user?.id]);

  useEffect(() => {
    loadMintedHashes();
  }, [loadMintedHashes]);

  useEffect(() => {
    const onUpdate = () => loadMintedHashes();
    window.addEventListener("wallet-history-update", onUpdate);
    return () => window.removeEventListener("wallet-history-update", onUpdate);
  }, [loadMintedHashes]);

  useEffect(() => {
    if (hardenedResults.length === 0) {
      setResultHashes([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const hashes: (string | null)[] = [];
      for (const f of hardenedResults) {
        if (cancelled) return;
        try {
          const binary = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
          hashes.push(await sha256Hex(binary));
        } catch {
          hashes.push(null);
        }
      }
      if (!cancelled) setResultHashes(hashes);
    };
    run();
    return () => { cancelled = true; };
  }, [hardenedResults]);

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const supabase = getSupabase();
    if (!supabase || !user?.id) return;
    const { error: e } = await supabase.from("folders").insert({
      user_id: user.id,
      name,
      parent_id: selectedFolderId ?? null,
    });
    if (e) { setError(e.message); return; }
    setNewFolderName("");
    setShowNewFolder(false);
    load();
  };

  const deleteFolder = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("folders").delete().eq("id", id);
    if (selectedFolderId === id) setSelectedFolderId(null);
    load();
  };

  const addFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    const supabase = getSupabase();
    if (!supabase || !user?.id) return;
    setError(null);
    setUploading(true);
    const bucket = "uploads";
    try {
      for (const file of Array.from(picked)) {
        const { data: row, error: insertErr } = await supabase
          .from("storage_files")
          .insert({
            user_id: user.id,
            folder_id: selectedFolderId ?? null,
            name: file.name,
            size: file.size,
            mime_type: file.type || null,
          })
          .select("id")
          .single();
        if (insertErr) {
          setError(insertErr.message);
          break;
        }
        const fileId = (row as { id: string }).id;
        const storagePath = `${user.id}/${fileId}/${encodeURIComponent(file.name)}`;
        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(storagePath, file, { upsert: true });
        if (uploadErr) {
          setError(`Upload failed: ${uploadErr.message}. Ensure bucket "${bucket}" exists in Supabase Storage.`);
          await supabase.from("storage_files").delete().eq("id", fileId);
          break;
        }
        await supabase
          .from("storage_files")
          .update({ storage_path: storagePath })
          .eq("id", fileId);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setSelectedFileIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    await supabase.from("storage_files").delete().eq("id", id);
    load();
  };

  const canHarden = (f: FileRow) => f.storage_path && (f.mime_type === "application/pdf" || (f.mime_type?.startsWith("image/") ?? false));
  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
  const selectedHardenable = selectedFiles.filter(canHarden);
  const pdfIds = selectedHardenable.filter((f) => f.mime_type === "application/pdf").map((f) => f.id);
  const imageIds = selectedHardenable.filter((f) => f.mime_type?.startsWith("image/")).map((f) => f.id);

  const submitHarden = async () => {
    if (!user?.id || (!pdfIds.length && !imageIds.length)) return;
    setError(null);
    setSubmitLoading(true);
    setHardenedResults([]);
    const allResults: Array<{ originalName: string; hardenedName: string; data: string }> = [];
    try {
      if (pdfIds.length) {
        const res = await fetch(`${apiBase}/harden/pdf/by-id`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_ids: pdfIds, user_id: user.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.success && json.files?.length) allResults.push(...json.files);
        else if (json.error) throw new Error(json.error);
      }
      if (imageIds.length) {
        const res = await fetch(`${apiBase}/harden/image/by-id`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_ids: imageIds, user_id: user.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.success && json.files?.length) allResults.push(...json.files);
        else if (json.error) throw new Error(json.error);
      }
      setHardenedResults(allResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitLoading(false);
    }
  };

  const downloadHardened = (hardenedName: string, base64Data: string) => {
    const ext = hardenedName.split(".").pop()?.toLowerCase() ?? "";
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mime = mimeTypes[ext] ?? "application/octet-stream";
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = hardenedName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mintHardened = useCallback(
    async (index: number) => {
      if (!publicKey || !sendTransaction) {
        setMintError("Connect Phantom wallet to mint.");
        return;
      }
      const f = hardenedResults[index];
      if (!f) return;
      setMintError(null);
      setMintingIndex(index);
      try {
        const tx = await buildMintTransaction(connection, publicKey, f.hardenedName, f.data);
        const sig = await sendTransaction(tx, connection, { skipPreflight: false });
        const binary = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
        const content_hash = await sha256Hex(binary);
        console.log("[mint] Minted successfully:", f.hardenedName, "tx:", sig);
        setMintedHashes((prev) => new Set(prev).add(content_hash));
        const supabase = getSupabase();
        if (supabase && user?.id) {
          await supabase.from("wallet_history").insert({
            user_id: user.id,
            wallet_id: null,
            type: "minted",
            description: `Minted ${f.hardenedName}`,
            tx_hash: sig,
            content_hash,
          });
          window.dispatchEvent(new CustomEvent("wallet-history-update"));
        }
        setMintingIndex(null);
      } catch (e) {
        setMintError(e instanceof Error ? e.message : String(e));
        setMintingIndex(null);
      }
    },
    [connection, publicKey, sendTransaction, hardenedResults, user?.id]
  );

  const rootFolders = folders.filter((f) => f.parent_id === null);
  const rootFiles = files.filter((f) => f.folder_id === null);

  return (
    <div className="flex flex-1 flex-col pt-6 pr-4 pb-6 pl-4 w-full border-l border-border">
      {/* Tab bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 rounded-md bg-muted/50 p-0.5">
          {(["local", "drive"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-colors",
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "local" ? "Storage" : "Drive"}
            </button>
          ))}
        </div>

        {tab === "local" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title={selectedFolderId ? "Add file to selected folder" : "Add file to root"}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <FilePlus className="size-4" />}
              Upload files
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => { setShowNewFolder((v) => !v); setError(null); }}
              aria-label="New folder"
              title="New folder"
            >
              {showNewFolder ? <X className="size-4" /> : <FolderPlus className="size-4" />}
            </Button>
          </div>
        )}
      </div>

      {tab === "drive" ? (
        <GoogleDriveSection />
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />

          {showNewFolder && (
            <div className="flex gap-2 mb-3">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={selectedFolderId ? "Subfolder name…" : "Folder name…"}
                className="h-8 text-sm rounded-md"
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
                autoFocus
              />
              <Button type="button" size="sm" className="h-8 shrink-0" onClick={createFolder}>Add</Button>
            </div>
          )}

          {selectedFolderId && (
            <p className="text-xs text-muted-foreground/60 mb-2">
              Files and folders added inside selected folder.{" "}
              <button className="underline hover:text-foreground" onClick={() => setSelectedFolderId(null)}>Clear</button>
            </p>
          )}

          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-4 py-12">
              <Folder className="size-10 opacity-40" />
              <p className="text-sm">No files yet</p>
              <p className="text-xs opacity-60">Upload images or PDFs to harden them</p>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <FilePlus className="size-4" />}
                Upload files
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {rootFolders.map((folder) => (
                <FolderNode
                  key={folder.id}
                  folder={folder}
                  folders={folders}
                  files={files}
                  depth={0}
                  selectedFolderId={selectedFolderId}
                  selectedFileIds={selectedFileIds}
                  onToggleFile={toggleFileSelection}
                  onSelect={setSelectedFolderId}
                  onDelete={deleteFolder}
                  onDeleteFile={deleteFile}
                />
              ))}
              {rootFiles.map((file) => (
                <FileNode
                  key={file.id}
                  file={file}
                  depth={0}
                  selected={selectedFileIds.has(file.id)}
                  onToggle={() => toggleFileSelection(file.id)}
                  onDelete={deleteFile}
                />
              ))}
            </ul>
          )}
          {files.some((f) => selectedFileIds.has(f.id)) && (
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={submitLoading || selectedHardenable.length === 0}
                onClick={submitHarden}
                className="gap-1"
              >
                {submitLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {submitLoading ? "Sending…" : "Submit to harden"}
              </Button>
              {submitLoading && (
                <span className="text-xs text-muted-foreground">Calling API…</span>
              )}
              {selectedHardenable.length < selectedFiles.length && (
                <span className="text-xs text-muted-foreground">
                  {selectedFiles.length - selectedHardenable.length} selected not PDF/image or missing upload
                </span>
              )}
            </div>
          )}
          {hardenedResults.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <p className="text-xs font-medium text-foreground">Ready to download</p>
              <p className="text-xs text-muted-foreground">Hardened files returned from the API. Download or mint on Solana.</p>
              {!publicKey && (
                <div className="flex flex-wrap items-center gap-2">
                  <WalletMultiButton className="h-8! rounded-md! text-xs!" />
                  <span className="text-xs text-muted-foreground">Connect Phantom to mint</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {hardenedResults.map((f, i) => {
                  const hash = resultHashes[i] ?? null;
                  const isMinted = hash != null && mintedHashes.has(hash);
                  return (
                    <div key={`${f.hardenedName}-${i}`} className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="gap-1"
                        onClick={() => downloadHardened(f.hardenedName, f.data)}
                      >
                        <Download className="size-4" />
                        Download
                      </Button>
                      {isMinted ? (
                        <span className="text-xs text-amber-500 px-2 py-1.5 rounded border border-amber-500/40 bg-amber-500/10">
                          Minted
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => mintHardened(i)}
                          disabled={mintingIndex !== null || !publicKey}
                          title={!publicKey ? "Connect Phantom to mint" : "Commit file hash to Solana (Memo)"}
                        >
                          {mintingIndex === i ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Coins className="size-4" />
                          )}
                          {mintingIndex === i ? "Minting…" : "Mint"}
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={f.hardenedName}>
                        {f.hardenedName}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      <ToastError message={error ?? mintError} onDismiss={() => { setError(null); setMintError(null); }} />
    </div>
  );
}
