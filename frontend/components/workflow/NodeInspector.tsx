"use client";
/**
 * components/workflow/NodeInspector.tsx
 * Right panel: shows selected node details and lets user edit params.
 * Wallet setup is prompted inline only when a Crypto-category node is selected.
 */

import { NODE_MAP, CATEGORY_COLORS } from "@/lib/workflow/node-registry";
import type { NodeRunResult } from "@/lib/workflow/types";

interface InspectorNode {
  id: string;
  type: string;
  data: { params?: Record<string, unknown>; [key: string]: unknown };
}

interface Props {
  node: InspectorNode | null;
  runResult?: NodeRunResult | null;
  onParamChange: (nodeId: string, paramId: string, value: unknown) => void;
  onClose: () => void;
  walletPubkey?: string;
  onWalletChange?: (pubkey: string) => void;
}

// Which node types need a wallet pubkey to function
const WALLET_NODES = new Set(["WalletConnect", "WriteAttestation", "SignMessage"]);

// Per-node wallet prompt copy
const WALLET_PROMPT: Record<string, { title: string; hint: string }> = {
  WalletConnect: {
    title: "Connect Solana Wallet",
    hint: "Paste your Solana public key. This will be used as the signer identity for downstream nodes.",
  },
  SignMessage: {
    title: "Wallet Required — Sign Message",
    hint: "This node signs an arbitrary message with your Solana keypair. Paste your public key so the workflow knows which wallet to use.",
  },
  WriteAttestation: {
    title: "Wallet Required — On-chain Attestation",
    hint: "This node writes a SHA-256 hash to Solana devnet via the Memo program. Your wallet public key is included in the attestation record.",
  },
};

export function NodeInspector({ node, runResult, onParamChange, onClose, walletPubkey, onWalletChange }: Props) {
  if (!node) {
    return (
      <div className="w-64 shrink-0 bg-zinc-950 border-l border-white/8 flex items-center justify-center">
        <p className="text-xs text-zinc-600 text-center px-4">
          Click a node to inspect and configure it.
        </p>
      </div>
    );
  }

  const def = NODE_MAP.get(node.type);
  if (!def) return null;

  const params = node.data.params ?? {};
  const colorCls = CATEGORY_COLORS[def.category];
  const needsWallet = WALLET_NODES.has(node.type);
  const walletPrompt = WALLET_PROMPT[node.type];
  const walletMissing = needsWallet && !walletPubkey;

  return (
    <div className="w-72 shrink-0 bg-zinc-950 border-l border-white/8 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${colorCls}`}>
              {def.category}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white leading-tight">{def.label}</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">{def.description}</p>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-white text-sm shrink-0 mt-0.5">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Wallet prompt (only for Crypto nodes that need a wallet) ── */}
        {needsWallet && onWalletChange !== undefined && (
          <div className={`px-4 py-3 border-b ${
            walletMissing
              ? "border-amber-500/40 bg-amber-500/8"
              : "border-emerald-500/20 bg-emerald-500/5"
          }`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${walletMissing ? "text-amber-400" : "text-emerald-400"}`}>
                {walletMissing ? "⚠ " : "✓ "}{walletPrompt?.title ?? "Solana Wallet"}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-snug mb-2">
              {walletPrompt?.hint ?? "Paste your Solana public key to use this node."}
            </p>
            <input
              type="text"
              value={walletPubkey ?? ""}
              onChange={(e) => onWalletChange(e.target.value)}
              placeholder="e.g. EhfBjnWQ…YP"
              className={`w-full bg-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono border ${
                walletMissing
                  ? "border-amber-400/30 focus:ring-1 focus:ring-amber-400/40"
                  : "border-emerald-500/30 focus:ring-1 focus:ring-emerald-400/30"
              }`}
            />
            {walletPubkey && (
              <p className="text-[10px] text-emerald-400 mt-1 font-mono truncate">
                {walletPubkey.slice(0, 8)}…{walletPubkey.slice(-6)}
              </p>
            )}
          </div>
        )}

        {/* Parameters */}
        {def.params.length > 0 && (
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-[11px] font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Parameters</p>
            <div className="space-y-3">
              {def.params.map((param) => (
                <div key={param.id}>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">{param.label}</label>
                  {param.type === "select" ? (
                    <select
                      value={String(params[param.id] ?? param.default ?? "")}
                      onChange={(e) => onParamChange(node.id, param.id, e.target.value)}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                    >
                      {param.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : param.type === "textarea" ? (
                    <textarea
                      value={String(params[param.id] ?? param.default ?? "")}
                      onChange={(e) => onParamChange(node.id, param.id, e.target.value)}
                      rows={4}
                      placeholder={param.placeholder}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none font-mono"
                    />
                  ) : param.type === "boolean" ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(params[param.id] ?? param.default)}
                        onChange={(e) => onParamChange(node.id, param.id, e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-xs text-zinc-400">Enabled</span>
                    </label>
                  ) : (
                    <input
                      type={param.type === "number" ? "number" : "text"}
                      value={String(params[param.id] ?? param.default ?? "")}
                      onChange={(e) => onParamChange(node.id, param.id, param.type === "number" ? Number(e.target.value) : e.target.value)}
                      placeholder={param.placeholder}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input ports */}
        {def.inputs.length > 0 && (
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-[11px] font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Inputs</p>
            <div className="space-y-1.5">
              {def.inputs.map((port) => (
                <div key={port.id} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                  <span className="text-xs text-zinc-400 flex-1">{port.label}</span>
                  <span className="text-[10px] font-mono text-zinc-600">{port.type}</span>
                  {port.required && <span className="text-[9px] text-red-400">req</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Output ports */}
        {def.outputs.length > 0 && (
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-[11px] font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Outputs</p>
            <div className="space-y-1.5">
              {def.outputs.map((port) => (
                <div key={port.id} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 flex-1">{port.label}</span>
                  <span className="text-[10px] font-mono text-zinc-600">{port.type}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Run result */}
        {runResult && (
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Last Run</p>
            <div className={`text-xs font-medium mb-2 ${
              runResult.status === "done" ? "text-emerald-400" :
              runResult.status === "error" ? "text-red-400" :
              runResult.status === "running" ? "text-yellow-400" : "text-zinc-400"
            }`}>
              {runResult.status} · {runResult.durationMs}ms
            </div>
            {runResult.error && (
              <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-2 mb-2">
                <p className="text-xs text-red-400">{runResult.error}</p>
              </div>
            )}
            {Object.keys(runResult.output).length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-zinc-600 mb-1">Outputs:</p>
                {Object.entries(runResult.output).slice(0, 6).map(([k, v]) => (
                  <div key={k} className="bg-zinc-800/50 rounded p-1.5">
                    <span className="text-[10px] font-mono text-zinc-500">{k}: </span>
                    <span className="text-[10px] font-mono text-zinc-300 break-all">
                      {typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 space-y-0.5">
              {runResult.logs.slice(-4).map((log, i) => (
                <p key={i} className="text-[10px] font-mono text-zinc-600 leading-tight">{log}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
