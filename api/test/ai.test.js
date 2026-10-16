// Real-AI test. Skipped unless TEST_FACES_DIR holds: personA_1.jpg, personA_2.jpg (same person) and personB_1.jpg (someone else).
import './env-ai.js';
import './env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { resetDb, startServer, client, photoForm, makeAdmin, signup, profile, pool } from './helpers.js';

const dir = process.env.TEST_FACES_DIR;
const skip = !dir || !fs.existsSync(path.join(dir, 'personA_1.jpg'));
const img = (n) => fs.readFileSync(path.join(dir, n));
let server, c, a;

before(async () => {
  if (skip) return;
  await resetDb();
  let base;
  ({ server, base } = await startServer());
  c = client(base);
  await makeAdmin();
  a = await signup(c, 1);
  await c.put('/me/profile', { token: a.token, json: profile() });
});
after(async () => {
  if (skip) return;
  server.close();
  await pool.end();
});

test('AI: selfie, same person ok, different person refused, dark/broken images refused', { skip, timeout: 180000 }, async () => {
  const sf = await c.post('/me/selfie', { token: a.token, form: photoForm(img('personA_1.jpg')) });
  assert.equal(sf.status, 201, JSON.stringify(sf.data.user?.photos?.map?.((p) => [p.status, p.reason]) ?? sf.data));
  assert.equal((await c.post('/me/photos', { token: a.token, form: photoForm(img('personA_2.jpg')) })).status, 201);
  const other = await c.post('/me/photos', { token: a.token, form: photoForm(img('personB_1.jpg')) });
  assert.equal(other.status, 422);
  assert.equal(other.data.error.code, 'FACE_MISMATCH');
  const dark = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#050505' } }).jpeg().toBuffer();
  assert.match((await c.post('/me/photos', { token: a.token, form: photoForm(dark) })).data.error.code, /QUALITY|NO_FACE/);
  assert.equal((await c.post('/me/photos', { token: a.token, form: photoForm(Buffer.from('not an image')) })).data.error.code, 'BAD_IMAGE');
});
