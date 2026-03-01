"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WalletOption = { id: string; name: string; walletId: string };

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
  const [files, setFiles] = useState<File[]>([]);
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
    const { data, error } = await supabase
      .from("wallets")
      .select("id, name, wallet_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      setWallets([]);
    } else {
      setWallets(
        (data ?? []).map((r) => ({
          id: r.id ?? "",
          name: (r.name?.trim() || r.wallet_id) ?? "Unnamed",
          walletId: r.wallet_id ?? "",
        }))
      );
    }
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

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles?.length) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  return (
    <div className="flex flex-1 flex-col pt-6 pr-6 pb-6 pl-2 w-full">
      {/* Wallet dropdown */}
      <div className="mb-6">
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
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
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
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Plus className="size-10 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Upload documents</p>
      </div>

      {/* Uploaded files list */}
      {files.length > 0 && (
        <ul className="mt-6 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <span className="truncate min-w-0" title={file.name}>
                {file.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                aria-label={`Remove ${file.name}`}
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
