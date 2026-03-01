"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, Coins, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { cn } from "@/lib/utils";

type TxRow = {
  id: string;
  type: string;
  amount: string | null;
  description: string | null;
  tx_hash: string | null;
  created_at: string;
};

function getSupabase() {
  try { return createClient(); } catch { return null; }
}

function TxIcon({ type }: { type: string }) {
  if (type === "receive") return <ArrowDownLeft className="size-4 text-green-400 shrink-0" />;
  if (type === "transfer") return <ArrowUpRight className="size-4 text-red-400 shrink-0" />;
  if (type === "fee") return <Coins className="size-4 text-yellow-400 shrink-0" />;
  if (type === "minted") return <Sparkles className="size-4 text-violet-400 shrink-0" />;
  return <Clock className="size-4 text-muted-foreground shrink-0" />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function WalletHistorySection() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from("wallet_history")
      .select("id, type, amount, description, tx_hash, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setTransactions(data ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUpdate = () => load();
    window.addEventListener("wallet-history-update", onUpdate);
    return () => window.removeEventListener("wallet-history-update", onUpdate);
  }, [load]);

  return (
    <div className="flex flex-1 flex-col pt-6 pr-4 pb-6 pl-4 w-full border-l border-border">
      <h2 className="text-sm font-medium text-muted-foreground mb-3">Wallet History</h2>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2 py-12">
          <Clock className="size-8 opacity-30" />
          <p className="text-sm">No transactions yet</p>
          <p className="text-xs opacity-60">Transactions will appear here</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/40 transition-colors"
            >
              <TxIcon type={tx.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "text-xs font-medium capitalize",
                    tx.type === "receive" && "text-green-400",
                    tx.type === "transfer" && "text-red-400",
                    tx.type === "fee" && "text-yellow-400",
                    tx.type === "minted" && "text-violet-400",
                  )}>
                    {tx.type}
                  </span>
                  {tx.amount && (
                    <span className="text-xs font-mono text-foreground shrink-0">{tx.amount}</span>
                  )}
                </div>
                {tx.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{tx.description}</p>
                )}
                {tx.tx_hash && (
                  <p className="text-xs text-muted-foreground/50 font-mono truncate mt-0.5">{tx.tx_hash}</p>
                )}
                <p className="text-xs text-muted-foreground/40 mt-0.5">{formatDate(tx.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
