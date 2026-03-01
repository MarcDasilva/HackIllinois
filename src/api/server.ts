/**
 * Express API Server
 * 
 * REST API endpoints for Google Drive + VeilDoc encryption backend
 */

import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import * as googleDrive from './googleDrive';
import * as encryptionWorkflow from './encryptionWorkflow';
import { getAuthUrl, exchangeCodeAndStore } from '../googleDrive';
import type { WebhookNotification } from '../types/encryption';

// ── Configuration ────────────────────────────────────────────

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const HOST = process.env.API_HOST || '0.0.0.0';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const WEBHOOK_RENEWAL_INTERVAL = parseInt(
  process.env.WEBHOOK_RENEWAL_INTERVAL_MS || '43200000', // 12 hours
  10
);

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Express App Setup ────────────────────────────────────────

const app = express();

// CORS so frontend on another port (e.g. Next.js on 3001) can call /api/oauth/user-id
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin === '*' ? '*' : corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// ── OAuth (Google Drive connect) ────────────────────────────

/**
 * GET /oauth/google
 * Redirect to Google consent. Query: user_id (required) — Supabase user UUID.
 */
app.get('/oauth/google', (req: Request, res: Response) => {
  const userId = req.query['user_id'];
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({
      error: 'Missing required query parameter: user_id',
      hint: 'Pass the Supabase user UUID as ?user_id=<uuid>',
    });
    return;
  }
  const state = Buffer.from(JSON.stringify({ user_id: userId })).toString('base64url');
  try {
    const authUrl = getAuthUrl();
    res.redirect(`${authUrl}&state=${encodeURIComponent(state)}`);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/oauth/user-id
 * Returns the configured default user ID for OAuth (from OAUTH_DEFAULT_USER_ID).
 * Frontend uses this for the "Sign in with Google" link so you configure once in .env.
 */
app.get('/api/oauth/user-id', (_req: Request, res: Response) => {
  const userId = process.env.OAUTH_DEFAULT_USER_ID?.trim();
  if (!userId) {
    res.status(404).json({ error: 'OAUTH_DEFAULT_USER_ID not set in server .env' });
    return;
  }
  res.json({ user_id: userId });
});

/**
 * GET /oauth/callback
 * Google redirects here after consent. Exchanges code for tokens, stores in Supabase.
 */
app.get('/oauth/callback', async (req: Request, res: Response) => {
  const code = req.query['code'];
  const state = req.query['state'];
  const errorParam = req.query['error'];
  if (errorParam) {
    res.status(400).json({ error: `OAuth denied: ${errorParam}` });
    return;
  }
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: "Missing 'code' from Google OAuth callback." });
    return;
  }
  let userId: string;
  try {
    const stateStr = Buffer.from(String(state), 'base64url').toString('utf8');
    const parsed = JSON.parse(stateStr) as { user_id?: string };
    if (!parsed.user_id) throw new Error('state missing user_id');
    userId = parsed.user_id;
  } catch {
    res.status(400).json({ error: 'Invalid or missing state parameter.' });
    return;
  }
  try {
    await exchangeCodeAndStore(code, userId);
    const successRedirect = process.env.OAUTH_SUCCESS_REDIRECT;
    if (successRedirect) {
      res.redirect(successRedirect);
    } else {
      res.json({ success: true, message: 'Google Drive connected.', user_id: userId });
    }
  } catch (err) {
    console.error('[API] OAuth callback error:', String(err));
    res.status(500).json({ error: String(err) });
  }
});

// ── API Endpoints ────────────────────────────────────────────

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Check dependencies
    const pythonDeps = await require('./veilDoc').checkPythonDependencies();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        python: pythonDeps.pythonInstalled,
        pythonVersion: pythonDeps.pythonVersion,
        pymupdf: pythonDeps.pymupdfInstalled,
        veildocScript: pythonDeps.veildocScriptExists,
        unveildocScript: pythonDeps.unveildocScriptExists,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/drive/files
 * List files from Google Drive
 * Query params: folderId, pageToken, mimeType
 */
app.get('/api/drive/files', async (req: Request, res: Response) => {
  try {
    const { folderId, pageToken, mimeType, userId } = req.query;
    const uid = typeof userId === 'string' && userId.trim() ? userId.trim() : undefined;

    const result = await googleDrive.listFiles(
      {
        folderId: folderId as string | undefined,
        pageToken: pageToken as string | undefined,
        mimeType: mimeType as string | undefined,
      },
      uid
    );

    res.json(result);
  } catch (error) {
    console.error('[API] Error listing files:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list files',
    });
  }
});

/**
 * POST /api/drive/encrypt
 * Encrypt selected files and enable continuous monitoring
 * Body: { fileIds: string[], mode: 'full' | 'pattern', replaceOriginal: boolean }
 */
app.post('/api/drive/encrypt', async (req: Request, res: Response) => {
  try {
    const { fileIds, mode, replaceOriginal, userId } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        error: 'fileIds must be a non-empty array',
      });
    }
    const sanitizedFileIds = fileIds.map((id: string) =>
      String(id).trim().replace(/["?\s]+$/g, '').replace(/^["?\s]+/g, '')
    ).filter(Boolean);
    if (sanitizedFileIds.length === 0) {
      return res.status(400).json({
        error: 'fileIds must be a non-empty array of valid strings',
      });
    }

    if (mode && mode !== 'full' && mode !== 'pattern') {
      return res.status(400).json({
        error: 'mode must be either "full" or "pattern"',
      });
    }

    const jobId = await encryptionWorkflow.startEncryptionJob(
      sanitizedFileIds,
      mode || 'pattern',
      replaceOriginal || false,
      typeof userId === 'string' && userId.trim() ? userId.trim() : undefined
    );
    
    res.json({
      jobId,
      status: 'started',
      message: `Encryption job started for ${sanitizedFileIds.length} file(s)`,
    });
  } catch (error) {
    console.error('[API] Error starting encryption job:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start encryption job',
    });
  }
});

/**
 * GET /api/drive/status/:jobId
 * Check encryption job status
 */
app.get('/api/drive/status/:jobId', (req: Request, res: Response) => {
  try {
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    
    const job = encryptionWorkflow.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
      });
    }
    
    res.json(job);
  } catch (error) {
    console.error('[API] Error fetching job status:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch job status',
    });
  }
});

/**
 * POST /api/drive/disable-encryption
 * Stop monitoring a file
 * Body: { fileId: string }
 */
app.post('/api/drive/disable-encryption', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({
        error: 'fileId is required',
      });
    }
    
    await encryptionWorkflow.disableEncryption(fileId);
    
    res.json({
      success: true,
      message: `Encryption disabled for file ${fileId}`,
    });
  } catch (error) {
    console.error('[API] Error disabling encryption:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to disable encryption',
    });
  }
});

/**
 * POST /api/drive/webhook
 * Webhook callback from Google Drive
 */
app.post('/api/drive/webhook', async (req: Request, res: Response) => {
  try {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    
    // Verify webhook signature
    if (!googleDrive.verifyWebhookSignature(headers, req.body)) {
      return res.status(401).json({
        error: 'Invalid webhook signature',
      });
    }
    
    // Extract webhook info
    const resourceState = headers['x-goog-resource-state'] as string;
    const resourceId = headers['x-goog-resource-id'] as string;
    const channelId = headers['x-goog-channel-id'] as string;
    
    console.log(`[API] Webhook received: state=${resourceState}, channelId=${channelId}`);
    
    // Ignore sync events (initial webhook setup confirmation)
    if (resourceState === 'sync') {
      return res.status(200).json({ status: 'ok', action: 'ignored_sync' });
    }
    
    // Look up document by webhook channel ID
    const { data: docs, error } = await supabase
      .from('documents')
      .select('*')
      .eq('webhook_channel_id', channelId)
      .eq('encryption_enabled', true);
    
    if (error || !docs || docs.length === 0) {
      return res.status(200).json({ status: 'ok', action: 'file_not_tracked' });
    }
    
    const doc = docs[0];
    const ownerId = (doc as { owner_id?: string }).owner_id;

    const metadata = await googleDrive.getFileMetadata(doc.google_drive_id, ownerId);
    
    // Check if file content actually changed (not just viewed/shared)
    if (metadata.modifiedTime === doc.drive_modified_time) {
      return res.status(200).json({ status: 'ok', action: 'no_content_change' });
    }
    
    // Trigger re-encryption asynchronously
    encryptionWorkflow.reEncryptFile(doc.id).catch((error) => {
      console.error('[API] Re-encryption failed:', error);
    });
    
    res.status(200).json({ status: 'ok', action: 're_encryption_triggered' });
  } catch (error) {
    console.error('[API] Webhook handler error:', error);
    // Return 200 to avoid webhook retries
    res.status(200).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents
 * List encrypted documents from Supabase
 * Query params: encryption_enabled (filter by active monitoring)
 */
app.get('/api/documents', async (req: Request, res: Response) => {
  try {
    const { encryption_enabled, status } = req.query;
    
    let query = supabase.from('documents').select('*');
    
    if (encryption_enabled === 'true') {
      query = query.eq('encryption_enabled', true);
    } else if (encryption_enabled === 'false') {
      query = query.eq('encryption_enabled', false);
    }
    
    if (status) {
      query = query.eq('encryption_status', status);
    }
    
    const { data, error } = await query.order('updated_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    res.json({
      documents: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('[API] Error fetching documents:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch documents',
    });
  }
});

// ── Error Handling ───────────────────────────────────────────

// Root — friendly response when someone opens the API URL in a browser
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'API server. Use the frontend app for the UI.',
    health: '/api/health',
    oauth_user_id: '/api/oauth/user-id',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ── Server Startup ───────────────────────────────────────────

/**
 * Start the API server
 */
export async function startServer(): Promise<void> {
  try {
    console.log('[API] Starting server...');
    
    try {
      await googleDrive.initDriveClient();
      console.log('[API] ✓ Google Drive client initialized (service account)');
    } catch (error) {
      if (googleDrive.isOAuthConfigured()) {
        console.log('[API] ✓ Using OAuth for Drive (pass userId in /api/drive/encrypt and /api/drive/files to avoid storage quota)');
      } else {
        console.warn('[API] ⚠ Warning: Failed to initialize Google Drive client');
        console.warn('[API] Set GOOGLE_SERVICE_ACCOUNT_PATH or OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
      }
    }
    
    // Start webhook renewal background task
    setInterval(async () => {
      try {
        const renewed = await encryptionWorkflow.renewExpiringWebhooks();
        if (renewed > 0) {
          console.log(`[API] Renewed ${renewed} webhooks`);
        }
      } catch (error) {
        console.error('[API] Webhook renewal error:', error);
      }
    }, WEBHOOK_RENEWAL_INTERVAL);
    
    console.log(`[API] Webhook renewal task scheduled (interval: ${WEBHOOK_RENEWAL_INTERVAL}ms)`);
    
    // Start Express server
    app.listen(PORT, HOST, () => {
      console.log(`[API] ✓ Server listening on ${HOST}:${PORT}`);
      console.log(`[API] Health check: http://${HOST}:${PORT}/api/health`);
      console.log('[API]');
      console.log('[API] Available endpoints:');
      console.log('[API]   GET  /api/health');
      console.log('[API]   GET  /api/oauth/user-id');
      console.log('[API]   GET  /oauth/google?user_id=<uuid>');
      console.log('[API]   GET  /oauth/callback');
      console.log('[API]   GET  /api/drive/files');
      console.log('[API]   POST /api/drive/encrypt');
      console.log('[API]   GET  /api/drive/status/:jobId');
      console.log('[API]   POST /api/drive/disable-encryption');
      console.log('[API]   POST /api/drive/webhook');
      console.log('[API]   GET  /api/documents');
    });
  } catch (error) {
    console.error('[API] Failed to start server:', error);
    process.exit(1);
  }
}

// ── Exports ──────────────────────────────────────────────────

export { app };
export default { startServer, app };
