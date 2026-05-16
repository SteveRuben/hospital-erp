/**
 * Process entry point. App construction is in app.ts so tests can import
 * the express instance without triggering initDB or listen.
 */

import app from './app.js';
import initDB from './config/init.js';

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
