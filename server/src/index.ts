import { parseEnv } from './config/env.js';
import { createDatabase } from './config/database.js';
import { createApp } from './app.js';

try {
  const config = parseEnv(process.env);
  const db = createDatabase(config.DATABASE_URL);
  await db.$connect();
  const runtime = await createApp(config, db);
  runtime.server.listen(config.PORT, '127.0.0.1', () => {
    console.info(`ViotechPM API listening on http://localhost:${config.PORT}`);
  });
  const shutdown = () => {
    void runtime
      .close()
      .then(() => db.$disconnect())
      .then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  console.error(
    'API startup failed. Check required environment variables and database connectivity.',
  );
  process.exit(1);
}
