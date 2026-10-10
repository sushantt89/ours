import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../config/env';
import { User } from '../models';
import { requireAuth } from '../middleware/auth';
import { authLimiter, emailLimiter } from '../middleware/rateLimit';
import { startSession, rotateSession, endSession, endAllSessions } from '../services/tokens';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mail';
import { sessionJSON } from '../services/serialize';
import { randomToken, sha256 } from '../utils/crypto';
import { badRequest, conflict, forbidden, unauthorized } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();
const BCRYPT_ROUNDS = env.isTest ? 4 : 12;
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

async function issueVerification(user: InstanceType<typeof User>) {
  const token = randomToken();
  user.verifyTokenHash = sha256(token);
  user.verifyTokenExpires = new Date(Date.now() + 48 * 3600 * 1000);
  await user.save();
  await sendVerificationEmail(user.email, user.name, token).catch((err) =>
    console.warn('[mail] verification email failed', err.message),
  );
}

/** Public, non-secret settings the web app needs before sign-in. */
router.get('/config', (_req, res) => {
  res.json({
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    pushPublicKey: env.pushEnabled ? env.VAPID_PUBLIC_KEY : null,
    driveEnabled: env.driveEnabled,
    gifsEnabled: env.gifsEnabled,
    turnEnabled: env.turnEnabled,
    maxUploadMb: env.MAX_UPLOAD_MB,
    // The version deployed right now; installed apps compare it with their own and update.
    commit: (process.env.RENDER_GIT_COMMIT ?? process.env.SOURCE_COMMIT ?? '').slice(0, 7) || null,
  });
});

router.post('/register', authLimiter, async (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(1, 'Tell us your name').max(60), email: v.email, password: v.password })
    .parse(req.body);

  if (await User.exists({ email: body.email })) {
    throw conflict('An account with that email already exists. Try signing in instead.', 'email_taken');
  }
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash: await hashPassword(body.password),
  });
  await issueVerification(user);
  const accessToken = await startSession(req, res, String(user._id));
  res.status(201).json({ accessToken, ...(await sessionJSON(user, null)) });
});

router.post('/login', authLimiter, async (req, res) => {
  const body = z.object({ email: v.email, password: z.string().min(1).max(128) }).parse(req.body);
  const user = await User.findOne({ email: body.email }).select('+passwordHash');
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) {
    throw unauthorized("That email and password don't match", 'bad_credentials');
  }
  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
    throw forbidden('Please confirm your email first. Check your inbox for the link.', 'email_unverified');
  }
  const accessToken = await startSession(req, res, String(user._id));
  res.json({ accessToken, ...(await sessionJSON(user)) });
});

router.post('/google', authLimiter, async (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) throw badRequest('Google sign-in is not configured', 'google_disabled');
  const { credential } = z.object({ credential: z.string().min(10).max(4096) }).parse(req.body);

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client
    .verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })
    .catch(() => null);
  const profile = ticket?.getPayload();
  if (!profile?.sub || !profile.email || !profile.email_verified) {
    throw unauthorized('Google sign-in could not be verified', 'google_failed');
  }

  const email = profile.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });
  if (!user) {
    user = await User.create({
      email,
      googleId: profile.sub,
      name: (profile.given_name || profile.name || email.split('@')[0]).slice(0, 60),
      emailVerified: true,
    });
  } else if (!user.googleId) {
    // Google has verified this address, so it is safe to link to the existing account.
    user.googleId = profile.sub;
    user.emailVerified = true;
    await user.save();
  }
  const accessToken = await startSession(req, res, String(user._id));
  res.json({ accessToken, ...(await sessionJSON(user)) });
});

router.post('/refresh', async (req, res) => {
  // A custom header forces a CORS preflight, so other sites cannot trigger a silent refresh.
  if (req.headers['x-requested-with'] !== 'ours') throw unauthorized();
  const rotated = await rotateSession(req, res);
  const user = rotated && (await User.findById(rotated.userId));
  if (!rotated || !user) {
    await endSession(req, res);
    throw unauthorized('Your session has ended. Please sign in again.', 'session_expired');
  }
  res.json({ accessToken: rotated.accessToken, ...(await sessionJSON(user)) });
});

router.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

router.post('/verify-email', authLimiter, async (req, res) => {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
  const user = await User.findOne({ verifyTokenHash: sha256(token), verifyTokenExpires: { $gt: new Date() } });
  if (!user) throw badRequest('This confirmation link is invalid or has expired', 'bad_token');
  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyTokenExpires = undefined;
  await user.save();
  res.json({ ok: true });
});

router.post('/resend-verification', emailLimiter, requireAuth, async (req, res) => {
  if (!req.user.emailVerified) await issueVerification(req.user);
  res.json({ ok: true });
});

router.post('/forgot-password', emailLimiter, async (req, res) => {
  const { email } = z.object({ email: v.email }).parse(req.body);
  const user = await User.findOne({ email });
  if (user) {
    const token = randomToken();
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + 3600 * 1000);
    await user.save();
    await sendPasswordResetEmail(user.email, token).catch((err) =>
      console.warn('[mail] reset email failed', err.message),
    );
  }
  // Same answer either way, so this can't be used to discover who has an account.
  res.json({ ok: true });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const body = z.object({ token: z.string().min(10).max(200), password: v.password }).parse(req.body);
  const user = await User.findOne({ resetTokenHash: sha256(body.token), resetTokenExpires: { $gt: new Date() } });
  if (!user) throw badRequest('This reset link is invalid or has expired', 'bad_token');
  user.passwordHash = await hashPassword(body.password);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.emailVerified = true; // they proved control of the inbox
  await user.save();
  await endAllSessions(String(user._id));
  res.json({ ok: true });
});

export default router;
