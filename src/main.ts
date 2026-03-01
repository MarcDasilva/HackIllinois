/**
 * Main entry point for the API server
 * 
 * Starts the Express server with Google Drive + VeilDoc encryption endpoints
 */

import * as dotenv from 'dotenv';
dotenv.config();

import('./api/server').then(({ startServer }) => {
  startServer().catch((error) => {
    console.error('[main] Fatal error starting server:', error);
    process.exit(1);
  });
});
