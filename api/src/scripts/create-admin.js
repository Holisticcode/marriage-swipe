// Usage: npm run create-admin -- you@example.com 'a-strong-password'
// Creates the super admin (or promotes/resets an existing account). There is no public admin sign-up.
import { pool, q } from '../db.js';
import { migrate } from '../migrate.js';
import { hashPassword } from '../auth.js';
import { normEmail } from '../util.js';

const [emailArg, password] = process.argv.slice(2);
const email = normEmail(emailArg);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !password || password.length < 12) {
  console.error("Usage: npm run create-admin -- you@example.com 'a-password-of-12-or-more-characters'");
  process.exit(1);
}
await migrate();
const hash = await hashPassword(password);
const existing = (await q('select id from users where email = $1', [email])).rows[0];
if (existing) {
  await q(`update users set role = 'admin', status = 'active', password_hash = $2, email_verified = true where id = $1`, [existing.id, hash]);
  console.log(`Updated ${email} and made it an admin.`);
} else {
  await q(`insert into users (email, password_hash, role, email_verified) values ($1,$2,'admin',true)`, [email, hash]);
  console.log(`Created admin ${email}.`);
}
await pool.end();
