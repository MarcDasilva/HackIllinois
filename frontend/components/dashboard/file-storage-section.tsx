"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, File, FilePlus, Folder, FolderOpen, FolderPlus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STORAGE_DRAG_TYPE, type StorageDragPayload } from "@/lib/drag-types";

type FolderRow = { id: string; name: string; parent_id: string | null };
type FileRow = { id: string; name: string; folder_id: string | null; size: number | null; mime_type: string | null };

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
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDeleteFile: (id: string) => void;
};

function FolderNode({ folder, folders, files, depth, selectedFolderId, onSelect, onDelete, onDeleteFile }: FolderNodeProps) {
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
              onSelect={onSelect}
              onDelete={onDelete}
              onDeleteFile={onDeleteFile}
            />
          ))}
          {folderFiles.map((file) => (
            <FileNode key={file.id} file={file} depth={depth + 1} onDelete={onDeleteFile} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FileNode({ file, depth, onDelete }: { file: FileRow; depth: number; onDelete: (id: string) => void }) {
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
      <span className="w-4 shrink-0" />
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
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) { setLoading(false); return; }
    const [fRes, fiRes] = await Promise.all([
      supabase.from("folders").select("id, name, parent_id").eq("user_id", user.id).order("name"),
      supabase.from("storage_files").select("id, name, folder_id, size, mime_type").eq("user_id", user.id).order("name"),
    ]);
    setFolders(fRes.data ?? []);
    setFiles(fiRes.data ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

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
    const rows = Array.from(picked).map((f) => ({
      user_id: user.id,
      folder_id: selectedFolderId ?? null,
      name: f.name,
      size: f.size,
      mime_type: f.type || null,
    }));
    const { error: e } = await supabase.from("storage_files").insert(rows);
    if (e) { setError(e.message); return; }
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  };

  const deleteFile = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("storage_files").delete().eq("id", id);
    load();
  };

  const rootFolders = folders.filter((f) => f.parent_id === null);
  const rootFiles = files.filter((f) => f.folder_id === null);

  return (
    <div className="flex flex-1 flex-col pt-6 pr-4 pb-6 pl-4 w-full border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Storage
          {selectedFolderId && (
            <button
              className="ml-2 text-xs text-muted-foreground/60 hover:text-foreground"
              onClick={() => setSelectedFolderId(null)}
              title="Deselect folder"
            >
              <X className="inline size-3" />
            </button>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {/* Add file button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            title={selectedFolderId ? "Add file to selected folder" : "Add file to root"}
          >
            <FilePlus className="size-4" />
          </Button>
          {/* New folder button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => { setShowNewFolder((v) => !v); setError(null); }}
            aria-label="New folder"
          >
            {showNewFolder ? <X className="size-4" /> : <FolderPlus className="size-4" />}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
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
          <Button type="button" size="sm" className="h-8 shrink-0" onClick={createFolder}>
            Add
          </Button>
        </div>
      )}

      {error && <p className="text-destructive text-xs mb-2">{error}</p>}

      {selectedFolderId && (
        <p className="text-xs text-muted-foreground/60 mb-2">
          Files and folders added inside selected folder. <button className="underline hover:text-foreground" onClick={() => setSelectedFolderId(null)}>Clear</button>
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2 py-12">
          <Folder className="size-8 opacity-30" />
          <p className="text-sm">No files yet</p>
          <p className="text-xs opacity-60">Use the icons above to add files or folders</p>
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
              onSelect={setSelectedFolderId}
              onDelete={deleteFolder}
              onDeleteFile={deleteFile}
            />
          ))}
          {rootFiles.map((file) => (
            <FileNode key={file.id} file={file} depth={0} onDelete={deleteFile} />
          ))}
        </ul>
      )}
    </div>
  );
}
