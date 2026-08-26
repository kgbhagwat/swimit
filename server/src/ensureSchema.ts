import { pool } from './db/pool.js';
import { ensureAuthSessionsTable } from './authSessions.js';
import { ensureAllAccountsOnVolumePackage } from './ensureVolumePackage.js';
import { ensureServerMonitorTable } from './serverMonitor.js';

/** Lightweight boot migrations so new columns work without a manual db:init. */
export async function ensureSchema() {
  await ensureAuthSessionsTable();
  await ensureServerMonitorTable();
  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS remote_access_until TIMESTAMPTZ;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_geo_mode TEXT NOT NULL DEFAULT 'pool_only';
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_radius_km INT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_type TEXT NOT NULL DEFAULT 'normal';
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
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'app_users_login_type_check'
      ) THEN
        ALTER TABLE app_users
          ADD CONSTRAINT app_users_login_type_check
          CHECK (login_type IN ('normal', 'coach'));
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
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS test_required BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS is_offer BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS offer_start_date DATE;
      ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS offer_end_date DATE;
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
    DO $$
    BEGIN
      IF to_regclass('public.registrations') IS NULL THEN
        RETURN;
      END IF;
      ALTER TABLE registrations ADD COLUMN IF NOT EXISTS test_result TEXT;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS feature_keys TEXT[] NOT NULL DEFAULT '{}';
  `).catch(() => {
    /* table may not exist on a brand-new empty database */
  });

  await ensureAllAccountsOnVolumePackage();

  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.pass_payments') IS NULL THEN
        RETURN;
      END IF;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS test_upgrade_applied BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS upgrade_source_payment_id INT;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS invoice_number TEXT;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(6, 2) NOT NULL DEFAULT 18;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
      ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.pass_payments') IS NULL THEN
        RETURN;
      END IF;
      UPDATE pass_payments
         SET invoice_number = 'INV-' || TO_CHAR(payment_date, 'YYYY') || '-' || LPAD(id::text, 6, '0'),
             tax_inclusive = TRUE,
             gst_percent = COALESCE(NULLIF(gst_percent, 0), 18),
             taxable_amount = CASE
               WHEN COALESCE(amount, 0) <= 0 THEN 0
               ELSE ROUND((amount / (1 + COALESCE(NULLIF(gst_percent, 0), 18) / 100.0))::numeric, 2)
             END,
             gst_amount = CASE
               WHEN COALESCE(amount, 0) <= 0 THEN 0
               ELSE ROUND(
                 (amount - ROUND((amount / (1 + COALESCE(NULLIF(gst_percent, 0), 18) / 100.0))::numeric, 2))::numeric,
                 2
               )
             END
       WHERE invoice_number IS NULL OR BTRIM(invoice_number) = '';
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pass_payments_invoice_number_uidx
      ON pass_payments (saas_account_id, invoice_number)
      WHERE invoice_number IS NOT NULL AND BTRIM(invoice_number) <> '';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pass_payment_intents_share_token_uidx
      ON pass_payment_intents (share_token)
      WHERE share_token IS NOT NULL AND TRIM(share_token) <> '';
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.whatsapp_inbound') IS NULL THEN
        RETURN;
      END IF;
      ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS ocr_upi_ok BOOLEAN;
      ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS ocr_amount NUMERIC(12, 2);
      ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS ocr_transaction_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS payment_notice_sent BOOLEAN NOT NULL DEFAULT FALSE;
    END $$;
  `);

  await pool.query(`
    UPDATE app_users u
       SET menu_access = array_append(menu_access, 'server-monitor')
      FROM saas_accounts a
     WHERE u.saas_account_id = a.id
       AND LOWER(a.account_code) = 'swimit'
       AND NOT ('server-monitor' = ANY (u.menu_access))
  `);
}
