import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

export interface Person {
  token: string;
  id: string;
  email: string;
  cookies: string[];
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  del: (url: string, body?: object) => request.Test;
}

let counter = 0;

export async function signUp(name: string): Promise<Person> {
  const email = `${name.toLowerCase()}${++counter}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'correct horse battery' });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const token: string = res.body.accessToken;
  const auth = (t: request.Test) => t.set('Authorization', `Bearer ${token}`);
  return {
    token,
    email,
    id: res.body.user.id,
    cookies: res.get('Set-Cookie') ?? [],
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body ?? {}),
    patch: (url, body) => auth(request(app).patch(url)).send(body ?? {}),
    del: (url, body) => auth(request(app).delete(url)).send(body ?? {}),
  };
}

/** Two people in an active couple. */
export async function makeCouple(a = 'Alex', b = 'Sam') {
  const one = await signUp(a);
  const two = await signUp(b);
  const created = await one.post('/api/couple', { name: `${a} & ${b}`, startDate: '2023-05-12', timezone: 'Australia/Adelaide' });
  const code: string = created.body.couple.inviteCode;
  const joined = await two.post('/api/couple/join', { code });
  if (joined.status !== 200) throw new Error(`join failed: ${JSON.stringify(joined.body)}`);
  return { one, two, coupleId: created.body.couple.id as string, code };
}

/** A real 1x1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
