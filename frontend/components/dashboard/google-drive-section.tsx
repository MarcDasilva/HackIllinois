"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, File, Folder, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

function formatSize(bytes?: string): string {
  if (!bytes) return "";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function DriveFileRow({ file }: { file: DriveFile }) {
  const isFolder = file.mimeType === FOLDER_MIME;
  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 transition-colors">
      {isFolder
        ? <Folder className="size-4 shrink-0 text-white" />
        : <File className="size-4 shrink-0 text-white" />}
      <span className="flex-1 truncate min-w-0" title={file.name}>{file.name}</span>
      <span className="text-xs text-muted-foreground/50 shrink-0 hidden group-hover:inline">
        {formatSize(file.size) || formatDate(file.modifiedTime)}
      </span>
      {file.webViewLink && (
        <a
          href={file.webViewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${file.name} in Drive`}
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </li>
  );
}

export function GoogleDriveSection() {
  const { providerToken } = useAuth();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string>("root");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([
    { id: "root", name: "My Drive" },
  ]);

  const fetchFiles = useCallback(async (folder: string, token?: string) => {
    if (!providerToken) return;
    setLoading(true);
    setError(null);
    try {
      const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)");
      const pageToken = token ? `&pageToken=${encodeURIComponent(token)}` : "";
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=50&orderBy=folder,name${pageToken}`,
        { headers: { Authorization: `Bearer ${providerToken}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setFiles(token ? (prev) => [...prev, ...(json.files ?? [])] : (json.files ?? []));
      setNextPageToken(json.nextPageToken ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Drive files");
    } finally {
      setLoading(false);
    }
  }, [providerToken]);

  useEffect(() => {
    if (providerToken) fetchFiles(folderId);
  }, [providerToken, folderId, fetchFiles]);

  const openFolder = (file: DriveFile) => {
    if (file.mimeType !== FOLDER_MIME) return;
    setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
    setFolderId(file.id);
  };

  const navigateTo = (crumb: { id: string; name: string }, idx: number) => {
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    setFolderId(crumb.id);
  };

  if (!providerToken) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-12 text-muted-foreground px-4 text-center">
        <File className="size-8 opacity-30" />
        <p className="text-sm">Google Drive not connected</p>
        <p className="text-xs opacity-60">Sign out and sign in again to grant Drive access.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 min-h-0">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 flex-wrap px-1">
        {breadcrumbs.map((crumb, idx) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {idx > 0 && <span className="text-muted-foreground/40 text-xs">/</span>}
            <button
              className={cn(
                "text-xs hover:text-foreground transition-colors",
                idx === breadcrumbs.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
              onClick={() => navigateTo(crumb, idx)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
        <Button
          type="button" variant="ghost" size="icon"
          className="h-5 w-5 ml-auto text-muted-foreground hover:text-foreground"
          onClick={() => fetchFiles(folderId)}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </div>

      {error && <p className="text-destructive text-xs px-1">{error}</p>}

      {loading && files.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 px-1">This folder is empty.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => openFolder(file)}
                className={file.mimeType === FOLDER_MIME ? "cursor-pointer" : ""}
              >
                <DriveFileRow file={file} />
              </div>
            ))}
          </ul>
          {nextPageToken && (
            <Button
              variant="ghost" size="sm"
              className="text-xs text-muted-foreground hover:text-foreground self-start"
              disabled={loading}
              onClick={() => fetchFiles(folderId, nextPageToken)}
            >
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
