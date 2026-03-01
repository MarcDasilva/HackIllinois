/**
 * Sync a Drive folder: download each document, run through hardening pipeline, re-upload (same name/id).
 */

import { getSupabaseClient } from "./supabase";
import {
  getFileContent,
  getFileContentWithToken,
  listFilesInFolder,
  listFilesInFolderWithToken,
  updateFileContent,
  updateFileContentWithToken,
} from "./googleDrive";
import { executeHardenPdf, executeHardenImage } from "./hardenJob";

const PDF_MIME = "application/pdf";
const DEFAULT_SEED = "42";

function isPdf(mime: string): boolean {
  return mime === PDF_MIME;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export interface SyncFolderRequest {
  user_id: string;
  drive_folder_id: string;
  seed?: string;
  /** When set, use this Google access token for Drive API instead of user_integrations. Enables sync with Supabase Google sign-in. */
  access_token?: string;
}

export interface SyncFolderResult {
  success: boolean;
  folder_last_encrypted_at: string | null;
  folder_encryption_success: boolean | null;
  processed: number;
  succeeded: number;
  failed: number;
  errors?: string[];
}

export async function executeSyncFolder(req: SyncFolderRequest): Promise<SyncFolderResult> {
  const { user_id, drive_folder_id, seed = DEFAULT_SEED, access_token } = req;
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const listFiles = access_token
    ? (folderId: string) => listFilesInFolderWithToken(access_token, folderId)
    : (folderId: string) => listFilesInFolder(user_id, folderId);
  const getContent = access_token
    ? (_userId: string, fileId: string) => getFileContentWithToken(access_token, fileId)
    : (userId: string, fileId: string) => getFileContent(userId, fileId);
  const updateContent = access_token
    ? (_userId: string, fileId: string, buffer: Buffer, mimeType: string) =>
        updateFileContentWithToken(access_token, fileId, buffer, mimeType)
    : (userId: string, fileId: string, buffer: Buffer, mimeType: string) =>
        updateFileContent(userId, fileId, buffer, mimeType);

  try {
    const files = await listFiles(drive_folder_id);
    const toProcess = files.filter((f) => isPdf(f.mimeType) || isImage(f.mimeType));

    for (const file of toProcess) {
      processed += 1;
      try {
        const buffer = await getContent(user_id, file.id);
        let resultBuffer: Buffer;
        const mimeType = file.mimeType;

        if (isPdf(file.mimeType)) {
          const result = await executeHardenPdf({
            files: [{ buffer, originalname: file.name }],
            seed,
          });
          if (!result.success || !result.files?.[0]) {
            throw new Error(result.error ?? "PDF harden failed");
          }
          resultBuffer = result.files[0].buffer;
        } else if (isImage(file.mimeType)) {
          const result = await executeHardenImage({
            files: [{ buffer, originalname: file.name }],
            seed,
          });
          if (!result.success || !result.files?.[0]) {
            throw new Error(result.error ?? "Image harden failed");
          }
          resultBuffer = result.files[0].buffer;
        } else {
          continue;
        }

        await updateContent(user_id, file.id, resultBuffer, mimeType);
        succeeded += 1;

        await supabase.from("drive_file_encryption_status").upsert(
          {
            user_id,
            drive_file_id: file.id,
            last_encrypted_at: now,
            last_encryption_success: true,
            updated_at: now,
          },
          { onConflict: "user_id,drive_file_id" }
        );

        await supabase.from("sync_history").insert({
          user_id,
          drive_file_id: file.id,
          drive_file_name: file.name,
          drive_folder_id,
          synced_at: now,
          success: true,
        });
      } catch (err) {
        failed += 1;
        const msg = `${file.name}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);

        await supabase.from("drive_file_encryption_status").upsert(
          {
            user_id,
            drive_file_id: file.id,
            last_encrypted_at: now,
            last_encryption_success: false,
            updated_at: now,
          },
          { onConflict: "user_id,drive_file_id" }
        );

        await supabase.from("sync_history").insert({
          user_id,
          drive_file_id: file.id,
          drive_file_name: file.name,
          drive_folder_id,
          synced_at: now,
          success: false,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const folderSuccess = failed === 0 && processed > 0;
    await supabase
      .from("drive_folder_settings")
      .upsert(
        {
          user_id,
          drive_folder_id,
          last_encrypted_at: now,
          last_encryption_success: folderSuccess,
          updated_at: now,
        },
        { onConflict: "user_id,drive_folder_id" }
      );

    return {
      success: failed === 0,
      folder_last_encrypted_at: now,
      folder_encryption_success: folderSuccess,
      processed,
      succeeded,
      failed,
      errors: errors.length ? errors : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await supabase
      .from("drive_folder_settings")
      .upsert(
        {
          user_id,
          drive_folder_id,
          last_encrypted_at: now,
          last_encryption_success: false,
          updated_at: now,
        },
        { onConflict: "user_id,drive_folder_id" }
      );
    return {
      success: false,
      folder_last_encrypted_at: now,
      folder_encryption_success: false,
      processed,
      succeeded,
      failed,
      errors,
    };
  }
}
