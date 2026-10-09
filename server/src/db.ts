import mongoose from 'mongoose';
import { env } from './config/env';

let memoryServer: { stop: () => Promise<unknown> } | null = null;

/**
 * Connects to MongoDB. In development, when no MONGODB_URI is set, a throwaway
 * in-memory database is started so the app runs with zero setup.
 */
export async function connectDB() {
  let uri = env.MONGODB_URI;
  if (!uri) {
    if (env.isProd) throw new Error('MONGODB_URI must be set in production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    uri = server.getUri('ours');
    console.warn('[db] MONGODB_URI is not set — using a temporary in-memory database. Data is lost on restart.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

export async function disconnectDB() {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
