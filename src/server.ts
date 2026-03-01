/**
 * src/server.ts
 *
 * Express HTTP server — port 8000.
 *
 * Endpoints:
 *
 *   GET  /health
 *   GET  /oauth/google
 *   GET  /oauth/callback
 *   POST /transfer
 *
 *   — Workflow CRUD (Supabase) —
 *   GET    /workflows             list user's workflows
 *   POST   /workflows             create workflow
 *   GET    /workflows/:id         get single workflow
 *   PATCH  /workflows/:id         update nodes/edges/name
 *   DELETE /workflows/:id         delete workflow
 *   POST   /workflows/:id/run     execute workflow engine
 *   GET    /workflows/:id/runs    run history
 *
 *   — Solana Attestation —
 *   POST /attest                  write hash to Solana devnet via Memo program
 *
 *   — Nessie Banking Proxy —
 *   POST /nessie                  proxy to Capital One Nessie API
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { getAuthUrl, exchangeCodeAndStore } from "./googleDrive";
import { executeTransfer } from "./transferJob";
import { validateSupabaseConnection, getSupabaseClient } from "./supabase";
import { executeWorkflow, validateGraph, type WorkflowNode, type WorkflowEdge } from "./workflow/engine";
import { TEMPLATE_MAP } from "./workflow/templates";

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
  ],
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

app.get("/oauth/google", (req: Request, res: Response) => {
  const userId = req.query["user_id"];

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing required query parameter: user_id" });
    return;
  }

  const state = Buffer.from(JSON.stringify({ user_id: userId })).toString("base64url");

  try {
    const authUrl = getAuthUrl();
    res.redirect(`${authUrl}&state=${encodeURIComponent(state)}`);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/oauth/callback", async (req: Request, res: Response) => {
  const code = req.query["code"];
  const state = req.query["state"];
  const errorParam = req.query["error"];

  if (errorParam) {
    res.status(400).json({ error: `OAuth denied: ${errorParam}` });
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing 'code' from Google OAuth callback." });
    return;
  }

  let userId: string;
  try {
    const stateStr = Buffer.from(String(state), "base64url").toString("utf8");
    const parsed = JSON.parse(stateStr) as { user_id?: string };
    if (!parsed.user_id) throw new Error("state missing user_id");
    userId = parsed.user_id;
  } catch {
    res.status(400).json({ error: "Invalid or missing state parameter." });
    return;
  }

  try {
    await exchangeCodeAndStore(code, userId);
    const successRedirect = process.env.OAUTH_SUCCESS_REDIRECT;
    if (successRedirect) {
      res.redirect(successRedirect);
    } else {
      res.json({ success: true, message: "Google Drive connected successfully.", user_id: userId });
    }
  } catch (err) {
    console.error("[server] OAuth callback error:", String(err));
    res.status(500).json({ error: String(err) });
  }
});

// ─── Drive Transfer ───────────────────────────────────────────────────────────

interface TransferRequestBody {
  document_id?: string;
  target_folder_id?: string;
  user_id?: string;
}

app.post("/transfer", async (req: Request, res: Response) => {
  const body = req.body as TransferRequestBody;
  const missing: string[] = [];
  if (!body.document_id) missing.push("document_id");
  if (!body.target_folder_id) missing.push("target_folder_id");
  if (!body.user_id) missing.push("user_id");

  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }

  try {
    const result = await executeTransfer({
      documentId: body.document_id!,
      targetFolderId: body.target_folder_id!,
      userId: body.user_id!,
    });
    const statusCode = result.status === "done" ? 200 : result.status === "error" ? 500 : 202;
    res.status(statusCode).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Solana Attestation ───────────────────────────────────────────────────────

app.post("/attest", async (req: Request, res: Response) => {
  const { finalHash, cluster = "devnet" } = req.body as {
    finalHash?: string;
    cluster?: string;
    metadata?: unknown;
    walletPubkey?: string;
  };

  if (!finalHash) {
    res.status(400).json({ error: "finalHash is required" });
    return;
  }

  // Try real Solana memo commit
  try {
    const { createConnection, loadKeypair } = await import("./solana");
    const connection = createConnection();
    const payer = loadKeypair();

    const { sendCommit } = await import("./memoCommit");
    const result = await sendCommit(connection, payer, {
      slot: 0,
      blockhash: "",
      tokens_state_hash: "",
      docs_hash: finalHash,
      doc_count: 1,
      entropy_seed: finalHash,
    });

    res.json({ txSignature: result.signature, explorerUrl: result.explorerUrl, cluster });
  } catch (err) {
    // Fall back to mock
    console.warn("[attest] Falling back to mock:", String(err));
    const crypto = await import("crypto");
    const txSignature = `mock_${crypto.createHash("sha256").update(finalHash).digest("hex").slice(0, 44)}`;
    const explorerUrl = `https://explorer.solana.com/tx/${txSignature}?cluster=${cluster}`;
    res.json({ txSignature, explorerUrl, cluster, mock: true });
  }
});

// ─── Nessie Banking Proxy ─────────────────────────────────────────────────────

app.post("/nessie", async (req: Request, res: Response) => {
  const { action, ...body } = req.body as { action: string; [key: string]: unknown };
  const apiKey = process.env.NESSIE_API_KEY;
  const BASE = "http://api.nessieisreal.com";

  if (!apiKey) {
    // Return a mock response
    res.json({ mock: true, message: "No NESSIE_API_KEY set", action });
    return;
  }

  try {
    let url = "";
    let method = "GET";
    let bodyData: unknown = undefined;

    if (action === "createCustomer") {
      url = `${BASE}/customers?key=${apiKey}`;
      method = "POST";
      bodyData = body;
    } else if (action === "getTransactions") {
      url = `${BASE}/accounts/${body.accountId}/transactions?key=${apiKey}`;
    } else {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    const fetchRes = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    });
    const data = await fetchRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

// Middleware: extract Supabase user_id from Authorization Bearer token
async function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const token = auth.slice(7);
  const { data, error } = await getSupabaseClient().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as Request & { userId: string }).userId = data.user.id;
  next();
}

// GET /workflows
app.get("/workflows", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const { data, error } = await getSupabaseClient()
    .from("workflows")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// POST /workflows
app.post("/workflows", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const { name = "Untitled Workflow", template = "blank" } = req.body as { name?: string; template?: string };

  const tmpl = TEMPLATE_MAP.get(template as Parameters<typeof TEMPLATE_MAP.get>[0]);
  const nodesJson = JSON.stringify(tmpl?.nodes ?? []);
  const edgesJson = JSON.stringify(tmpl?.edges ?? []);

  const { data, error } = await getSupabaseClient()
    .from("workflows")
    .insert({ name, owner_id: userId, template, nodes_json: nodesJson, edges_json: edgesJson })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// GET /workflows/:id
app.get("/workflows/:id", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const { data, error } = await getSupabaseClient()
    .from("workflows")
    .select("*")
    .eq("id", req.params.id)
    .eq("owner_id", userId)
    .single();

  if (error || !data) { res.status(404).json({ error: "Not found" }); return; }
  res.json(data);
});

// PATCH /workflows/:id
app.patch("/workflows/:id", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const { name, nodes_json, edges_json } = req.body as {
    name?: string;
    nodes_json?: string;
    edges_json?: string;
  };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (nodes_json !== undefined) updates.nodes_json = nodes_json;
  if (edges_json !== undefined) updates.edges_json = edges_json;

  const { data, error } = await getSupabaseClient()
    .from("workflows")
    .update(updates)
    .eq("id", req.params.id)
    .eq("owner_id", userId)
    .select()
    .single();

  if (error || !data) { res.status(500).json({ error: error?.message ?? "Update failed" }); return; }
  res.json(data);
});

// DELETE /workflows/:id
app.delete("/workflows/:id", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const { error } = await getSupabaseClient()
    .from("workflows")
    .delete()
    .eq("id", req.params.id)
    .eq("owner_id", userId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// POST /workflows/:id/run
app.post("/workflows/:id/run", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;

  // Load workflow
  const { data: workflow, error: wfErr } = await getSupabaseClient()
    .from("workflows")
    .select("*")
    .eq("id", req.params.id)
    .eq("owner_id", userId)
    .single();

  if (wfErr || !workflow) { res.status(404).json({ error: "Workflow not found" }); return; }

  const nodes = JSON.parse(workflow.nodes_json as string) as WorkflowNode[];
  const edges = JSON.parse(workflow.edges_json as string) as WorkflowEdge[];

  if (nodes.length === 0) {
    res.status(400).json({ error: "Workflow has no nodes. Add blocks to the canvas first." });
    return;
  }

  const validationErrors = validateGraph(nodes, edges);
  if (validationErrors.length > 0) {
    res.status(400).json({ error: validationErrors.join("\n") });
    return;
  }

  // Create Run record
  const { data: run, error: runErr } = await getSupabaseClient()
    .from("workflow_runs")
    .insert({ workflow_id: req.params.id, status: "running", started_at: new Date().toISOString() })
    .select()
    .single();

  if (runErr || !run) { res.status(500).json({ error: "Failed to create run record" }); return; }

  // Execute
  const result = await executeWorkflow(nodes, edges);

  // Save RunNodes
  for (const nr of result.nodeResults) {
    await getSupabaseClient().from("workflow_run_nodes").insert({
      run_id: run.id,
      node_id: nr.nodeId,
      node_type: nr.nodeType,
      status: nr.status,
      logs: JSON.stringify(nr.logs),
      output_json: JSON.stringify(nr.output),
      started_at: nr.startedAt,
      finished_at: nr.finishedAt || null,
    });
  }

  // Update run status
  await getSupabaseClient()
    .from("workflow_runs")
    .update({ status: result.status, finished_at: new Date().toISOString() })
    .eq("id", run.id);

  res.json({ run, nodeResults: result.nodeResults, status: result.status });
});

// GET /workflows/:id/runs
app.get("/workflows/:id/runs", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;

  // Verify ownership
  const { data: wf } = await getSupabaseClient()
    .from("workflows")
    .select("id")
    .eq("id", req.params.id)
    .eq("owner_id", userId)
    .single();

  if (!wf) { res.status(404).json({ error: "Not found" }); return; }

  const { data, error } = await getSupabaseClient()
    .from("workflow_runs")
    .select("*, workflow_run_nodes(*)")
    .eq("workflow_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ─── 404 + error handler ──────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await validateSupabaseConnection();

  const port = parseInt(process.env.SERVER_PORT ?? "8000", 10);

  app.listen(port, () => {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Velum Backend Server");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  Listening on  : http://localhost:${port}`);
    console.log(`  Health check  : GET  /health`);
    console.log(`  Workflows     : GET|POST /workflows`);
    console.log(`  Attest        : POST /attest`);
    console.log("═══════════════════════════════════════════════════════════════");
  });
}

start().catch((err) => {
  console.error("[server] Fatal startup error:", String(err));
  process.exit(1);
});
