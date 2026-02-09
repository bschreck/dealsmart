import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Only initialize when DATABASE_URL is available
// (tests and local dev without DB fall back to in-memory)
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return drizzle(url, { schema });
}

export type Database = ReturnType<typeof getDb>;
