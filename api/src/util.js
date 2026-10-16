import crypto from 'node:crypto';

export class AppError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const normEmail = (s) => String(s || '').trim().toLowerCase();

// Mobile numbers are stored in international format, e.g. +61412345678
export function normPhone(s) {
  const cleaned = String(s || '').trim().replace(/[\s\-().]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : '';
}

// phone numbers / emails typed into a bio or chat message
export const CONTACT_RE = /@|\d{6,}|\d[\d\s-]{7,}\d/;

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

export function hash32(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password needs at least 8 characters.';
  if (pw.length > 100) return 'Password is too long.';
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Password needs letters and numbers.';
  return '';
}

export function pair(a, b) {
  return a < b ? [a, b] : [b, a];
}
