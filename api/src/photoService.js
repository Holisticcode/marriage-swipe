// The photo rules, in one place.
//  * selfie: clear photo, no nudity, exactly one face. Becomes the profile photo and the "reference face".
//  * extra photos: no nudity, your face is in it, and the face matches the verified selfie.
//  * anything borderline, or any time the AI cannot run, goes to the admin review queue instead of being published.
import { q, tx } from './db.js';
import { config } from './config.js';
import { AppError } from './util.js';
import { analyzeImage, imageQuality, faceDistance, moderationStatus } from './moderation.js';
import { normalizeImage, storeBuffer, storeBlurredThumb, deleteStored, readStored } from './media.js';
import { audit } from './serializers.js';

const T = () => config.moderation;

function qualityProblem(qual) {
  if (qual.mean <= 45) return 'Too dark. Move to a brighter spot.';
  if (qual.mean >= 225) return 'Too bright. Step away from the light behind you.';
  if (qual.sharp <= 18) return 'Looks blurry. Hold the phone steady.';
  return '';
}

async function recordRejected(user, kind, buf, reason, scores) {
  const key = await storeBlurredThumb(buf).catch(() => null);
  await q(
    `insert into photos (user_id, kind, status, reason, file_key, scores, decided_by, attempt) values ($1,$2,'rejected',$3,$4,$5,'ai',true)`,
    [user.id, kind, reason, key, scores ? JSON.stringify(scores) : null],
  );
  // keep only the latest 20 blocked attempts per member
  const { rows } = await q(`select id, file_key from photos where user_id = $1 and attempt = true order by created_at desc offset 20`, [user.id]);
  for (const r of rows) {
    await deleteStored(r.file_key);
    await q('delete from photos where id = $1', [r.id]);
  }
  await audit({ id: user.id, label: user.email }, 'photo_blocked', user.id, { kind, reason });
  if (/^Explicit/.test(reason)) {
    const { rows: c } = await q(
      `select count(*)::int as n from photos where user_id = $1 and attempt = true and reason like 'Explicit%' and created_at > now() - interval '24 hours'`,
      [user.id],
    );
    if (c[0].n >= 3) {
      const open = await q(`select 1 from reports where target_id = $1 and open and reporter_id is null and reason = 'Repeated explicit uploads'`, [user.id]);
      if (!open.rowCount) {
        await q(`insert into reports (reporter_id, target_id, reason, note) values (null, $1, 'Repeated explicit uploads', 'Raised automatically after 3 blocked explicit photos in 24 hours.')`, [user.id]);
      }
    }
  }
}

const fail = (code, message) => new AppError(422, code, message);

export async function processSelfie(user, raw) {
  const buf = await normalizeImage(raw);
  const problem = qualityProblem(await imageQuality(buf));
  if (problem) throw fail('QUALITY', problem);

  const ai = await analyzeImage(buf);
  let status = 'approved';
  let reason = null;
  let descriptor = null;
  let scores = null;

  if (!ai.available) {
    status = 'review';
    reason = 'AI check unavailable. Waiting for a moderator.';
  } else {
    scores = { explicit: +ai.nsfw.explicit.toFixed(3), revealing: +ai.nsfw.revealing.toFixed(3), faces: ai.faces.length };
    if (ai.nsfw.explicit >= T().explicit) {
      await recordRejected(user, 'selfie', buf, `Explicit content (${Math.round(ai.nsfw.explicit * 100)}%)`, scores);
      throw fail('EXPLICIT', 'This photo was flagged as explicit. Use a clear selfie of your face, fully clothed.');
    }
    if (ai.faces.length === 0) throw fail('NO_FACE', 'No face found. Fill the frame with your face.');
    if (ai.faces.length > 1) throw fail('MANY_FACES', 'More than one face found. Only you should be in the photo.');
    descriptor = ai.faces[0].descriptor;
    if (ai.nsfw.revealing >= T().revealing) {
      status = 'review';
      reason = `Revealing photo (${Math.round(ai.nsfw.revealing * 100)}%). Waiting for a moderator.`;
    }
  }

  const key = await storeBuffer(buf);
  const photo = await tx(async (c) => {
    // a newer selfie replaces any selfie that was still waiting for review
    const old = await c.query(`select id, file_key from photos where user_id = $1 and kind = 'selfie' and status = 'review' and attempt = false`, [user.id]);
    for (const o of old.rows) {
      await deleteStored(o.file_key);
      await c.query('delete from photos where id = $1', [o.id]);
    }
    const ins = await c.query(
      `insert into photos (user_id, kind, status, reason, file_key, scores, decided_by) values ($1,'selfie',$2,$3,$4,$5,$6) returning *`,
      [user.id, status, reason, key, scores ? JSON.stringify(scores) : null, ai.available ? 'ai' : null],
    );
    if (status === 'approved') await applySelfie(c, user.id, ins.rows[0], descriptor, 'ai');
    return ins.rows[0];
  });
  await audit({ id: user.id, label: user.email }, status === 'approved' ? 'selfie_verified' : 'selfie_held_for_review', user.id, { reason });
  return { status, photo, message: status === 'approved' ? 'You are verified. Your selfie is now your profile photo.' : 'Your selfie is waiting for a moderator. We will let you know.' };
}

// Make `photo` the member's selfie and reference face. Used by the AI path and by admin approval.
export async function applySelfie(c, userId, photo, descriptor, method) {
  const cur = (await c.query('select face_descriptor, selfie_photo_id from users where id = $1', [userId])).rows[0];
  if (cur?.selfie_photo_id && cur.selfie_photo_id !== photo.id) {
    const old = (await c.query('select id, file_key from photos where id = $1', [cur.selfie_photo_id])).rows[0];
    if (old) {
      await deleteStored(old.file_key);
      await c.query('delete from photos where id = $1', [old.id]);
    }
  }
  // if the new face does not match the old reference, earlier extra photos are no longer trusted
  if (cur?.face_descriptor && descriptor && faceDistance(cur.face_descriptor, descriptor) >= T().faceMatch) {
    await c.query(
      `update photos set status = 'review', reason = 'New selfie looks like a different person', decided_by = null where user_id = $1 and kind = 'extra' and status = 'approved'`,
      [userId],
    );
  }
  await c.query(`update photos set status = 'approved', decided_by = $2 where id = $1`, [photo.id, method === 'admin' ? 'admin' : 'ai']);
  await c.query(
    `update users set selfie_photo_id = $2, verified = true, verify_method = $3, verified_at = now(), face_descriptor = coalesce($4::jsonb, face_descriptor), updated_at = now() where id = $1`,
    [userId, photo.id, method, descriptor ? JSON.stringify(descriptor) : null],
  );
}

// try to compute a face record for a stored photo (used when an admin approves a selfie the AI never saw)
export async function descriptorFromStored(fileKey) {
  const buf = await readStored(fileKey);
  if (!buf) return null;
  const ai = await analyzeImage(buf);
  return ai.available && ai.faces.length === 1 ? ai.faces[0].descriptor : null;
}

export async function processExtraPhoto(user, raw) {
  const { rows: cnt } = await q(`select count(*)::int as n from photos where user_id = $1 and kind = 'extra' and attempt = false and status in ('approved','review')`, [user.id]);
  if (cnt[0].n >= config.maxExtraPhotos) throw new AppError(409, 'LIMIT', `You can add up to ${config.maxExtraPhotos} extra photos. Remove one first.`);
  if (!user.verified) throw new AppError(409, 'NOT_VERIFIED', 'Verify your selfie before adding photos.');
  const buf = await normalizeImage(raw);

  const ai = await analyzeImage(buf);
  let status = 'approved';
  let reason = null;
  let scores = null;

  if (!ai.available) {
    status = 'review';
    reason = 'AI check unavailable. Waiting for a moderator.';
  } else {
    scores = { explicit: +ai.nsfw.explicit.toFixed(3), revealing: +ai.nsfw.revealing.toFixed(3), faces: ai.faces.length };
    if (ai.nsfw.explicit >= T().explicit) {
      await recordRejected(user, 'extra', buf, `Explicit content (${Math.round(ai.nsfw.explicit * 100)}%)`, scores);
      throw fail('EXPLICIT', 'This photo was flagged as explicit and was not added. Repeated attempts are reported to our team.');
    }
    if (ai.faces.length === 0) {
      await recordRejected(user, 'extra', buf, 'No face found', scores);
      throw fail('NO_FACE', 'We could not find your face. Every photo must clearly show you.');
    }
    const ref = (await q('select face_descriptor from users where id = $1', [user.id])).rows[0]?.face_descriptor;
    if (!ref) {
      status = 'review';
      reason = 'No reference face on file. Waiting for a moderator to compare it with the selfie.';
    } else {
      const best = Math.min(...ai.faces.map((f) => faceDistance(f.descriptor, ref)));
      scores.faceDistance = +best.toFixed(3);
      if (best >= T().faceMatch) {
        await recordRejected(user, 'extra', buf, 'Face does not match verified selfie', scores);
        throw fail('FACE_MISMATCH', 'This does not look like the person in your verified selfie, so it was not added.');
      }
      if (ai.nsfw.revealing >= T().revealing) {
        status = 'review';
        reason = `Revealing photo (${Math.round(ai.nsfw.revealing * 100)}%). Waiting for a moderator.`;
      }
    }
  }

  const key = await storeBuffer(buf);
  const photo = (
    await q(
      `insert into photos (user_id, kind, status, reason, file_key, scores, decided_by) values ($1,'extra',$2,$3,$4,$5,$6) returning *`,
      [user.id, status, reason, key, scores ? JSON.stringify(scores) : null, ai.available ? 'ai' : null],
    )
  ).rows[0];
  await audit({ id: user.id, label: user.email }, status === 'approved' ? 'photo_approved' : 'photo_held_for_review', user.id, { reason });
  return { status, photo, message: status === 'approved' ? 'Looks good. Your photo is live.' : 'This photo is waiting for a moderator before others can see it.' };
}

export { moderationStatus };
