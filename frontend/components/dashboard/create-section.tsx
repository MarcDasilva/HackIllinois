"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, Plus, X, Send, Download, Loader2, Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STORAGE_DRAG_TYPE, type StorageDragPayload } from "@/lib/drag-types";
import { ToastError } from "@/components/dashboard/toast-error";
import { buildMintTransaction, sha256Hex } from "@/lib/solana-mint";

type WalletOption = { id: string; name: string; walletId: string };
type OrgOption = { id: string; name: string };

export type UploadItem =
  | { kind: "local"; file: File }
  | { kind: "storage"; id: string; name: string; size: number | null; mime_type?: string | null };

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
  const [processLoading, setProcessLoading] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [hardenedResults, setHardenedResults] = useState<Array<{ originalName: string; hardenedName: string; data: string }>>([]);
  const [mintingIndex, setMintingIndex] = useState<number | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintedHashes, setMintedHashes] = useState<Set<string>>(new Set());
  const [resultHashes, setResultHashes] = useState<(string | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const PHANTOM_PREFIX = "phantom:";
  const phantomOption: WalletOption | null =
    publicKey != null
      ? {
          id: `${PHANTOM_PREFIX}${publicKey.toBase58()}`,
          name: `Phantom: ${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`,
          walletId: publicKey.toBase58(),
        }
      : null;
  const walletOptions: WalletOption[] = phantomOption ? [phantomOption, ...wallets] : wallets;

  useEffect(() => {
    if (phantomOption && selectedWalletId !== phantomOption.id) {
      setSelectedWalletId(phantomOption.id);
    }
  }, [phantomOption?.id]);
  useEffect(() => {
    if (wallets.length > 0 && !phantomOption && !selectedWalletId) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, phantomOption, selectedWalletId]);
  useEffect(() => {
    if (!phantomOption && selectedWalletId.startsWith(PHANTOM_PREFIX)) {
      setSelectedWalletId(wallets[0]?.id ?? "");
    }
  }, [phantomOption, selectedWalletId, wallets]);

  const apiBase = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_LAVA_API_URL ?? "http://localhost:3001") : "";

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
    if (orgs.length > 0 && !selectedOrgId) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

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
          return [...prev, { kind: "storage", id: payload.id, name: payload.name, size: payload.size, mime_type: payload.mime_type ?? null }];
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

  function isPdf(item: UploadItem): boolean {
    if (item.kind === "local") return item.file.type === "application/pdf" || item.file.name.toLowerCase().endsWith(".pdf");
    return item.mime_type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf");
  }

  function isImage(item: UploadItem): boolean {
    if (item.kind === "local") return item.file.type.startsWith("image/");
    return (item.mime_type?.startsWith("image/") ?? false) || /\.(jpe?g|png|gif|webp)$/i.test(item.name);
  }

  const processableItems = items.filter((i) => isPdf(i) || isImage(i));

  const processFiles = async () => {
    if (!user?.id || processableItems.length === 0) return;
    setProcessError(null);
    setProcessLoading(true);
    setHardenedResults([]);
    const allResults: Array<{ originalName: string; hardenedName: string; data: string }> = [];
    try {
      const localPdfs = items.filter((i): i is UploadItem & { kind: "local" } => i.kind === "local" && isPdf(i));
      const localImages = items.filter((i): i is UploadItem & { kind: "local" } => i.kind === "local" && isImage(i));
      const storagePdfs = items.filter((i) => i.kind === "storage" && isPdf(i));
      const storageImages = items.filter((i) => i.kind === "storage" && isImage(i));

      if (localPdfs.length > 0) {
        const form = new FormData();
        localPdfs.forEach((i) => i.kind === "local" && form.append("files", i.file));
        const res = await fetch(`${apiBase}/harden/pdf`, { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.success && json.files?.length) allResults.push(...json.files);
      }
      if (localImages.length > 0) {
        const form = new FormData();
        localImages.forEach((i) => i.kind === "local" && form.append("files", i.file));
        const res = await fetch(`${apiBase}/harden/image`, { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.success && json.files?.length) allResults.push(...json.files);
      }
      if (storagePdfs.length > 0) {
        const fileIds = storagePdfs.map((i) => (i.kind === "storage" ? i.id : null)).filter((id): id is string => id != null);
        const res = await fetch(`${apiBase}/harden/pdf/by-id`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_ids: fileIds, user_id: user.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.success && json.files?.length) allResults.push(...json.files);
      }
      if (storageImages.length > 0) {
        const fileIds = storageImages.map((i) => (i.kind === "storage" ? i.id : null)).filter((id): id is string => id != null);
        const res = await fetch(`${apiBase}/harden/image/by-id`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_ids: fileIds, user_id: user.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.success && json.files?.length) allResults.push(...json.files);
      }
      setHardenedResults(allResults);
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessLoading(false);
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
          const walletIdForHistory =
            selectedWalletId && !selectedWalletId.startsWith("phantom:") && wallets.some((w) => w.id === selectedWalletId)
              ? selectedWalletId
              : null;
          await supabase.from("wallet_history").insert({
            user_id: user.id,
            wallet_id: walletIdForHistory,
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
    [connection, publicKey, sendTransaction, hardenedResults, user?.id, selectedWalletId, wallets]
  );

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
          {walletOptions.map((w) => (
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
          accept="image/*,application/pdf"
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

      {/* Process files button — always visible, disabled until at least one image/PDF */}
      <div className="mt-4 space-y-1">
        <Button
          type="button"
          size="default"
          className="w-full gap-2"
          onClick={processFiles}
          disabled={processLoading || processableItems.length === 0}
        >
          {processLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {processLoading ? "Processing…" : "Process files"}
        </Button>
        {processableItems.length === 0 && (
          <p className="text-xs text-muted-foreground">Upload an image or PDF to enable.</p>
        )}
      </div>

      {/* Download hardened files + Mint */}
      {hardenedResults.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <p className="text-sm font-medium">Ready to download</p>
          {!publicKey && (
            <div className="flex flex-wrap items-center gap-2">
              <WalletMultiButton className="h-9! rounded-md! text-sm!" />
              <span className="text-xs text-muted-foreground">Connect Phantom to mint on Solana</span>
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
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={f.hardenedName}>
                    {f.hardenedName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ToastError message={processError ?? mintError} onDismiss={() => { setProcessError(null); setMintError(null); }} />
    </div>
  );
}
