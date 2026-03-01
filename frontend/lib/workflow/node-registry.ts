/**
 * lib/workflow/node-registry.ts  (FRONTEND — rendering only)
 *
 * Defines the shape of every block type: category, ports, params, colors.
 * The run() logic lives on the backend (src/workflow/node-registry.ts).
 */

// ─── Port & Parameter types ───────────────────────────────────────────────────

export type PortType = "string" | "hash" | "json" | "number" | "boolean" | "file" | "any";

export interface Port {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
}

export interface ParamDef {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "textarea";
  default?: unknown;
  options?: string[]; // for select
  placeholder?: string;
}

export type NodeCategory =
  | "Documents"
  | "Images"
  | "Banking"
  | "Crypto"
  | "Logic"
  | "Output";

export interface NodeDef {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  color: string; // tailwind bg color token
  inputs: Port[];
  outputs: Port[];
  params: ParamDef[];
}

// ─── Node definitions ─────────────────────────────────────────────────────────

export const NODE_REGISTRY: NodeDef[] = [

  // ── Documents ──────────────────────────────────────────────────────────────

  {
    type: "UploadDoc",
    label: "Upload Document",
    category: "Documents",
    description: "Accepts a document file (PDF, DOCX, etc.) and passes it downstream.",
    color: "bg-blue-500",
    inputs: [],
    outputs: [
      { id: "file", label: "File", type: "file" },
      { id: "filename", label: "Filename", type: "string" },
      { id: "size", label: "Size (bytes)", type: "number" },
    ],
    params: [
      { id: "filename", label: "Filename (mock)", type: "string", default: "income_statement.pdf", placeholder: "document.pdf" },
      { id: "size", label: "File size (bytes)", type: "number", default: 102400 },
      { id: "content", label: "Content (mock text)", type: "textarea", default: "Employer: Acme Corp\nPay Period: 2026-01-01 to 2026-01-15\nGross Pay: $3,500.00\nNet Pay: $2,800.00" },
    ],
  },

  {
    type: "HashDoc",
    label: "Hash Document",
    category: "Documents",
    description: "Computes a SHA-256 hash of the document content for tamper-evident storage.",
    color: "bg-blue-500",
    inputs: [{ id: "file", label: "File", type: "file", required: true }],
    outputs: [
      { id: "hash", label: "SHA-256 Hash", type: "hash" },
      { id: "file", label: "File (passthrough)", type: "file" },
    ],
    params: [],
  },

  {
    type: "ExtractFields",
    label: "Extract Fields (LLM)",
    category: "Documents",
    description: "Uses an LLM to extract structured fields from document text.",
    color: "bg-blue-500",
    inputs: [{ id: "file", label: "File", type: "file", required: true }],
    outputs: [
      { id: "fields", label: "Extracted Fields", type: "json" },
      { id: "employer", label: "Employer", type: "string" },
      { id: "income", label: "Income (USD)", type: "number" },
    ],
    params: [
      { id: "fieldsToExtract", label: "Fields to Extract", type: "string", default: "employer,income,pay_period", placeholder: "comma-separated" },
    ],
  },

  {
    type: "SignDoc",
    label: "Sign Document",
    category: "Documents",
    description: "Attaches a cryptographic signature to a document hash.",
    color: "bg-blue-500",
    inputs: [
      { id: "hash", label: "Document Hash", type: "hash", required: true },
    ],
    outputs: [
      { id: "signature", label: "Signature", type: "string" },
      { id: "signedAt", label: "Signed At", type: "string" },
    ],
    params: [
      { id: "signer", label: "Signer Identity", type: "string", default: "mock-issuer-pubkey", placeholder: "Public key or name" },
    ],
  },

  // ── Images ─────────────────────────────────────────────────────────────────

  {
    type: "UploadImage",
    label: "Upload Image",
    category: "Images",
    description: "Accepts an image file and passes it downstream.",
    color: "bg-purple-500",
    inputs: [],
    outputs: [
      { id: "image", label: "Image", type: "file" },
      { id: "filename", label: "Filename", type: "string" },
    ],
    params: [
      { id: "filename", label: "Filename (mock)", type: "string", default: "paystub.png", placeholder: "image.png" },
      { id: "content", label: "Mock content description", type: "string", default: "Pay stub image from Acme Corp" },
    ],
  },

  {
    type: "TamperCheck",
    label: "Tamper Check",
    category: "Images",
    description: "Runs ELA (Error Level Analysis) to detect image manipulation. Returns a fraud score 0-1.",
    color: "bg-purple-500",
    inputs: [{ id: "image", label: "Image", type: "file", required: true }],
    outputs: [
      { id: "fraudScore", label: "Fraud Score (0-1)", type: "number" },
      { id: "passed", label: "Passed", type: "boolean" },
      { id: "report", label: "Analysis Report", type: "json" },
    ],
    params: [
      { id: "threshold", label: "Pass Threshold (max fraud score)", type: "number", default: 0.3 },
    ],
  },

  {
    type: "OCR",
    label: "OCR",
    category: "Images",
    description: "Extracts text from an image using optical character recognition.",
    color: "bg-purple-500",
    inputs: [{ id: "image", label: "Image", type: "file", required: true }],
    outputs: [
      { id: "text", label: "Extracted Text", type: "string" },
      { id: "confidence", label: "Confidence", type: "number" },
    ],
    params: [],
  },

  // ── Banking (Nessie) ───────────────────────────────────────────────────────

  {
    type: "NessieCreateCustomer",
    label: "Create Customer",
    category: "Banking",
    description: "Creates a new Capital One Nessie customer record.",
    color: "bg-emerald-500",
    inputs: [],
    outputs: [
      { id: "customerId", label: "Customer ID", type: "string" },
      { id: "customer", label: "Customer Object", type: "json" },
    ],
    params: [
      { id: "firstName", label: "First Name", type: "string", default: "Jane", placeholder: "Jane" },
      { id: "lastName", label: "Last Name", type: "string", default: "Demo", placeholder: "Demo" },
    ],
  },

  {
    type: "NessieCreateAccount",
    label: "Create Account",
    category: "Banking",
    description: "Creates a checking/savings account for a Nessie customer.",
    color: "bg-emerald-500",
    inputs: [{ id: "customerId", label: "Customer ID", type: "string", required: true }],
    outputs: [
      { id: "accountId", label: "Account ID", type: "string" },
      { id: "account", label: "Account Object", type: "json" },
    ],
    params: [
      { id: "type", label: "Account Type", type: "select", options: ["Checking", "Savings", "Credit Card"], default: "Checking" },
      { id: "nickname", label: "Nickname", type: "string", default: "Primary Checking" },
      { id: "balance", label: "Initial Balance ($)", type: "number", default: 5000 },
    ],
  },

  {
    type: "NessieFetchTransactions",
    label: "Fetch Transactions",
    category: "Banking",
    description: "Retrieves all transactions for a Nessie account.",
    color: "bg-emerald-500",
    inputs: [{ id: "accountId", label: "Account ID", type: "string", required: true }],
    outputs: [
      { id: "transactions", label: "Transactions", type: "json" },
      { id: "totalIncome", label: "Total Income ($)", type: "number" },
      { id: "count", label: "Transaction Count", type: "number" },
    ],
    params: [
      { id: "limit", label: "Max Transactions", type: "number", default: 10 },
    ],
  },

  {
    type: "NessieSimulatePaycheck",
    label: "Simulate Paycheck",
    category: "Banking",
    description: "Creates a deposit transaction simulating a paycheck.",
    color: "bg-emerald-500",
    inputs: [{ id: "accountId", label: "Account ID", type: "string", required: true }],
    outputs: [
      { id: "transactionId", label: "Transaction ID", type: "string" },
      { id: "amount", label: "Amount ($)", type: "number" },
      { id: "transaction", label: "Transaction", type: "json" },
    ],
    params: [
      { id: "amount", label: "Paycheck Amount ($)", type: "number", default: 3500 },
      { id: "description", label: "Description", type: "string", default: "Paycheck Direct Deposit" },
    ],
  },

  {
    type: "NessieCreatePurchase",
    label: "Create Purchase",
    category: "Banking",
    description: "Records a purchase/payment transaction via Nessie.",
    color: "bg-emerald-500",
    inputs: [{ id: "accountId", label: "Account ID", type: "string", required: true }],
    outputs: [
      { id: "purchaseId", label: "Purchase ID", type: "string" },
      { id: "purchase", label: "Purchase Object", type: "json" },
    ],
    params: [
      { id: "amount", label: "Amount ($)", type: "number", default: 1200 },
      { id: "description", label: "Description", type: "string", default: "Invoice Payment #INV-2026-001" },
      { id: "merchantName", label: "Merchant Name", type: "string", default: "Velum Client" },
    ],
  },

  // ── Crypto ─────────────────────────────────────────────────────────────────

  {
    type: "WalletConnect",
    label: "Wallet Connect",
    category: "Crypto",
    description: "Provides the connected Solana wallet public key for downstream nodes.",
    color: "bg-violet-500",
    inputs: [],
    outputs: [
      { id: "publicKey", label: "Public Key", type: "string" },
      { id: "connected", label: "Connected", type: "boolean" },
    ],
    params: [
      { id: "mockPubkey", label: "Wallet Public Key", type: "string", default: "EhfBjnWQUktSPCTYHdngsSg2U36Z1sihDFZ8uQKKezYP", placeholder: "Solana wallet address" },
    ],
  },

  {
    type: "SignMessage",
    label: "Sign Message",
    category: "Crypto",
    description: "Signs an arbitrary message with the connected wallet, producing a verifiable signature.",
    color: "bg-violet-500",
    inputs: [
      { id: "message", label: "Message", type: "string", required: true },
      { id: "publicKey", label: "Public Key", type: "string" },
    ],
    outputs: [
      { id: "signature", label: "Signature", type: "string" },
      { id: "message", label: "Message", type: "string" },
    ],
    params: [],
  },

  {
    type: "WriteAttestation",
    label: "Write Attestation",
    category: "Crypto",
    description: "Writes the final attestation hash to Solana devnet via Memo program. Returns tx signature + Explorer link.",
    color: "bg-violet-500",
    inputs: [
      { id: "finalHash", label: "Final Hash", type: "hash", required: true },
      { id: "metadata", label: "Metadata (JSON)", type: "json" },
    ],
    outputs: [
      { id: "txSignature", label: "Tx Signature", type: "string" },
      { id: "explorerUrl", label: "Explorer URL", type: "string" },
      { id: "attestation", label: "Attestation Object", type: "json" },
    ],
    params: [
      { id: "cluster", label: "Cluster", type: "select", options: ["devnet", "mainnet-beta", "testnet"], default: "devnet" },
    ],
  },

  // ── Logic ──────────────────────────────────────────────────────────────────

  {
    type: "IfElse",
    label: "If / Else",
    category: "Logic",
    description: "Routes flow based on a boolean condition.",
    color: "bg-amber-500",
    inputs: [
      { id: "condition", label: "Condition", type: "boolean", required: true },
      { id: "value", label: "Value (passthrough)", type: "any" },
    ],
    outputs: [
      { id: "trueBranch", label: "True Branch", type: "any" },
      { id: "falseBranch", label: "False Branch", type: "any" },
      { id: "result", label: "Condition Result", type: "boolean" },
    ],
    params: [],
  },

  {
    type: "ValidateSchema",
    label: "Validate Schema",
    category: "Logic",
    description: "Validates a JSON object against a simple key-type schema. Fails run if validation fails.",
    color: "bg-amber-500",
    inputs: [
      { id: "data", label: "Data (JSON)", type: "json", required: true },
    ],
    outputs: [
      { id: "valid", label: "Valid", type: "boolean" },
      { id: "data", label: "Data (passthrough)", type: "json" },
      { id: "errors", label: "Errors", type: "json" },
    ],
    params: [
      { id: "requiredKeys", label: "Required Keys (comma-separated)", type: "string", default: "employer,income", placeholder: "key1,key2" },
      { id: "minIncome", label: "Minimum Income ($)", type: "number", default: 1000 },
    ],
  },

  {
    type: "MapFields",
    label: "Map Fields",
    category: "Logic",
    description: "Remaps keys from an input JSON object to new key names.",
    color: "bg-amber-500",
    inputs: [{ id: "data", label: "Input Data", type: "json", required: true }],
    outputs: [{ id: "mapped", label: "Mapped Data", type: "json" }],
    params: [
      { id: "mapping", label: "Mapping (JSON: {\"oldKey\":\"newKey\"})", type: "textarea", default: '{"employer":"issuer","income":"grossPay"}' },
    ],
  },

  {
    type: "Merge",
    label: "Merge",
    category: "Logic",
    description: "Merges two JSON objects into one.",
    color: "bg-amber-500",
    inputs: [
      { id: "a", label: "Object A", type: "json" },
      { id: "b", label: "Object B", type: "json" },
    ],
    outputs: [{ id: "merged", label: "Merged Object", type: "json" }],
    params: [],
  },

  // ── Output ─────────────────────────────────────────────────────────────────

  {
    type: "AttestationPack",
    label: "Attestation Pack",
    category: "Output",
    description: "Assembles all evidence into a structured Attestation JSON and computes finalHash.",
    color: "bg-rose-500",
    inputs: [
      { id: "docHash", label: "Document Hash", type: "hash" },
      { id: "fields", label: "Extracted Fields", type: "json" },
      { id: "transactions", label: "Transactions", type: "json" },
      { id: "fraudScore", label: "Fraud Score", type: "number" },
      { id: "signature", label: "Doc Signature", type: "string" },
    ],
    outputs: [
      { id: "attestation", label: "Attestation JSON", type: "json" },
      { id: "finalHash", label: "Final Hash", type: "hash" },
      { id: "workflowId", label: "Workflow ID", type: "string" },
    ],
    params: [
      { id: "workflowName", label: "Workflow Name", type: "string", default: "Income Proof Pack" },
      { id: "version", label: "Version", type: "string", default: "1.0" },
    ],
  },

  {
    type: "QRCode",
    label: "QR Code",
    category: "Output",
    description: "Generates a QR code from a URL or text value (returns data URI in real impl; mock here).",
    color: "bg-rose-500",
    inputs: [{ id: "value", label: "Value / URL", type: "any", required: true }],
    outputs: [
      { id: "qrDataUri", label: "QR Data URI", type: "string" },
      { id: "value", label: "Value", type: "string" },
    ],
    params: [
      { id: "size", label: "Size (px)", type: "number", default: 256 },
    ],
  },

  {
    type: "DownloadReceipt",
    label: "Download Receipt",
    category: "Output",
    description: "Packages the attestation as a downloadable JSON receipt.",
    color: "bg-rose-500",
    inputs: [
      { id: "attestation", label: "Attestation JSON", type: "json" },
      { id: "txSignature", label: "Solana Tx Signature", type: "string" },
    ],
    outputs: [
      { id: "receiptJson", label: "Receipt JSON", type: "json" },
      { id: "filename", label: "Filename", type: "string" },
    ],
    params: [
      { id: "label", label: "Receipt Label", type: "string", default: "velum-receipt" },
    ],
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const NODE_MAP = new Map<string, NodeDef>(
  NODE_REGISTRY.map((n) => [n.type, n])
);

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  Documents: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Images: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  Banking: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Crypto: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  Logic: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Output: "bg-rose-500/10 text-rose-400 border-rose-500/30",
};

// Solid header color per category (for block rendering)
export const CATEGORY_HEADER_COLORS: Record<NodeCategory, string> = {
  Documents: "bg-blue-600",
  Images: "bg-purple-600",
  Banking: "bg-emerald-600",
  Crypto: "bg-violet-600",
  Logic: "bg-amber-600",
  Output: "bg-rose-600",
};

export const CATEGORY_ORDER: NodeCategory[] = [
  "Documents",
  "Images",
  "Banking",
];
