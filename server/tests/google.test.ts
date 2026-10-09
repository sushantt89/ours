import { describe, expect, it, vi } from 'vitest';

// Configure Google before the app (and its env) loads, and stand in for Google's token check.
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
});
const profiles: Record<string, object> = {
  'token-newbie': { sub: 'g-1', email: 'Newbie@Example.com', email_verified: true, given_name: 'Nova' },
  'token-existing': { sub: 'g-2', email: 'existing@example.com', email_verified: true, given_name: 'Ex' },
  'token-unverified': { sub: 'g-3', email: 'shady@example.com', email_verified: false },
};
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken, audience }: { idToken: string; audience: string }) {
      if (audience !== 'test-client.apps.googleusercontent.com' || !profiles[idToken]) throw new Error('bad token');
      return { getPayload: () => profiles[idToken] };
    }
  },
}));

const { default: request } = await import('supertest');
const { app } = await import('./helpers');
const { User } = await import('../src/models');

const google = (credential: string) => request(app).post('/api/auth/google').send({ credential });

describe('Sign in with Google', () => {
  it('advertises the client id to the web app', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.body.googleClientId).toBe('test-client.apps.googleusercontent.com');
  });

  it('creates a verified account on first sign-in, and signs the same person in afterwards', async () => {
    const first = await google('token-newbie');
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
    expect(first.body.user).toMatchObject({ email: 'newbie@example.com', name: 'Nova', emailVerified: true, hasGoogle: true });
    expect(first.get('Set-Cookie')?.some((c) => c.startsWith('ours_rt='))).toBe(true);

    const again = await google('token-newbie');
    expect(again.body.user.id).toBe(first.body.user.id);
    expect(await User.countDocuments({ email: 'newbie@example.com' })).toBe(1);
  });

  it('links Google to an existing password account with the same email', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Ex', email: 'existing@example.com', password: 'correct horse battery' });
    const res = await google('token-existing');
    expect(res.body.user.id).toBe(reg.body.user.id);
    expect(res.body.user.hasGoogle).toBe(true);
    // The password still works too.
    expect((await request(app).post('/api/auth/login').send({ email: 'existing@example.com', password: 'correct horse battery' })).status).toBe(200);
  });

  it('rejects forged tokens and unverified Google emails', async () => {
    expect((await google('token-forged')).status).toBe(401);
    expect((await google('token-unverified')).status).toBe(401);
    expect(await User.countDocuments({ email: 'shady@example.com' })).toBe(0);
  });
});
