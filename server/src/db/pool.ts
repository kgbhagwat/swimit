import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString,
  // Pass validity, payments, and attendance use calendar dates in India.
  options: '-c timezone=Asia/Kolkata',
});
