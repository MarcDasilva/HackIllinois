"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import {
  getWorkflow,
  saveWorkflow,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
} from "@/lib/workflow/storage";
import { runWorkflow, type StepResult } from "@/lib/workflow/runner";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconGitBranch,
  IconFileText,
  IconPhoto,
  IconBuildingBank,
  IconTargetArrow,
  IconX,
  IconRefresh,
  IconChevronDown,
  IconChevronUp,
  IconCreditCard,
  IconShoppingCart,
  IconArrowsExchange,
  IconPigMoney,
  IconCash,
  IconAlertTriangle,
  IconCheck,
  IconPlayerPlay,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconCircleDashed,
  IconAlertCircle,
  IconArrowDownLeft,
  IconArrowUpRight,
} from "@tabler/icons-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = "calc(var(--spacing) * 72)";
const BANK_PROFILES_KEY = "velum_bank_profiles";
const MINTED_DOCS_KEY = "velum_minted_documents";
const BANK_EVENTS_KEY = "velum_bank_events";
const NODE_WIDTH = 180;
const NODE_HEIGHT = 62; // approx header + description

// ─── Types ────────────────────────────────────────────────────────────────────

interface NessieAccount {
  _id: string;
  type: string;
  nickname: string;
  balance: number;
  rewards: number;
}

interface BankProfile {
  id: string;
  name: string;
  customerId: string;
  firstName: string;
  lastName: string;
  address: {
    street_number: string;
    street_name: string;
    city: string;
    state: string;
    zip: string;
  };
  accounts: NessieAccount[];
  createdAt: string;
}

interface MintedDocument {
  id: string;
  name: string;
  type: string;
  mintedAt: string;
  txHash?: string;
  size?: number;
}

interface NessieTx {
  _id: string;
  amount: number;
  description?: string;
  transaction_date?: string;
  purchase_date?: string;
  merchant_id?: string;
  payee_id?: string;
}

interface BankEvent {
  id: string;
  name: string;
  profileId: string;
  profileName: string;
  accountId: string;
  accountNickname: string;
  type: "deposit" | "withdrawal";
  amount: number;
  description: string;
  medium: "balance" | "rewards";
  repeat: string;
  active: boolean;
  runs: { timestamp: string; success: boolean; message: string }[];
}

// ─── Block definitions ────────────────────────────────────────────────────────

const BLOCK_TYPES = [
  {
    type: "DocumentUpload",
    label: "Document Upload",
    description: "Check minted documents",
    icon: IconFileText,
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
  },
  {
    type: "ImageUpload",
    label: "Image Upload",
    description: "Accept PNG / JPEG images",
    icon: IconPhoto,
    color: "#a855f7",
    bg: "rgba(168,85,247,0.12)",
  },
  {
    type: "BankingEvent",
    label: "Banking Event",
    description: "Capital One Nessie profile",
    icon: IconBuildingBank,
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
  },
  {
    type: "TargetSource",
    label: "Target Source",
    description: "Output approval result",
    icon: IconTargetArrow,
    color: "#f43f5e",
    bg: "rgba(244,63,94,0.12)",
  },
] as const;

type BlockTypeDef = (typeof BLOCK_TYPES)[number];

function blockDef(type: string): BlockTypeDef {
  return BLOCK_TYPES.find((b) => b.type === type) ?? BLOCK_TYPES[0];
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readBankProfiles(): BankProfile[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(BANK_PROFILES_KEY) ?? "[]"); }
  catch { return []; }
}

function readMintedDocs(): MintedDocument[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MINTED_DOCS_KEY) ?? "[]"); }
  catch { return []; }
}

function readBankEvents(): BankEvent[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(BANK_EVENTS_KEY) ?? "[]"); }
  catch { return []; }
}

// ─── Port geometry helpers ────────────────────────────────────────────────────

// Output port: right-center of node
function outputPort(node: WorkflowNode) {
  return { x: node.x + NODE_WIDTH, y: node.y + NODE_HEIGHT / 2 };
}

// Input port: left-center of node
function inputPort(node: WorkflowNode) {
  return { x: node.x, y: node.y + NODE_HEIGHT / 2 };
}

// Bezier path between two points
function bezierPath(sx: number, sy: number, tx: number, ty: number) {
  const dx = Math.abs(tx - sx) * 0.5;
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

// ─── Layout wrapper ───────────────────────────────────────────────────────────

function PageLayout({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <div
      className="flex flex-col flex-1 min-h-svh transition-[margin-left] duration-200 ease-linear"
      style={{ marginLeft: open ? SIDEBAR_WIDTH : "0px" }}
    >
      {children}
    </div>
  );
}

// ─── Canvas block ─────────────────────────────────────────────────────────────

function CanvasBlock({
  node,
  onDelete,
  onDragStart,
  onStartEdge,
  onOpenModal,
}: {
  node: WorkflowNode;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onStartEdge: (e: React.MouseEvent, nodeId: string) => void;
  onOpenModal: () => void;
}) {
  const def = blockDef(node.type);
  const Icon = def.icon;
  const [hovered, setHovered] = useState(false);
  // track whether a drag actually moved so we don't fire modal on drag-release
  const didDrag = useRef(false);
  const mouseDown = useRef(false);

  return (
    <div
      className="absolute select-none rounded-xl border transition-shadow"
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        borderColor: hovered ? def.color : "rgba(255,255,255,0.1)",
        background: hovered ? def.bg : "#111",
        boxShadow: hovered ? `0 0 0 2px ${def.color}33` : "none",
        cursor: "grab",
        zIndex: 10,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.stopPropagation();
        didDrag.current = false;
        mouseDown.current = true;
        onDragStart(e);
      }}
      onMouseMove={() => { if (mouseDown.current) didDrag.current = true; }}
      onMouseUp={() => { mouseDown.current = false; }}
      onClick={(e) => {
        e.stopPropagation();
        if (!didDrag.current) onOpenModal();
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="rounded-md p-1 shrink-0" style={{ background: def.bg }}>
          <Icon size={14} style={{ color: def.color }} />
        </div>
        <span className="text-xs font-medium text-white truncate flex-1">{node.label}</span>
        <button
          className="text-zinc-600 hover:text-red-400 transition-colors"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <IconX size={12} />
        </button>
      </div>
      <div className="px-3 pb-2 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
        {def.description}
      </div>

      {/* Input port — left center */}
      <div
        className="absolute rounded-full border-2 transition-all"
        style={{
          left: -6,
          top: NODE_HEIGHT / 2 - 6,
          width: 12,
          height: 12,
          background: "#111",
          borderColor: hovered ? def.color : "rgba(255,255,255,0.2)",
          zIndex: 20,
          cursor: "default",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Output port — right center */}
      <div
        className="absolute rounded-full border-2 transition-all"
        style={{
          right: -6,
          top: NODE_HEIGHT / 2 - 6,
          width: 12,
          height: 12,
          background: hovered ? def.color : "#111",
          borderColor: hovered ? def.color : "rgba(255,255,255,0.2)",
          zIndex: 20,
          cursor: "crosshair",
          boxShadow: hovered ? `0 0 6px ${def.color}88` : "none",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onStartEdge(e, node.id);
        }}
      />
    </div>
  );
}

// ─── Edge SVG layer ───────────────────────────────────────────────────────────

function EdgeLayer({
  edges,
  nodes,
  pendingEdge,
  onDeleteEdge,
}: {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
  pendingEdge: { sourceId: string; mouseX: number; mouseY: number } | null;
  onDeleteEdge: (id: string) => void;
}) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", zIndex: 5, overflow: "visible" }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.4)" />
        </marker>
        <marker id="arrowhead-hot" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
        </marker>
      </defs>

      {/* Committed edges */}
      {edges.map((edge) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return null;
        const s = outputPort(src);
        const t = inputPort(tgt);
        const srcDef = blockDef(src.type);
        return (
          <g key={edge.id} style={{ pointerEvents: "all" }}>
            {/* Fat invisible hit target */}
            <path
              d={bezierPath(s.x, s.y, t.x, t.y)}
              stroke="transparent"
              strokeWidth={12}
              fill="none"
              style={{ cursor: "pointer" }}
              onClick={() => onDeleteEdge(edge.id)}
            />
            {/* Visible arrow */}
            <path
              d={bezierPath(s.x, s.y, t.x, t.y)}
              stroke={srcDef.color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="0"
              opacity={0.6}
              markerEnd="url(#arrowhead)"
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}

      {/* Pending (in-progress) edge */}
      {pendingEdge && (() => {
        const src = nodeMap.get(pendingEdge.sourceId);
        if (!src) return null;
        const s = outputPort(src);
        return (
          <path
            d={bezierPath(s.x, s.y, pendingEdge.mouseX, pendingEdge.mouseY)}
            stroke="#6366f1"
            strokeWidth={1.5}
            fill="none"
            strokeDasharray="5 4"
            opacity={0.8}
            markerEnd="url(#arrowhead-hot)"
          />
        );
      })()}
    </svg>
  );
}

// ─── Inspector: Document Upload ───────────────────────────────────────────────

function DocumentUploadInspector({ node, onChange }: { node: WorkflowNode; onChange: (n: WorkflowNode) => void }) {
  const docs = readMintedDocs();
  const [selected, setSelected] = useState<string>(node.params.documentId ?? "");

  function pick(id: string) {
    setSelected(id);
    onChange({ ...node, params: { ...node.params, documentId: id } });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Label</label>
        <input
          className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.label}
          onChange={(e) => onChange({ ...node, label: e.target.value })}
        />
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-2">Minted Documents</p>
        {docs.length === 0 ? (
          <div className="rounded-lg px-3 py-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <IconFileText size={20} className="text-zinc-700 mx-auto mb-1" />
            <p className="text-xs text-zinc-600">No minted documents found.</p>
            <p className="text-xs text-zinc-700 mt-0.5">Mint documents via the Documents page.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {docs.map((doc) => (
              <button key={doc.id} onClick={() => pick(doc.id)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{
                  background: selected === doc.id ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selected === doc.id ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <IconFileText size={12} style={{ color: selected === doc.id ? "#3b82f6" : "#52525b" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{doc.name}</p>
                  <p className="text-xs text-zinc-600">{doc.type}</p>
                </div>
                {selected === doc.id && <IconCheck size={11} style={{ color: "#3b82f6" }} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Max Size (MB)</label>
        <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.params.maxSizeMb ?? ""} placeholder="10"
          onChange={(e) => onChange({ ...node, params: { ...node.params, maxSizeMb: e.target.value } })} />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Accepted types</label>
        <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.params.accept ?? ""} placeholder="pdf, txt"
          onChange={(e) => onChange({ ...node, params: { ...node.params, accept: e.target.value } })} />
      </div>
    </div>
  );
}

// ─── Inspector: Banking Event ─────────────────────────────────────────────────

function BankingEventInspector({ node, onChange }: { node: WorkflowNode; onChange: (n: WorkflowNode) => void }) {
  const profiles = readBankProfiles();
  const [selectedProfileId, setSelectedProfileId] = useState<string>(node.params.profileId ?? "");
  const [selectedAccountId, setSelectedAccountId] = useState<string>(node.params.accountId ?? "");
  const [transactions, setTransactions] = useState<{
    purchases: NessieTx[]; transfers: NessieTx[]; deposits: NessieTx[]; withdrawals: NessieTx[]; loans: NessieTx[];
  } | null>(null);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  function pickProfile(id: string) {
    setSelectedProfileId(id);
    setSelectedAccountId("");
    setTransactions(null);
    onChange({ ...node, params: { ...node.params, profileId: id, accountId: "" } });
  }

  function pickAccount(id: string) {
    setSelectedAccountId(id);
    setTransactions(null);
    onChange({ ...node, params: { ...node.params, accountId: id } });
  }

  async function loadTransactions() {
    if (!selectedAccountId) return;
    setLoadingTx(true);
    setTxError("");
    try {
      const res = await fetch(`/api/nessie?accountId=${encodeURIComponent(selectedAccountId)}`);
      if (!res.ok) throw new Error("failed");
      setTransactions(await res.json());
    } catch { setTxError("Could not fetch transactions from Nessie."); }
    finally { setLoadingTx(false); }
  }

  const txSections = transactions ? [
    { key: "purchases", label: "Purchases", items: transactions.purchases, icon: IconShoppingCart, color: "#a855f7" },
    { key: "transfers", label: "Transfers", items: transactions.transfers, icon: IconArrowsExchange, color: "#3b82f6" },
    { key: "deposits", label: "Deposits", items: transactions.deposits, icon: IconPigMoney, color: "#10b981" },
    { key: "withdrawals", label: "Withdrawals", items: transactions.withdrawals, icon: IconCash, color: "#f59e0b" },
    { key: "loans", label: "Loans", items: transactions.loans, icon: IconCreditCard, color: "#f43f5e" },
  ] : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Label</label>
        <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} />
      </div>

      <div>
        <p className="text-xs text-zinc-400 mb-2">Bank Profile</p>
        {profiles.length === 0 ? (
          <div className="rounded-lg px-3 py-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-zinc-600">No profiles. Add one in Bank Profiles.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {profiles.map((p) => (
              <button key={p.id} onClick={() => pickProfile(p.id)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{
                  background: selectedProfileId === p.id ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedProfileId === p.id ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <IconBuildingBank size={12} style={{ color: selectedProfileId === p.id ? "#10b981" : "#52525b" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{p.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{p.firstName} {p.lastName}</p>
                </div>
                {selectedProfileId === p.id && <IconCheck size={11} style={{ color: "#10b981" }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedProfile && (
        <div className="rounded-lg p-3 flex flex-col gap-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold text-white mb-0.5">{selectedProfile.firstName} {selectedProfile.lastName}</p>
          <p className="text-xs text-zinc-500 font-mono">{selectedProfile.customerId}</p>
          {selectedProfile.address.city && (
            <p className="text-xs text-zinc-500">
              {selectedProfile.address.street_number} {selectedProfile.address.street_name},{" "}
              {selectedProfile.address.city}, {selectedProfile.address.state} {selectedProfile.address.zip}
            </p>
          )}
          {selectedProfile.accounts.length > 0 && (
            <div className="mt-1 pt-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <p className="text-xs text-zinc-500 mb-1">Total Balance</p>
              <p className="text-sm font-semibold text-emerald-400">
                ${selectedProfile.accounts.reduce((s, a) => s + a.balance, 0).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}

      {selectedProfile && selectedProfile.accounts.length > 0 && (
        <div>
          <p className="text-xs text-zinc-400 mb-2">Account</p>
          <div className="flex flex-col gap-1">
            {selectedProfile.accounts.map((acct) => (
              <button key={acct._id} onClick={() => pickAccount(acct._id)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{
                  background: selectedAccountId === acct._id ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedAccountId === acct._id ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <IconCreditCard size={12} style={{ color: selectedAccountId === acct._id ? "#3b82f6" : "#52525b" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{acct.nickname || acct.type}</p>
                  <p className="text-xs text-zinc-600 capitalize">{acct.type}</p>
                </div>
                <span className="text-xs text-emerald-400 shrink-0">${acct.balance.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedAccountId && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-400">Transactions</p>
            <button onClick={loadTransactions} disabled={loadingTx}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors">
              <IconRefresh size={11} className={loadingTx ? "animate-spin" : ""} />
              {loadingTx ? "Loading…" : transactions ? "Refresh" : "Load"}
            </button>
          </div>
          {txError && (
            <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-amber-400 mb-2"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
              <IconAlertTriangle size={11} />{txError}
            </div>
          )}
          {transactions && (
            <div className="flex flex-col gap-1">
              {txSections.map(({ key, label, items, icon: TxIcon, color }) => (
                <div key={key} className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <button onClick={() => setExpandedSection((v) => v === key ? null : key)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-800 transition-colors"
                    style={{ background: "rgba(255,255,255,0.02)" }}>
                    <TxIcon size={11} style={{ color }} />
                    <span className="text-xs text-white flex-1 text-left">{label}</span>
                    <span className="text-xs text-zinc-500">{items.length}</span>
                    {expandedSection === key ? <IconChevronUp size={11} className="text-zinc-600" /> : <IconChevronDown size={11} className="text-zinc-600" />}
                  </button>
                  {expandedSection === key && items.length > 0 && (
                    <div className="flex flex-col divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      {items.slice(0, 10).map((tx) => (
                        <div key={tx._id} className="px-2.5 py-1.5 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-300 truncate">{tx.description ?? tx.merchant_id ?? tx.payee_id ?? tx._id.slice(0, 8)}</p>
                            <p className="text-xs text-zinc-600">{tx.purchase_date ?? tx.transaction_date ?? "—"}</p>
                          </div>
                          <span className="text-xs font-medium ml-2" style={{ color }}>${tx.amount?.toLocaleString() ?? "—"}</span>
                        </div>
                      ))}
                      {items.length > 10 && <p className="text-xs text-zinc-600 px-2.5 py-1.5">+{items.length - 10} more</p>}
                    </div>
                  )}
                  {expandedSection === key && items.length === 0 && <p className="text-xs text-zinc-600 px-2.5 py-2">None found.</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Spending Limit ($)</label>
        <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.params.spendingLimit ?? ""} placeholder="e.g. 5000"
          onChange={(e) => onChange({ ...node, params: { ...node.params, spendingLimit: e.target.value } })} />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Min Balance Required ($)</label>
        <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.params.minBalance ?? ""} placeholder="e.g. 1000"
          onChange={(e) => onChange({ ...node, params: { ...node.params, minBalance: e.target.value } })} />
      </div>
    </div>
  );
}

// ─── Inspector: Generic ───────────────────────────────────────────────────────

function GenericInspector({ node, onChange }: { node: WorkflowNode; onChange: (n: WorkflowNode) => void }) {
  const PARAM_LABELS: Record<string, Record<string, string>> = {
    ImageUpload: { maxSizeMb: "Max Size (MB)", accept: "Accepted types" },
    TargetSource: { walletPubkey: "Wallet Pubkey", threshold: "Approval Threshold" },
  };
  const params = PARAM_LABELS[node.type] ?? {};
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Label</label>
        <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
          value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} />
      </div>
      {Object.entries(params).map(([key, label]) => (
        <div key={key}>
          <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
          <input className="w-full rounded-lg border px-2.5 py-1.5 text-xs text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
            value={node.params[key] ?? ""} placeholder={label}
            onChange={(e) => onChange({ ...node, params: { ...node.params, [key]: e.target.value } })} />
        </div>
      ))}
    </div>
  );
}

// ─── Block Config Modal ───────────────────────────────────────────────────────

function BlockConfigModal({
  node,
  onChange,
  onClose,
}: {
  node: WorkflowNode;
  onChange: (n: WorkflowNode) => void;
  onClose: () => void;
}) {
  const def = blockDef(node.type);
  const Icon = def.icon;

  // Local draft so changes only commit on Save
  const [draft, setDraft] = useState<WorkflowNode>(node);

  function save() {
    onChange(draft);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.82)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl border border-zinc-800 w-full max-w-md shadow-2xl flex flex-col"
        style={{ background: "#0a0a0a", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ background: def.bg }}>
              <Icon size={15} style={{ color: def.color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{def.label}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Configure this block</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-4">

          {/* Label (always present) */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Block Label</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </div>

          {/* ── DocumentUpload ─────────────────────────────────────── */}
          {draft.type === "DocumentUpload" && (
            <DocumentUploadModalPanel draft={draft} setDraft={setDraft} />
          )}

          {/* ── BankingEvent ───────────────────────────────────────── */}
          {draft.type === "BankingEvent" && (
            <BankingEventModalPanel draft={draft} setDraft={setDraft} />
          )}

          {/* ── TargetSource ───────────────────────────────────────── */}
          {draft.type === "TargetSource" && (
            <TargetSourceModalPanel draft={draft} setDraft={setDraft} />
          )}

          {/* ── ImageUpload ────────────────────────────────────────── */}
          {draft.type === "ImageUpload" && (
            <ImageUploadModalPanel draft={draft} setDraft={setDraft} />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 justify-end px-5 py-4 border-t shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: def.color }}
          >
            <IconCheck size={14} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal panels ──────────────────────────────────────────────────────────────

function DocumentUploadModalPanel({
  draft,
  setDraft,
}: {
  draft: WorkflowNode;
  setDraft: (n: WorkflowNode) => void;
}) {
  const docs = readMintedDocs();
  const selected = draft.params.documentId ?? "";

  return (
    <>
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2">Select Minted Document</p>
        {docs.length === 0 ? (
          <div
            className="rounded-lg px-4 py-5 text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <IconFileText size={22} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No minted documents found.</p>
            <p className="text-xs text-zinc-700 mt-1">
              Go to the Documents page to mint a file first.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {docs.map((doc) => {
              const isSelected = selected === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setDraft({ ...draft, params: { ...draft.params, documentId: doc.id } })}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: isSelected ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isSelected ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div
                    className="rounded-md p-1.5 shrink-0"
                    style={{ background: isSelected ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)" }}
                  >
                    <IconFileText size={13} style={{ color: isSelected ? "#3b82f6" : "#52525b" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{doc.name}</p>
                    <p className="text-xs text-zinc-500">
                      {doc.type}
                      {doc.size ? ` · ${(doc.size / 1024).toFixed(1)} KB` : ""}
                      {doc.mintedAt ? ` · ${new Date(doc.mintedAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {isSelected && <IconCheck size={13} style={{ color: "#3b82f6", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Constraints */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-zinc-400 mb-1 block">Max Size (MB)</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            value={draft.params.maxSizeMb ?? ""}
            placeholder="10"
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, maxSizeMb: e.target.value } })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-zinc-400 mb-1 block">Accepted types</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            value={draft.params.accept ?? ""}
            placeholder="pdf, txt"
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, accept: e.target.value } })}
          />
        </div>
      </div>
    </>
  );
}

function BankingEventModalPanel({
  draft,
  setDraft,
}: {
  draft: WorkflowNode;
  setDraft: (n: WorkflowNode) => void;
}) {
  const events = readBankEvents();
  const selected = draft.params.bankEventId ?? "";
  const selectedEvent = events.find((e) => e.id === selected);

  return (
    <>
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2">Select Bank Event</p>
        {events.length === 0 ? (
          <div
            className="rounded-lg px-4 py-5 text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <IconBuildingBank size={22} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No bank events found.</p>
            <p className="text-xs text-zinc-700 mt-1">
              Go to Bank Profiles → Bank Events to create one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((ev) => {
              const isSelected = selected === ev.id;
              const isDeposit = ev.type === "deposit";
              const typeColor = isDeposit ? "#10b981" : "#f87171";
              const typeBg = isDeposit ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)";
              const lastRun = ev.runs[ev.runs.length - 1];
              return (
                <button
                  key={ev.id}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      params: {
                        ...draft.params,
                        bankEventId: ev.id,
                        profileId: ev.profileId,
                        accountId: ev.accountId,
                      },
                    })
                  }
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: isSelected ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isSelected ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div className="rounded-md p-1.5 shrink-0 mt-0.5" style={{ background: typeBg }}>
                    {isDeposit
                      ? <IconArrowDownLeft size={13} style={{ color: typeColor }} />
                      : <IconArrowUpRight size={13} style={{ color: typeColor }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-white truncate">{ev.name}</p>
                      {!ev.active && (
                        <span className="text-xs px-1.5 rounded" style={{ background: "rgba(255,255,255,0.07)", color: "#71717a" }}>
                          paused
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      <span style={{ color: typeColor }}>{isDeposit ? "Deposit" : "Withdrawal"}</span>
                      {" "}
                      <span className="text-zinc-300 font-medium">${ev.amount.toLocaleString()}</span>
                      {" via "}{ev.medium}
                      {" · "}{ev.profileName} / {ev.accountNickname}
                    </p>
                    {lastRun && (
                      <p className="text-xs mt-0.5" style={{ color: lastRun.success ? "#10b981" : "#f87171" }}>
                        Last run: {new Date(lastRun.timestamp).toLocaleDateString()} — {lastRun.success ? "success" : "failed"}
                      </p>
                    )}
                  </div>
                  {isSelected && <IconCheck size={13} style={{ color: "#10b981", flexShrink: 0, marginTop: 2 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Show selected event summary */}
      {selectedEvent && (
        <div
          className="rounded-lg px-3 py-2.5 flex flex-col gap-1"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-xs text-zinc-500">Linked to event</p>
          <p className="text-xs font-medium text-white">{selectedEvent.name}</p>
          <p className="text-xs text-zinc-500 font-mono">
            Profile: {selectedEvent.profileId.slice(0, 8)}… · Account: {selectedEvent.accountId.slice(0, 8)}…
          </p>
        </div>
      )}

      {/* Thresholds */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-zinc-400 mb-1 block">Spending Limit ($)</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            value={draft.params.spendingLimit ?? ""}
            placeholder="5000"
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, spendingLimit: e.target.value } })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-zinc-400 mb-1 block">Min Balance ($)</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            value={draft.params.minBalance ?? ""}
            placeholder="1000"
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, minBalance: e.target.value } })}
          />
        </div>
      </div>
    </>
  );
}

function TargetSourceModalPanel({
  draft,
  setDraft,
}: {
  draft: WorkflowNode;
  setDraft: (n: WorkflowNode) => void;
}) {
  return (
    <>
      {/* Info blurb */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs text-zinc-400"
        style={{ background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.18)" }}
      >
        The Target Source is the final node of your workflow. It aggregates all upstream results and
        issues an approval verdict. Configure the sendee — the recipient who will receive the outcome.
      </div>

      {/* Sendee name */}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Sendee Name</label>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          value={draft.params.sendeeName ?? ""}
          placeholder="e.g. Jane Doe"
          onChange={(e) => setDraft({ ...draft, params: { ...draft.params, sendeeName: e.target.value } })}
        />
      </div>

      {/* Sendee email */}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Sendee Email</label>
        <input
          type="email"
          className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          value={draft.params.sendeeEmail ?? ""}
          placeholder="jane@example.com"
          onChange={(e) => setDraft({ ...draft, params: { ...draft.params, sendeeEmail: e.target.value } })}
        />
      </div>

      {/* Wallet pubkey */}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Wallet Address (optional)</label>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          value={draft.params.walletPubkey ?? ""}
          placeholder="Solana pubkey…"
          onChange={(e) => setDraft({ ...draft, params: { ...draft.params, walletPubkey: e.target.value } })}
        />
      </div>

      {/* Approval threshold */}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Approval Threshold (warnings)</label>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          value={draft.params.threshold ?? ""}
          placeholder="e.g. 2"
          onChange={(e) => setDraft({ ...draft, params: { ...draft.params, threshold: e.target.value } })}
        />
        <p className="text-xs text-zinc-600 mt-1">
          If warnings exceed this number the result becomes "Conditionally Approved".
        </p>
      </div>
    </>
  );
}

function ImageUploadModalPanel({
  draft,
  setDraft,
}: {
  draft: WorkflowNode;
  setDraft: (n: WorkflowNode) => void;
}) {
  return (
    <>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-zinc-400 mb-1 block">Max Size (MB)</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            value={draft.params.maxSizeMb ?? ""}
            placeholder="10"
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, maxSizeMb: e.target.value } })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-zinc-400 mb-1 block">Accepted types</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            value={draft.params.accept ?? ""}
            placeholder="png, jpg, jpeg"
            onChange={(e) => setDraft({ ...draft, params: { ...draft.params, accept: e.target.value } })}
          />
        </div>
      </div>
    </>
  );
}

// ─── Inspector panel ──────────────────────────────────────────────────────────

function Inspector({ node, onChange, onClose }: { node: WorkflowNode; onChange: (n: WorkflowNode) => void; onClose: () => void }) {
  const def = blockDef(node.type);
  const Icon = def.icon;
  return (
    <div className="w-72 shrink-0 border-l flex flex-col" style={{ background: "#0a0a0a", borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2">
          <div className="rounded-md p-1" style={{ background: def.bg }}>
            <Icon size={13} style={{ color: def.color }} />
          </div>
          <span className="text-xs font-semibold text-white">{node.label}</span>
        </div>
        <button className="text-zinc-500 hover:text-white transition-colors" onClick={onClose}>
          <IconX size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {node.type === "DocumentUpload" && <DocumentUploadInspector node={node} onChange={onChange} />}
        {node.type === "BankingEvent" && <BankingEventInspector node={node} onChange={onChange} />}
        {node.type !== "DocumentUpload" && node.type !== "BankingEvent" && <GenericInspector node={node} onChange={onChange} />}
      </div>
    </div>
  );
}

// ─── Timeline panel ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  StepResult["status"],
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  pending: { icon: IconCircleDashed, color: "#52525b", bg: "rgba(82,82,91,0.1)", label: "Pending" },
  running: { icon: IconLoader2, color: "#6366f1", bg: "rgba(99,102,241,0.1)", label: "Running…" },
  pass: { icon: IconCircleCheck, color: "#10b981", bg: "rgba(16,185,129,0.1)", label: "Passed" },
  fail: { icon: IconCircleX, color: "#f43f5e", bg: "rgba(244,63,94,0.1)", label: "Failed" },
  warn: { icon: IconAlertCircle, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "Warning" },
  skip: { icon: IconCircleDashed, color: "#71717a", bg: "rgba(113,113,122,0.1)", label: "Skipped" },
};

function TimelineStep({ step, isLast }: { step: StepResult; isLast: boolean }) {
  const cfg = STATUS_CONFIG[step.status];
  const Icon = cfg.icon;
  const def = blockDef(step.nodeType);

  return (
    <div className="flex gap-3">
      {/* Connector line */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 28,
            height: 28,
            background: cfg.bg,
            border: `1px solid ${cfg.color}44`,
          }}
        >
          <Icon
            size={14}
            style={{ color: cfg.color }}
            className={step.status === "running" ? "animate-spin" : ""}
          />
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ background: "rgba(255,255,255,0.07)", minHeight: 16 }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="rounded p-0.5 shrink-0" style={{ background: def.bg }}>
            <def.icon size={10} style={{ color: def.color }} />
          </div>
          <span className="text-xs font-medium text-white truncate">{step.label}</span>
          <span
            className="text-xs shrink-0 ml-auto"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{step.message}</p>
        {step.detail && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.28)" }}>
            {step.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function RunTimeline({
  steps,
  running,
  finalStatus,
  summary,
  onClose,
  onRerun,
}: {
  steps: StepResult[];
  running: boolean;
  finalStatus: "approved" | "denied" | "incomplete" | null;
  summary: string;
  onClose: () => void;
  onRerun: () => void;
}) {
  const verdictConfig = {
    approved: { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", icon: IconCircleCheck, label: "Approved" },
    denied: { color: "#f43f5e", bg: "rgba(244,63,94,0.1)", border: "rgba(244,63,94,0.25)", icon: IconCircleX, label: "Denied" },
    incomplete: { color: "#6366f1", bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.25)", icon: IconAlertCircle, label: "Incomplete" },
  };

  const verdict = finalStatus ? verdictConfig[finalStatus] : null;

  return (
    <div
      className="w-80 shrink-0 border-l flex flex-col"
      style={{ background: "#0a0a0a", borderColor: "rgba(255,255,255,0.08)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <IconPlayerPlay size={13} className="text-zinc-400" />
          <span className="text-xs font-semibold text-white">Run Timeline</span>
          {running && (
            <span className="text-xs text-indigo-400 animate-pulse">Running…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!running && (
            <button
              onClick={onRerun}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800"
            >
              <IconRefresh size={11} />
              Re-run
            </button>
          )}
          <button
            className="text-zinc-500 hover:text-white transition-colors ml-1"
            onClick={onClose}
          >
            <IconX size={14} />
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-4">
        {steps.length === 0 && running && (
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <IconLoader2 size={13} className="animate-spin text-indigo-400" />
            Starting workflow…
          </div>
        )}

        {steps.map((step, i) => (
          <TimelineStep key={step.nodeId} step={step} isLast={i === steps.length - 1 && !running} />
        ))}
      </div>

      {/* Verdict */}
      {verdict && !running && (
        <div
          className="px-4 py-3 border-t shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="rounded-xl p-3 flex items-start gap-2.5"
            style={{
              background: verdict.bg,
              border: `1px solid ${verdict.border}`,
            }}
          >
            <verdict.icon size={16} style={{ color: verdict.color }} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold" style={{ color: verdict.color }}>
                {verdict.label}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                {summary}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [saved, setSaved] = useState(false);
  const [modalNodeId, setModalNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Run state
  const [showTimeline, setShowTimeline] = useState(false);
  const [runSteps, setRunSteps] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [finalStatus, setFinalStatus] = useState<"approved" | "denied" | "incomplete" | null>(null);
  const [runSummary, setRunSummary] = useState("");

  // Node dragging
  const dragging = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Edge drawing
  const [pendingEdge, setPendingEdge] = useState<{ sourceId: string; mouseX: number; mouseY: number } | null>(null);
  const pendingEdgeRef = useRef<{ sourceId: string } | null>(null);

  // Load
  useEffect(() => {
    const wf = getWorkflow(workflowId);
    if (!wf) { router.replace("/dashboard/workflows"); return; }
    setWorkflow(wf);
    setNodes(wf.nodes);
    setEdges(wf.edges ?? []);
  }, [workflowId, router]);

  // Save
  const handleSave = useCallback(() => {
    if (!workflow) return;
    saveWorkflow({ ...workflow, nodes, edges });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [workflow, nodes, edges]);

  // Run
  const handleRun = useCallback(async () => {
    if (running) return;
    // Auto-save first
    if (workflow) saveWorkflow({ ...workflow, nodes, edges });
    // Reset timeline
    setRunSteps([]);
    setFinalStatus(null);
    setRunSummary("");
    setShowTimeline(true);
    setRunning(true);

    const result = await runWorkflow(nodes, edges, (step) => {
      setRunSteps((prev) => {
        const idx = prev.findIndex((s) => s.nodeId === step.nodeId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = step;
          return next;
        }
        return [...prev, step];
      });
    });

    setFinalStatus(result.finalStatus);
    setRunSummary(result.summary);
    setRunning(false);
  }, [running, workflow, nodes, edges]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  // ── Node drag ────────────────────────────────────────────────────────────

  function startNodeDrag(e: React.MouseEvent, nodeId: string, origX: number, origY: number) {
    dragging.current = { nodeId, startX: e.clientX, startY: e.clientY, origX, origY };
  }

  // ── Edge drawing ─────────────────────────────────────────────────────────

  function startEdge(e: React.MouseEvent, sourceId: string) {
    e.preventDefault();
    e.stopPropagation();
    pendingEdgeRef.current = { sourceId };
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPendingEdge({ sourceId, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top });
  }

  // ── Unified mouse move ────────────────────────────────────────────────────

  function onMouseMove(e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Move node
    const d = dragging.current;
    if (d) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const { nodeId, origX, origY } = d;
      setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, x: origX + dx, y: origY + dy } : n));
    }

    // Update pending edge endpoint
    if (pendingEdgeRef.current) {
      setPendingEdge({
        sourceId: pendingEdgeRef.current.sourceId,
        mouseX: e.clientX - rect.left,
        mouseY: e.clientY - rect.top,
      });
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    dragging.current = null;

    // Finish edge — check if mouse released over an input port (handled via node mouseUp)
    // If released on canvas (not a node port), cancel
    if (pendingEdgeRef.current) {
      pendingEdgeRef.current = null;
      setPendingEdge(null);
    }
  }

  function finishEdge(targetId: string) {
    const pe = pendingEdgeRef.current;
    if (!pe) return;
    if (pe.sourceId === targetId) { // no self-loops
      pendingEdgeRef.current = null;
      setPendingEdge(null);
      return;
    }
    // Prevent duplicate edges
    setEdges((prev) => {
      const exists = prev.some((e) => e.source === pe.sourceId && e.target === targetId);
      if (exists) return prev;
      return [...prev, { id: crypto.randomUUID(), source: pe.sourceId, target: targetId }];
    });
    pendingEdgeRef.current = null;
    setPendingEdge(null);
  }

  // ── Canvas drop ───────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("block-type");
    if (!type || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const def = blockDef(type);
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label: def.label,
      x: e.clientX - rect.left - NODE_WIDTH / 2,
      y: e.clientY - rect.top - NODE_HEIGHT / 2,
      params: {},
    };
    setNodes((prev) => [...prev, newNode]);
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
  }

  function deleteEdge(id: string) {
    setEdges((prev) => prev.filter((e) => e.id !== id));
  }

  function updateNode(updated: WorkflowNode) {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  const selectedNode = nodes.find((n) => n.id === modalNodeId) ?? null;

  if (!workflow) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ height: "calc(100vh - 48px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 h-12 shrink-0 border-b" style={{ background: "#0a0a0a", borderColor: "rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard/workflows" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
          <IconArrowLeft size={14} />
          Workflows
        </Link>
        <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="flex items-center gap-2">
          <IconGitBranch size={14} className="text-zinc-400" />
          <span className="text-sm font-medium text-white">{workflow.name}</span>
        </div>
        <div className="flex-1" />
        {edges.length > 0 && (
          <span className="text-xs text-zinc-600">{edges.length} connection{edges.length !== 1 ? "s" : ""}</span>
        )}
        <button
          onClick={handleRun}
          disabled={running || nodes.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: running || nodes.length === 0 ? "rgba(255,255,255,0.04)" : "rgba(99,102,241,0.15)",
            border: `1px solid ${running || nodes.length === 0 ? "rgba(255,255,255,0.08)" : "rgba(99,102,241,0.4)"}`,
            color: running || nodes.length === 0 ? "#52525b" : "#a5b4fc",
            cursor: running || nodes.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {running ? (
            <IconLoader2 size={13} className="animate-spin" />
          ) : (
            <IconPlayerPlay size={13} />
          )}
          {running ? "Running…" : "Run"}
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
        >
          <IconDeviceFloppy size={13} />
          {saved ? "Saved!" : "Save"}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Block palette */}
        <div className="w-52 shrink-0 border-r flex flex-col gap-1 p-3 overflow-y-auto" style={{ background: "#0a0a0a", borderColor: "rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">Blocks</p>
          {BLOCK_TYPES.map((def) => {
            const Icon = def.icon;
            return (
              <div key={def.type} draggable
                onDragStart={(e) => { e.dataTransfer.setData("block-type", def.type); }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-grab hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
              >
                <div className="rounded-md p-1 shrink-0" style={{ background: def.bg }}>
                  <Icon size={13} style={{ color: def.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white leading-tight truncate">{def.label}</p>
                  <p className="text-xs leading-tight" style={{ color: "rgba(255,255,255,0.35)" }}>{def.description}</p>
                </div>
              </div>
            );
          })}
          <div className="mt-4 px-1 flex flex-col gap-2">
            <p className="text-xs text-zinc-600 leading-relaxed">
              Drag blocks onto the canvas to build your workflow.
            </p>
            <p className="text-xs text-zinc-700 leading-relaxed">
              Drag from the <span className="text-zinc-500">right dot</span> of a block to the <span className="text-zinc-500">left dot</span> of another to connect them.
            </p>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden"
          style={{
            background: "#080808",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            cursor: pendingEdge ? "crosshair" : "default",
          }}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => setModalNodeId(null)}
        >
          {/* SVG edge layer */}
          <EdgeLayer
            edges={edges}
            nodes={nodes}
            pendingEdge={pendingEdge}
            onDeleteEdge={deleteEdge}
          />

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <IconGitBranch size={36} className="text-zinc-800 mb-3" />
              <p className="text-sm text-zinc-700">Drag blocks from the left panel to get started</p>
            </div>
          )}

          {nodes.map((node) => (
            <CanvasBlock
              key={node.id}
              node={node}
              onDelete={() => deleteNode(node.id)}
              onDragStart={(e) => startNodeDrag(e, node.id, node.x, node.y)}
              onStartEdge={startEdge}
              onOpenModal={() => setModalNodeId(node.id)}
            />
          ))}

          {/* Invisible per-node drop zones for finishing edges */}
          {nodes.map((node) => (
            <div
              key={`drop-${node.id}`}
              className="absolute"
              style={{
                left: node.x - 8,
                top: node.y - 8,
                width: NODE_WIDTH + 16,
                height: NODE_HEIGHT + 16,
                zIndex: pendingEdge ? 30 : -1,
                cursor: "crosshair",
              }}
              onMouseUp={(e) => {
                if (pendingEdgeRef.current) {
                  e.stopPropagation();
                  finishEdge(node.id);
                }
              }}
            />
          ))}
        </div>

        {/* Run Timeline */}
        {showTimeline && (
          <RunTimeline
            steps={runSteps}
            running={running}
            finalStatus={finalStatus}
            summary={runSummary}
            onClose={() => setShowTimeline(false)}
            onRerun={handleRun}
          />
        )}
      </div>

      {/* Block config modal */}
      {modalNodeId && (() => {
        const modalNode = nodes.find((n) => n.id === modalNodeId);
        if (!modalNode) return null;
        return (
          <BlockConfigModal
            node={modalNode}
            onChange={(updated) => { updateNode(updated); }}
            onClose={() => setModalNodeId(null)}
          />
        );
      })()}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowEditPage() {
  const params = useParams();
  const id = params.id as string;
  const { user, signOut } = useAuth();
  const displayUser = {
    name: user?.user_metadata?.full_name ?? user?.email ?? "User",
    email: user?.email ?? "",
    avatar: user?.user_metadata?.avatar_url,
  };

  return (
    <SidebarProvider style={{ "--sidebar-width": SIDEBAR_WIDTH, "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <AppSidebar user={displayUser} onSignOut={signOut} />
      <PageLayout>
        <WorkflowEditor workflowId={id} />
      </PageLayout>
    </SidebarProvider>
  );
}
