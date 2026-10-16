// Discover, swipes, matches, chat, reports and blocks
import express from 'express';
import { z } from 'zod';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { AppError, wrap, CONTACT_RE, hash32, pair } from '../util.js';
import { parse } from '../validate.js';
import { requireAuth, requireReady } from '../auth.js';
import { publicProfile, photosByUser, audit } from '../serializers.js';

export const socialRouter = express.Router();
socialRouter.use(requireAuth);

const PROFILE_COLS = 'u.id, u.name, u.age, u.gender, u.relationship_status, u.city, u.bio, u.verified, u.is_sample, u.hue';

// ---- Discover
socialRouter.get(
  '/discover',
  requireReady,
  wrap(async (req, res) => {
    const me = req.user;
    const city = String(req.query.city || '').trim();
    const limit = Math.min(Number(req.query.limit) || 20, 40);
    const { rows } = await q(
      `select ${PROFILE_COLS} from users u
       where u.id <> $1 and u.role = 'user' and u.status = 'active' and u.verified and u.name is not null
         and not exists (select 1 from swipes s where s.user_id = $1 and s.target_id = u.id)
         and not exists (select 1 from blocks b where (b.user_id = $1 and b.blocked_id = u.id) or (b.user_id = u.id and b.blocked_id = $1))
         and ($2 = 'Everyone' or u.gender = $2)
         and (u.looking_for = 'Everyone' or u.looking_for = $3)
         and ($4 = '' or lower(u.city) = lower($4))
       order by u.is_sample asc, u.verified_at desc nulls last
       limit $5`,
      [me.id, me.looking_for, me.gender, city, limit],
    );
    const photos = await photosByUser(rows.map((r) => r.id));
    res.json({ profiles: rows.map((r) => publicProfile(req, r, photos.get(r.id) || [])) });
  }),
);

socialRouter.get(
  '/discover/cities',
  requireReady,
  wrap(async (_req, res) => {
    const { rows } = await q(`select distinct city from users where status = 'active' and verified and city is not null and role = 'user' order by city`);
    res.json({ cities: rows.map((r) => r.city) });
  }),
);

// ---- Swipe
const swipeSchema = z.object({ userId: z.string().uuid(), direction: z.enum(['yes', 'no']) });

socialRouter.post(
  '/swipes',
  requireReady,
  wrap(async (req, res) => {
    const b = parse(swipeSchema, req.body);
    if (b.userId === req.user.id) throw new AppError(400, 'SELF', 'You cannot swipe on yourself.');
    const target = (await q(`select ${PROFILE_COLS}, u.status from users u where u.id = $1 and u.role = 'user'`, [b.userId])).rows[0];
    if (!target || target.status !== 'active') throw new AppError(404, 'NOT_FOUND', 'That profile is not available.');
    const blocked = await q('select 1 from blocks where (user_id = $1 and blocked_id = $2) or (user_id = $2 and blocked_id = $1)', [req.user.id, b.userId]);
    if (blocked.rowCount) throw new AppError(404, 'NOT_FOUND', 'That profile is not available.');

    const result = await tx(async (c) => {
      await c.query(
        `insert into swipes (user_id, target_id, direction) values ($1,$2,$3)
         on conflict (user_id, target_id) do update set direction = excluded.direction, created_at = now()`,
        [req.user.id, b.userId, b.direction],
      );
      if (b.direction !== 'yes') return null;
      const back = target.is_sample
        ? hash32(target.id) % 4 !== 0 // demo profiles like you back about 3 times in 4
        : (await c.query(`select 1 from swipes where user_id = $1 and target_id = $2 and direction = 'yes'`, [b.userId, req.user.id])).rowCount > 0;
      if (!back) return null;
      const [a, bb] = pair(req.user.id, b.userId);
      const m = await c.query(`insert into matches (user_a, user_b) values ($1,$2) on conflict (user_a, user_b) do nothing returning id`, [a, bb]);
      if (m.rowCount) return m.rows[0].id;
      return (await c.query('select id from matches where user_a = $1 and user_b = $2', [a, bb])).rows[0].id;
    });

    if (!result) return res.json({ matched: false });
    const photos = await photosByUser([b.userId]);
    res.json({ matched: true, match: { id: result, profile: publicProfile(req, target, photos.get(b.userId) || []) } });
  }),
);

// ---- Matches & chat
async function myMatch(userId, matchId) {
  const { rows } = await q('select * from matches where id = $1 and (user_a = $2 or user_b = $2)', [matchId, userId]);
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Match not found.');
  const otherId = rows[0].user_a === userId ? rows[0].user_b : rows[0].user_a;
  const other = (await q(`select ${PROFILE_COLS}, u.status from users u where u.id = $1`, [otherId])).rows[0];
  if (!other || other.status !== 'active') throw new AppError(404, 'NOT_FOUND', 'Match not found.');
  return { match: rows[0], other };
}

socialRouter.get(
  '/matches',
  wrap(async (req, res) => {
    const { rows } = await q(
      `select m.id as match_id, m.created_at as matched_at, ${PROFILE_COLS},
         (select body from messages where match_id = m.id order by id desc limit 1) as last_body,
         (select sender_id from messages where match_id = m.id order by id desc limit 1) as last_sender,
         (select created_at from messages where match_id = m.id order by id desc limit 1) as last_at,
         (select count(*)::int from messages where match_id = m.id and sender_id <> $1 and read_at is null) as unread
       from matches m
       join users u on u.id = case when m.user_a = $1 then m.user_b else m.user_a end
       where (m.user_a = $1 or m.user_b = $1) and u.status = 'active'
       order by coalesce((select max(created_at) from messages where match_id = m.id), m.created_at) desc`,
      [req.user.id],
    );
    const photos = await photosByUser(rows.map((r) => r.id));
    res.json({
      matches: rows.map((r) => ({
        id: r.match_id,
        matchedAt: r.matched_at,
        profile: publicProfile(req, r, photos.get(r.id) || []),
        lastMessage: r.last_body ? { text: r.last_body, mine: r.last_sender === req.user.id, at: r.last_at } : null,
        unread: r.unread,
      })),
    });
  }),
);

socialRouter.get(
  '/matches/:id/messages',
  wrap(async (req, res) => {
    const { other } = await myMatch(req.user.id, req.params.id);
    const after = Number(req.query.after) || 0;
    const { rows } = await q(
      `select id, sender_id, body, created_at from messages where match_id = $1 and id > $2 order by id asc limit 200`,
      [req.params.id, after],
    );
    await q('update messages set read_at = now() where match_id = $1 and sender_id <> $2 and read_at is null', [req.params.id, req.user.id]);
    const photos = await photosByUser([other.id]);
    res.json({
      with: publicProfile(req, other, photos.get(other.id) || []),
      messages: rows.map((m) => ({ id: m.id, mine: m.sender_id === req.user.id, text: m.body, at: m.created_at })),
    });
  }),
);

const REPLIES = ['Hi! Lovely to match with you.', 'What does a perfect weekend look like for you?', 'Do you want to meet through family first or chat for a while?', 'Same here. What are you hoping for in the next year?'];

socialRouter.post(
  '/matches/:id/messages',
  wrap(async (req, res) => {
    const b = parse(z.object({ text: z.string().transform((s) => s.trim()).pipe(z.string().min(1, 'Type a message.').max(300, 'Messages can be up to 300 characters.')) }), req.body);
    const { other } = await myMatch(req.user.id, req.params.id);
    if (CONTACT_RE.test(b.text)) throw new AppError(422, 'CONTACT_INFO', 'For safety, keep phone numbers and emails out of chat for now.');
    const msg = (await q('insert into messages (match_id, sender_id, body) values ($1,$2,$3) returning id, created_at', [req.params.id, req.user.id, b.text])).rows[0];
    if (other.is_sample && config.demoAutoReply) {
      setTimeout(async () => {
        try {
          const n = (await q('select count(*)::int as n from messages where match_id = $1 and sender_id = $2', [req.params.id, other.id])).rows[0].n;
          await q('insert into messages (match_id, sender_id, body) values ($1,$2,$3)', [req.params.id, other.id, REPLIES[n % REPLIES.length]]);
        } catch {
          /* the chat may have been deleted meanwhile */
        }
      }, 1200).unref();
    }
    res.status(201).json({ message: { id: msg.id, mine: true, text: b.text, at: msg.created_at } });
  }),
);

// ---- Safety: block, unblock, report
async function blockUser(c, me, targetId) {
  await c.query('insert into blocks (user_id, blocked_id) values ($1,$2) on conflict do nothing', [me, targetId]);
  const [a, b] = pair(me, targetId);
  await c.query('delete from matches where user_a = $1 and user_b = $2', [a, b]); // chat goes with it
  await c.query(`insert into swipes (user_id, target_id, direction) values ($1,$2,'no') on conflict (user_id, target_id) do update set direction = 'no'`, [me, targetId]);
}

async function ensureTarget(id, me) {
  if (id === me) throw new AppError(400, 'SELF', 'That is you.');
  const t = (await q('select id, name, email from users where id = $1 and role = \'user\'', [id])).rows[0];
  if (!t) throw new AppError(404, 'NOT_FOUND', 'Profile not found.');
  return t;
}

socialRouter.post('/users/:id/block', wrap(async (req, res) => {
  const t = await ensureTarget(req.params.id, req.user.id);
  await tx((c) => blockUser(c, req.user.id, t.id));
  await audit({ id: req.user.id, label: req.user.email }, 'blocked_user', t.id);
  res.json({ ok: true });
}));

socialRouter.delete('/users/:id/block', wrap(async (req, res) => {
  await q('delete from blocks where user_id = $1 and blocked_id = $2', [req.user.id, req.params.id]);
  res.json({ ok: true });
}));

socialRouter.get('/me/blocks', wrap(async (req, res) => {
  const { rows } = await q('select u.id, u.name from blocks b join users u on u.id = b.blocked_id where b.user_id = $1 order by b.created_at desc', [req.user.id]);
  res.json({ blocked: rows });
}));

export const REPORT_REASONS = ['Fake profile or photos', 'Nudity or sexual content', 'Harassment or abuse', 'Asking for money', 'Looks under 18', 'Something else'];

socialRouter.post('/reports', wrap(async (req, res) => {
  const b = parse(z.object({ userId: z.string().uuid(), reason: z.enum(REPORT_REASONS, { errorMap: () => ({ message: 'Choose a reason.' }) }), note: z.string().max(300).optional() }), req.body);
  const t = await ensureTarget(b.userId, req.user.id);
  await tx(async (c) => {
    await c.query('insert into reports (reporter_id, target_id, reason, note) values ($1,$2,$3,$4)', [req.user.id, t.id, b.reason, b.note || null]);
    await blockUser(c, req.user.id, t.id); // the person who reported never sees them again
  });
  await audit({ id: req.user.id, label: req.user.email }, 'reported_user', t.id, { reason: b.reason });
  res.status(201).json({ ok: true, message: 'Thanks. Our team will review this profile.' });
}));

socialRouter.get('/report-reasons', (_req, res) => res.json({ reasons: REPORT_REASONS }));
