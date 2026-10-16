import sharp from 'sharp';
import { pool, q } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { ensureUploadDir } from '../src/media.js';
import { hashPassword } from '../src/auth.js';
import { resetLockouts } from '../src/routes/auth.js';

export async function resetDb() {
  if (!/test/.test(process.env.DATABASE_URL || '')) throw new Error('Refusing to wipe a database whose URL does not contain "test".');
  await pool.query('drop schema public cascade; create schema public;');
  await migrate();
  await ensureUploadDir();
  resetLockouts();
}

export async function startServer() {
  const app = createApp();
  const server = await new Promise((res) => {
    const s = app.listen(0, () => res(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

export function client(base) {
  async function call(method, path, { token, json, form } = {}) {
    const headers = {};
    let body;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    if (form) body = form;
    const res = await fetch(base + path, { method, headers, body });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (p, o) => call('GET', p, o),
    post: (p, o) => call('POST', p, o),
    put: (p, o) => call('PUT', p, o),
    del: (p, o) => call('DELETE', p, o),
  };
}

export function photoForm(buf, name = 'photo.jpg') {
  const fd = new FormData();
  fd.append('photo', new Blob([buf], { type: 'image/jpeg' }), name);
  return fd;
}

// a sharp, mid-brightness picture that passes the quality check (it has no face, so only useful with the AI switched off)
export async function noisePhoto(seed = 1) {
  return sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 120 + seed, g: 110, b: 100 }, noise: { type: 'gaussian', mean: 128, sigma: 45 } } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function makeAdmin(email = 'boss@example.com', password = 'Admin-password-123') {
  await q(`insert into users (email, password_hash, role, email_verified) values ($1,$2,'admin',true)`, [email, await hashPassword(password)]);
  return { email, password };
}

export async function signup(c, n, extra = {}) {
  const r = await c.post('/auth/signup', {
    json: { email: `user${n}@example.com`, phone: `+6141234${String(5000 + n)}`, password: 'secret123', acceptTerms: true, ...extra },
  });
  if (r.status !== 201) throw new Error('signup failed: ' + JSON.stringify(r.data));
  return { token: r.data.accessToken, refresh: r.data.refreshToken, id: r.data.user.id, email: `user${n}@example.com` };
}

export const profile = (o = {}) => ({ name: 'Sam', age: 30, gender: 'Man', lookingFor: 'Woman', status: 'Single', city: 'Melbourne', bio: 'Engineer, family first.', adult: true, ...o });

export async function login(c, identifier, password) {
  const r = await c.post('/auth/login', { json: { identifier, password } });
  return r;
}

export { pool, q };
