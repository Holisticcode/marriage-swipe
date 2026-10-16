import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import { config } from './config.js';
import { q } from './db.js';
import { AppError, wrap } from './util.js';

const dir = path.resolve(config.uploadDir);
const KEY_RE = /^[a-f0-9-]{36}\.jpg$/;

export async function ensureUploadDir() {
  await fs.mkdir(dir, { recursive: true });
}

// Re-encode every upload: fixes rotation, strips location/EXIF data, caps the size.
// Throws AppError(422) if the file is not a readable image.
export async function normalizeImage(buffer, maxDim = 1280) {
  try {
    return await sharp(buffer, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new AppError(422, 'BAD_IMAGE', 'That file could not be read as a photo. Try a JPEG or PNG.');
  }
}

export async function storeBuffer(buf) {
  const key = `${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(dir, key), buf, { mode: 0o640 });
  return key;
}

// Rejected photos are never kept. Only a tiny heavily blurred thumbnail stays so a moderator knows what was blocked.
export async function storeBlurredThumb(buf) {
  const thumb = await sharp(buf).resize(72, 96, { fit: 'cover' }).blur(7).jpeg({ quality: 45 }).toBuffer();
  return storeBuffer(thumb);
}

export async function readStored(key) {
  if (!KEY_RE.test(key || '')) return null;
  return fs.readFile(path.join(dir, key)).catch(() => null);
}

export async function deleteStored(key) {
  if (!KEY_RE.test(key || '')) return;
  await fs.unlink(path.join(dir, key)).catch(() => {});
}

// ---- signed, expiring image links (so <img> tags and Flutter's Image.network need no auth headers)
function sign(id, exp) {
  return crypto.createHmac('sha256', config.mediaSecret).update(`${id}.${exp}`).digest('base64url');
}

export function mediaPath(photoId) {
  const hour = 3600;
  const exp = Math.ceil((Date.now() / 1000 + hour) / hour) * hour; // stable for up to an hour, so browsers can cache
  return `/media/${photoId}?e=${exp}&s=${sign(photoId, exp)}`;
}

export function mediaUrl(req, photoId) {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  return base + mediaPath(photoId);
}

export const mediaRouter = express.Router();
mediaRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const { id } = req.params;
    const exp = Number(req.query.e);
    const sig = String(req.query.s || '');
    const good = sign(id, exp);
    const ok = exp > Date.now() / 1000 && sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
    if (!ok) throw new AppError(403, 'BAD_LINK', 'This image link has expired.');
    const { rows } = await q('select file_key from photos where id = $1', [id]);
    if (!rows[0] || !KEY_RE.test(rows[0].file_key || '')) throw new AppError(404, 'NOT_FOUND', 'Image not found.');
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=1800',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.sendFile(path.join(dir, rows[0].file_key));
  }),
);
