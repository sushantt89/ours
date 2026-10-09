import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, makeCouple, signUp } from './helpers';
import { Couple, Message, Notification } from '../src/models';

describe('couple spaces', () => {
  it('creates a space with an invite code and link', async () => {
    const alex = await signUp('Alex');
    const res = await alex.post('/api/couple', { name: 'Us', startDate: '2023-05-12', timezone: 'Australia/Adelaide' });
    expect(res.status).toBe(201);
    expect(res.body.couple.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(res.body.couple.inviteLink).toContain(`/join/${res.body.couple.inviteCode}`);
    expect(res.body.couple.status).toBe('pending');
    expect(res.body.partner).toBeNull();
  });

  it('rejects a start date in the future', async () => {
    const alex = await signUp('Alex');
    const res = await alex.post('/api/couple', { startDate: '2999-01-01', timezone: 'UTC' });
    expect(res.status).toBe(400);
  });

  it('lets the partner join, then closes the invite', async () => {
    const { one, two, code } = await makeCouple();
    const me = await one.get('/api/me');
    expect(me.body.couple.status).toBe('active');
    expect(me.body.couple.inviteCode).toBeNull();
    expect(me.body.partner.name).toBe('Sam');
    expect((await two.get('/api/me')).body.partner.name).toBe('Alex');

    // The creator is told their partner arrived.
    const joined = await Notification.findOne({ userId: one.id, type: 'partner' });
    expect(joined?.title).toContain('Sam joined');

    // The code no longer works for anyone else.
    expect((await request(app).get(`/api/couple/invite/${code}`)).status).toBe(404);
  });

  it('is limited to exactly two people', async () => {
    const { code, coupleId } = await makeCouple();
    const third = await signUp('Jo');
    expect((await third.post('/api/couple/join', { code })).status).toBe(404);
    const couple = await Couple.findById(coupleId);
    expect(couple!.members).toHaveLength(2);
  });

  it('only fills the second seat once when two people race for it', async () => {
    const alex = await signUp('Alex');
    const code = (await alex.post('/api/couple', { timezone: 'UTC' })).body.couple.inviteCode;
    const [b, c] = await Promise.all([signUp('Bea'), signUp('Cy')]);
    const results = await Promise.all([b.post('/api/couple/join', { code }), c.post('/api/couple/join', { code })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  });

  it('stops someone joining a second couple or their own invite', async () => {
    const { one, two } = await makeCouple();
    const other = await signUp('Jo');
    const code = (await other.post('/api/couple', { timezone: 'UTC' })).body.couple.inviteCode;
    expect((await one.post('/api/couple/join', { code })).status).toBe(409);
    expect((await two.post('/api/couple', { timezone: 'UTC' })).status).toBe(409);
    expect((await other.post('/api/couple/join', { code })).status).toBe(409);
  });

  it('blocks couple features until someone has a couple', async () => {
    const solo = await signUp('Solo');
    const res = await solo.get('/api/messages');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('no_couple');
  });

  it('keeps the space for the partner when one leaves, and deletes everything when both have left', async () => {
    const { one, two, coupleId } = await makeCouple();
    await one.post('/api/messages', { text: 'hello' });

    expect((await one.post('/api/couple/leave', { confirm: 'LEAVE' })).status).toBe(200);
    expect((await one.get('/api/messages')).status).toBe(403);
    expect((await two.get('/api/me')).body.couple.status).toBe('ended');
    expect((await two.get('/api/messages')).body.messages).toHaveLength(1);

    await two.post('/api/couple/leave', { confirm: 'LEAVE' });
    expect(await Couple.findById(coupleId)).toBeNull();
    expect(await Message.countDocuments({ coupleId })).toBe(0);
  });
});
