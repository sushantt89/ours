import type { AnyId } from '../models';
import webpush from 'web-push';
import { env } from '../config/env';
import { PushSubscription } from '../models';

if (env.pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  emoji?: string;
  image?: string;
}

/** Sends a web push to every device a user has subscribed. Expired subscriptions are pruned. */
export async function sendPush(userId: AnyId, payload: PushPayload) {
  if (!env.pushEnabled) return;
  const subs = await PushSubscription.find({ userId });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await sub.deleteOne();
        else if (!env.isTest) console.warn('[push] delivery failed', status);
      }
    }),
  );
}
