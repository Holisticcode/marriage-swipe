// Super-admin console API. Every route needs a signed-in account with role = 'admin'.
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { q, tx } from '../db.js';
import { AppError, wrap } from '../util.js';
import { parse } from '../validate.js';
import { requireAdmin, hashPassword } from '../auth.js';
import { photoDto, audit } from '../serializers.js';
import { mediaUrl, deleteStored, readStored, storeBlurredThumb } from '../media.js';
import { applySelfie, descriptorFromStored } from '../photoService.js';
import { moderationStatus } from '../moderation.js';

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

const who = (req) => ({ id: req.user.id, label: `${req.user.email} (admin)` });
const idParam = z.string().uuid();

async function targetUser(req) {
  const id = parse(z.object({ id: idParam }), req.params).id;
  const u = (await q('select id, email, name, role, status, selfie_photo_id from users where id = $1', [id])).rows[0];
  if (!u) throw new AppError(404, 'NOT_FOUND', 'Profile not found.');
  if (u.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'Admin accounts cannot be changed here.');
  return u;
}
const label = (u) => u.name || u.email || u.id;

// ---- overview
adminRouter.get(
  '/overview',
  wrap(async (req, res) => {
    const c = (
      await q(`select
        (select count(*)::int from users where role = 'user') as total,
        (select count(*)::int from users where role = 'user' and not is_sample) as real,
        (select count(*)::int from users where role = 'user' and status = 'active') as active,
        (select count(*)::int from users where role = 'user' and status <> 'active') as off,
        (select count(*)::int from reports where open) as open_reports,
        (select count(distinct target_id)::int from reports where open) as reported_profiles,
        (select count(*)::int from photos where status = 'review' and attempt = false) as to_review,
        (select count(*)::int from photos where status = 'rejected') as blocked_photos,
        (select count(*)::int from matches) as matches,
        (select count(*)::int from messages) as messages`)
    ).rows[0];
    const attention = (
      await q(`select u.id, u.name, u.email, u.selfie_photo_id,
          (select count(*)::int from reports r where r.target_id = u.id and r.open) as open_reports,
          (select count(*)::int from photos p where p.user_id = u.id and p.status = 'review' and p.attempt = false) as photos_review
        from users u where u.role = 'user' and (exists (select 1 from reports r where r.target_id = u.id and r.open)
          or exists (select 1 from photos p where p.user_id = u.id and p.status = 'review' and p.attempt = false))
        order by open_reports desc, u.created_at desc limit 8`)
    ).rows;
    const recent = (await q('select id, at, actor_label, action, target_id, detail from audit_log order by id desc limit 12')).rows;
    res.json({
      counts: c,
      moderation: moderationStatus(),
      attention: attention.map((a) => ({ ...a, avatar: a.selfie_photo_id ? mediaUrl(req, a.selfie_photo_id) : null })),
      recent,
    });
  }),
);

// ---- members
const listSchema = z.object({
  q: z.string().max(80).optional().default(''),
  filter: z.enum(['all', 'real', 'sample', 'active', 'reported', 'review', 'off']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

adminRouter.get(
  '/users',
  wrap(async (req, res) => {
    const b = parse(listSchema, req.query);
    const where = [`u.role = 'user'`];
    const params = [];
    const add = (v) => (params.push(v), `$${params.length}`);
    if (b.q) {
      const p = add(`%${b.q.toLowerCase()}%`);
      where.push(`(lower(coalesce(u.name,'')) like ${p} or lower(coalesce(u.email,'')) like ${p} or coalesce(u.phone,'') like ${p} or lower(coalesce(u.city,'')) like ${p})`);
    }
    if (b.filter === 'real') where.push('not u.is_sample');
    if (b.filter === 'sample') where.push('u.is_sample');
    if (b.filter === 'active') where.push(`u.status = 'active'`);
    if (b.filter === 'off') where.push(`u.status <> 'active'`);
    if (b.filter === 'reported') where.push('exists (select 1 from reports r where r.target_id = u.id and r.open)');
    if (b.filter === 'review') where.push(`exists (select 1 from photos p where p.user_id = u.id and p.status = 'review' and p.attempt = false)`);
    const W = where.join(' and ');
    const total = (await q(`select count(*)::int as n from users u where ${W}`, params)).rows[0].n;
    const lim = add(b.pageSize);
    const off = add((b.page - 1) * b.pageSize);
    const { rows } = await q(
      `select u.id, u.email, u.phone, u.name, u.age, u.gender, u.relationship_status, u.city, u.status, u.status_reason, u.verified, u.verify_method,
         u.is_sample, u.created_at, u.last_login_at, u.selfie_photo_id,
         (select count(*)::int from reports r where r.target_id = u.id and r.open) as open_reports,
         (select count(*)::int from photos p where p.user_id = u.id and p.status = 'approved' and p.kind = 'extra') as photos_live,
         (select count(*)::int from photos p where p.user_id = u.id and p.status = 'review' and p.attempt = false) as photos_review,
         (select count(*)::int from photos p where p.user_id = u.id and p.attempt = true) as photos_blocked
       from users u where ${W}
       order by (select count(*) from reports r where r.target_id = u.id and r.open) desc, u.created_at desc
       limit ${lim} offset ${off}`,
      params,
    );
    res.json({ total, page: b.page, pageSize: b.pageSize, users: rows.map((r) => ({ ...r, avatar: r.selfie_photo_id ? mediaUrl(req, r.selfie_photo_id) : null })) });
  }),
);

adminRouter.get(
  '/users/:id',
  wrap(async (req, res) => {
    const id = parse(z.object({ id: idParam }), req.params).id;
    const u = (
      await q(`select id, email, phone, role, status, status_reason, status_at, email_verified, phone_verified, is_sample, created_at, last_login_at,
        name, age, gender, looking_for, relationship_status, city, bio, verified, verify_method, verified_at, selfie_photo_id from users where id = $1`, [id])
    ).rows[0];
    if (!u) throw new AppError(404, 'NOT_FOUND', 'Profile not found.');
    const photos = (await q('select * from photos where user_id = $1 order by (kind = \'selfie\') desc, created_at desc', [id])).rows;
    const reports = (
      await q(`select r.id, r.reason, r.note, r.open, r.resolution, r.created_at, r.closed_at, r.reporter_id, coalesce(ru.name, ru.email, 'System') as reporter
        from reports r left join users ru on ru.id = r.reporter_id where r.target_id = $1 order by r.id desc`, [id])
    ).rows;
    const log = (await q('select at, actor_label, action, detail from audit_log where target_id = $1 order by id desc limit 30', [id])).rows;
    res.json({
      user: { ...u, avatar: u.selfie_photo_id ? mediaUrl(req, u.selfie_photo_id) : null },
      photos: photos.map((p) => photoDto(req, p, true)).map((p, i) => ({ ...p, current: photos[i].id === u.selfie_photo_id })),
      reports,
      log,
    });
  }),
);

const statusSchema = z.object({
  status: z.enum(['active', 'suspended', 'removed']),
  reason: z.string().max(120).optional().default(''),
  note: z.string().max(160).optional().default(''),
});

adminRouter.post(
  '/users/:id/status',
  wrap(async (req, res) => {
    const u = await targetUser(req);
    const b = parse(statusSchema, req.body);
    if (b.status !== 'active' && !b.reason) throw new AppError(400, 'VALIDATION', 'Choose a reason. The member will see it.');
    const full = b.status === 'active' ? null : b.reason + (b.note ? ` — ${b.note}` : '');
    await tx(async (c) => {
      await c.query('update users set status = $2, status_reason = $3, status_at = now(), updated_at = now() where id = $1', [u.id, b.status, full]);
      if (b.status !== 'active') {
        await c.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [u.id]);
        await c.query(`update reports set open = false, resolution = $2, closed_at = now() where target_id = $1 and open`, [u.id, b.status === 'removed' ? 'Profile removed' : 'Put on hold']);
      }
    });
    await audit(who(req), `status_${b.status}`, u.id, { name: label(u), reason: full });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/users/:id',
  wrap(async (req, res) => {
    const u = await targetUser(req);
    const files = (await q('select file_key from photos where user_id = $1', [u.id])).rows;
    await audit(who(req), 'user_deleted', u.id, { name: label(u), email: u.email });
    await q('delete from users where id = $1', [u.id]);
    await Promise.all(files.map((f) => deleteStored(f.file_key)));
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/users/:id/reset-password',
  wrap(async (req, res) => {
    const u = await targetUser(req);
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const temp = Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join('') + '7';
    await q('update users set password_hash = $2, updated_at = now() where id = $1', [u.id, await hashPassword(temp)]);
    await q('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [u.id]);
    await audit(who(req), 'password_reset_by_admin', u.id, { name: label(u) });
    res.json({ temporaryPassword: temp });
  }),
);

adminRouter.post(
  '/users/:id/reports/dismiss',
  wrap(async (req, res) => {
    const u = await targetUser(req);
    await q(`update reports set open = false, resolution = 'Dismissed', closed_at = now() where target_id = $1 and open`, [u.id]);
    await audit(who(req), 'reports_dismissed', u.id, { name: label(u) });
    res.json({ ok: true });
  }),
);

// ---- reports
adminRouter.get(
  '/reports',
  wrap(async (req, res) => {
    const { rows } = await q(
      `select r.id, r.reason, r.note, r.created_at, r.target_id, coalesce(ru.name, ru.email, 'System') as reporter,
         u.name, u.email, u.status, u.selfie_photo_id
       from reports r join users u on u.id = r.target_id left join users ru on ru.id = r.reporter_id
       where r.open order by r.id desc limit 500`,
    );
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.target_id)) map.set(r.target_id, { userId: r.target_id, name: r.name || r.email, status: r.status, avatar: r.selfie_photo_id ? mediaUrl(req, r.selfie_photo_id) : null, reports: [] });
      map.get(r.target_id).reports.push({ id: r.id, reason: r.reason, note: r.note, reporter: r.reporter, at: r.created_at });
    }
    res.json({ profiles: [...map.values()].sort((a, b) => b.reports.length - a.reports.length) });
  }),
);

// ---- photo review queue
adminRouter.get(
  '/photos',
  wrap(async (req, res) => {
    const status = z.enum(['review', 'rejected']).catch('review').parse(req.query.status);
    const { rows } = await q(
      `select p.*, u.name, u.email from photos p join users u on u.id = p.user_id
       where p.status = $1 and (p.status <> 'review' or p.attempt = false) order by p.created_at desc limit 200`,
      [status],
    );
    res.json({ photos: rows.map((p) => ({ ...photoDto(req, p, true), userId: p.user_id, userName: p.name || p.email })) });
  }),
);

async function loadPhoto(req) {
  const id = parse(z.object({ id: idParam }), req.params).id;
  const p = (await q('select p.*, u.selfie_photo_id, u.name, u.email from photos p join users u on u.id = p.user_id where p.id = $1', [id])).rows[0];
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Photo not found.');
  return p;
}

adminRouter.post(
  '/photos/:id/approve',
  wrap(async (req, res) => {
    const p = await loadPhoto(req);
    if (p.attempt) throw new AppError(400, 'BLOCKED', 'The file was not kept, so it cannot be approved. Ask the member to upload it again.');
    if (p.kind === 'selfie') {
      const descriptor = await descriptorFromStored(p.file_key);
      await tx((c) => applySelfie(c, p.user_id, p, descriptor, 'admin'));
    } else {
      await q(`update photos set status = 'approved', reason = 'Approved by admin', decided_by = 'admin' where id = $1`, [p.id]);
    }
    await audit(who(req), 'photo_approved_by_admin', p.user_id, { photo: p.id, kind: p.kind });
    res.json({ ok: true });
  }),
);

// Reject: the picture is deleted; only a tiny blurred thumbnail stays on record.
async function rejectPhoto(p, reason) {
  const buf = p.attempt ? null : await readStored(p.file_key);
  const thumb = buf ? await storeBlurredThumb(buf) : p.file_key;
  if (buf) await deleteStored(p.file_key);
  await tx(async (c) => {
    await c.query(`update photos set status = 'rejected', attempt = true, reason = $2, decided_by = 'admin', file_key = $3 where id = $1`, [p.id, reason, thumb]);
    if (p.id === p.selfie_photo_id) {
      await c.query('update users set verified = false, verify_method = null, verified_at = null, selfie_photo_id = null, face_descriptor = null, updated_at = now() where id = $1', [p.user_id]);
    }
  });
}

adminRouter.post(
  '/photos/:id/reject',
  wrap(async (req, res) => {
    const p = await loadPhoto(req);
    const reason = z.string().max(120).catch('').parse(req.body?.reason) || 'Rejected by admin';
    await rejectPhoto(p, reason);
    await audit(who(req), 'photo_rejected_by_admin', p.user_id, { photo: p.id, kind: p.kind, reason });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/photos/:id',
  wrap(async (req, res) => {
    const p = await loadPhoto(req);
    await deleteStored(p.file_key);
    await tx(async (c) => {
      await c.query('delete from photos where id = $1', [p.id]);
      if (p.id === p.selfie_photo_id) {
        await c.query('update users set verified = false, verify_method = null, verified_at = null, selfie_photo_id = null, face_descriptor = null, updated_at = now() where id = $1', [p.user_id]);
      }
    });
    await audit(who(req), 'photo_deleted_by_admin', p.user_id, { photo: p.id });
    res.json({ ok: true });
  }),
);

// ---- activity log
adminRouter.get(
  '/log',
  wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const { rows } = await q('select id, at, actor_label, action, target_id, detail from audit_log order by id desc limit 100 offset $1', [(page - 1) * 100]);
    const total = (await q('select count(*)::int as n from audit_log')).rows[0].n;
    res.json({ total, page, entries: rows });
  }),
);
