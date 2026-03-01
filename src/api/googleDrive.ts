/**
 * Google Drive API Integration Module
 *
 * Supports two auth modes:
 * - Service account (JWT): no user storage quota; use Shared Drive or GOOGLE_DRIVE_UPLOAD_FOLDER_ID.
 * - OAuth (per-user): uses the user's Drive and quota; no Shared Drive required.
 * When userId is passed to list/get/download/upload, OAuth is used if GOOGLE_CLIENT_ID is set.
 */

import { google, drive_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  DriveFile,
  DriveFileList,
  DriveWebhook,
  DriveFileMetadata,
  UploadOptions,
  ListFilesOptions,
} from '../types/googleDrive';

// ── Configuration ────────────────────────────────────────────

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './config/google-service-account.json';
const WEBHOOK_URL = process.env.GOOGLE_DRIVE_WEBHOOK_URL || '';
/** Folder or Shared Drive folder ID where new files are uploaded (service account only; OAuth uses user's Drive) */
const UPLOAD_FOLDER_ID = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

let driveClient: drive_v3.Drive | null = null;
let authClient: JWT | null = null;

/** Lazy Supabase client for OAuth token storage (user_integrations) */
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required for OAuth Drive.');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function getOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId?.trim()) throw new Error('GOOGLE_CLIENT_ID is not set for OAuth. Create an OAuth 2.0 client in Google Cloud Console.');
  if (!clientSecret?.trim()) throw new Error('GOOGLE_CLIENT_SECRET is not set.');
  if (!redirectUri?.trim()) throw new Error('GOOGLE_REDIRECT_URI is not set (e.g. http://localhost:3000/oauth/callback).');
  return { clientId, clientSecret, redirectUri };
}

/** Load a user's OAuth tokens from user_integrations. */
async function loadUserTokens(userId: string): Promise<{ access_token: string; refresh_token: string; token_expires_at: string }> {
  const { data, error } = await getSupabase()
    .from('user_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .single();
  if (error || !data) {
    throw new Error(`No Google Drive OAuth for user ${userId}. User should connect Drive first (e.g. OAuth flow).`);
  }
  const row = data as Record<string, string>;
  return { access_token: row.access_token, refresh_token: row.refresh_token, token_expires_at: row.token_expires_at };
}

async function persistRefreshedToken(userId: string, accessToken: string, expiresAt: string): Promise<void> {
  const { error } = await getSupabase()
    .from('user_integrations')
    .update({ access_token: accessToken, token_expires_at: expiresAt })
    .eq('user_id', userId)
    .eq('provider', 'google_drive');
  if (error) throw new Error(`Failed to persist refreshed token: ${error.message}`);
}

/** Build a Drive v3 client using the user's OAuth tokens (uses their storage quota). */
export async function getDriveClientForUser(userId: string): Promise<drive_v3.Drive> {
  const tokens = await loadUserTokens(userId);
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: new Date(tokens.token_expires_at).getTime(),
  });
  oauth2Client.on('tokens', (newTokens) => {
    if (newTokens.access_token) {
      const expiresAt = newTokens.expiry_date
        ? new Date(newTokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();
      persistRefreshedToken(userId, newTokens.access_token, expiresAt).catch((err) =>
        console.error(`[googleDrive] Failed to persist refreshed token for ${userId}:`, err)
      );
    }
  });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/** True if OAuth is configured and can be used for user-scoped operations. */
export function isOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_REDIRECT_URI?.trim());
}

// ── Initialization ───────────────────────────────────────────

/**
 * Initialize Google Drive API client with service account
 * 
 * @returns Promise resolving to Drive client
 */
export async function initDriveClient(): Promise<drive_v3.Drive> {
  if (driveClient) {
    return driveClient;
  }

  // Validate service account file exists
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Service account file not found: ${SERVICE_ACCOUNT_PATH}`);
  }

  // Load service account credentials
  const serviceAccountKey = JSON.parse(
    await readFile(SERVICE_ACCOUNT_PATH, 'utf-8')
  );

  // Create JWT auth client
  authClient = new google.auth.JWT({
    email: serviceAccountKey.client_email,
    key: serviceAccountKey.private_key,
    scopes: SCOPES,
  });

  // Authenticate
  await authClient.authorize();

  // Initialize Drive API client
  driveClient = google.drive({ version: 'v3', auth: authClient });

  console.log('[googleDrive] Drive client initialized successfully');
  return driveClient;
}

/**
 * Get initialized Drive client (throws if not initialized)
 */
function getDriveClient(): drive_v3.Drive {
  if (!driveClient) {
    throw new Error('Drive client not initialized. Call initDriveClient() first.');
  }
  return driveClient;
}

// ── File Operations ──────────────────────────────────────────

/**
 * List files from Google Drive with pagination.
 * When userId is provided and OAuth is configured, uses that user's Drive (their quota).
 */
export async function listFiles(options: ListFilesOptions = {}, userId?: string): Promise<DriveFileList> {
  const drive = userId && isOAuthConfigured() ? await getDriveClientForUser(userId) : getDriveClient();

  // Build query
  const queryParts: string[] = ["trashed = false"];
  
  if (options.folderId) {
    queryParts.push(`'${options.folderId}' in parents`);
  }
  
  if (options.mimeType) {
    queryParts.push(`mimeType = '${options.mimeType}'`);
  }
  
  if (options.query) {
    queryParts.push(options.query);
  }

  const query = queryParts.join(' and ');

  // Execute list request
  const response = await drive.files.list({
    q: query,
    pageSize: options.pageSize || 100,
    pageToken: options.pageToken,
    fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, iconLink, thumbnailLink, parents)',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return {
    files: (response.data.files || []) as DriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get file metadata from Google Drive.
 * When userId is provided and OAuth is configured, uses that user's access.
 */
export async function getFileMetadata(fileId: string, userId?: string): Promise<DriveFileMetadata> {
  const drive = userId && isOAuthConfigured() ? await getDriveClientForUser(userId) : getDriveClient();

  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, parents',
    supportsAllDrives: true,
  });

  return response.data as DriveFileMetadata;
}

/**
 * Download file from Google Drive to local path.
 * When userId is provided and OAuth is configured, uses that user's access.
 */
export async function downloadFile(fileId: string, destPath: string, userId?: string): Promise<string> {
  const drive = userId && isOAuthConfigured() ? await getDriveClientForUser(userId) : getDriveClient();

  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const dest = createWriteStream(destPath);
    
    response.data
      .on('error', reject)
      .pipe(dest)
      .on('error', reject)
      .on('finish', () => resolve(destPath));
  });
}

/**
 * Upload file to Google Drive.
 * When userId is provided and OAuth is configured, uses that user's Drive (avoids service-account storage quota).
 * For new files without replaceFileId, pass folderId (e.g. same folder as original) or rely on GOOGLE_DRIVE_UPLOAD_FOLDER_ID for service account.
 */
export async function uploadFile(
  filePath: string,
  options: UploadOptions = {},
  userId?: string
): Promise<DriveFileMetadata> {
  const drive = userId && isOAuthConfigured() ? await getDriveClientForUser(userId) : getDriveClient();

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const media = {
    mimeType: options.mimeType || 'application/octet-stream',
    body: createReadStream(filePath),
  };

  if (options.replaceFileId) {
    const response = await drive.files.update({
      fileId: options.replaceFileId,
      media,
      fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, parents',
      supportsAllDrives: true,
    });
    return response.data as DriveFileMetadata;
  }

  const envUploadFolderId = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID ?? '';
  const parentId = options.folderId || envUploadFolderId || UPLOAD_FOLDER_ID;
  const usingOAuth = !!(userId && isOAuthConfigured());
  if (!parentId && !usingOAuth) {
    throw new Error(
      'Service accounts have no storage quota. Set GOOGLE_DRIVE_UPLOAD_FOLDER_ID to a Shared Drive folder, or use OAuth (pass userId and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).'
    );
  }
  if (!parentId) {
    throw new Error('Upload requires folderId in options when creating a new file (e.g. same folder as original).');
  }

  const fileMetadata: drive_v3.Schema$File = {
    name: options.name || filePath.split(/[/\\]/).pop() || 'untitled',
    parents: [parentId],
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, parents',
    supportsAllDrives: true,
  });

  return response.data as DriveFileMetadata;
}

/**
 * Delete file from Google Drive
 * 
 * @param fileId - Google Drive file ID
 * @returns Promise resolving when file is deleted
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

// ── Webhook Management ───────────────────────────────────────

/**
 * Create webhook for file change notifications.
 * When userId is provided and OAuth is configured, uses that user's Drive client.
 */
export async function createWebhook(
  fileId: string,
  callbackUrl?: string,
  userId?: string
): Promise<DriveWebhook> {
  const drive = userId && isOAuthConfigured() ? await getDriveClientForUser(userId) : getDriveClient();
  const url = callbackUrl || WEBHOOK_URL;

  if (!url) {
    throw new Error('Webhook URL not configured. Set GOOGLE_DRIVE_WEBHOOK_URL environment variable.');
  }

  const channelId = uuidv4();
  const expiration = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now

  const response = await drive.files.watch({
    fileId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: url,
      expiration: expiration.toString(),
    },
  });

  return {
    id: response.data.id!,
    resourceId: response.data.resourceId!,
    resourceUri: response.data.resourceUri!,
    kind: response.data.kind!,
    expiration: response.data.expiration!,
  };
}

/**
 * Stop webhook channel.
 * When userId is provided and OAuth is configured, uses that user's Drive client.
 */
export async function stopWebhook(channelId: string, resourceId: string, userId?: string): Promise<void> {
  const drive = userId && isOAuthConfigured() ? await getDriveClientForUser(userId) : getDriveClient();

  await drive.channels.stop({
    requestBody: {
      id: channelId,
      resourceId: resourceId,
    },
  });
}

/**
 * Verify webhook notification signature
 * 
 * @param headers - Request headers from webhook
 * @param body - Request body from webhook
 * @returns True if signature is valid
 */
export function verifyWebhookSignature(
  headers: Record<string, string | string[] | undefined>,
  body: any
): boolean {
  // Google Drive webhooks don't use HMAC signatures like GitHub
  // Instead, verify the channel ID and resource state are present
  const channelId = headers['x-goog-channel-id'];
  const resourceState = headers['x-goog-resource-state'];
  const resourceId = headers['x-goog-resource-id'];

  return !!(channelId && resourceState && resourceId);
}

/**
 * Renew webhook before expiration.
 * When userId is provided and OAuth is configured, uses that user's Drive client.
 */
export async function renewWebhook(
  fileId: string,
  oldChannelId: string,
  oldResourceId: string,
  callbackUrl?: string,
  userId?: string
): Promise<DriveWebhook> {
  try {
    await stopWebhook(oldChannelId, oldResourceId, userId);
  } catch (error) {
    console.warn(`[googleDrive] Failed to stop old webhook: ${error}`);
  }
  return createWebhook(fileId, callbackUrl, userId);
}

// ── Utility Functions ────────────────────────────────────────

/**
 * Build web view URL for a file
 * 
 * @param fileId - Google Drive file ID
 * @returns Web view URL
 */
export function buildFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Extract file ID from Google Drive URL
 * 
 * @param url - Google Drive URL
 * @returns File ID or null if not found
 */
export function extractFileIdFromUrl(url: string): string | null {
  const patterns = [
    /\/file\/d\/([^\/]+)/,
    /id=([^&]+)/,
    /\/d\/([^\/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// ── Exports ──────────────────────────────────────────────────

export default {
  initDriveClient,
  getDriveClientForUser,
  isOAuthConfigured,
  listFiles,
  getFileMetadata,
  downloadFile,
  uploadFile,
  deleteFile,
  createWebhook,
  stopWebhook,
  renewWebhook,
  verifyWebhookSignature,
  buildFileUrl,
  extractFileIdFromUrl,
};
