import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { ensureUploadDir } from './media.js';
import { initModeration } from './moderation.js';
import { createApp } from './app.js';

await migrate();
await ensureUploadDir();
initModeration(); // warm up the AI models in the background; photos wait for it if needed

const app = createApp();
const server = app.listen(config.port, () => console.log(`[api] listening on :${config.port} (${config.env})`));

function stop() {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
