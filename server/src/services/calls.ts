import { env } from '../config/env';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

let cached: { servers: IceServer[]; at: number } | null = null;

/**
 * Connection helpers for calls. STUN lets phones find a direct route; a TURN relay carries
 * the call when no direct route exists (common on mobile data). Metered credentials are
 * fetched from their API and cached for an hour.
 */
export async function iceServers(): Promise<IceServer[]> {
  if (env.METERED_DOMAIN && env.METERED_API_KEY) {
    if (cached && Date.now() - cached.at < 3600_000) return cached.servers;
    try {
      const res = await fetch(`https://${env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_API_KEY)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const servers = [...STUN, ...((await res.json()) as IceServer[])];
        cached = { servers, at: Date.now() };
        return servers;
      }
    } catch {
      /* fall back to STUN only */
    }
  }
  if (env.TURN_URLS) {
    return [...STUN, { urls: env.TURN_URLS.split(',').map((u) => u.trim()), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
  }
  return STUN;
}
