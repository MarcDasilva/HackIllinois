// lib/workflow/runner.ts
// Workflow execution engine — topological sort + per-node evaluators

import type { WorkflowNode, WorkflowEdge } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = "pending" | "running" | "pass" | "fail" | "skip" | "warn";

// Minimal doc shape passed in from the caller (sourced from Supabase wallet_history)
export interface RunnerDoc {
  id: string;
  name: string;
}

export interface StepResult {
  nodeId: string;
  nodeType: string;
  label: string;
  status: StepStatus;
  message: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface RunResult {
  steps: StepResult[];
  finalStatus: "approved" | "denied" | "incomplete";
  summary: string;
}

// ─── Topological sort (Kahn's algorithm) ─────────────────────────────────────

function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] | null {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (node) sorted.push(node);
    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Cycle detected
  if (sorted.length !== nodes.length) return null;
  return sorted;
}

// ─── Nessie fetch helper ──────────────────────────────────────────────────────

interface NessieTx {
  _id: string;
  amount: number;
  description?: string;
  purchase_date?: string;
  transaction_date?: string;
}

interface NessieTransactions {
  purchases: NessieTx[];
  transfers: NessieTx[];
  deposits: NessieTx[];
  withdrawals: NessieTx[];
  loans: NessieTx[];
}

async function fetchTransactions(accountId: string): Promise<NessieTransactions> {
  const res = await fetch(`/api/nessie?accountId=${encodeURIComponent(accountId)}`);
  if (!res.ok) throw new Error(`Nessie API error: ${res.status}`);
  return res.json();
}

// ─── Per-node evaluators ──────────────────────────────────────────────────────

async function evalDocumentUpload(
  node: WorkflowNode,
  _context: Map<string, StepResult>,
  mintedDocs: RunnerDoc[]
): Promise<StepResult> {
  const base = { nodeId: node.id, nodeType: node.type, label: node.label };

  const documentId = node.params.documentId;
  if (!documentId) {
    return {
      ...base,
      status: "fail",
      message: "No document attached",
      detail: "Open the block and select a minted document.",
    };
  }

  const doc = mintedDocs.find((d) => d.id === documentId);
  if (!doc) {
    return {
      ...base,
      status: "fail",
      message: "Attached document not found",
      detail: `Document ID ${documentId} could not be found in your minted documents.`,
    };
  }

  // Type check (by extension from filename)
  const accepted = node.params.accept
    ? node.params.accept.split(",").map((t) => t.trim().toLowerCase())
    : [];
  if (accepted.length > 0) {
    const ext = doc.name.split(".").pop()?.toLowerCase() ?? "";
    if (!accepted.includes(ext)) {
      return {
        ...base,
        status: "fail",
        message: `File type not accepted`,
        detail: `"${doc.name}" is .${ext}; accepted: ${accepted.join(", ")}.`,
      };
    }
  }

  return {
    ...base,
    status: "pass",
    message: `Document verified: "${doc.name}"`,
    data: { documentId, documentName: doc.name },
  };
}

async function evalImageUpload(
  node: WorkflowNode,
  _context: Map<string, StepResult>
): Promise<StepResult> {
  const base = { nodeId: node.id, nodeType: node.type, label: node.label };

  const maxMb = parseFloat(node.params.maxSizeMb ?? "");
  const accepted = node.params.accept
    ? node.params.accept.split(",").map((t) => t.trim())
    : [];

  const detail = [
    maxMb ? `Max size: ${maxMb} MB` : null,
    accepted.length ? `Accepted: ${accepted.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    ...base,
    status: "pass",
    message: "Image upload step configured",
    detail: detail || "No constraints configured.",
    data: { maxSizeMb: maxMb, acceptedTypes: accepted },
  };
}

async function evalBankingEvent(
  node: WorkflowNode,
  _context: Map<string, StepResult>
): Promise<StepResult> {
  const base = { nodeId: node.id, nodeType: node.type, label: node.label };

  const profileId = node.params.profileId;
  const accountId = node.params.accountId;

  if (!profileId) {
    return {
      ...base,
      status: "fail",
      message: "No bank profile selected",
      detail: "Open the inspector and select a bank profile.",
    };
  }

  // Load profile from localStorage
  let profile: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    accounts: Array<{ _id: string; balance: number; type: string; nickname: string }>;
  } | null = null;

  try {
    const raw = localStorage.getItem("velum_bank_profiles");
    const profiles = raw ? JSON.parse(raw) : [];
    profile = profiles.find((p: { id: string }) => p.id === profileId) ?? null;
  } catch {
    return {
      ...base,
      status: "fail",
      message: "Could not read bank profiles from storage",
    };
  }

  if (!profile) {
    return {
      ...base,
      status: "fail",
      message: "Selected bank profile no longer exists",
      detail: "Remove and re-add the profile in Bank Profiles.",
    };
  }

  if (!accountId) {
    return {
      ...base,
      status: "fail",
      message: "No account selected",
      detail: `Profile "${profile.name}" is set but no account was selected.`,
    };
  }

  const account = profile.accounts.find((a) => a._id === accountId);
  if (!account) {
    return {
      ...base,
      status: "fail",
      message: "Selected account not found in profile",
    };
  }

  const balance = account.balance;
  const spendingLimit = parseFloat(node.params.spendingLimit ?? "");
  const minBalance = parseFloat(node.params.minBalance ?? "");

  // Fetch live transactions
  let transactions: NessieTransactions | null = null;
  let txFetchError = "";
  try {
    transactions = await fetchTransactions(accountId);
  } catch (err) {
    txFetchError = err instanceof Error ? err.message : "unknown error";
  }

  const issues: string[] = [];
  const details: string[] = [
    `Account: ${account.nickname || account.type}`,
    `Balance: $${balance.toLocaleString()}`,
  ];

  // Min balance check
  if (!isNaN(minBalance) && balance < minBalance) {
    issues.push(`Balance $${balance.toLocaleString()} is below required minimum $${minBalance.toLocaleString()}`);
  }

  // Spending limit check — sum purchases
  if (!isNaN(spendingLimit) && transactions) {
    const totalPurchases = transactions.purchases.reduce((s, t) => s + (t.amount ?? 0), 0);
    details.push(`Total purchases: $${totalPurchases.toLocaleString()}`);
    if (totalPurchases > spendingLimit) {
      issues.push(
        `Total purchases $${totalPurchases.toLocaleString()} exceeds spending limit $${spendingLimit.toLocaleString()}`
      );
    }
  }

  if (txFetchError) {
    details.push(`Warning: could not fetch transactions — ${txFetchError}`);
  }

  const failed = issues.length > 0;
  return {
    ...base,
    status: failed ? "fail" : "pass",
    message: failed
      ? `Banking check failed: ${issues[0]}`
      : `Banking checks passed for ${profile.firstName} ${profile.lastName}`,
    detail: [...details, ...issues].join(" · "),
    data: {
      profileName: profile.name,
      customerName: `${profile.firstName} ${profile.lastName}`,
      balance,
      accountType: account.type,
      transactions: transactions ?? undefined,
    },
  };
}

async function evalTargetSource(
  node: WorkflowNode,
  context: Map<string, StepResult>
): Promise<StepResult> {
  const base = { nodeId: node.id, nodeType: node.type, label: node.label };

  // Collect all upstream results
  const upstreamResults = Array.from(context.values());
  const failures = upstreamResults.filter((r) => r.status === "fail");
  const warnings = upstreamResults.filter((r) => r.status === "warn");

  const threshold = parseFloat(node.params.threshold ?? "0");

  if (failures.length > 0) {
    return {
      ...base,
      status: "fail",
      message: `Send FAILED — ${failures.length} check${failures.length > 1 ? "s" : ""} failed`,
      detail: failures.map((f) => `• ${f.label}: ${f.message}`).join("\n"),
      data: { decision: "denied", failures: failures.length, warnings: warnings.length },
    };
  }

  if (warnings.length > 0 && threshold > 0 && warnings.length > threshold) {
    return {
      ...base,
      status: "warn",
      message: `Sent with warnings — ${warnings.length} warning${warnings.length > 1 ? "s" : ""}`,
      detail: warnings.map((w) => `• ${w.label}: ${w.message}`).join("\n"),
      data: { decision: "conditional", warnings: warnings.length },
    };
  }

  return {
    ...base,
    status: "pass",
    message: "Sent — all checks passed",
    detail: `${upstreamResults.length} upstream step${upstreamResults.length !== 1 ? "s" : ""} passed.`,
    data: { decision: "approved", totalSteps: upstreamResults.length },
  };
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  onStep: (step: StepResult) => void,
  mintedDocs: RunnerDoc[] = []
): Promise<RunResult> {
  const steps: StepResult[] = [];

  if (nodes.length === 0) {
    return {
      steps: [],
      finalStatus: "incomplete",
      summary: "Workflow has no nodes. Add blocks to the canvas first.",
    };
  }

  // Topological sort
  const sorted = topoSort(nodes, edges);
  if (!sorted) {
    return {
      steps: [],
      finalStatus: "incomplete",
      summary: "Workflow contains a cycle — cannot execute.",
    };
  }

  const context = new Map<string, StepResult>();

  for (const node of sorted) {
    // Emit "running" placeholder
    const running: StepResult = {
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      status: "running",
      message: "Evaluating…",
    };
    onStep(running);

    // Small delay to make progress visible
    await new Promise((r) => setTimeout(r, 350));

    let result: StepResult;
    try {
      switch (node.type) {
        case "DocumentUpload":
          result = await evalDocumentUpload(node, context, mintedDocs);
          break;
        case "ImageUpload":
          result = await evalImageUpload(node, context);
          break;
        case "BankingEvent":
          result = await evalBankingEvent(node, context);
          break;
        case "TargetSource":
          result = await evalTargetSource(node, context);
          break;
        default:
          result = {
            nodeId: node.id,
            nodeType: node.type,
            label: node.label,
            status: "skip",
            message: `Unknown block type "${node.type}" — skipped`,
          };
      }
    } catch (err) {
      result = {
        nodeId: node.id,
        nodeType: node.type,
        label: node.label,
        status: "fail",
        message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    steps.push(result);
    context.set(node.id, result);
    onStep(result);
  }

  // Determine final status
  const loanStep = steps.find((s) => s.nodeType === "TargetSource");
  const anyFail = steps.some((s) => s.status === "fail");

  let finalStatus: RunResult["finalStatus"];
  let summary: string;

  if (loanStep) {
    const decision = (loanStep.data?.decision as string) ?? "denied";
    if (decision === "approved") {
      finalStatus = "approved";
      summary = "Sent — all checks passed.";
    } else if (decision === "conditional") {
      finalStatus = "approved";
      summary = "Sent with warnings — review before proceeding.";
    } else {
      finalStatus = "denied";
      summary = loanStep.message;
    }
  } else if (anyFail) {
    finalStatus = "denied";
    summary = "One or more checks failed.";
  } else {
    finalStatus = "incomplete";
    summary = "Workflow completed. Add a Target Source block for a final verdict.";
  }

  return { steps, finalStatus, summary };
}
