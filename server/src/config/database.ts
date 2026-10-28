import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

export function createDatabase(url: string) {
  const adapter = new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5000, max: 10 });
  return new PrismaClient({ adapter, log: [] });
}
