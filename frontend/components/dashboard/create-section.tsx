"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STORAGE_DRAG_TYPE, type StorageDragPayload } from "@/lib/drag-types";

type WalletOption = { id: string; name: string; walletId: string };
type OrgOption = { id: string; name: string };

export type UploadItem =
  | { kind: "local"; file: File }
  | { kind: "storage"; id: string; name: string; size: number | null };

function getSupabase() {
  try {
    return createClient();
  } catch {
    return null;
  }
}

export function CreateSection() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadWallets = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) {
      setWallets([]);
      setLoading(false);
      return;
    }
    const [walletsRes, orgsRes] = await Promise.all([
      supabase.from("wallets").select("id, name, wallet_id").eq("user_id", user.id).order("created_at", { ascending: true }),
      supabase.from("organizations").select("id, name").eq("user_id", user.id).order("created_at", { ascending: true }),
    ]);
    if (walletsRes.error) {
      setWallets([]);
    } else {
      setWallets(
        (walletsRes.data ?? []).map((r) => ({
          id: r.id ?? "",
          name: (r.name?.trim() || r.wallet_id) ?? "Unnamed",
          walletId: r.wallet_id ?? "",
        }))
      );
    }
    setOrgs((orgsRes.data ?? []).map((r) => ({ id: r.id ?? "", name: r.name ?? "" })));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    if (wallets.length > 0 && !selectedWalletId) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, selectedWalletId]);

  useEffect(() => {
    if (orgs.length > 0 && !selectedOrgId) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

  const addLocalFiles = (newFiles: FileList | null) => {
    if (!newFiles?.length) return;
    setItems((prev) => [
      ...prev,
      ...Array.from(newFiles).map((f): UploadItem => ({ kind: "local", file: f })),
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    // Storage file dragged from right panel
    const raw = e.dataTransfer.getData(STORAGE_DRAG_TYPE);
    if (raw) {
      try {
        const payload: StorageDragPayload = JSON.parse(raw);
        // Avoid duplicates
        setItems((prev) => {
          const exists = prev.some((i) => i.kind === "storage" && i.id === payload.id);
          if (exists) return prev;
          return [...prev, { kind: "storage", id: payload.id, name: payload.name, size: payload.size }];
        });
        return;
      } catch {
        // fall through to OS file handling
      }
    }

    addLocalFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  function itemName(item: UploadItem) {
    return item.kind === "local" ? item.file.name : item.name;
  }

  return (
    <div className="flex flex-1 flex-col pt-6 pr-6 pb-6 pl-2 w-full">
      {/* Wallet dropdown */}
      <div className="mb-4">
        <label htmlFor="wallet-select" className="text-sm font-medium text-muted-foreground block mb-2">
          Wallet
        </label>
        <select
          id="wallet-select"
          value={selectedWalletId}
          onChange={(e) => setSelectedWalletId(e.target.value)}
          disabled={loading}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <option value="">Select wallet</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Organization dropdown */}
      <div className="mb-6">
        <label htmlFor="org-select" className="text-sm font-medium text-muted-foreground block mb-2">
          Organization
        </label>
        <select
          id="org-select"
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          disabled={loading}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <option value="">Select organization</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {/* Upload box */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed min-h-[200px] cursor-pointer transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="*"
          onChange={(e) => addLocalFiles(e.target.files)}
        />
        <Plus className="size-10 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Upload documents</p>
        <p className="mt-1 text-xs text-muted-foreground/60">or drag files from storage →</p>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <ul className="mt-6 space-y-2">
          {items.map((item, index) => (
            <li
              key={`${itemName(item)}-${index}`}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <FileIcon className="size-4 shrink-0 text-white" />
              {item.kind === "storage" && (
                <span className="text-xs text-muted-foreground/60 shrink-0 border border-border rounded px-1">
                  storage
                </span>
              )}
              <span className="truncate min-w-0 flex-1" title={itemName(item)}>
                {itemName(item)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(index);
                }}
                aria-label={`Remove ${itemName(item)}`}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
