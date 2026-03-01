/**
 * lib/workflow/templates.ts
 *
 * Pre-built workflow templates that auto-create a starter graph.
 */

import type { WorkflowNode, WorkflowEdge } from "./engine";

export type TemplateName = "blank" | "income-proof" | "document-verify" | "invoice-payment";

export interface TemplateDefinition {
  name: TemplateName;
  label: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  params: Record<string, unknown> = {}
): WorkflowNode {
  return { id, type, position: { x, y }, data: { params } };
}

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): WorkflowEdge {
  return {
    id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATES: TemplateDefinition[] = [
  {
    name: "blank",
    label: "Blank",
    description: "Start with an empty canvas.",
    nodes: [],
    edges: [],
  },

  {
    name: "income-proof",
    label: "Income Proof Pack",
    description:
      "Upload a pay stub, hash it, pull Nessie transactions, validate income, build an attestation, post to Solana, and generate a QR code.",
    nodes: [
      node("n1", "UploadDoc", 80, 200, { filename: "paystub.pdf", content: "Employer: Acme Corp\nGross Pay: $3,500.00\nNet Pay: $2,800.00\nPay Period: 2026-01-01 to 2026-01-15" }),
      node("n2", "HashDoc", 340, 200),
      node("n3", "ExtractFields", 340, 360, { fieldsToExtract: "employer,income" }),
      node("n4", "NessieCreateCustomer", 600, 80, { firstName: "Jane", lastName: "Demo" }),
      node("n5", "NessieCreateAccount", 860, 80, { type: "Checking", balance: 5000 }),
      node("n6", "NessieFetchTransactions", 1120, 80, { limit: 10 }),
      node("n7", "ValidateSchema", 600, 360, { requiredKeys: "employer,income", minIncome: 2000 }),
      node("n8", "AttestationPack", 880, 300, { workflowName: "Income Proof Pack" }),
      node("n9", "WriteAttestation", 1140, 300, { cluster: "devnet" }),
      node("n10", "QRCode", 1400, 300, { size: 256 }),
    ],
    edges: [
      edge("n1", "file", "n2", "file"),
      edge("n1", "file", "n3", "file"),
      edge("n2", "hash", "n8", "docHash"),
      edge("n3", "fields", "n7", "data"),
      edge("n3", "fields", "n8", "fields"),
      edge("n4", "customerId", "n5", "customerId"),
      edge("n5", "accountId", "n6", "accountId"),
      edge("n6", "transactions", "n8", "transactions"),
      edge("n8", "finalHash", "n9", "finalHash"),
      edge("n8", "attestation", "n9", "metadata"),
      edge("n9", "explorerUrl", "n10", "value"),
    ],
  },

  {
    name: "document-verify",
    label: "Document Verify",
    description:
      "Upload an image, run tamper detection, hash the original doc, sign it, and write the attestation on-chain.",
    nodes: [
      node("n1", "UploadImage", 80, 200, { filename: "id_card.jpg", content: "Government-issued ID card image" }),
      node("n2", "TamperCheck", 340, 200, { threshold: 0.3 }),
      node("n3", "UploadDoc", 80, 420, { filename: "supporting_doc.pdf", content: "Name: John Smith\nDOB: 1990-05-15\nID: 123-45-6789" }),
      node("n4", "HashDoc", 340, 420),
      node("n5", "SignDoc", 600, 420, { signer: "velum-verifier-v1" }),
      node("n6", "AttestationPack", 860, 300, { workflowName: "Document Verify" }),
      node("n7", "WriteAttestation", 1120, 300, { cluster: "devnet" }),
      node("n8", "DownloadReceipt", 1380, 300, { label: "doc-verify-receipt" }),
    ],
    edges: [
      edge("n1", "image", "n2", "image"),
      edge("n2", "fraudScore", "n6", "fraudScore"),
      edge("n3", "file", "n4", "file"),
      edge("n4", "hash", "n5", "hash"),
      edge("n4", "hash", "n6", "docHash"),
      edge("n5", "signature", "n6", "signature"),
      edge("n6", "finalHash", "n7", "finalHash"),
      edge("n6", "attestation", "n7", "metadata"),
      edge("n7", "txSignature", "n8", "txSignature"),
      edge("n6", "attestation", "n8", "attestation"),
    ],
  },

  {
    name: "invoice-payment",
    label: "Invoice + Payment Proof",
    description:
      "Hash an invoice doc, create a Nessie payment, bundle evidence into an attestation, write to chain, and download a receipt.",
    nodes: [
      node("n1", "UploadDoc", 80, 200, { filename: "invoice.pdf", content: "Invoice #INV-2026-001\nAmount Due: $1,200.00\nService: Software Development\nDue Date: 2026-02-28" }),
      node("n2", "HashDoc", 340, 200),
      node("n3", "NessieCreateCustomer", 80, 420, { firstName: "Client", lastName: "Corp" }),
      node("n4", "NessieCreateAccount", 340, 420, { type: "Checking", balance: 10000 }),
      node("n5", "NessieCreatePurchase", 600, 420, { amount: 1200, description: "Invoice #INV-2026-001" }),
      node("n6", "AttestationPack", 860, 300, { workflowName: "Invoice + Payment Proof" }),
      node("n7", "WriteAttestation", 1120, 300, { cluster: "devnet" }),
      node("n8", "DownloadReceipt", 1380, 300, { label: "invoice-receipt" }),
    ],
    edges: [
      edge("n1", "file", "n2", "file"),
      edge("n2", "hash", "n6", "docHash"),
      edge("n3", "customerId", "n4", "customerId"),
      edge("n4", "accountId", "n5", "accountId"),
      edge("n5", "purchase", "n6", "fields"),
      edge("n6", "finalHash", "n7", "finalHash"),
      edge("n6", "attestation", "n7", "metadata"),
      edge("n7", "txSignature", "n8", "txSignature"),
      edge("n6", "attestation", "n8", "attestation"),
    ],
  },
];

export const TEMPLATE_MAP = new Map<TemplateName, TemplateDefinition>(
  TEMPLATES.map((t) => [t.name, t])
);
