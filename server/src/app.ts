import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import mongoose from 'mongoose';
import { env } from './config/env';
import { requireAuth, requireCouple } from './middleware/auth';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import auth from './routes/auth';
import me from './routes/me';
import couple from './routes/couple';
import dashboard from './routes/dashboard';
import messages from './routes/messages';
import media from './routes/media';
import nudges from './routes/nudges';
import notes from './routes/notes';
import memories, { albums } from './routes/memories';
import uploads from './routes/uploads';
import { events, countdowns, lists, bucket } from './routes/planning';
import { dates, questions, moods } from './routes/together';
import notifications from './routes/notifications';
import { integrations, files } from './routes/integrations';
import gifs from './routes/gifs';
import data from './routes/data';
import { songs, littleThings, gifts, watchlist, journal, places } from './routes/extras';
import games from './routes/games';
import recap from './routes/recap';
import { iceServers } from './services/calls';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway/Vercel proxies
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://accounts.google.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://*.giphy.com',
            'https://*.googleusercontent.com',
            'https://tile.openstreetmap.org',
            'https://i.scdn.co',
            'https://*.spotifycdn.com',
            'https://i.ytimg.com',
            'https://*.sndcdn.com',
            'https://*.mzstatic.com',
          ],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", 'https://accounts.google.com', env.CLIENT_URL, env.CLIENT_URL.replace(/^http/, 'ws')],
          frameSrc: [
            'https://accounts.google.com',
            'https://open.spotify.com',
            'https://www.youtube-nocookie.com',
            'https://embed.music.apple.com',
            'https://w.soundcloud.com',
          ],
          workerSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // Only force HTTPS in production, so the app can be tried over plain http on a home network.
          upgradeInsecureRequests: env.isProd ? [] : null,
        },
      },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Google sign-in popup
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });

  const api = express.Router();
  api.use(apiLimiter);
  // Private data must never be stored by shared caches.
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Routes that handle their own authentication
  api.use('/auth', auth);
  api.use('/me', me);
  api.use('/couple', couple);
  api.use('/media', media);
  api.use('/integrations', integrations);
  api.use('/files', files);
  api.use('/data', data);

  // Everything below is couple data: signed in AND a verified member of the couple.
  const coupleOnly = [requireAuth, requireCouple];
  api.use('/dashboard', coupleOnly, dashboard);
  api.use('/messages', coupleOnly, messages);
  api.use('/nudges', coupleOnly, nudges);
  api.use('/notes', coupleOnly, notes);
  api.use('/memories', coupleOnly, memories);
  api.use('/albums', coupleOnly, albums);
  api.use('/uploads', coupleOnly, uploads);
  api.use('/events', coupleOnly, events);
  api.use('/countdowns', coupleOnly, countdowns);
  api.use('/lists', coupleOnly, lists);
  api.use('/bucket', coupleOnly, bucket);
  api.use('/dates', coupleOnly, dates);
  api.use('/questions', coupleOnly, questions);
  api.use('/moods', coupleOnly, moods);
  api.use('/gifs', coupleOnly, gifs);
  api.use('/notifications', requireAuth, notifications);
  api.use('/songs', coupleOnly, songs);
  api.use('/little-things', coupleOnly, littleThings);
  api.use('/gifts', coupleOnly, gifts);
  api.use('/watchlist', coupleOnly, watchlist);
  api.use('/journal', coupleOnly, journal);
  api.use('/places', coupleOnly, places);
  api.use('/games', coupleOnly, games);
  api.use('/recap', coupleOnly, recap);
  api.get('/calls/ice', requireAuth, requireCouple, async (_req, res) => {
    res.json({ iceServers: await iceServers() });
  });

  api.use(notFoundHandler);
  app.use('/api', api);

  // In production the same server can also serve the built web app (single free service).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = [path.resolve(here, '../../client/dist'), path.resolve(here, '../client/dist')].find((p) =>
    fs.existsSync(path.join(p, 'index.html')),
  );
  if (clientDist) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, file) {
          const name = path.basename(file);
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (name === 'sw.js' || name.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
