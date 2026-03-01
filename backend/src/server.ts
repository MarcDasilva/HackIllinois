/**
 * LAVA backend — Express server: health, OAuth, Drive transfer, PDF/image hardening.
 *
 *   GET  /health
 *   GET  /oauth/google?user_id=<uuid>
 *   GET  /oauth/callback
 *   POST /transfer
 *   POST /harden/pdf, /harden/pdf/by-id
 *   POST /harden/image, /harden/image/by-id
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import { getAuthUrl, exchangeCodeAndStore } from "./googleDrive";
import { executeTransfer } from "./transferJob";
import { executeHardenPdf, executeHardenImage } from "./hardenJob";
import { validateSupabaseConnection } from "./supabase";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const app = express();

// CORS first so every response (including errors) gets headers
app.use(
  cors({
    origin: (origin: string | undefined, cb: (err: null, allow: boolean | string) => void) =>
      cb(null, origin ?? true),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
  })
);

app.use(express.json());

interface TransferRequestBody {
  document_id?: string;
  target_folder_id?: string;
  user_id?: string;
}
interface HardenByIdRequestBody {
  file_ids?: string[];
  user_id?: string;
  seed?: string;
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.get("/oauth/google", (req: Request, res: Response) => {
  const userId = req.query["user_id"];
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing user_id", hint: "?user_id=<supabase-uuid>" });
    return;
  }
  const state = Buffer.from(JSON.stringify({ user_id: userId })).toString("base64url");
  try {
    const urlWithState = `${getAuthUrl()}&state=${encodeURIComponent(state)}`;
    res.redirect(urlWithState);
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
    res.status(400).json({ error: "Missing code from callback" });
    return;
  }
  let userId: string;
  try {
    const parsed = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8")) as { user_id?: string };
    if (!parsed.user_id) throw new Error("state missing user_id");
    userId = parsed.user_id;
  } catch {
    res.status(400).json({ error: "Invalid state" });
    return;
  }
  try {
    await exchangeCodeAndStore(code, userId);
    const redirect = process.env.OAUTH_SUCCESS_REDIRECT;
    if (redirect) res.redirect(redirect);
    else res.json({ success: true, message: "Google Drive connected.", user_id: userId });
  } catch (err) {
    console.error("[server] OAuth callback:", String(err));
    res.status(500).json({ error: String(err) });
  }
});

app.post("/transfer", async (req: Request, res: Response) => {
  const body = req.body as TransferRequestBody;
  const missing: string[] = [];
  if (!body.document_id) missing.push("document_id");
  if (!body.target_folder_id) missing.push("target_folder_id");
  if (!body.user_id) missing.push("user_id");
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing: ${missing.join(", ")}` });
    return;
  }
  try {
    const result = await executeTransfer({
      documentId: body.document_id!,
      targetFolderId: body.target_folder_id!,
      userId: body.user_id!,
    });
    const code = result.status === "done" ? 200 : result.status === "error" ? 500 : 202;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function sendHardenResult(result: Awaited<ReturnType<typeof executeHardenPdf>>, res: Response) {
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.status(200).json({
    success: true,
    files: result.files?.map((f) => ({
      originalName: f.originalName,
      hardenedName: f.hardenedName,
      data: f.buffer.toString("base64"),
    })),
  });
}

app.post("/harden/pdf", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const seed = (req.body as { seed?: string }).seed?.trim();
  if (files.length === 0) {
    res.status(400).json({ success: false, error: "No files. Use 'files' or POST /harden/pdf/by-id" });
    return;
  }
  const result = await executeHardenPdf({
    files: files.map((f) => ({ buffer: f.buffer, originalname: f.originalname })),
    seed,
  });
  sendHardenResult(result, res);
});

app.post("/harden/pdf/by-id", async (req: Request, res: Response) => {
  const body = req.body as HardenByIdRequestBody;
  if (!body.file_ids?.length || !body.user_id) {
    res.status(400).json({ success: false, error: "Missing file_ids or user_id" });
    return;
  }
  const result = await executeHardenPdf({ file_ids: body.file_ids, user_id: body.user_id, seed: body.seed });
  sendHardenResult(result, res);
});

app.post("/harden/image", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const seed = (req.body as { seed?: string }).seed?.trim();
  if (files.length === 0) {
    res.status(400).json({ success: false, error: "No files. Use 'files' or POST /harden/image/by-id" });
    return;
  }
  const result = await executeHardenImage({
    files: files.map((f) => ({ buffer: f.buffer, originalname: f.originalname })),
    seed,
  });
  sendHardenResult(result, res);
});

app.post("/harden/image/by-id", async (req: Request, res: Response) => {
  const body = req.body as HardenByIdRequestBody;
  if (!body.file_ids?.length || !body.user_id) {
    res.status(400).json({ success: false, error: "Missing file_ids or user_id" });
    return;
  }
  const result = await executeHardenImage({ file_ids: body.file_ids, user_id: body.user_id, seed: body.seed });
  sendHardenResult(result, res);
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Ensure CORS headers on error response (some middleware may skip normal CORS)
  const origin = _req.headers.origin || "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  console.error("[server] Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start(): Promise<void> {
  const port = parseInt(process.env.SERVER_PORT ?? "3001", 10);
  const server = app.listen(port, () => {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  LAVA Backend");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  Listening on  : http://localhost:${port}`);
    console.log(`  Health check  : GET  /health`);
    console.log(`  OAuth         : GET  /oauth/google?user_id=<uuid>`);
    console.log(`  Transfer      : POST /transfer`);
    console.log(`  Harden PDF    : POST /harden/pdf or /harden/pdf/by-id`);
    console.log(`  Harden image  : POST /harden/image or /harden/image/by-id`);
    console.log("═══════════════════════════════════════════════════════════════");
  });
  // Keep server reference so the process stays alive
  server.ref?.();

  const shutdown = () => {
    console.log("\n[server] Shutting down…");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Validate Supabase in background (required for /transfer and hardening by-id)
  validateSupabaseConnection().catch((err) => {
    console.warn("[server] Supabase validation failed (transfer/harden by-id may fail):", String(err));
  });
}

start().catch((err) => {
  console.error("[server] Fatal:", String(err));
  process.exit(1);
});
