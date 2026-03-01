/**
 * lib/workflow/templates.ts
 *
 * Pre-built workflow templates that auto-create a starter graph.
 */

import type { WorkflowNode, WorkflowEdge } from "./types";

export type TemplateName = "blank" | "document-verify";

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
    name: "document-verify",
    label: "Document Verify",
    description:
      "Upload an image, run tamper detection, hash the doc, sign it, and bundle an attestation.",
    nodes: [
      node("n1", "UploadImage", 80, 200, { filename: "id_card.jpg", content: "Government-issued ID card image" }),
      node("n2", "TamperCheck", 340, 200, { threshold: 0.3 }),
      node("n3", "UploadDoc", 80, 420, { filename: "supporting_doc.pdf", content: "Name: John Smith\nDOB: 1990-05-15\nID: 123-45-6789" }),
      node("n4", "HashDoc", 340, 420),
      node("n5", "SignDoc", 600, 420, { signer: "velum-verifier-v1" }),
      node("n6", "NessieCreateCustomer", 600, 160, { firstName: "John", lastName: "Smith" }),
      node("n7", "NessieCreateAccount", 860, 160, { type: "Checking", balance: 5000 }),
      node("n8", "NessieFetchTransactions", 1120, 160, { limit: 5 }),
    ],
    edges: [
      edge("n1", "image", "n2", "image"),
      edge("n3", "file", "n4", "file"),
      edge("n4", "hash", "n5", "hash"),
      edge("n6", "customerId", "n7", "customerId"),
      edge("n7", "accountId", "n8", "accountId"),
    ],
  },
];

export const TEMPLATE_MAP = new Map<TemplateName, TemplateDefinition>(
  TEMPLATES.map((t) => [t.name, t])
);
