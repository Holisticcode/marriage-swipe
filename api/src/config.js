import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://marriage:marriage@localhost:5432/marriageswipe',
  dbSsl: bool(process.env.DATABASE_SSL, false),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-dev-only-change-me',
  mediaSecret: process.env.MEDIA_SECRET || process.env.JWT_SECRET || 'dev-media-secret-change-me',
  accessTtlSec: num(process.env.ACCESS_TTL_SEC, 15 * 60),
  refreshTtlDays: num(process.env.REFRESH_TTL_DAYS, 60),
  publicUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 12),
  maxExtraPhotos: num(process.env.MAX_EXTRA_PHOTOS, 5),
  trustProxy: bool(process.env.TRUST_PROXY, true),
  requireEmailVerification: bool(process.env.REQUIRE_EMAIL_VERIFICATION, false),
  demoAutoReply: bool(process.env.DEMO_AUTO_REPLY, true),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Marriage Swipe <no-reply@example.com>',
  },
  moderation: {
    mode: (process.env.MODERATION_MODE || 'local').toLowerCase(), // local | off
    explicit: num(process.env.MOD_EXPLICIT, 0.5), // Porn+Hentai at or above = rejected
    revealing: num(process.env.MOD_REVEALING, 0.7), // "Sexy" at or above = human review
    faceMatch: num(process.env.MOD_FACE_MATCH, 0.55), // distance below = same person
  },
};

if (config.env === 'production') {
  if (config.jwtSecret.startsWith('dev-only') || config.jwtSecret.length < 32) {
    throw new Error('Set JWT_SECRET to a long random value (32+ characters) in production.');
  }
}
