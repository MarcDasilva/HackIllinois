/**
 * Drive transfer execution: move document's Drive file to target folder.
 */

import { getSupabaseClient } from "./supabase";
import { moveFile, getFile } from "./googleDrive";

export interface TransferRequest {
  documentId: string;
  targetFolderId: string;
  userId: string;
}

export type TransferStatus = "none" | "pending" | "in_progress" | "done" | "error";

export interface TransferResult {
  documentId: string;
  status: TransferStatus;
  newFolderId?: string;
  transferredAt?: string;
  error?: string;
}

interface DocumentRow {
  id: string;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  mime_type: string | null;
  transfer_status: TransferStatus;
  transfer_target_folder_id: string | null;
}

async function setStatus(
  documentId: string,
  status: TransferStatus,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from("documents").update({ transfer_status: status, ...extra }).eq("id", documentId);
}

export async function executeTransfer(req: TransferRequest): Promise<TransferResult> {
  const { documentId, targetFolderId, userId } = req;
  const supabase = getSupabaseClient();

  const { data, error: fetchError } = await supabase
    .from("documents")
    .select("id, drive_file_id, drive_folder_id, mime_type, transfer_status, transfer_target_folder_id")
    .eq("id", documentId)
    .single();

  if (fetchError || !data) {
    return { documentId, status: "error", error: fetchError?.message ?? "Row not found" };
  }

  const doc = data as unknown as DocumentRow;
  if (!doc.drive_file_id) {
    await setStatus(documentId, "error", { transfer_error: "No drive_file_id" });
    return { documentId, status: "error", error: "Document has no drive_file_id" };
  }
  if (doc.transfer_status === "in_progress") {
    return { documentId, status: "in_progress", error: "Transfer already in progress" };
  }

  let currentFolderId = doc.drive_folder_id;
  if (!currentFolderId) {
    try {
      const meta = await getFile(userId, doc.drive_file_id);
      const parentId = meta.parents[0] ?? null;
      if (!parentId) {
        await setStatus(documentId, "error", { transfer_error: "No parent folder" });
        return { documentId, status: "error", error: "Drive file has no parent folder" };
      }
      await supabase.from("documents").update({ drive_folder_id: parentId, mime_type: meta.mimeType }).eq("id", documentId);
      doc.drive_folder_id = parentId;
      currentFolderId = parentId;
    } catch (err) {
      const msg = String(err);
      await setStatus(documentId, "error", { transfer_error: msg });
      return { documentId, status: "error", error: msg };
    }
  }

  await setStatus(documentId, "in_progress", { transfer_target_folder_id: targetFolderId, transfer_error: null });

  try {
    const movedFile = await moveFile(userId, doc.drive_file_id, targetFolderId, currentFolderId);
    const transferredAt = new Date().toISOString();
    await supabase
      .from("documents")
      .update({
        drive_folder_id: targetFolderId,
        mime_type: movedFile.mimeType || doc.mime_type,
        transfer_status: "done",
        transfer_target_folder_id: null,
        transfer_error: null,
        transferred_at: transferredAt,
      })
      .eq("id", documentId);

    return { documentId, status: "done", newFolderId: targetFolderId, transferredAt };
  } catch (err) {
    const msg = String(err);
    await setStatus(documentId, "error", { transfer_error: msg, transfer_target_folder_id: null });
    return { documentId, status: "error", error: msg };
  }
}
