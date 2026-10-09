import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transport = env.mailEnabled
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function layout(heading: string, text: string, cta: string, link: string) {
  return `<!doctype html><html><body style="margin:0;background:#faf5f1;font-family:Georgia,serif;color:#2b1f24">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <div style="font-size:28px">❤️</div>
    <h1 style="font-size:24px;font-weight:500;margin:16px 0 8px">${esc(heading)}</h1>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5d4c53">${esc(text)}</p>
    <p style="margin:28px 0"><a href="${esc(link)}" style="background:#d6456b;color:#fff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;padding:12px 22px;border-radius:999px;display:inline-block">${esc(cta)}</a></p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#9a8a90">If you didn't ask for this, you can safely ignore this email.</p>
  </div></body></html>`;
}

async function send(to: string, subject: string, heading: string, text: string, cta: string, link: string) {
  if (!transport) {
    // No SMTP configured: surface the link in the server log so development still works.
    if (!env.isTest) console.info(`\n[mail] To: ${to}\n[mail] ${subject}\n[mail] ${link}\n`);
    return;
  }
  await transport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text: `${heading}\n\n${text}\n\n${link}`,
    html: layout(heading, text, cta, link),
  });
}

export const sendVerificationEmail = (to: string, name: string, token: string) =>
  send(
    to,
    'Confirm your email for Ours',
    `Welcome, ${name}`,
    'Confirm your email address to keep your couple space secure and recoverable.',
    'Confirm email',
    `${env.CLIENT_URL}/verify-email?token=${token}`,
  );

export const sendPasswordResetEmail = (to: string, token: string) =>
  send(
    to,
    'Reset your Ours password',
    'Reset your password',
    'Use the button below to choose a new password. This link works once and expires in one hour.',
    'Choose a new password',
    `${env.CLIENT_URL}/reset-password?token=${token}`,
  );
