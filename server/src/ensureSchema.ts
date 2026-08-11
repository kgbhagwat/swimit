import { pool } from './db/pool.js';

/** Lightweight boot migrations so new columns work without a manual db:init. */
export async function ensureSchema() {
  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS remote_access_until TIMESTAMPTZ;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_geo_mode TEXT NOT NULL DEFAULT 'pool_only';
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_radius_km INT;
    ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS google_maps_url TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.app_users') IS NULL THEN
        RETURN;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'app_users_login_geo_mode_check'
      ) THEN
        ALTER TABLE app_users
          ADD CONSTRAINT app_users_login_geo_mode_check
          CHECK (login_geo_mode IN ('pool_only', 'radius'));
      END IF;
    END $$;
  `);
}
