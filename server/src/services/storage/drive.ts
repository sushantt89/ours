import type { AnyId } from '../../models';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { env } from '../../config/env';
import { Integration } from '../../models';
import { decrypt } from '../../utils/crypto';
import { HttpError } from '../../utils/http';

/**
 * Google Drive integration.
 *
 * Uses only the `drive.file` scope: the app can see and manage files and folders that it
 * created itself. It has no access to anything else in the person's Drive.
 */
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'];
export const DRIVE_FOLDERS = ['Photos', 'Videos', 'Memories', 'Documents', 'Shared Files'] as const;
export type DriveFolder = (typeof DRIVE_FOLDERS)[number];

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const redirectUri = () => `${env.SERVER_URL}/api/integrations/google-drive/callback`;

export function oauthClient() {
  if (!env.driveEnabled) throw new HttpError(503, 'Google Drive is not configured on this server', 'drive_disabled');
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri());
}

export function authUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: false,
    scope: DRIVE_SCOPES,
    state,
  });
}

export async function exchangeCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new HttpError(400, 'Google did not grant offline access. Please try again.');
  let email: string | undefined;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    email = ticket.getPayload()?.email;
  }
  const granted = (tokens.scope ?? '').split(' ');
  if (!granted.includes(DRIVE_SCOPES[0])) {
    throw new HttpError(400, 'Drive access was not granted. Please tick the Google Drive box and try again.');
  }
  return { refreshToken: tokens.refresh_token, accessToken: tokens.access_token!, email };
}

const clients = new Map<string, OAuth2Client>();

/** A fresh access token for the couple's connected Drive. */
export async function accessTokenFor(coupleId: AnyId): Promise<{ token: string; integrationId: string }> {
  const integration = await Integration.findOne({ coupleId, provider: 'google_drive' }).select('+refreshTokenEnc');
  if (!integration) throw new HttpError(409, 'Google Drive is not connected', 'drive_not_connected');
  const id = String(integration._id);
  let client = clients.get(id);
  if (!client) {
    client = oauthClient();
    client.setCredentials({ refresh_token: decrypt(integration.refreshTokenEnc) });
    clients.set(id, client);
  }
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('no token');
    return { token, integrationId: id };
  } catch {
    clients.delete(id);
    throw new HttpError(409, 'Google Drive access has expired. Please reconnect it in Settings.', 'drive_expired');
  }
}

export const forgetClient = (integrationId: string) => clients.delete(integrationId);

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (!env.isTest) console.warn('[drive]', res.status, detail.slice(0, 300));
    if (res.status === 404) throw new HttpError(404, 'That file is no longer in Google Drive', 'not_found');
    throw new HttpError(502, 'Google Drive did not respond as expected. Please try again.', 'drive_error');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
}

export async function createFolder(token: string, name: string, parent?: string): Promise<string> {
  const body = { name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) };
  const file = await call<{ id: string }>(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return file.id;
}

/** Creates "Couple App / <couple name> / Photos, Videos, …" and returns the folder ids. */
export async function createFolderTree(token: string, coupleName: string) {
  const top = await createFolder(token, 'Couple App');
  const root = await createFolder(token, coupleName || 'Our space', top);
  const folders: Record<string, string> = {};
  for (const name of DRIVE_FOLDERS) folders[name] = await createFolder(token, name, root);
  return { rootFolderId: root, folders };
}

export async function uploadFile(token: string, parent: string, name: string, mime: string, buffer: Buffer) {
  const boundary = `ours-${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, parents: [parent] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return call<DriveFile>(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime)');
  const data = await call<{ files: DriveFile[] }>(
    token,
    `${API}/files?q=${q}&fields=${fields}&orderBy=folder,name&pageSize=200`,
  );
  return data.files ?? [];
}

export const getFile = (token: string, fileId: string) =>
  call<DriveFile & { parents?: string[] }>(
    token,
    `${API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,parents`,
  );

export async function downloadFile(token: string, fileId: string, range?: string) {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
  });
  if (!res.ok || !res.body) {
    throw new HttpError(res.status === 404 ? 404 : 502, 'That file could not be loaded from Google Drive');
  }
  return {
    stream: Readable.fromWeb(res.body as unknown as WebReadableStream),
    status: res.status,
    contentRange: res.headers.get('content-range'),
    contentLength: res.headers.get('content-length'),
  };
}

export async function deleteDriveFile(token: string, fileId: string) {
  await call(token, `${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }).catch(() => undefined);
}

export async function revoke(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
  }).catch(() => undefined);
}

export { FOLDER_MIME };
