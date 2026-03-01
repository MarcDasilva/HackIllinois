"use client";
/**
 * components/workflow/BlockLibrary.tsx
 * Left panel: categorized, draggable block tiles for the canvas.
 */

import { useState } from "react";
import { NODE_REGISTRY, CATEGORY_ORDER, type NodeCategory } from "@/lib/workflow/node-registry";

interface Props {
  onAddNode: (type: string) => void;
}

const CAT_ICONS: Record<NodeCategory, string> = {
  Documents: "◻",
  Images: "◼",
  Banking: "◈",
  Crypto: "◉",
  Logic: "◇",
  Output: "◎",
};

const CAT_BG: Record<NodeCategory, string> = {
  Documents: "bg-blue-600",
  Images: "bg-purple-600",
  Banking: "bg-emerald-600",
  Crypto: "bg-violet-600",
  Logic: "bg-amber-600",
  Output: "bg-rose-600",
};

const CAT_TEXT: Record<NodeCategory, string> = {
  Documents: "text-blue-400",
  Images: "text-purple-400",
  Banking: "text-emerald-400",
  Crypto: "text-violet-400",
  Logic: "text-amber-400",
  Output: "text-rose-400",
};

const CAT_BORDER: Record<NodeCategory, string> = {
  Documents: "border-blue-500/20 hover:border-blue-500/50",
  Images: "border-purple-500/20 hover:border-purple-500/50",
  Banking: "border-emerald-500/20 hover:border-emerald-500/50",
  Crypto: "border-violet-500/20 hover:border-violet-500/50",
  Logic: "border-amber-500/20 hover:border-amber-500/50",
  Output: "border-rose-500/20 hover:border-rose-500/50",
};

export function BlockLibrary({ onAddNode }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<NodeCategory>>(new Set());

  const filtered = NODE_REGISTRY.filter(
    (n) =>
      !search ||
      n.label.toLowerCase().includes(search.toLowerCase()) ||
      n.description.toLowerCase().includes(search.toLowerCase()) ||
      n.category.toLowerCase().includes(search.toLowerCase())
  );

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    nodes: filtered.filter((n) => n.category === cat),
  })).filter((g) => g.nodes.length > 0);

  function toggleCat(cat: NodeCategory) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-white/8 w-64 shrink-0">
      {/* Header */}
      <div className="px-3 py-3 border-b border-white/8">
        <p className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wide">Blocks</p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search blocks…"
          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
        />
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto py-2">
        {byCategory.map(({ cat, nodes }) => (
          <div key={cat} className="mb-1">
            {/* Category header */}
            <button
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/3 transition-colors"
            >
              <span className={`w-5 h-5 rounded flex items-center justify-center text-white text-xs shrink-0 ${CAT_BG[cat]}`}>
                {CAT_ICONS[cat]}
              </span>
              <span className={`text-[11px] font-semibold ${CAT_TEXT[cat]}`}>{cat}</span>
              <span className="ml-auto text-zinc-600 text-[10px]">
                {collapsed.has(cat) ? "▸" : "▾"}
              </span>
            </button>

            {/* Block tiles */}
            {!collapsed.has(cat) && (
              <div className="px-2 space-y-1 pb-1">
                {nodes.map((n) => (
                  <button
                    key={n.type}
                    onClick={() => onAddNode(n.type)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/workflow-node-type", n.type);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className={`w-full text-left rounded-xl border bg-zinc-900 px-3 py-2.5 transition-all group cursor-grab active:cursor-grabbing ${CAT_BORDER[cat]}`}
                    title={n.description}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs ${CAT_TEXT[cat]}`}>{CAT_ICONS[cat]}</span>
                      <span className="text-[11px] font-semibold text-white leading-tight">{n.label}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">{n.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {byCategory.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-8 px-3">No blocks match &ldquo;{search}&rdquo;</p>
        )}
      </div>

      <div className="px-3 py-2 border-t border-white/8 text-[10px] text-zinc-600">
        Click or drag a block onto the canvas
      </div>
    </div>
  );
}
