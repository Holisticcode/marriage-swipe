import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { q } from './db.js';
import { AppError } from './util.js';
import { mediaRouter } from './media.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { socialRouter } from './routes/social.js';
import { adminRouter } from './routes/admin.js';
import { moderationStatus } from './moderation.js';

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1); // running behind nginx
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, cb) {
        // native apps send no Origin header; browsers must be on the allow-list
        if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.env === 'test' ? 100_000 : 240,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path.startsWith('/media/') || req.path === '/health',
      message: { error: { code: 'RATE_LIMIT', message: 'Slow down a little and try again.' } },
    }),
  );

  app.get('/health', async (_req, res) => {
    try {
      await q('select 1');
      res.json({ ok: true, moderation: moderationStatus() });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/media', mediaRouter);
  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/admin', adminRouter);
  app.use('/', socialRouter);

  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Not found.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra || {}) } });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request could not be read.' } });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_BIG', message: 'The request is too large.' } });
    console.error('[error]', err);
    res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong on our side. Please try again.' } });
  });

  return app;
}
