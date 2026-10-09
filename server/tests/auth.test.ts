import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, signUp } from './helpers';
import { mailbox } from './setup';
import { User } from '../src/models';

describe('authentication', () => {
  it('registers, hashes the password and never returns it', async () => {
    const alex = await signUp('Alex');
    const stored = await User.findById(alex.id).select('+passwordHash');
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    const me = await alex.get('/api/me');
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
    expect(me.body.user.emailVerified).toBe(false);
  });

  it('rejects weak passwords, bad emails and duplicate accounts', async () => {
    const weak = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@example.com', password: 'short' });
    expect(weak.status).toBe(400);
    const bad = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'longenough1' });
    expect(bad.status).toBe(400);
    const alex = await signUp('Alex');
    const dup = await request(app).post('/api/auth/register').send({ name: 'A', email: alex.email.toUpperCase(), password: 'longenough1' });
    expect(dup.status).toBe(409);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const alex = await signUp('Alex');
    const wrong = await request(app).post('/api/auth/login').send({ email: alex.email, password: 'not the password' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'not the password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks protected routes without a valid token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').set('Authorization', 'Bearer nonsense')).status).toBe(401);
    expect((await request(app).get('/api/messages')).status).toBe(401);
  });

  it('rotates refresh tokens and sets httpOnly cookies', async () => {
    const alex = await signUp('Alex');
    const refreshCookie = alex.cookies.find((c) => c.startsWith('ours_rt='))!;
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/Path=\/api\/auth/);

    // Without the custom header the refresh is refused (CSRF guard).
    const noHeader = await request(app).post('/api/auth/refresh').set('Cookie', alex.cookies);
    expect(noHeader.status).toBe(401);

    const ok = await request(app).post('/api/auth/refresh').set('Cookie', alex.cookies).set('X-Requested-With', 'ours');
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const rotated = (ok.get('Set-Cookie') ?? []).find((c) => c.startsWith('ours_rt='))!;
    expect(rotated.split(';')[0]).not.toBe(refreshCookie.split(';')[0]);
  });

  it('logs out by revoking the refresh token', async () => {
    const alex = await signUp('Alex');
    await request(app).post('/api/auth/logout').set('Cookie', alex.cookies);
    const after = await request(app).post('/api/auth/refresh').set('Cookie', alex.cookies).set('X-Requested-With', 'ours');
    expect(after.status).toBe(401);
  });

  it('verifies email with a single-use token', async () => {
    const alex = await signUp('Alex');
    const token = mailbox.verify[alex.email];
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await alex.get('/api/me')).body.user.emailVerified).toBe(true);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
  });

  it('resets a password, signs out other sessions, and never reveals unknown emails', async () => {
    const alex = await signUp('Alex');
    const ghost = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    const real = await request(app).post('/api/auth/forgot-password').send({ email: alex.email });
    expect(ghost.body).toEqual(real.body);

    const token = mailbox.reset[alex.email];
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'a brand new password' });
    expect(reset.status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'another password1' })).status).toBe(400);

    const oldSession = await request(app).post('/api/auth/refresh').set('Cookie', alex.cookies).set('X-Requested-With', 'ours');
    expect(oldSession.status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: alex.email, password: 'correct horse battery' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: alex.email, password: 'a brand new password' })).status).toBe(200);
  });

  it('requires the current password to change it', async () => {
    const alex = await signUp('Alex');
    expect((await alex.post('/api/me/password', { current: 'wrong', next: 'new password 123' })).status).toBe(400);
    expect((await alex.post('/api/me/password', { current: 'correct horse battery', next: 'new password 123' })).status).toBe(200);
  });
});
