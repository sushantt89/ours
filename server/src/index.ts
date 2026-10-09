import http from 'node:http';
import { env } from './config/env';
import { connectDB, disconnectDB } from './db';
import { createApp } from './app';
import { attachSockets } from './sockets';
import { startScheduler } from './services/scheduler';

async function main() {
  await connectDB();
  const server = http.createServer(createApp());
  attachSockets(server);
  startScheduler();

  server.listen(env.PORT, () => {
    console.info(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    const off = [
      !env.mailEnabled && 'email (links are logged here instead)',
      !env.googleEnabled && 'Google sign-in',
      !env.driveEnabled && 'Google Drive',
      !env.pushEnabled && 'web push',
      !env.gifsEnabled && 'GIF search',
    ].filter(Boolean);
    if (off.length) console.info(`[api] optional features not configured: ${off.join(', ')}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
