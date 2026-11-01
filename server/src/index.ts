import { parseEnv } from './config/env.js';
import { createDatabase } from './config/database.js';
import { createApp } from './app.js';
import { startReminderScheduler } from './services/reminder.service.js';
import { assertProductionAccounts } from './services/production-security.service.js';
import { localStorage } from './services/storage.service.js';

let db: ReturnType<typeof createDatabase> | undefined;
let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
let stopReminders: (() => Promise<void>) | undefined;
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  runtime?.drain();
  const deadline = setTimeout(() => process.exit(1), 20000);
  deadline.unref();
  try {
    await stopReminders?.();
    await runtime?.close();
    await db?.$disconnect();
    clearTimeout(deadline);
    process.exit(code);
  } catch {
    console.error(JSON.stringify({ event: 'shutdown.failed' }));
    process.exit(1);
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void shutdown();
  });
for (const event of ['uncaughtException', 'unhandledRejection'])
  process.on(event, () => {
    console.error(JSON.stringify({ event: 'process.failed' }));
    void shutdown(1);
  });
try {
  const config = parseEnv(process.env);
  db = createDatabase(config.DATABASE_URL);
  await db.$connect();
  if (config.NODE_ENV === 'production') {
    await assertProductionAccounts(db, config.HOSTED_TEST_MODE === 'true');
    // This verifies accessibility, not the provider's durability guarantee.
    if (config.DOCUMENTS_ENABLED !== 'false') {
      const storage = localStorage(config.UPLOAD_DIRECTORY);
      const key = await storage.put(Buffer.from('ViotechPM storage readiness'));
      try {
        await storage.read(key);
      } finally {
        await storage.remove(key);
      }
    }
  }
  runtime = await createApp(config, db);
  const server = runtime.server;
  const host = config.HOST ?? (config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.PORT, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  server.on('error', () => {
    console.error(JSON.stringify({ event: 'server.failed' }));
    void shutdown(1);
  });
  stopReminders =
    config.NODE_ENV !== 'test' && process.env.REMINDERS_ENABLED !== 'false'
      ? startReminderScheduler(db)
      : async () => {};
  console.info(JSON.stringify({ event: 'server.listening', port: config.PORT, host }));
} catch {
  console.error(
    'API startup failed. Check required environment variables, database, administrator and private storage.',
  );
  await shutdown(1);
}
