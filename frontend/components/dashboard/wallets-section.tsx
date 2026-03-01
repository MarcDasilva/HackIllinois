"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WalletEntry = { id: string; name: string; walletId: string; walletSecret: string };

function getSupabase() {
  try {
    return createClient();
  } catch {
    return null;
  }
}

export function WalletsSection({ showHeading = true }: { showHeading?: boolean }) {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [showIds, setShowIds] = useState<Set<number>>(new Set());
  const [showSecrets, setShowSecrets] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) {
      setWallets([]);
      setLoading(false);
      return;
    }
    const { data, error: e } = await supabase
      .from("wallets")
      .select("id, name, wallet_id, wallet_secret")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (e) {
      setError(e.message);
      setWallets([]);
    } else {
      setWallets(
        (data ?? []).map((r) => ({
          id: r.id ?? "",
          name: r.name ?? "",
          walletId: r.wallet_id ?? "",
          walletSecret: r.wallet_secret ?? "",
        }))
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  const toggleShow = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, key: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addWallet = () => {
    setWallets((prev) => [...prev, { id: "", name: "", walletId: "", walletSecret: "" }]);
  };

  const updateWallet = (index: number, field: keyof WalletEntry, value: string) => {
    setWallets((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
    );
  };

  const removeWallet = (index: number) => {
    setWallets((prev) => prev.filter((_, i) => i !== index));
  };

  const saveWallets = async () => {
    setError(null);
    const supabase = getSupabase();
    if (!supabase || !user?.id) {
      setError("Not signed in");
      return;
    }
    setSaving(true);
    try {
      const { error: deleteErr } = await supabase
        .from("wallets")
        .delete()
        .eq("user_id", user.id);
      if (deleteErr) throw deleteErr;

      const valid = wallets.filter((w) => w.walletId.trim());
      if (valid.length > 0) {
        const { error: insertErr } = await supabase.from("wallets").insert(
          valid.map((w) => ({
            user_id: user.id,
            name: w.name.trim() || null,
            wallet_id: w.walletId.trim(),
            wallet_secret: w.walletSecret.trim() || null,
          }))
        );
        if (insertErr) throw insertErr;
      }
      await loadWallets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save wallets");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-8 lg:px-6">
        <p className="text-muted-foreground text-sm">Loading wallets…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 lg:px-6 max-w-2xl">
      {showHeading && (
        <>
          <h2 className="font-serif text-2xl text-foreground">Wallets</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Add wallet addresses and secrets for payments. Data is stored securely per account.
          </p>
        </>
      )}

      <div className={showHeading ? "mt-6 flex flex-col gap-4" : "flex flex-col gap-4"}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {wallets.length} wallet{wallets.length !== 1 ? "s" : ""}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={addWallet} className="gap-1.5">
            <Plus className="size-4" />
            Add wallet
          </Button>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/50 p-4">
          {wallets.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No wallets yet. Click &quot;Add wallet&quot; to add one.
            </p>
          ) : (
            wallets.map((wallet, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="grid flex-1 gap-2 min-w-0">
                    <label className="text-xs font-medium text-muted-foreground">Label</label>
                    <Input
                      value={wallet.name}
                      onChange={(e) => updateWallet(index, "name", e.target.value)}
                      placeholder="e.g. Main wallet"
                      className="rounded-lg"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive mt-6"
                    onClick={() => removeWallet(index)}
                    aria-label="Remove wallet"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Wallet address / ID</label>
                  <div className="relative flex">
                    <Input
                      type={showIds.has(index) ? "text" : "password"}
                      value={wallet.walletId}
                      onChange={(e) => updateWallet(index, "walletId", e.target.value)}
                      placeholder="Address or ID"
                      className="rounded-lg pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleShow(setShowIds, index)}
                      aria-label={showIds.has(index) ? "Hide address" : "Show address"}
                    >
                      {showIds.has(index) ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Secret key</label>
                  <div className="relative flex">
                    <Input
                      type={showSecrets.has(index) ? "text" : "password"}
                      value={wallet.walletSecret}
                      onChange={(e) => updateWallet(index, "walletSecret", e.target.value)}
                      placeholder="Secret key (stored encrypted)"
                      className="rounded-lg pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleShow(setShowSecrets, index)}
                      aria-label={showSecrets.has(index) ? "Hide secret" : "Show secret"}
                    >
                      {showSecrets.has(index) ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {wallets.some((w) => w.walletId.trim() || w.name.trim() || w.walletSecret.trim()) && (
          <div className="flex items-center gap-3">
            <Button onClick={saveWallets} disabled={saving} className="rounded-lg">
              {saving ? "Saving…" : "Save wallets"}
            </Button>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
