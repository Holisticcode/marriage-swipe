import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { q } from '../db.js';
import { config } from '../config.js';
import { AppError, wrap, CONTACT_RE, validatePassword } from '../util.js';
import { parse } from '../validate.js';
import { requireAuth, USER_COLS, hashPassword, checkPassword } from '../auth.js';
import { meDto, photoDto, audit } from '../serializers.js';
import { processSelfie, processExtraPhoto } from '../photoService.js';
import { deleteStored } from '../media.js';

export const meRouter = express.Router();
meRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } }).single('photo');
const takeFile = (req, res, next) =>
  upload(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'TOO_BIG', `Photos can be up to ${config.maxUploadMb} MB.`));
    if (err) return next(new AppError(400, 'UPLOAD', 'The photo could not be uploaded.'));
    if (!req.file) return next(new AppError(400, 'NO_FILE', 'Choose a photo to upload (form field "photo").'));
    next();
  });

const fresh = async (id) => (await q(`select ${USER_COLS} from users where id = $1`, [id])).rows[0];

meRouter.get('/', wrap(async (req, res) => res.json({ user: await meDto(req, await fresh(req.user.id)) })));

const clean = (s) => String(s ?? '').trim();
const profileSchema = z.object({
  name: z.string({ required_error: 'Add your first name.' }).transform(clean).pipe(z.string().min(1, 'Add your first name.').max(24, 'First name is too long.')),
  age: z.coerce.number({ invalid_type_error: 'Enter your age.' }).int().min(18, 'You must be 18 or older to join.').max(90, 'Enter an age between 18 and 90.'),
  gender: z.enum(['Man', 'Woman'], { errorMap: () => ({ message: 'Choose "I am".' }) }),
  lookingFor: z.enum(['Man', 'Woman', 'Everyone'], { errorMap: () => ({ message: 'Choose who you are looking for.' }) }),
  status: z.enum(['Single', 'Divorced', 'Widowed', 'Separated'], { errorMap: () => ({ message: 'Choose your status.' }) }),
  city: z.string({ required_error: 'Add your city.' }).transform(clean).pipe(z.string().min(1, 'Add your city.').max(40)),
  bio: z.string().transform(clean).pipe(z.string().max(140, 'Keep your line under 140 characters.')).optional().default(''),
  adult: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm you are 18 or older.' }) }),
});

meRouter.put(
  '/profile',
  wrap(async (req, res) => {
    const b = parse(profileSchema, req.body);
    if (CONTACT_RE.test(`${b.name} ${b.bio} ${b.city}`)) {
      throw new AppError(400, 'CONTACT_INFO', 'Please remove phone numbers or emails. Contact details stay private until you both agree.');
    }
    const hue = req.user.hue ?? Math.floor(Math.random() * 360);
    await q(
      `update users set name=$2, age=$3, gender=$4, looking_for=$5, relationship_status=$6, city=$7, bio=$8, hue=$9, updated_at=now() where id=$1`,
      [req.user.id, b.name, b.age, b.gender, b.lookingFor, b.status, b.city, b.bio, hue],
    );
    res.json({ user: await meDto(req, await fresh(req.user.id)) });
  }),
);

meRouter.post(
  '/selfie',
  takeFile,
  wrap(async (req, res) => {
    const r = await processSelfie(req.user, req.file.buffer);
    res.status(r.status === 'approved' ? 201 : 202).json({ status: r.status, message: r.message, user: await meDto(req, await fresh(req.user.id)) });
  }),
);

meRouter.post(
  '/photos',
  takeFile,
  wrap(async (req, res) => {
    const r = await processExtraPhoto(req.user, req.file.buffer);
    res.status(r.status === 'approved' ? 201 : 202).json({
      status: r.status,
      message: r.message,
      photo: photoDto(req, r.photo),
      user: await meDto(req, await fresh(req.user.id)),
    });
  }),
);

meRouter.delete(
  '/photos/:id',
  wrap(async (req, res) => {
    const { rows } = await q(`select id, file_key, kind from photos where id = $1 and user_id = $2 and attempt = false`, [req.params.id, req.user.id]);
    const p = rows[0];
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Photo not found.');
    if (p.kind === 'selfie') throw new AppError(400, 'SELFIE', 'To change your verified selfie, take a new one.');
    await deleteStored(p.file_key);
    await q('delete from photos where id = $1', [p.id]);
    res.json({ user: await meDto(req, await fresh(req.user.id)) });
  }),
);

meRouter.post(
  '/password',
  wrap(async (req, res) => {
    const b = parse(z.object({ current: z.string().min(1), next: z.string() }), req.body);
    const pwErr = validatePassword(b.next);
    if (pwErr) throw new AppError(400, 'WEAK_PASSWORD', pwErr);
    const row = (await q('select password_hash from users where id = $1', [req.user.id])).rows[0];
    if (!(await checkPassword(b.current, row.password_hash))) throw new AppError(401, 'BAD_PASSWORD', 'Your current password is not right.');
    await q('update users set password_hash = $2, updated_at = now() where id = $1', [req.user.id, await hashPassword(b.next)]);
    await q('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.user.id]);
    res.json({ ok: true });
  }),
);

// Delete my account and everything attached to it (needed for app-store rules and privacy law)
meRouter.delete(
  '/',
  wrap(async (req, res) => {
    const pw = String(req.body?.password || '');
    const row = (await q('select password_hash, email from users where id = $1', [req.user.id])).rows[0];
    if (!(await checkPassword(pw, row.password_hash))) throw new AppError(401, 'BAD_PASSWORD', 'Enter your password to delete your account.');
    const files = (await q('select file_key from photos where user_id = $1', [req.user.id])).rows;
    await audit({ id: req.user.id, label: row.email }, 'account_deleted_by_member', req.user.id);
    await q('delete from users where id = $1', [req.user.id]);
    await Promise.all(files.map((f) => deleteStored(f.file_key)));
    res.json({ ok: true });
  }),
);
