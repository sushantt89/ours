import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Capture emailed tokens instead of sending mail.
export const mailbox: { verify: Record<string, string>; reset: Record<string, string> } = { verify: {}, reset: {} };
vi.mock('../src/services/mail', () => ({
  sendVerificationEmail: async (to: string, _name: string, token: string) => void (mailbox.verify[to] = token),
  sendPasswordResetEmail: async (to: string, token: string) => void (mailbox.reset[to] = token),
}));

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('test'));
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300)); // let fire-and-forget writes settle
  await mongoose.disconnect();
  await mongo.stop();
});
