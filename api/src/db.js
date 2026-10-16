import pg from 'pg';
import { config } from './config.js';

pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint -> number

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});
pool.on('error', (e) => console.error('[db] idle client error', e.message));

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
