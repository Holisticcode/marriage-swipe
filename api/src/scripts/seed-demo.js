// Adds 14 clearly-labelled demo profiles (no photos) so a fresh install has people to swipe on while you test.
// Demo profiles like you back ~3 times in 4 and reply to chat. Remove them any time from the admin console (filter: Sample).
import { pool, q } from '../db.js';
import { migrate } from '../migrate.js';
import { hashPassword } from '../auth.js';
import crypto from 'node:crypto';

const P = [
  ['Aanya', 27, 'Woman', 'Single', 'Mumbai', 'Product designer. Chai over coffee, family dinners every Sunday.', 335],
  ['Rohan', 31, 'Man', 'Single', 'Pune', 'Civil engineer. Builds bridges, cooks badly, learning fast.', 215],
  ['Sophie', 29, 'Woman', 'Divorced', 'Melbourne', 'Primary teacher with one cheerful kid. Weekend markets and long walks.', 20],
  ['Daniel', 34, 'Man', 'Single', 'Sydney', 'Physio. Early riser, beach walks, ready for something lasting.', 195],
  ['Meera', 33, 'Woman', 'Divorced', 'Bengaluru', 'Software lead. Looking for kindness, humour and a shared plan.', 300],
  ['Tom', 38, 'Man', 'Widowed', 'London', 'Architect. Quiet evenings, good books, a patient heart.', 250],
  ['Priya', 26, 'Woman', 'Single', 'Delhi', 'Doctor in training. Classical dance, street food, big family.', 350],
  ['Arjun', 30, 'Man', 'Single', 'Toronto', 'Data analyst and weekend cricketer. Wants to settle down this year.', 170],
  ['Leila', 28, 'Woman', 'Single', 'Dubai', 'Marketing manager. Loves travel, hates small talk.', 40],
  ['James', 37, 'Man', 'Divorced', 'Auckland', 'Chef. Cooks for people he loves, looking for the right person.', 140],
  ['Nisha', 32, 'Woman', 'Single', 'Singapore', 'Finance, yoga, and a plan to own a small dog.', 280],
  ['Karan', 29, 'Man', 'Separated', 'Chandigarh', 'Runs the family shop. Honest, loyal, up early.', 25],
  ['Emma', 31, 'Woman', 'Single', 'Melbourne', 'Vet nurse. Coffee, camping, and a good long conversation.', 160],
  ['Ravi', 35, 'Man', 'Single', 'Perth', 'Mining engineer. Wants a partner for travel and a quiet home.', 230],
];

await migrate();
const hash = await hashPassword(crypto.randomBytes(24).toString('hex')); // nobody can log in as a demo profile
let n = 0;
for (const [name, age, gender, status, city, bio, hue] of P) {
  const email = `demo.${name.toLowerCase()}@demo.invalid`;
  const r = await q(
    `insert into users (email, password_hash, is_sample, email_verified, name, age, gender, looking_for, relationship_status, city, bio, hue, verified, verify_method, verified_at)
     values ($1,$2,true,true,$3,$4,$5,'Everyone',$6,$7,$8,$9,true,'sample',now()) on conflict (email) do nothing`,
    [email, hash, name, age, gender, status, city, bio, hue],
  );
  n += r.rowCount;
}
console.log(`Added ${n} demo profiles (${P.length - n} already existed).`);
await pool.end();
