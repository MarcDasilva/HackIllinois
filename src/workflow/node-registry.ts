/**
 * lib/workflow/node-registry.ts
 *
 * Central registry of all available workflow block types.
 * Each NodeDef describes a block's category, ports, parameters, and run() logic.
 * The run() implementations are async and return typed outputs.
 */

import crypto from "crypto";

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
  run: (inputs: Record<string, unknown>, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function randomId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Nessie mock helpers ──────────────────────────────────────────────────────

function mockCustomer() {
  return {
    id: `cust_${randomId()}`,
    first_name: "Jane",
    last_name: "Demo",
    address: { street_number: "123", street_name: "Main St", city: "Chicago", state: "IL", zip: "60601" },
  };
}

function mockAccount(customerId: string) {
  return {
    _id: `acct_${randomId()}`,
    customer_id: customerId,
    type: "Checking",
    nickname: "Primary Checking",
    rewards: 0,
    balance: 4823.50,
  };
}

function mockTransactions(accountId: string, count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `txn_${randomId()}`,
    account_id: accountId,
    type: i % 2 === 0 ? "deposit" : "withdrawal",
    amount: +(Math.random() * 3000 + 100).toFixed(2),
    description: i % 2 === 0 ? "Paycheck Direct Deposit" : "Purchase",
    date: new Date(Date.now() - i * 7 * 86400000).toISOString().split("T")[0],
  }));
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
    async run(_, params) {
      await sleep(300);
      const content = String(params.content ?? "mock document content");
      return {
        file: { name: params.filename, size: params.size, content },
        filename: params.filename,
        size: params.size,
      };
    },
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
    async run(inputs) {
      await sleep(200);
      const file = inputs.file as { content?: string; name?: string } | string | undefined;
      const content = typeof file === "object" && file?.content ? file.content : String(file ?? "");
      const hash = sha256(content);
      return { hash, file: inputs.file };
    },
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
    async run(inputs) {
      await sleep(800);
      const file = inputs.file as { content?: string } | undefined;
      const text = file?.content ?? "";
      // Simple regex mock extraction
      const employerMatch = text.match(/Employer:\s*(.+)/);
      const incomeMatch = text.match(/Gross Pay:\s*\$?([\d,]+\.?\d*)/);
      const employer = employerMatch?.[1]?.trim() ?? "Unknown Corp";
      const income = parseFloat((incomeMatch?.[1] ?? "0").replace(/,/g, ""));
      const fields = { employer, income, pay_period: "2026-01-01 to 2026-01-15" };
      return { fields, employer, income };
    },
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
    async run(inputs, params) {
      await sleep(300);
      const hash = String(inputs.hash ?? "");
      const signer = String(params.signer ?? "mock-issuer");
      const signedAt = new Date().toISOString();
      const signature = sha256(`${hash}:${signer}:${signedAt}`);
      return { signature, signedAt };
    },
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
    async run(_, params) {
      await sleep(200);
      return {
        image: { name: params.filename, content: params.content },
        filename: params.filename,
      };
    },
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
    async run(_, params) {
      await sleep(600);
      const fraudScore = +(Math.random() * 0.25).toFixed(4); // mock: usually passes
      const threshold = Number(params.threshold ?? 0.3);
      const passed = fraudScore <= threshold;
      return {
        fraudScore,
        passed,
        report: { fraudScore, threshold, method: "mock-ELA", passed },
      };
    },
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
    async run(inputs) {
      await sleep(500);
      const img = inputs.image as { content?: string } | undefined;
      return {
        text: img?.content ?? "Mock OCR extracted text from image",
        confidence: 0.94,
      };
    },
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
    async run(_, params) {
      await sleep(400);
      try {
        const apiKey = process.env.NESSIE_API_KEY;
        if (!apiKey) throw new Error("no-key");
        const res = await fetch(`http://api.nessieisreal.com/customers?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: params.firstName,
            last_name: params.lastName,
            address: { street_number: "123", street_name: "Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { objectCreated?: { id?: string } };
        const customer = data.objectCreated ?? mockCustomer();
        return { customerId: customer.id ?? `cust_${randomId()}`, customer };
      } catch {
        const customer = mockCustomer();
        return { customerId: customer.id, customer };
      }
    },
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
    async run(inputs, params) {
      await sleep(400);
      try {
        const apiKey = process.env.NESSIE_API_KEY;
        const customerId = String(inputs.customerId ?? "");
        if (!apiKey || !customerId) throw new Error("no-key");
        const res = await fetch(`http://api.nessieisreal.com/customers/${customerId}/accounts?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: params.type, nickname: params.nickname, rewards: 0, balance: params.balance }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { objectCreated?: { _id?: string } };
        const account = data.objectCreated ?? mockAccount(customerId);
        return { accountId: (account as { _id?: string })._id ?? `acct_${randomId()}`, account };
      } catch {
        const customerId = String(inputs.customerId ?? `cust_${randomId()}`);
        const account = mockAccount(customerId);
        return { accountId: account._id, account };
      }
    },
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
    async run(inputs, params) {
      await sleep(500);
      try {
        const apiKey = process.env.NESSIE_API_KEY;
        const accountId = String(inputs.accountId ?? "");
        if (!apiKey || !accountId) throw new Error("no-key");
        const res = await fetch(`http://api.nessieisreal.com/accounts/${accountId}/transactions?key=${apiKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const transactions = (await res.json()) as Array<{ amount: number; type: string }>;
        const deposits = transactions.filter((t) => t.type === "deposit");
        const totalIncome = deposits.reduce((sum, t) => sum + (t.amount ?? 0), 0);
        return { transactions, totalIncome, count: transactions.length };
      } catch {
        const accountId = String(inputs.accountId ?? `acct_${randomId()}`);
        const transactions = mockTransactions(accountId, Number(params.limit ?? 5));
        const totalIncome = transactions.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
        return { transactions, totalIncome, count: transactions.length };
      }
    },
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
    async run(inputs, params) {
      await sleep(400);
      const accountId = String(inputs.accountId ?? `acct_${randomId()}`);
      const amount = Number(params.amount ?? 3500);
      try {
        const apiKey = process.env.NESSIE_API_KEY;
        if (!apiKey) throw new Error("no-key");
        const res = await fetch(`http://api.nessieisreal.com/accounts/${accountId}/deposits?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medium: "balance", transaction_date: new Date().toISOString().split("T")[0], amount, description: params.description }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { objectCreated?: { _id?: string } };
        const txn = data.objectCreated ?? { _id: `txn_${randomId()}`, amount, type: "deposit" };
        return { transactionId: (txn as { _id?: string })._id ?? `txn_${randomId()}`, amount, transaction: txn };
      } catch {
        const transaction = { _id: `txn_${randomId()}`, account_id: accountId, type: "deposit", amount, description: params.description, date: new Date().toISOString().split("T")[0] };
        return { transactionId: transaction._id, amount, transaction };
      }
    },
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
    async run(inputs, params) {
      await sleep(400);
      const accountId = String(inputs.accountId ?? `acct_${randomId()}`);
      const amount = Number(params.amount ?? 1200);
      const purchase = {
        _id: `purchase_${randomId()}`,
        account_id: accountId,
        merchant_id: `merch_${randomId()}`,
        amount,
        description: params.description,
        date: new Date().toISOString().split("T")[0],
        status: "executed",
      };
      return { purchaseId: purchase._id, purchase };
    },
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
      { id: "mockPubkey", label: "Mock Public Key (if not connected)", type: "string", default: "EhfBjnWQUktSPCTYHdngsSg2U36Z1sihDFZ8uQKKezYP" },
    ],
    async run(_, params) {
      await sleep(100);
      const publicKey = String(params.mockPubkey ?? "EhfBjnWQUktSPCTYHdngsSg2U36Z1sihDFZ8uQKKezYP");
      return { publicKey, connected: true };
    },
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
    async run(inputs) {
      await sleep(200);
      const message = String(inputs.message ?? "");
      const pubkey = String(inputs.publicKey ?? "mock-key");
      const signature = sha256(`${message}:${pubkey}:${Date.now()}`);
      return { signature, message };
    },
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
      { id: "walletPubkey", label: "Wallet Public Key", type: "string", default: "", placeholder: "Solana public key (overrides connected wallet)" },
    ],
    async run(inputs, params) {
      await sleep(1200);
      const finalHash = String(inputs.finalHash ?? sha256(`mock-${Date.now()}`));
      const cluster = String(params.cluster ?? "devnet");
      try {
        // Call backend /attest endpoint directly
        const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
        const res = await fetch(`${backendUrl}/attest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finalHash, metadata: inputs.metadata, cluster, walletPubkey: params.walletPubkey }),
        });
        if (res.ok) {
          const data = await res.json() as { txSignature: string; explorerUrl: string };
          return { txSignature: data.txSignature, explorerUrl: data.explorerUrl, attestation: { finalHash, txSignature: data.txSignature, cluster } };
        }
      } catch { /* fall through to mock */ }
      // Mock fallback
      const txSignature = `mock_${sha256(finalHash).slice(0, 44)}`;
      const explorerUrl = `https://explorer.solana.com/tx/${txSignature}?cluster=${cluster}`;
      return { txSignature, explorerUrl, attestation: { finalHash, txSignature, cluster, mock: true } };
    },
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
    async run(inputs) {
      await sleep(50);
      const condition = Boolean(inputs.condition);
      return {
        trueBranch: condition ? inputs.value : null,
        falseBranch: condition ? null : inputs.value,
        result: condition,
      };
    },
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
    async run(inputs, params) {
      await sleep(100);
      const data = inputs.data as Record<string, unknown> ?? {};
      const required = String(params.requiredKeys ?? "").split(",").map((k) => k.trim()).filter(Boolean);
      const errors: string[] = [];
      for (const key of required) {
        if (!(key in data)) errors.push(`Missing required field: ${key}`);
      }
      const minIncome = Number(params.minIncome ?? 0);
      if (minIncome > 0 && typeof data.income === "number" && data.income < minIncome) {
        errors.push(`Income $${data.income} is below minimum $${minIncome}`);
      }
      return { valid: errors.length === 0, data, errors };
    },
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
    async run(inputs, params) {
      await sleep(100);
      const data = inputs.data as Record<string, unknown> ?? {};
      let mapping: Record<string, string> = {};
      try { mapping = JSON.parse(String(params.mapping ?? "{}")); } catch { /* ignore */ }
      const mapped: Record<string, unknown> = { ...data };
      for (const [oldKey, newKey] of Object.entries(mapping)) {
        if (oldKey in mapped) {
          mapped[newKey] = mapped[oldKey];
          delete mapped[oldKey];
        }
      }
      return { mapped };
    },
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
    async run(inputs) {
      await sleep(50);
      const a = inputs.a as Record<string, unknown> ?? {};
      const b = inputs.b as Record<string, unknown> ?? {};
      return { merged: { ...a, ...b } };
    },
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
    async run(inputs, params) {
      await sleep(200);
      const runId = randomId();
      const createdAt = new Date().toISOString();
      const attestation = {
        workflowId: `wf_${randomId()}`,
        runId,
        createdAt,
        version: params.version ?? "1.0",
        workflowName: params.workflowName,
        evidence: {
          docHash: inputs.docHash ?? null,
          extractedFields: inputs.fields ?? null,
          transactions: inputs.transactions ?? null,
          fraudScore: inputs.fraudScore ?? null,
          docSignature: inputs.signature ?? null,
        },
        finalHash: "",
        signatures: [],
        chainReceipt: null,
      };
      attestation.finalHash = sha256(JSON.stringify(attestation.evidence));
      return { attestation, finalHash: attestation.finalHash, workflowId: attestation.workflowId };
    },
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
    async run(inputs) {
      await sleep(300);
      const value = String(inputs.value ?? "");
      // In production: use qrcode library. For MVP, return a plausible URL.
      const encoded = encodeURIComponent(value.slice(0, 200));
      const qrDataUri = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encoded}`;
      return { qrDataUri, value };
    },
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
    async run(inputs, params) {
      await sleep(100);
      const receipt = {
        ...((inputs.attestation as Record<string, unknown>) ?? {}),
        chainReceipt: inputs.txSignature ?? null,
        generatedAt: new Date().toISOString(),
        format: "velum-receipt-v1",
      };
      const filename = `${params.label ?? "velum-receipt"}-${Date.now()}.json`;
      return { receiptJson: receipt, filename };
    },
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

export const CATEGORY_ORDER: NodeCategory[] = [
  "Documents",
  "Images",
  "Banking",
  "Crypto",
  "Logic",
  "Output",
];
