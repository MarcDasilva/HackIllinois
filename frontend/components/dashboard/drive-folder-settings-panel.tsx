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
import { X } from "lucide-react";

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

function getSupabase() {
  try {
    return createClient();
  } catch {
    return null;
  }
}

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptTrigger, setEncryptTrigger] = useState<EncryptTrigger | "">("on_update");
  const [encryptContentTypes, setEncryptContentTypes] = useState<EncryptContentTypes | "">("both");
  const [viewerEmails, setViewerEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");

  const loadSettings = useCallback(async () => {
    if (!user?.id || !open) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("drive_folder_settings")
        .select("id, is_encrypted, encrypt_trigger, encrypt_content_types, allowed_viewer_emails")
        .eq("user_id", user.id)
        .eq("drive_folder_id", driveFolderId)
        .maybeSingle();
      if (err) throw err;
      if (data) {
        setIsEncrypted(!!data.is_encrypted);
        setEncryptTrigger((data.encrypt_trigger as EncryptTrigger) ?? "on_update");
        setEncryptContentTypes((data.encrypt_content_types as EncryptContentTypes) ?? "both");
        setViewerEmails(Array.isArray(data.allowed_viewer_emails) ? data.allowed_viewer_emails : []);
      } else {
        setIsEncrypted(false);
        setEncryptTrigger("on_update");
        setEncryptContentTypes("both");
        setViewerEmails([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [user?.id, open, driveFolderId]);

  useEffect(() => {
    if (open) loadSettings();
  }, [open, loadSettings]);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-left">Folder settings</SheetTitle>
          <p className="text-sm text-muted-foreground text-left truncate" title={driveFolderName}>
            {driveFolderName}
          </p>
        </SheetHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Encrypted or not */}
            <div className="space-y-2">
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
                {/* Encrypt when */}
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

                {/* Encrypt content types */}
                <div className="space-y-2">
                  <label className="text-sm font-medium block">Encrypt content types</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={encryptContentTypes}
                    onChange={(e) => setEncryptContentTypes(e.target.value as EncryptContentTypes)}
                  >
                    {(Object.keys(ENCRYPT_CONTENT_LABELS) as EncryptContentTypes[]).map((k) => (
                      <option key={k} value={k}>
                        {ENCRYPT_CONTENT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Users who can view */}
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
