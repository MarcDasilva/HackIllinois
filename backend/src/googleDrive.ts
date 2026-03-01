/**
 * Google Drive API v3 wrapper for backend (OAuth, move file, get metadata).
 */

import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getSupabaseClient } from "./supabase";

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
}

export interface UserTokens {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

function getOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri?.trim()) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set in backend/.env");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildOAuthClient(tokens: UserTokens, userId: string): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: new Date(tokens.token_expires_at).getTime(),
  });
  oauth2Client.on("tokens", (newTokens) => {
    if (newTokens.access_token) {
      const expiresAt = newTokens.expiry_date
        ? new Date(newTokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();
      persistTokens(userId, newTokens.access_token, expiresAt).catch((e) =>
        console.error("[googleDrive] Failed to persist refreshed token:", e)
      );
    }
  });
  return oauth2Client;
}

export function getAuthUrl(): string {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
}

export async function exchangeCodeAndStore(code: string, userId: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("OAuth did not return access_token or refresh_token.");
  }
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: "google_drive",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      google_email: userInfo.email ?? null,
    },
    { onConflict: "user_id,provider" }
  );
  if (error) throw new Error(`Failed to store OAuth tokens: ${error.message}`);
  console.log(`[googleDrive] Stored tokens for user ${userId}`);
}

async function persistTokens(userId: string, accessToken: string, expiresAt: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("user_integrations")
    .update({ access_token: accessToken, token_expires_at: expiresAt })
    .eq("user_id", userId)
    .eq("provider", "google_drive");
  if (error) throw new Error(`persistTokens failed: ${error.message}`);
}

export async function loadUserTokens(userId: string): Promise<UserTokens> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_integrations")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google_drive")
    .single();
  if (error || !data) {
    throw new Error(`No Google Drive integration for user ${userId}. Use GET /oauth/google first.`);
  }
  const r = data as Record<string, string>;
  return { access_token: r.access_token, refresh_token: r.refresh_token, token_expires_at: r.token_expires_at };
}

function buildDriveClient(tokens: UserTokens, userId: string): drive_v3.Drive {
  const auth = buildOAuthClient(tokens, userId);
  return google.drive({ version: "v3", auth });
}

/** Build a Drive client from a single access token (e.g. from Supabase provider_token). No refresh. */
function buildDriveClientFromAccessToken(accessToken: string): drive_v3.Drive {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

export async function getFile(userId: string, fileId: string): Promise<DriveFileMetadata> {
  const tokens = await loadUserTokens(userId);
  const drive = buildDriveClient(tokens, userId);
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
  });
  const f = res.data;
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    parents: f.parents ?? [],
    webViewLink: f.webViewLink ?? undefined,
    createdTime: f.createdTime ?? undefined,
    modifiedTime: f.modifiedTime ?? undefined,
  };
}

export async function moveFile(
  userId: string,
  fileId: string,
  targetFolderId: string,
  currentFolderId: string
): Promise<DriveFileMetadata> {
  const tokens = await loadUserTokens(userId);
  const drive = buildDriveClient(tokens, userId);
  const res = await drive.files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: currentFolderId,
    fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
  });
  const f = res.data;
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    parents: f.parents ?? [],
    webViewLink: f.webViewLink ?? undefined,
    createdTime: f.createdTime ?? undefined,
    modifiedTime: f.modifiedTime ?? undefined,
  };
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Download file content (binary). Use for non–Google-Docs files (e.g. PDF, images). */
export async function getFileContent(userId: string, fileId: string): Promise<Buffer> {
  const tokens = await loadUserTokens(userId);
  const drive = buildDriveClient(tokens, userId);
  return getFileContentWithDrive(drive, fileId);
}

/** Download file content using a Drive client (e.g. from access token). */
export async function getFileContentWithDrive(drive: drive_v3.Drive, fileId: string): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const data = res.data as ArrayBuffer | undefined;
  if (!data) throw new Error("Empty response from Drive");
  return Buffer.from(data);
}

export async function getFileContentWithToken(accessToken: string, fileId: string): Promise<Buffer> {
  const drive = buildDriveClientFromAccessToken(accessToken);
  return getFileContentWithDrive(drive, fileId);
}

/** List files (no folders) in a Drive folder. */
export async function listFilesInFolder(
  userId: string,
  folderId: string
): Promise<DriveFileMetadata[]> {
  const tokens = await loadUserTokens(userId);
  const drive = buildDriveClient(tokens, userId);
  return listFilesInFolderWithDrive(drive, folderId);
}

export async function listFilesInFolderWithDrive(
  drive: drive_v3.Drive,
  folderId: string
): Promise<DriveFileMetadata[]> {
  const q = `'${folderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`;
  const res = await drive.files.list({
    q,
    fields: "files(id, name, mimeType, parents, webViewLink, createdTime, modifiedTime)",
    pageSize: 100,
    orderBy: "name",
  });
  const files = res.data.files ?? [];
  return files.map((f) => ({
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    parents: f.parents ?? [],
    webViewLink: f.webViewLink ?? undefined,
    createdTime: f.createdTime ?? undefined,
    modifiedTime: f.modifiedTime ?? undefined,
  }));
}

export async function listFilesInFolderWithToken(
  accessToken: string,
  folderId: string
): Promise<DriveFileMetadata[]> {
  const drive = buildDriveClientFromAccessToken(accessToken);
  return listFilesInFolderWithDrive(drive, folderId);
}

/** Overwrite file content (keeps same file id and name). */
export async function updateFileContent(
  userId: string,
  fileId: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const tokens = await loadUserTokens(userId);
  const drive = buildDriveClient(tokens, userId);
  return updateFileContentWithDrive(drive, fileId, buffer, mimeType);
}

export async function updateFileContentWithDrive(
  drive: drive_v3.Drive,
  fileId: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const { Readable } = await import("stream");
  await drive.files.update({
    fileId,
    requestBody: {},
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
  });
}

export async function updateFileContentWithToken(
  accessToken: string,
  fileId: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const drive = buildDriveClientFromAccessToken(accessToken);
  return updateFileContentWithDrive(drive, fileId, buffer, mimeType);
}
