/**
 * Process entry point. App construction is in app.ts so tests can import
 * the express instance without triggering initDB or listen.
 *
 * We create the HTTP server explicitly (instead of letting Express manage
 * it) so Socket.IO can attach to the same port. This keeps the deployment
 * a single Node process — no separate websocket service to manage.
 */

import http from 'http';
import app from './app.js';
import initDB from './config/init.js';
import { attachRealtime } from './services/realtime.js';
import { scheduleRetention } from './services/retention.js';

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await initDB();
    const server = http.createServer(app);
    attachRealtime(server);
    scheduleRetention();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
