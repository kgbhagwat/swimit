import { pool } from './db/pool.js';

/** Lightweight boot migrations so new columns work without a manual db:init. */
export async function ensureSchema() {
  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS remote_access_until TIMESTAMPTZ;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_geo_mode TEXT NOT NULL DEFAULT 'pool_only';
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_radius_km INT;
    ALTER TABLE saas_accounts ADD COLUMN IF NOT EXISTS login_session_timeout_minutes INT NOT NULL DEFAULT 30;
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

  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.pass_types') IS NULL THEN
        RETURN;
      END IF;
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS max_swimmers_per_coach INT;
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS exceeding_limit_allowed BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS verification_mode TEXT NOT NULL DEFAULT 'ok_not_ok';
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS saas_account_id INT;
      UPDATE pass_types
         SET verification_mode = 'ok_not_ok'
       WHERE verification_mode IS NULL OR TRIM(verification_mode) = '';
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.pass_payment_intents') IS NULL THEN
        RETURN;
      END IF;
      ALTER TABLE pass_payment_intents ADD COLUMN IF NOT EXISTS share_token TEXT;
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pass_payment_intents_share_token_uidx
      ON pass_payment_intents (share_token)
      WHERE share_token IS NOT NULL AND TRIM(share_token) <> '';
  `);
}
