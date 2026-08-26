import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const DB_POOL_MAX = 20;

export const pool = new Pool({
  connectionString,
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Pass validity, payments, and attendance use calendar dates in India.
  options: '-c timezone=Asia/Kolkata',
});
