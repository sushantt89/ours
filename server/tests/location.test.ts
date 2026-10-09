import { describe, expect, it } from 'vitest';
import { makeCouple } from './helpers';
import { Location, Notification } from '../src/models';
import { expireLocationSharing } from '../src/routes/location';

const ADELAIDE = { lat: -34.9285, lng: 138.6007, accuracy: 25 };

describe('locate my partner', () => {
  it('shows nothing until someone chooses to share', async () => {
    const { one, two } = await makeCouple();
    const view = (await two.get('/api/location')).body;
    expect(view.partner).toEqual({ sharing: false, until: null, position: null });
    // Sending a position without sharing turned on is refused and stores nothing.
    expect((await one.post('/api/location/update', ADELAIDE)).status).toBe(409);
    expect(await Location.countDocuments({ lat: { $ne: null } })).toBe(0);
  });

  it('lets a partner see your latest position while you share, and forgets it when you stop', async () => {
    const { one, two } = await makeCouple();
    const on = await one.put('/api/location/sharing', { sharing: true, minutes: 60 });
    expect(on.body.me.sharing).toBe(true);
    expect(await Notification.countDocuments({ userId: two.id, type: 'location' })).toBe(1);

    await one.post('/api/location/update', ADELAIDE);
    const seen = (await two.get('/api/location')).body.partner;
    expect(seen).toMatchObject({ sharing: true, position: { lat: ADELAIDE.lat, lng: ADELAIDE.lng, accuracy: 25 } });
    // Sharing is one-way: Sam sharing nothing means Alex sees nothing of Sam.
    expect((await one.get('/api/location')).body.partner.position).toBeNull();

    await one.put('/api/location/sharing', { sharing: false });
    expect((await two.get('/api/location')).body.partner).toEqual({ sharing: false, until: null, position: null });
    const stored = await Location.findOne({ userId: one.id }).lean();
    expect(stored?.lat).toBeUndefined();
  });

  it('switches itself off when the chosen time runs out', async () => {
    const { one, two } = await makeCouple();
    await one.put('/api/location/sharing', { sharing: true, minutes: 60 });
    await one.post('/api/location/update', ADELAIDE);
    await expireLocationSharing(new Date(Date.now() + 61 * 60_000));
    expect((await two.get('/api/location')).body.partner.position).toBeNull();
    expect((await Location.findOne({ userId: one.id }).lean())?.lat).toBeUndefined();
  });

  it('can share until turned off', async () => {
    const { one, two } = await makeCouple();
    await one.put('/api/location/sharing', { sharing: true, minutes: null });
    await one.post('/api/location/update', ADELAIDE);
    await expireLocationSharing(new Date(Date.now() + 30 * 86400_000));
    expect((await two.get('/api/location')).body.partner).toMatchObject({ sharing: true, until: null, position: { lat: ADELAIDE.lat } });
  });

  it('asks the partner to share, at most once every few minutes', async () => {
    const { one, two } = await makeCouple();
    expect((await one.post('/api/location/request')).status).toBe(200);
    expect((await one.post('/api/location/request')).status).toBe(429);
    const asks = await Notification.find({ userId: two.id, type: 'location' }).lean();
    expect(asks).toHaveLength(1);
    expect(asks[0].url).toBe('/locate?asked=1');
  });

  it("never reveals another couple's location, and forgets you when you leave", async () => {
    const first = await makeCouple('Ana', 'Ben');
    const other = await makeCouple('Cat', 'Dan');
    await first.one.put('/api/location/sharing', { sharing: true, minutes: null });
    await first.one.post('/api/location/update', ADELAIDE);
    for (const outsider of [other.one, other.two]) {
      expect((await outsider.get('/api/location')).body.partner.position).toBeNull();
    }
    expect((await first.one.post('/api/couple/leave', { confirm: 'LEAVE' })).status).toBe(200);
    expect(await Location.countDocuments({ userId: first.one.id })).toBe(0);
  });
});
