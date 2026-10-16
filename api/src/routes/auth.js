import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { q } from '../db.js';
import { config } from '../config.js';
import { AppError, wrap, normEmail, normPhone, validatePassword, sha256, randomCode } from '../util.js';
import { parse } from '../validate.js';
import { hashPassword, checkPassword, issueTokens, rotateRefresh, requireAuth, assertActive, USER_COLS } from '../auth.js';
import { meDto, audit } from '../serializers.js';
import { sendMail, sendSms } from '../mail.js';

export const authRouter = express.Router();

const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.env === 'test' ? 10_000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again in a few minutes.' } },
});

// per-account lockout so one account cannot be guessed from many IPs
const fails = new Map();
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;
function lockCheck(key) {
  const f = fails.get(key);
  if (f && f.until > Date.now()) throw new AppError(429, 'RATE_LIMIT', 'Too many wrong passwords. Try again in 15 minutes.');
}
function lockFail(key) {
  const f = fails.get(key) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) {
    f.until = Date.now() + LOCK_MS;
    f.n = 0;
  }
  fails.set(key, f);
}
export const resetLockouts = () => fails.clear();

async function findByIdentifier(identifier) {
  const id = String(identifier || '').trim();
  if (id.includes('@')) {
    return (await q('select * from users where email = $1', [normEmail(id)])).rows[0];
  }
  const phone = normPhone(id.startsWith('+') ? id : '+' + id.replace(/\D/g, ''));
  if (!phone) return undefined;
  return (await q('select * from users where phone = $1', [phone])).rows[0];
}

// ---- verification codes (email / phone / password reset)
async function sendCode(user, purpose) {
  const code = randomCode();
  await q('delete from verification_codes where user_id = $1 and purpose = $2 and used_at is null', [user.id, purpose]);
  await q("insert into verification_codes (user_id, purpose, code_hash, expires_at) values ($1,$2,$3, now() + interval '10 minutes')", [user.id, purpose, sha256(code + user.id)]);
  if (purpose === 'phone') await sendSms(user.phone, `Your Marriage Swipe code is ${code}. It expires in 10 minutes.`);
  else await sendMail(user.email, purpose === 'reset' ? 'Reset your Marriage Swipe password' : 'Verify your email', `Your Marriage Swipe code is ${code}\n\nIt expires in 10 minutes. If you did not ask for it, you can ignore this message.`);
}

async function checkCode(userId, purpose, code) {
  const { rows } = await q(
    'select id, code_hash, attempts from verification_codes where user_id = $1 and purpose = $2 and used_at is null and expires_at > now() order by id desc limit 1',
    [userId, purpose],
  );
  const row = rows[0];
  if (!row || row.attempts >= 5) throw new AppError(400, 'BAD_CODE', 'That code has expired. Ask for a new one.');
  if (sha256(String(code).trim() + userId) !== row.code_hash) {
    await q('update verification_codes set attempts = attempts + 1 where id = $1', [row.id]);
    throw new AppError(400, 'BAD_CODE', 'That code is not right.');
  }
  await q('update verification_codes set used_at = now() where id = $1', [row.id]);
}

// ---- sign up
const signupSchema = z.object({
  email: z.string({ required_error: 'Enter your email.' }).email('Enter a valid email address.').max(120),
  phone: z.string({ required_error: 'Enter your mobile number.' }).max(30),
  password: z.string({ required_error: 'Choose a password.' }),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please agree to the community rules.' }) }),
});

authRouter.post(
  '/signup',
  ipLimiter,
  wrap(async (req, res) => {
    const b = parse(signupSchema, req.body);
    const email = normEmail(b.email);
    const phone = normPhone(b.phone);
    if (!phone) throw new AppError(400, 'BAD_PHONE', 'Enter your mobile number with country code, like +61412345678.');
    const pwErr = validatePassword(b.password);
    if (pwErr) throw new AppError(400, 'WEAK_PASSWORD', pwErr);
    const dupe = (await q('select email from users where email = $1 or phone = $2 limit 1', [email, phone])).rows[0];
    if (dupe) {
      throw new AppError(409, 'EXISTS', dupe.email === email ? 'An account with this email already exists. Log in instead.' : 'An account with this mobile number already exists. Log in instead.');
    }
    let user;
    try {
      user = (await q(`insert into users (email, phone, password_hash) values ($1,$2,$3) returning *`, [email, phone, await hashPassword(b.password)])).rows[0];
    } catch (e) {
      if (e.code === '23505') throw new AppError(409, 'EXISTS', 'An account with these details already exists. Log in instead.');
      throw e;
    }
    await audit({ id: user.id, label: email }, 'signup', user.id);
    if (config.requireEmailVerification) sendCode(user, 'email').catch((e) => console.error('[mail] failed', e.message));
    const tokens = await issueTokens(user, req);
    res.status(201).json({ ...tokens, user: await meDto(req, user) });
  }),
);

// ---- log in (email OR phone)
const loginSchema = z.object({ identifier: z.string().min(3, 'Enter your email or mobile number.'), password: z.string().min(1, 'Enter your password.') });

authRouter.post(
  '/login',
  ipLimiter,
  wrap(async (req, res) => {
    const b = parse(loginSchema, req.body);
    const key = b.identifier.trim().toLowerCase();
    lockCheck(key);
    const user = await findByIdentifier(b.identifier);
    const ok = await checkPassword(b.password, user?.password_hash);
    if (!user || !ok) {
      lockFail(key);
      throw new AppError(401, 'BAD_LOGIN', 'That email, mobile number or password is not right.');
    }
    fails.delete(key);
    assertActive(user);
    await q('update users set last_login_at = now() where id = $1', [user.id]);
    const tokens = await issueTokens(user, req);
    res.json({ ...tokens, user: await meDto(req, user) });
  }),
);

authRouter.post(
  '/refresh',
  wrap(async (req, res) => {
    const { user, tokens } = await rotateRefresh(String(req.body?.refreshToken || ''), req);
    res.json({ ...tokens, user: await meDto(req, user) });
  }),
);

authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    const t = String(req.body?.refreshToken || '');
    if (t) await q('update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null', [sha256(t)]);
    res.json({ ok: true });
  }),
);

// ---- email / phone verification (signed in)
authRouter.post('/email/send', requireAuth, ipLimiter, wrap(async (req, res) => {
  await sendCode((await q('select * from users where id = $1', [req.user.id])).rows[0], 'email');
  res.json({ ok: true });
}));
authRouter.post('/email/verify', requireAuth, ipLimiter, wrap(async (req, res) => {
  await checkCode(req.user.id, 'email', req.body?.code);
  await q('update users set email_verified = true where id = $1', [req.user.id]);
  const u = (await q(`select ${USER_COLS} from users where id = $1`, [req.user.id])).rows[0];
  res.json({ user: await meDto(req, u) });
}));
authRouter.post('/phone/send', requireAuth, ipLimiter, wrap(async (req, res) => {
  await sendCode((await q('select * from users where id = $1', [req.user.id])).rows[0], 'phone');
  res.json({ ok: true });
}));
authRouter.post('/phone/verify', requireAuth, ipLimiter, wrap(async (req, res) => {
  await checkCode(req.user.id, 'phone', req.body?.code);
  await q('update users set phone_verified = true where id = $1', [req.user.id]);
  const u = (await q(`select ${USER_COLS} from users where id = $1`, [req.user.id])).rows[0];
  res.json({ user: await meDto(req, u) });
}));

// ---- forgot / reset password (always answers the same, so it cannot be used to find accounts)
authRouter.post('/forgot', ipLimiter, wrap(async (req, res) => {
  const user = await findByIdentifier(req.body?.identifier || req.body?.email);
  if (user && user.status === 'active' && user.email) sendCode(user, 'reset').catch((e) => console.error('[mail] failed', e.message));
  res.status(202).json({ ok: true, message: 'If that account exists, a code is on its way to the email address.' });
}));

const resetSchema = z.object({ identifier: z.string().min(3), code: z.string().min(4), newPassword: z.string() });
authRouter.post('/reset', ipLimiter, wrap(async (req, res) => {
  const b = parse(resetSchema, { ...req.body, identifier: req.body?.identifier || req.body?.email });
  const pwErr = validatePassword(b.newPassword);
  if (pwErr) throw new AppError(400, 'WEAK_PASSWORD', pwErr);
  const user = await findByIdentifier(b.identifier);
  if (!user) throw new AppError(400, 'BAD_CODE', 'That code is not right.');
  await checkCode(user.id, 'reset', b.code);
  await q('update users set password_hash = $2, updated_at = now() where id = $1', [user.id, await hashPassword(b.newPassword)]);
  await q('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [user.id]);
  await audit({ id: user.id, label: user.email }, 'password_reset', user.id);
  res.json({ ok: true });
}));
