"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MetallicPaint from "@/components/MetallicPaint";

const LAVALAMP_GIF = "/lavalampfinal.gif";
const COLS = 10;
const ROWS = 3;
const TOTAL = COLS * ROWS;
const RESHUFFLE_MS = 5 * 60 * 1000;
const STAGGER_MS = 200;
const VELUM_GOLD = "#b8a060";

type TokenDisplay = { id: string };

/** Per-slot display: token id + staggered last-changed timestamp (from DB). */
export type SlotDisplay = { id: string; lastChangedAt: Date | null };

/** Seeded PRNG so the same epoch produces the same shuffle (no change on refresh until 5 min is up). */
function seededRandom(seed: number) {
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const rng = seededRandom(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getEpoch(): number {
  return Math.floor(Date.now() / RESHUFFLE_MS);
}

function pickAssignmentsForEpoch(tokens: TokenDisplay[], epoch: number): TokenDisplay[] {
  if (tokens.length === 0) {
    return Array.from({ length: TOTAL }, () => ({ id: "—" }));
  }
  const shuffled = shuffleWithSeed(tokens, epoch);
  return Array.from({ length: TOTAL }, (_, i) => shuffled[i % shuffled.length]);
}

/** Staggered "last changed" time for a slot so they're not all identical. */
function staggeredLastChangedAt(epoch: number, slotIndex: number): Date {
  return new Date(epoch * RESHUFFLE_MS + slotIndex * STAGGER_MS);
}

function formatTime(d: Date): string {
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

/** Renders the gif immediately so all lamps appear on load. */
function StaggeredGif({ slotIndex, epoch }: { slotIndex: number; epoch: number }) {
  return (
    <img
      src={LAVALAMP_GIF}
      alt=""
      className="w-full h-full object-contain"
      aria-hidden
    />
  );
}

export default function WallPage() {
  const [tokens, setTokens] = useState<TokenDisplay[]>([]);
  const [slots, setSlots] = useState<SlotDisplay[]>([]);
  const [epoch, setEpoch] = useState<number>(() => getEpoch());
  const [clock, setClock] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metallicReady, setMetallicReady] = useState(false);

  const ensureWallSlotsForEpoch = useCallback(
    async (supabase: ReturnType<typeof createClient>, ep: number, tokenList: TokenDisplay[]) => {
      const { data: existing } = await supabase
        .from("wall_slots")
        .select("slot_index, token_id, last_changed_at")
        .eq("epoch", ep)
        .order("slot_index");
      if (existing && existing.length === TOTAL) {
        const ordered: SlotDisplay[] = Array(TOTAL);
        existing.forEach((row: { slot_index: number; token_id: string | null; last_changed_at: string }) => {
          ordered[row.slot_index] = {
            id: row.token_id ?? "—",
            lastChangedAt: row.last_changed_at ? new Date(row.last_changed_at) : null,
          };
        });
        return ordered;
      }
      const assignments = pickAssignmentsForEpoch(tokenList, ep);
      const rows = assignments.map((a, slotIndex) => ({
        epoch: ep,
        slot_index: slotIndex,
        token_id: a.id === "—" ? null : a.id,
        last_changed_at: staggeredLastChangedAt(ep, slotIndex).toISOString(),
      }));
      await supabase.from("wall_slots").upsert(rows, {
        onConflict: "epoch,slot_index",
      });
      return assignments.map((a, slotIndex) => ({
        id: a.id,
        lastChangedAt: staggeredLastChangedAt(ep, slotIndex),
      }));
    },
    []
  );

  const refreshTokens = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("token_accounts")
      .select("id")
      .eq("is_active", true);
    if (e) {
      setError(e.message);
      setTokens([]);
      setSlots([]);
      return;
    }
    const list: TokenDisplay[] = (data ?? []).map((row: { id: string }) => ({ id: row.id }));
    setTokens(list);
    const ep = getEpoch();
    setEpoch(ep);
    const slotData = await ensureWallSlotsForEpoch(supabase, ep, list);
    setSlots(slotData);
  }, [ensureWallSlotsForEpoch]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  useEffect(() => {
    if (tokens.length === 0) return;
    const interval = setInterval(async () => {
      const ep = getEpoch();
      const supabase = createClient();
      const slotData = await ensureWallSlotsForEpoch(supabase, ep, tokens);
      setEpoch(ep);
      setSlots(slotData);
    }, RESHUFFLE_MS);
    return () => clearInterval(interval);
  }, [tokens, ensureWallSlotsForEpoch]);

  useEffect(() => {
    setClock(new Date());
    const interval = setInterval(() => setClock(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url("/wallbg.png")' }}
        aria-hidden
      />
      {/* Velum logo dead-center above everything — matches landing page */}
      <div className="absolute left-0 right-0 top-0 z-20 w-full flex justify-center pt-8 pb-2">
        <Link
          href="/"
          className="flex flex-col items-center transition-colors hover:opacity-90"
          style={{ color: VELUM_GOLD }}
          aria-label="Back to Velum"
        >
          <div className="w-[min(24vmin,140px)] h-[min(24vmin,140px)] md:w-[min(16vmin,120px)] md:h-[min(16vmin,120px)] relative">
            <img
              src="/velumclear.png"
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                opacity: metallicReady ? 0 : 1,
                transition: "opacity 0.25s ease-out",
                pointerEvents: "none",
              }}
              aria-hidden
            />
            <MetallicPaint
              imageSrc="/velumclear.png"
              scale={3.5}
              refraction={0.012}
              liquid={0.7}
              speed={0.25}
              brightness={2}
              lightColor="#ffffff"
              darkColor="#000000"
              fresnel={1}
              onReady={() => setMetallicReady(true)}
            />
          </div>
          <span
            className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight font-serif"
            style={{ color: VELUM_GOLD }}
          >
            Velum
          </span>
          <span className="text-sm md:text-base text-muted-foreground font-serif tracking-widest">
            Token Encryption Generation
          </span>
        </Link>
      </div>

      <div
        className="flex-1 flex flex-col justify-center items-center gap-0 px-2 pt-36 pb-24 relative z-10"
        style={{ minHeight: "calc(100vh - 120px)" }}
      >
        {Array.from({ length: ROWS }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid place-items-center gap-0 shrink-0 w-full"
            style={{
              gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
              borderBottom: `5px solid ${VELUM_GOLD}`,
              maxWidth: "min(95vw, 900px)",
            }}
          >
            {Array.from({ length: COLS }, (_, colIndex) => {
              const i = rowIndex * COLS + colIndex;
              const slot = slots[i] ?? { id: "—", lastChangedAt: null };
              return (
                <div
                  key={i}
                  className="relative group flex items-center justify-center w-full max-w-[90px] aspect-square p-0"
                >
                  <StaggeredGif slotIndex={i} epoch={epoch} />
                  <div
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                    aria-hidden
                  >
                    <div className="bg-black/90 text-white text-xs font-mono px-3 py-2 rounded-lg shadow-xl border border-white/20 max-w-[200px] text-center">
                      <div className="break-all">{slot.id}</div>
                      {slot.lastChangedAt && (
                        <div className="text-muted-foreground mt-1">
                          Last changed: {formatTime(slot.lastChangedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 py-2 flex justify-center z-10">
        <time
          dateTime={clock?.toISOString() ?? ""}
          className="text-7xl md:text-9xl font-serif font-bold italic tabular-nums text-foreground text-center"
        >
          {clock
            ? `${clock.getHours().toString().padStart(2, "0")}:${clock.getMinutes().toString().padStart(2, "0")}:${clock.getSeconds().toString().padStart(2, "0")}.${clock.getMilliseconds().toString().padStart(3, "0")}`
            : "—"}
        </time>
      </footer>

      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-destructive/90 text-destructive-foreground text-sm rounded">
          {error}
        </div>
      )}
    </div>
  );
}
