/**
 * Runs LAVA hardening scripts (pdf_hardener.py, image_hardener.py) on uploaded files.
 * Scripts are expected in the backend folder (same directory as package.json).
 */

import { spawn } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { getSupabaseClient } from "./supabase";

const UPLOADS_BUCKET = "uploads";
const DEFAULT_SEED = "42";
const PDF_HARDENER_SCRIPT = "pdf_hardener.py";
const IMAGE_HARDENER_SCRIPT = "image_hardener.py";

export interface HardenPdfRequest {
  files?: Array<{ buffer: Buffer; originalname: string }>;
  file_ids?: string[];
  user_id?: string;
  seed?: string;
}

export interface HardenImageRequest {
  files?: Array<{ buffer: Buffer; originalname: string }>;
  file_ids?: string[];
  user_id?: string;
  seed?: string;
}

export interface HardenResultFile {
  originalName: string;
  hardenedName: string;
  buffer: Buffer;
}

export interface HardenResult {
  success: boolean;
  files?: HardenResultFile[];
  error?: string;
}

/** Resolve path to Python script in backend folder (same level as package.json). */
function scriptPath(name: string): string {
  return path.normalize(path.join(backendRoot(), name));
}

/** Backend folder: where package.json and .venv live. Prefer module location, else cwd. */
function backendRoot(): string {
  try {
    const modDir = __dirname;
    const distDir = path.basename(modDir);
    if (distDir === "dist" || distDir === "src") return path.dirname(modDir);
    return modDir;
  } catch {
    return process.cwd();
  }
}

/** Prefer backend/.venv/bin/python3 when present so venv deps are used without activating. */
function pythonCommand(): string {
  const root = backendRoot();
  const venvPython = path.join(root, ".venv", "bin", "python3");
  if (fsSync.existsSync(venvPython)) return venvPython;
  return "python3";
}

function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Process exited ${code}\n${stderr || stdout}`));
    });
  });
}

async function getFileFromStorage(fileId: string, userId: string): Promise<{ buffer: Buffer; name: string }> {
  const supabase = getSupabaseClient();
  const { data: row, error: selectError } = await supabase
    .from("storage_files")
    .select("id, name, storage_path, user_id")
    .eq("id", fileId)
    .single();

  if (selectError || !row) throw new Error(`File not found: ${fileId}`);
  const r = row as { user_id: string; name: string; storage_path: string | null };
  if (r.user_id !== userId) throw new Error("File does not belong to user");
  if (!r.storage_path?.trim()) throw new Error("File has no storage path");

  const { data: blob, error: downloadError } = await supabase.storage.from(UPLOADS_BUCKET).download(r.storage_path);
  if (downloadError || blob == null) throw new Error(`Download failed: ${downloadError?.message ?? "unknown"}`);
  return { buffer: Buffer.from(await blob.arrayBuffer()), name: r.name };
}

async function hardenOnePdf(
  inputBuffer: Buffer,
  originalName: string,
  seed: string,
  workDir: string
): Promise<HardenResultFile> {
  const stem = path.basename(originalName, path.extname(originalName));
  const inputPath = path.join(workDir, `in_${stem}.pdf`);
  const outputPath = path.join(workDir, `out_${stem}_hardened.pdf`);
  await fs.writeFile(inputPath, inputBuffer);

  const script = scriptPath(PDF_HARDENER_SCRIPT);
  try {
    await fs.access(script);
  } catch {
    throw new Error(`Script not found: ${script}. Add pdf_hardener.py to the backend folder.`);
  }

  await runCommand(pythonCommand(), [script, "-i", inputPath, "-o", outputPath, "--seed", seed, "--attack", "none"], {
    cwd: backendRoot(),
  });
  const outBuffer = await fs.readFile(outputPath);
  return { originalName, hardenedName: `${stem}_hardened.pdf`, buffer: outBuffer };
}

export async function executeHardenPdf(req: HardenPdfRequest): Promise<HardenResult> {
  const seed = req.seed?.trim() || DEFAULT_SEED;
  const workDir = path.join(os.tmpdir(), `lava-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    let inputs: Array<{ buffer: Buffer; originalname: string }> = [];
    if (req.files?.length) {
      inputs = req.files.map((f) => ({ buffer: f.buffer, originalname: f.originalname }));
    } else if (req.file_ids?.length && req.user_id) {
      for (const id of req.file_ids) {
        const { buffer, name } = await getFileFromStorage(id, req.user_id);
        inputs.push({ buffer, originalname: name });
      }
    } else {
      return { success: false, error: "Provide 'files' (multipart) or 'file_ids' with 'user_id'." };
    }

    const results: HardenResultFile[] = [];
    for (const input of inputs) {
      results.push(await hardenOnePdf(input.buffer, input.originalname, seed, workDir));
    }
    return { success: true, files: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeHardenImage(req: HardenImageRequest): Promise<HardenResult> {
  const script = scriptPath(IMAGE_HARDENER_SCRIPT);
  try {
    await fs.access(script);
  } catch {
    return { success: false, error: "Image hardener not available. Add image_hardener.py to the backend folder." };
  }

  const seed = req.seed?.trim() || DEFAULT_SEED;
  const workDir = path.join(os.tmpdir(), `lava-img-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    let inputs: Array<{ buffer: Buffer; originalname: string }> = [];
    if (req.files?.length) {
      inputs = req.files.map((f) => ({ buffer: f.buffer, originalname: f.originalname }));
    } else if (req.file_ids?.length && req.user_id) {
      for (const id of req.file_ids) {
        const { buffer, name } = await getFileFromStorage(id, req.user_id);
        inputs.push({ buffer, originalname: name });
      }
    } else {
      return { success: false, error: "Provide 'files' (multipart) or 'file_ids' with 'user_id'." };
    }

    const results: HardenResultFile[] = [];
    for (const input of inputs) {
      const ext = path.extname(input.originalname).toLowerCase();
      const stem = path.basename(input.originalname, ext);
      const inputPath = path.join(workDir, `in_${stem}${ext}`);
      const outputPath = path.join(workDir, `out_${stem}_protected${ext}`);
      await fs.writeFile(inputPath, input.buffer);
      await runCommand(pythonCommand(), [script, "-i", inputPath, "-o", outputPath, "--seed", seed], { cwd: backendRoot() });
      const outBuffer = await fs.readFile(outputPath);
      results.push({ originalName: input.originalname, hardenedName: `${stem}_protected${ext}`, buffer: outBuffer });
    }
    return { success: true, files: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
