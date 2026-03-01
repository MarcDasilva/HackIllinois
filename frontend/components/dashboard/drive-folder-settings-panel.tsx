"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, CheckCircle2, XCircle, ChevronDown, ChevronRight, FileText, RefreshCw } from "lucide-react";

export type EncryptTrigger = "on_update" | "daily" | "hourly";
export type EncryptContentTypes = "images" | "pdfs" | "both";

export type DriveFolderSettingsRow = {
  id: string;
  drive_folder_id: string;
  drive_folder_name: string | null;
  is_encrypted: boolean;
  encrypt_trigger: EncryptTrigger | null;
  encrypt_content_types: EncryptContentTypes | null;
  allowed_viewer_emails: string[];
  last_encrypted_at: string | null;
  last_encryption_success: boolean | null;
};

const ENCRYPT_TRIGGER_LABELS: Record<EncryptTrigger, string> = {
  on_update: "Every file update",
  daily: "Every day",
  hourly: "Every hour",
};

const ENCRYPT_CONTENT_LABELS: Record<EncryptContentTypes, string> = {
  images: "Images",
  pdfs: "PDFs",
  both: "Images and PDFs",
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

function getSupabase() {
  try {
    return createClient();
  } catch {
    return null;
  }
}

type DriveFileItem = { id: string; name: string };
type FileEncryptionStatus = { last_encrypted_at: string | null; last_encryption_success: boolean | null };

type DriveFolderSettingsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driveFolderId: string;
  driveFolderName: string;
  onSaved?: () => void;
};

export function DriveFolderSettingsPanel({
  open,
  onOpenChange,
  driveFolderId,
  driveFolderName,
  onSaved,
}: DriveFolderSettingsPanelProps) {
  const { user, providerToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [fileStatusMap, setFileStatusMap] = useState<Record<string, FileEncryptionStatus>>({});
  const [filesLoading, setFilesLoading] = useState(false);

  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptTrigger, setEncryptTrigger] = useState<EncryptTrigger | "">("on_update");
  const [encryptContentTypes, setEncryptContentTypes] = useState<EncryptContentTypes | "">("both");
  const [viewerEmails, setViewerEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [lastEncryptedAt, setLastEncryptedAt] = useState<string | null>(null);
  const [lastEncryptionSuccess, setLastEncryptionSuccess] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const apiBase =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_LAVA_API_URL ?? "http://localhost:3001")
      : "";

  const loadSettings = useCallback(async () => {
    if (!user?.id || !open) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("drive_folder_settings")
        .select("id, is_encrypted, encrypt_trigger, encrypt_content_types, allowed_viewer_emails, last_encrypted_at, last_encryption_success")
        .eq("user_id", user.id)
        .eq("drive_folder_id", driveFolderId)
        .maybeSingle();
      if (err) throw err;
      if (data) {
        setIsEncrypted(!!data.is_encrypted);
        setEncryptTrigger((data.encrypt_trigger as EncryptTrigger) ?? "on_update");
        setEncryptContentTypes((data.encrypt_content_types as EncryptContentTypes) ?? "both");
        setViewerEmails(Array.isArray(data.allowed_viewer_emails) ? data.allowed_viewer_emails : []);
        setLastEncryptedAt(data.last_encrypted_at ?? null);
        setLastEncryptionSuccess(data.last_encryption_success ?? null);
      } else {
        setIsEncrypted(false);
        setEncryptTrigger("on_update");
        setEncryptContentTypes("both");
        setViewerEmails([]);
        setLastEncryptedAt(null);
        setLastEncryptionSuccess(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [user?.id, open, driveFolderId]);

  const loadDriveFilesAndStatus = useCallback(async () => {
    if (!user?.id || !providerToken || !open) return;
    setFilesLoading(true);
    try {
      const q = encodeURIComponent(
        `'${driveFolderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`
      );
      const fields = encodeURIComponent("nextPageToken,files(id,name)");
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=name`,
        { headers: { Authorization: `Bearer ${providerToken}` } }
      );
      if (!res.ok) {
        setDriveFiles([]);
        setFileStatusMap({});
        return;
      }
      const json = await res.json();
      const files: DriveFileItem[] = (json.files ?? []).map((f: { id: string; name: string }) => ({
        id: f.id,
        name: f.name,
      }));
      setDriveFiles(files);
      if (files.length === 0) {
        setFileStatusMap({});
        return;
      }
      const supabase = getSupabase();
      if (!supabase) {
        setFileStatusMap({});
        return;
      }
      const { data: statusRows } = await supabase
        .from("drive_file_encryption_status")
        .select("drive_file_id, last_encrypted_at, last_encryption_success")
        .eq("user_id", user.id)
        .in("drive_file_id", files.map((f) => f.id));
      const map: Record<string, FileEncryptionStatus> = {};
      for (const row of statusRows ?? []) {
        map[row.drive_file_id] = {
          last_encrypted_at: row.last_encrypted_at ?? null,
          last_encryption_success: row.last_encryption_success ?? null,
        };
      }
      setFileStatusMap(map);
    } catch {
      setDriveFiles([]);
      setFileStatusMap({});
    } finally {
      setFilesLoading(false);
    }
  }, [user?.id, providerToken, open, driveFolderId]);

  useEffect(() => {
    if (open) loadSettings();
  }, [open, loadSettings]);

  useEffect(() => {
    if (open) loadDriveFilesAndStatus();
  }, [open, loadDriveFilesAndStatus]);

  const handleSave = async () => {
    if (!user?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("drive_folder_settings").upsert(
        {
          user_id: user.id,
          drive_folder_id: driveFolderId,
          drive_folder_name: driveFolderName || null,
          is_encrypted: isEncrypted,
          encrypt_trigger: isEncrypted ? (encryptTrigger || "on_update") : null,
          encrypt_content_types: isEncrypted ? (encryptContentTypes || "both") : null,
          allowed_viewer_emails: viewerEmails.filter(Boolean),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,drive_folder_id" }
      );
      if (err) throw err;
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const addViewer = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (viewerEmails.includes(email)) return;
    setViewerEmails((prev) => [...prev, email]);
    setNewEmail("");
  };

  const removeViewer = (email: string) => {
    setViewerEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleSync = async () => {
    if (!user?.id || !driveFolderId) return;
    if (!apiBase) {
      setSyncError("Backend URL not configured. Set NEXT_PUBLIC_LAVA_API_URL or run the backend on http://localhost:3001.");
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`${apiBase}/sync/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          drive_folder_id: driveFolderId,
          ...(providerToken && { access_token: providerToken }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          setSyncError(
            "Sync endpoint not found (404). Is the LAVA backend running? Start it with: cd backend && npm run dev"
          );
          return;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (data.errors?.length) {
        setSyncError(data.errors.slice(0, 3).join("; "));
      }
      await loadSettings();
      await loadDriveFilesAndStatus();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-left">Folder settings</SheetTitle>
          <p className="text-sm text-muted-foreground text-left truncate" title={driveFolderName}>
            {driveFolderName}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              onClick={handleSync}
              disabled={syncing || !user?.id}
            >
              {syncing ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {syncing ? "Syncing…" : "Sync"}
            </Button>
            {syncError && (
              <p className="text-xs text-destructive truncate" title={syncError}>
                {syncError}
              </p>
            )}
          </div>
        </SheetHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Top: Last encrypted for drive (folder) */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 shrink-0">
              <p className="text-sm font-medium">Drive last encrypted</p>
              {lastEncryptedAt ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {new Date(lastEncryptedAt).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  {lastEncryptionSuccess === true && (
                    <span className="inline-flex items-center gap-1 ml-2 text-green-600 dark:text-green-500">
                      <CheckCircle2 className="size-4" />
                      Success
                    </span>
                  )}
                  {lastEncryptionSuccess === false && (
                    <span className="inline-flex items-center gap-1 ml-2 text-destructive">
                      <XCircle className="size-4" />
                      Failed
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-0.5">Never</p>
              )}
            </div>

            {/* Caret menu: Options */}
            <div className="border border-border rounded-lg shrink-0">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-t-lg transition-colors"
                onClick={() => setOptionsOpen((o) => !o)}
              >
                {optionsOpen ? (
                  <ChevronDown className="size-4 shrink-0" />
                ) : (
                  <ChevronRight className="size-4 shrink-0" />
                )}
                Options
              </button>
              {optionsOpen && (
                <div className="px-3 pb-3 pt-0 space-y-4 border-t border-border">
                  <div className="space-y-2 pt-3">
                    <label className="text-sm font-medium block">Encryption</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={isEncrypted ? "encrypted" : "not_encrypted"}
                      onChange={(e) => setIsEncrypted(e.target.value === "encrypted")}
                    >
                      <option value="not_encrypted">Not encrypted</option>
                      <option value="encrypted">Encrypted</option>
                    </select>
                  </div>
                  {isEncrypted && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium block">Encrypt when</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={encryptTrigger}
                          onChange={(e) => setEncryptTrigger(e.target.value as EncryptTrigger)}
                        >
                          {(Object.keys(ENCRYPT_TRIGGER_LABELS) as EncryptTrigger[]).map((k) => (
                            <option key={k} value={k}>
                              {ENCRYPT_TRIGGER_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium block">Encrypt content types</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={encryptContentTypes}
                          onChange={(e) =>
                            setEncryptContentTypes(e.target.value as EncryptContentTypes)
                          }
                        >
                          {(Object.keys(ENCRYPT_CONTENT_LABELS) as EncryptContentTypes[]).map(
                            (k) => (
                              <option key={k} value={k}>
                                {ENCRYPT_CONTENT_LABELS[k]}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium block">Users who can view</label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="Add email…"
                        className="flex-1"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addViewer();
                          }
                        }}
                      />
                      <Button type="button" variant="secondary" size="sm" onClick={addViewer}>
                        Add
                      </Button>
                    </div>
                    <ul className="flex flex-wrap gap-1.5 mt-2">
                      {viewerEmails.map((email) => (
                        <li
                          key={email}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                        >
                          <span className="truncate max-w-[180px]">{email}</span>
                          <button
                            type="button"
                            className="shrink-0 rounded p-0.5 hover:bg-muted-foreground/20"
                            onClick={() => removeViewer(email)}
                            aria-label={`Remove ${email}`}
                          >
                            <X className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Documents list */}
            <div className="flex flex-col gap-1 min-h-0">
              <p className="text-sm font-medium shrink-0">Documents</p>
              {filesLoading ? (
                <p className="text-xs text-muted-foreground py-2">Loading…</p>
              ) : driveFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No documents in this folder</p>
              ) : (
                <ul className="space-y-1 overflow-y-auto min-h-0">
                  {driveFiles.map((file) => {
                    const status = fileStatusMap[file.id];
                    const lastAt = status?.last_encrypted_at ?? null;
                    const success = status?.last_encryption_success;
                    return (
                      <li
                        key={file.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm bg-muted/30 hover:bg-muted/50"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate min-w-0" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {lastAt
                            ? new Date(lastAt).toLocaleString(undefined, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                          {lastAt && success === true && (
                            <CheckCircle2
                              className="size-3.5 inline-block ml-1 text-green-600 dark:text-green-500"
                              aria-label="Encrypted successfully"
                            />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive shrink-0">{error}</p>
        )}

        <SheetFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
