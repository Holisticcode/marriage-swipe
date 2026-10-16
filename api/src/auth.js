import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';
import { AppError, wrap, sha256, randomToken } from './util.js';

const ROUNDS = 11;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', ROUNDS);

export const hashPassword = (pw) => bcrypt.hash(pw, ROUNDS);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash || DUMMY_HASH);

// every column except the large face descriptor
export const USER_COLS = `id, email, phone, role, status, status_reason, status_at, email_verified, phone_verified, is_sample,
  created_at, last_login_at, name, age, gender, looking_for, relationship_status, city, bio, hue,
  verified, verify_method, verified_at, selfie_photo_id, (face_descriptor is not null) as has_face`;

export function signAccess(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.accessTtlSec,
    issuer: 'marriage-swipe',
    algorithm: 'HS256',
  });
}

export async function issueTokens(user, req) {
  const refresh = 'rt_' + randomToken(40);
  await q('insert into refresh_tokens (user_id, token_hash, expires_at, user_agent) values ($1,$2, now() + ($3 || \' days\')::interval, $4)', [
    user.id,
    sha256(refresh),
    String(config.refreshTtlDays),
    String(req.get('user-agent') || '').slice(0, 200),
  ]);
  return { accessToken: signAccess(user), refreshToken: refresh, expiresIn: config.accessTtlSec };
}

export async function rotateRefresh(token, req) {
  const { rows } = await q('select id, user_id, expires_at, revoked_at from refresh_tokens where token_hash = $1', [sha256(token || '')]);
  const row = rows[0];
  if (!row) throw new AppError(401, 'BAD_REFRESH', 'Please log in again.');
  if (row.revoked_at) {
    // a used token came back: assume it leaked and sign the account out everywhere
    await q('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [row.user_id]);
    throw new AppError(401, 'BAD_REFRESH', 'Please log in again.');
  }
  if (new Date(row.expires_at) < new Date()) throw new AppError(401, 'BAD_REFRESH', 'Please log in again.');
  await q('update refresh_tokens set revoked_at = now() where id = $1', [row.id]);
  const { rows: u } = await q(`select ${USER_COLS} from users where id = $1`, [row.user_id]);
  if (!u[0]) throw new AppError(401, 'BAD_REFRESH', 'Please log in again.');
  assertActive(u[0]);
  return { user: u[0], tokens: await issueTokens(u[0], req) };
}

export function assertActive(user) {
  if (user.status !== 'active') {
    throw new AppError(403, user.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REMOVED',
      user.status === 'suspended' ? 'Your account is on hold.' : 'Your profile was removed.', { reason: user.status_reason || '' });
  }
}

export const requireAuth = wrap(async (req, _res, next) => {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new AppError(401, 'NO_TOKEN', 'Please log in.');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { issuer: 'marriage-swipe', algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'BAD_TOKEN', 'Your session expired. Please log in again.');
  }
  const { rows } = await q(`select ${USER_COLS} from users where id = $1`, [payload.sub]);
  if (!rows[0]) throw new AppError(401, 'BAD_TOKEN', 'Please log in again.');
  assertActive(rows[0]); // removed / suspended accounts are cut off immediately
  req.user = rows[0];
  next();
});

export const requireAdmin = [
  requireAuth,
  (req, _res, next) => {
    if (req.user.role !== 'admin') return next(new AppError(403, 'FORBIDDEN', 'Admins only.'));
    next();
  },
];

// must have: a filled-in profile, a verified selfie (and a verified email when the server requires it)
export function requireReady(req, _res, next) {
  const u = req.user;
  if (!u.name) return next(new AppError(409, 'PROFILE_INCOMPLETE', 'Finish your profile first.'));
  if (!u.verified) return next(new AppError(409, 'NOT_VERIFIED', 'Verify your selfie first.'));
  if (config.requireEmailVerification && !u.email_verified) return next(new AppError(409, 'EMAIL_NOT_VERIFIED', 'Verify your email first.'));
  next();
}
