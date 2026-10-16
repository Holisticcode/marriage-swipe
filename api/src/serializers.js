import { q } from './db.js';
import { mediaUrl } from './media.js';
import { config } from './config.js';

export async function audit(actor, action, targetId, detail) {
  try {
    await q('insert into audit_log (actor_id, actor_label, action, target_id, detail) values ($1,$2,$3,$4,$5)', [
      actor?.id || null,
      actor?.label || actor?.name || actor?.email || 'system',
      action,
      targetId || null,
      detail ? JSON.stringify(detail) : null,
    ]);
  } catch (e) {
    console.error('[audit] failed', e.message);
  }
}

// photos of many users at once: Map(userId -> rows)
export async function photosByUser(userIds, statuses = ['approved']) {
  if (!userIds.length) return new Map();
  const { rows } = await q(
    `select id, user_id, kind, status, reason, scores, decided_by, attempt, created_at from photos
     where user_id = any($1) and status = any($2) and attempt = false order by (kind = 'selfie') desc, created_at asc`,
    [userIds, statuses],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.user_id)) map.set(r.user_id, []);
    map.get(r.user_id).push(r);
  }
  return map;
}

// what other members see
export function publicProfile(req, u, photos = []) {
  return {
    id: u.id,
    name: u.name,
    age: u.age,
    gender: u.gender,
    status: u.relationship_status,
    city: u.city,
    bio: u.bio || '',
    verified: !!u.verified,
    sample: !!u.is_sample,
    hue: u.hue,
    photos: photos.map((p) => mediaUrl(req, p.id)),
  };
}

export function photoDto(req, p, admin = false) {
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    reason: p.reason || null,
    url: mediaUrl(req, p.id),
    createdAt: p.created_at,
    ...(admin ? { scores: p.scores || null, decidedBy: p.decided_by, attempt: !!p.attempt } : {}),
  };
}

// the signed-in member's own view
export async function meDto(req, u) {
  const { rows } = await q(
    `select id, kind, status, reason, created_at from photos where user_id = $1 and attempt = false and status in ('approved','review')
     order by (kind = 'selfie') desc, created_at asc`,
    [u.id],
  );
  const verification = u.verified ? 'verified' : rows.some((p) => p.kind === 'selfie' && p.status === 'review') ? 'pending' : 'none';
  return {
    id: u.id,
    role: u.role,
    email: u.email,
    phone: u.phone,
    emailVerified: u.email_verified,
    phoneVerified: u.phone_verified,
    requiresEmailVerification: config.requireEmailVerification,
    createdAt: u.created_at,
    profile: u.name
      ? { name: u.name, age: u.age, gender: u.gender, lookingFor: u.looking_for, status: u.relationship_status, city: u.city, bio: u.bio || '' }
      : null,
    verification, // none | pending (waiting for a moderator) | verified
    verifyMethod: u.verify_method,
    photos: rows.map((p) => photoDto(req, p)),
    limits: { maxExtraPhotos: config.maxExtraPhotos },
  };
}
