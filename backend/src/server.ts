import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { postgresSessionStore } from './config/session.js';

const server = app.listen(env.port, () => {
  console.info(`Backend listening on port ${env.port}.`);
});

function shutdown(signal: string) {
  console.info(`Received ${signal}; closing backend connections.`);
  server.close(() => {
    postgresSessionStore.close();
    void pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
