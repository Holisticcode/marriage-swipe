// Whole-API test with the AI switched off, so every photo goes through the human review queue.
import './env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resetDb, startServer, client, photoForm, noisePhoto, makeAdmin, signup, profile, login, pool, q } from './helpers.js';
import { sentInDev } from '../src/mail.js';

let base, server, c, admin;
const S = {};

before(async () => {
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  await resetDb();
  ({ server, base } = await startServer());
  c = client(base);
  admin = await makeAdmin();
});
after(async () => {
  server.close();
  await pool.end();
});

test('health check works', async () => {
  const r = await c.get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

test('sign up validates input and rejects duplicates', async () => {
  const bad = (json) => c.post('/auth/signup', { json: { email: 'a@b.co', phone: '+61412345678', password: 'secret123', acceptTerms: true, ...json } });
  assert.equal((await bad({ phone: '0412345678' })).data.error.code, 'BAD_PHONE');
  assert.equal((await bad({ password: 'short' })).data.error.code, 'WEAK_PASSWORD');
  assert.equal((await bad({ password: 'onlyletters' })).data.error.code, 'WEAK_PASSWORD');
  assert.equal((await bad({ email: 'nope' })).status, 400);
  assert.equal((await bad({ acceptTerms: false })).status, 400);
  S.a = await signup(c, 1);
  assert.equal((await c.post('/auth/signup', { json: { email: 'USER1@example.com', phone: '+61400000001', password: 'secret123', acceptTerms: true } })).status, 409);
  assert.equal((await c.post('/auth/signup', { json: { email: 'other@example.com', phone: '+61412345001', password: 'secret123', acceptTerms: true } })).status, 409);
});

test('log in with email or phone; wrong password is refused; passwords are not stored in plain text', async () => {
  assert.equal((await login(c, 'user1@example.com', 'secret123')).status, 200);
  assert.equal((await login(c, '+61412345001', 'secret123')).status, 200);
  assert.equal((await login(c, '61412345001', 'secret123')).status, 200); // + is optional when typing
  const bad = await login(c, 'user1@example.com', 'wrong-password1');
  assert.equal(bad.status, 401);
  const { rows } = await q('select password_hash from users where email = $1', ['user1@example.com']);
  assert.match(rows[0].password_hash, /^\$2[aby]\$/);
});

test('account locks after repeated wrong passwords', async () => {
  for (let i = 0; i < 8; i++) await login(c, 'lock@example.com', 'wrong-password1');
  const r = await login(c, 'lock@example.com', 'wrong-password1');
  assert.equal(r.status, 429);
});

test('profile: contact details are refused, valid profile saves', async () => {
  const t = S.a.token;
  assert.equal((await c.put('/me/profile', { token: t, json: profile({ bio: 'call me 0412345678' }) })).data.error.code, 'CONTACT_INFO');
  assert.equal((await c.put('/me/profile', { token: t, json: profile({ age: 17 }) })).status, 400);
  assert.equal((await c.put('/me/profile', { token: t, json: profile({ adult: false }) })).status, 400);
  const r = await c.put('/me/profile', { token: t, json: profile() });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.profile.name, 'Sam');
});

test('cannot swipe or discover before the selfie is verified', async () => {
  assert.equal((await c.get('/discover', { token: S.a.token })).data.error.code, 'NOT_VERIFIED');
});

test('with AI off, a selfie waits for the admin; admin approves it', async () => {
  const up = await c.post('/me/selfie', { token: S.a.token, form: photoForm(await noisePhoto(1)) });
  assert.equal(up.status, 202);
  assert.equal(up.data.user.verification, 'pending');
  S.admin = (await login(c, admin.email, admin.password)).data.accessToken;
  const list = await c.get('/admin/photos?status=review', { token: S.admin });
  assert.equal(list.data.photos.length, 1);
  assert.equal(list.data.photos[0].kind, 'selfie');
  const ok = await c.post(`/admin/photos/${list.data.photos[0].id}/approve`, { token: S.admin });
  assert.equal(ok.status, 200);
  const me = await c.get('/me', { token: S.a.token });
  assert.equal(me.data.user.verification, 'verified');
  assert.equal(me.data.user.verifyMethod, 'admin');
});

async function makeVerified(n, p) {
  const u = await signup(c, n);
  await c.put('/me/profile', { token: u.token, json: profile(p) });
  await c.post('/me/selfie', { token: u.token, form: photoForm(await noisePhoto(n)) });
  const list = await c.get('/admin/photos?status=review', { token: S.admin });
  const mine = list.data.photos.find((x) => x.userId === u.id && x.kind === 'selfie');
  await c.post(`/admin/photos/${mine.id}/approve`, { token: S.admin });
  return u;
}

test('discover respects who each person is looking for, city filter and hides sample-less self', async () => {
  S.b = await makeVerified(2, { name: 'Anna', gender: 'Woman', lookingFor: 'Man', city: 'Melbourne', age: 28 });
  S.c = await makeVerified(3, { name: 'Cara', gender: 'Woman', lookingFor: 'Woman', city: 'Sydney', age: 27 }); // not looking for a man
  S.d = await makeVerified(4, { name: 'Dina', gender: 'Woman', lookingFor: 'Everyone', city: 'Sydney', age: 31 });
  const r = await c.get('/discover', { token: S.a.token });
  const names = r.data.profiles.map((p) => p.name).sort();
  assert.deepEqual(names, ['Anna', 'Dina']); // Cara wants women, so she is hidden from Sam
  assert.ok(!JSON.stringify(r.data).includes('@'), 'no email addresses leak');
  assert.ok(!r.data.profiles.some((p) => p.name === 'Sam'));
  const syd = await c.get('/discover?city=sydney', { token: S.a.token });
  assert.deepEqual(syd.data.profiles.map((p) => p.name), ['Dina']);
  const cities = await c.get('/discover/cities', { token: S.a.token });
  assert.ok(cities.data.cities.includes('Melbourne'));
});

test('a match needs both people to swipe right; chat works and filters contact details', async () => {
  const first = await c.post('/swipes', { token: S.a.token, json: { userId: S.b.id, direction: 'yes' } });
  assert.equal(first.data.matched, false);
  const second = await c.post('/swipes', { token: S.b.token, json: { userId: S.a.id, direction: 'yes' } });
  assert.equal(second.data.matched, true);
  S.match = second.data.match.id;
  const again = await c.post('/swipes', { token: S.a.token, json: { userId: S.b.id, direction: 'yes' } });
  assert.equal(again.data.matched, true);
  assert.equal(again.data.match.id, S.match); // same match, not a duplicate
  assert.equal((await q('select count(*)::int as n from matches')).rows[0].n, 1);
  assert.equal((await c.post('/swipes', { token: S.a.token, json: { userId: S.a.id, direction: 'yes' } })).status, 400);
  assert.deepEqual((await c.get('/discover', { token: S.a.token })).data.profiles.map((p) => p.name), ['Dina']); // Anna no longer shown

  const bad = await c.post(`/matches/${S.match}/messages`, { token: S.a.token, json: { text: 'text me on 0412345678' } });
  assert.equal(bad.data.error.code, 'CONTACT_INFO');
  assert.equal((await c.post(`/matches/${S.match}/messages`, { token: S.a.token, json: { text: 'Hi Anna!' } })).status, 201);
  const list = await c.get('/matches', { token: S.b.token });
  assert.equal(list.data.matches[0].unread, 1);
  assert.equal(list.data.matches[0].lastMessage.text, 'Hi Anna!');
  const msgs = await c.get(`/matches/${S.match}/messages`, { token: S.b.token });
  assert.equal(msgs.data.messages.length, 1);
  assert.equal(msgs.data.messages[0].mine, false);
  assert.equal((await c.get('/matches', { token: S.b.token })).data.matches[0].unread, 0); // read now
  // a stranger cannot read the chat
  assert.equal((await c.get(`/matches/${S.match}/messages`, { token: S.d.token })).status, 404);
});

test('demo profiles like you back and reply in chat', async () => {
  const { rows } = await q(`insert into users (email, password_hash, is_sample, name, age, gender, looking_for, relationship_status, city, bio, hue, verified, verify_method)
    values ('demo.zoe@demo.invalid','x',true,'Zoe',29,'Woman','Everyone','Single','Melbourne','Demo',200,true,'sample') returning id`);
  const zoe = rows[0].id;
  const r = await c.post('/swipes', { token: S.d.token, json: { userId: zoe, direction: 'yes' } });
  // roughly 3 in 4 demo profiles like back: just make sure the answer is well-formed either way
  assert.equal(typeof r.data.matched, 'boolean');
  if (r.data.matched) {
    await c.post(`/matches/${r.data.match.id}/messages`, { token: S.d.token, json: { text: 'Hello Zoe' } });
    await new Promise((res) => setTimeout(res, 1700));
    const m = await c.get(`/matches/${r.data.match.id}/messages`, { token: S.d.token });
    assert.equal(m.data.messages.length, 2);
  }
});

test('extra photos are held for review, then approved by the admin and shown to others', async () => {
  const up = await c.post('/me/photos', { token: S.b.token, form: photoForm(await noisePhoto(9)) });
  assert.equal(up.status, 202);
  assert.equal(up.data.status, 'review');
  const before = await c.get(`/matches/${S.match}/messages`, { token: S.a.token });
  assert.equal(before.data.with.photos.length, 1); // selfie only
  const list = await c.get('/admin/photos?status=review', { token: S.admin });
  const photo = list.data.photos.find((p) => p.userId === S.b.id);
  await c.post(`/admin/photos/${photo.id}/approve`, { token: S.admin });
  const after = await c.get(`/matches/${S.match}/messages`, { token: S.a.token });
  assert.equal(after.data.with.photos.length, 2);
  // media links are signed and only work with the right signature
  const url = after.data.with.photos[1];
  const img = await fetch(url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(url.replace(/s=[^&]+/, 's=tampered'))).status, 403);
  // owner can remove it again
  const del = await c.del(`/me/photos/${photo.id}`, { token: S.b.token });
  assert.equal(del.status, 200);
  assert.equal(del.data.user.photos.length, 1);
  // uploads that are not images are refused
  const junk = await c.post('/me/photos', { token: S.b.token, form: photoForm(Buffer.from('not an image at all')) });
  assert.equal(junk.data.error.code, 'BAD_IMAGE');
  assert.equal((await c.post('/me/photos', { token: S.b.token, json: {} })).status, 400);
});

test('reporting hides the person, notifies admin, and the admin can remove them', async () => {
  const rep = await c.post('/reports', { token: S.a.token, json: { userId: S.d.id, reason: 'Fake profile or photos', note: 'looks stolen' } });
  assert.equal(rep.status, 201);
  assert.equal((await c.post('/reports', { token: S.a.token, json: { userId: S.d.id, reason: 'made up' } })).status, 400);
  assert.ok(!(await c.get('/discover', { token: S.a.token })).data.profiles.some((p) => p.id === S.d.id));
  const reports = await c.get('/admin/reports', { token: S.admin });
  assert.equal(reports.data.profiles[0].name, 'Dina');
  assert.equal(reports.data.profiles[0].reports[0].reporter, 'Sam');
  const ov = await c.get('/admin/overview', { token: S.admin });
  assert.equal(ov.data.counts.open_reports, 1);

  // remove her: she is cut off at once with the reason, and cannot log back in
  const rm = await c.post(`/admin/users/${S.d.id}/status`, { token: S.admin, json: { status: 'removed', reason: 'Fake profile or photos', note: 'stolen pictures' } });
  assert.equal(rm.status, 200);
  const blocked = await c.get('/me', { token: S.d.token });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, 'ACCOUNT_REMOVED');
  assert.match(blocked.data.error.reason, /stolen pictures/);
  const again = await login(c, 'user4@example.com', 'secret123');
  assert.equal(again.status, 403);
  assert.equal((await c.get('/admin/reports', { token: S.admin })).data.profiles.length, 0); // report closed
  // restore
  await c.post(`/admin/users/${S.d.id}/status`, { token: S.admin, json: { status: 'active' } });
  assert.equal((await login(c, 'user4@example.com', 'secret123')).status, 200);
});

test('blocking removes the match and hides both people from each other', async () => {
  assert.equal((await c.post(`/users/${S.a.id}/block`, { token: S.b.token })).status, 200);
  assert.equal((await c.get('/matches', { token: S.a.token })).data.matches.length, 0);
  assert.equal((await c.get('/matches', { token: S.b.token })).data.matches.length, 0);
  assert.ok(!(await c.get('/discover', { token: S.a.token })).data.profiles.some((p) => p.name === 'Anna'));
  assert.equal((await c.get('/me/blocks', { token: S.b.token })).data.blocked[0].name, 'Sam');
  assert.equal((await c.del(`/users/${S.a.id}/block`, { token: S.b.token })).status, 200);
});

test('admin routes are locked to admins', async () => {
  assert.equal((await c.get('/admin/overview')).status, 401);
  assert.equal((await c.get('/admin/overview', { token: S.a.token })).status, 403);
  assert.equal((await c.get('/admin/users', { token: S.a.token })).status, 403);
  assert.equal((await c.post(`/admin/users/${S.b.id}/status`, { token: S.a.token, json: { status: 'removed', reason: 'x' } })).status, 403);
  // an admin account cannot be modified through the member routes
  const adminId = (await q(`select id from users where role = 'admin'`)).rows[0].id;
  assert.equal((await c.post(`/admin/users/${adminId}/status`, { token: S.admin, json: { status: 'removed', reason: 'oops' } })).status, 403);
});

test('admin can list, search, filter and open members; reset a password; delete a member', async () => {
  const all = await c.get('/admin/users', { token: S.admin });
  assert.equal(all.data.total, 5); // Sam, Anna, Cara, Dina, Zoe (the demo profile)
  const q1 = await c.get('/admin/users?q=anna', { token: S.admin });
  assert.equal(q1.data.users.length, 1);
  assert.equal((await c.get('/admin/users?filter=sample', { token: S.admin })).data.total, 1);
  const detail = await c.get(`/admin/users/${S.b.id}`, { token: S.admin });
  assert.equal(detail.data.user.email, 'user2@example.com');
  assert.ok(detail.data.photos.length >= 1);
  assert.ok(detail.data.log.length >= 1);
  assert.equal((await c.get('/admin/users/not-a-uuid', { token: S.admin })).status, 400);

  const reset = await c.post(`/admin/users/${S.c.id}/reset-password`, { token: S.admin });
  assert.ok(reset.data.temporaryPassword.length >= 12);
  assert.equal((await login(c, 'user3@example.com', 'secret123')).status, 401);
  assert.equal((await login(c, 'user3@example.com', reset.data.temporaryPassword)).status, 200);

  const files = (await q('select file_key from photos where user_id = $1', [S.c.id])).rows.map((r) => r.file_key);
  assert.ok(files.length > 0 && files.every((f) => fs.existsSync(`${process.env.UPLOAD_DIR}/${f}`)));
  assert.equal((await c.del(`/admin/users/${S.c.id}`, { token: S.admin })).status, 200);
  assert.ok(files.every((f) => !fs.existsSync(`${process.env.UPLOAD_DIR}/${f}`)), 'photo files are deleted with the member');
  assert.equal((await q('select count(*)::int as n from users where id = $1', [S.c.id])).rows[0].n, 0);
  const log = await c.get('/admin/log', { token: S.admin });
  assert.ok(log.data.entries.some((e) => e.action === 'user_deleted'));
});

test('refresh tokens rotate; reusing an old one signs the account out everywhere', async () => {
  const l = await login(c, 'user1@example.com', 'secret123');
  const r1 = await c.post('/auth/refresh', { json: { refreshToken: l.data.refreshToken } });
  assert.equal(r1.status, 200);
  const reuse = await c.post('/auth/refresh', { json: { refreshToken: l.data.refreshToken } });
  assert.equal(reuse.status, 401);
  const r2 = await c.post('/auth/refresh', { json: { refreshToken: r1.data.refreshToken } });
  assert.equal(r2.status, 401); // the whole family was revoked
  assert.equal((await c.post('/auth/refresh', { json: { refreshToken: 'rt_garbage' } })).status, 401);
});

test('forgot password sends a code by email, reset sets a new password', async () => {
  sentInDev.length = 0;
  const f = await c.post('/auth/forgot', { json: { identifier: 'user1@example.com' } });
  assert.equal(f.status, 202);
  assert.equal((await c.post('/auth/forgot', { json: { identifier: 'nobody@example.com' } })).status, 202); // same answer: cannot probe for accounts
  await new Promise((res) => setTimeout(res, 100));
  const code = sentInDev.at(-1).text.match(/\b(\d{6})\b/)[1];
  assert.equal((await c.post('/auth/reset', { json: { identifier: 'user1@example.com', code: '000000', newPassword: 'brand-new-pass1' } })).data.error.code, 'BAD_CODE');
  const ok = await c.post('/auth/reset', { json: { identifier: 'user1@example.com', code, newPassword: 'brand-new-pass1' } });
  assert.equal(ok.status, 200);
  assert.equal((await login(c, 'user1@example.com', 'secret123')).status, 401);
  assert.equal((await login(c, 'user1@example.com', 'brand-new-pass1')).status, 200);
  assert.equal((await c.post('/auth/reset', { json: { identifier: 'user1@example.com', code, newPassword: 'another-pass-22' } })).status, 400); // a code works once
});

test('email verification code flow', async () => {
  const u = await signup(c, 20);
  sentInDev.length = 0;
  assert.equal((await c.post('/auth/email/send', { token: u.token })).status, 200);
  const code = sentInDev.at(-1).text.match(/\b(\d{6})\b/)[1];
  assert.equal((await c.post('/auth/email/verify', { token: u.token, json: { code: '123456' === code ? '654321' : '123456' } })).status, 400);
  const ok = await c.post('/auth/email/verify', { token: u.token, json: { code } });
  assert.equal(ok.data.user.emailVerified, true);
});

test('deleting my own account needs the password and removes everything', async () => {
  const me = await login(c, 'user1@example.com', 'brand-new-pass1');
  const t = me.data.accessToken;
  assert.equal((await c.del('/me', { token: t, json: { password: 'wrong' } })).status, 401);
  assert.equal((await c.del('/me', { token: t, json: { password: 'brand-new-pass1' } })).status, 200);
  assert.equal((await login(c, 'user1@example.com', 'brand-new-pass1')).status, 401);
  assert.equal((await q('select count(*)::int as n from photos where user_id = $1', [S.a.id])).rows[0].n, 0);
});
