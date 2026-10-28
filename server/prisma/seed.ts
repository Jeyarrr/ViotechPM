import 'dotenv/config';
import { createDatabase } from '../src/config/database.js';
import { bootstrap } from '../src/services/bootstrap.service.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = createDatabase(process.env.DATABASE_URL);
try {
  const result = await bootstrap(db, process.env);
  console.info(
    result.created
      ? 'Initial Super Admin created.'
      : 'Administrator already exists; account left unchanged.',
  );
} catch {
  console.error(
    'Bootstrap failed. Check database connectivity and bootstrap environment variables.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
