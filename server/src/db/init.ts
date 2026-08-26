import { pool } from './pool.js';
import { allowlistedSqlIdentifier } from './sqlSafety.js';
import { allowDuplicateAccountMobile } from '../envFlags.js';
import { defaultFeatureKeysForModules } from '../packageFeatures.js';
import { ensureAllAccountsOnVolumePackage } from '../ensureVolumePackage.js';

const sql = `
CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  full_address TEXT NOT NULL,
  whatsapp_mobile TEXT NOT NULL,
  other_mobile TEXT,
  email TEXT NOT NULL,
  birthdate DATE NOT NULL,
  sex TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  emergency_name TEXT NOT NULL,
  emergency_relation TEXT NOT NULL,
  emergency_mobile TEXT NOT NULL,
  has_health_issue TEXT NOT NULL,
  health_issue_details TEXT,
  doctor_name TEXT,
  doctor_no TEXT,
  identity_document TEXT NOT NULL,
  identity_photo_path TEXT NOT NULL,
  swimmer_photo_path TEXT NOT NULL,
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS doctor_no TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registrations ALTER COLUMN is_active SET DEFAULT FALSE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS pass_type TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS batch TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS coach TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS pass_valid_until DATE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS parent_relation TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS parent_mobile TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_adult BOOLEAN;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS test_result TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS identity_number TEXT NOT NULL DEFAULT '';
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS is_adult BOOLEAN;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS identity_number TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS staff_registrations (
  id SERIAL PRIMARY KEY,
  registration_for TEXT NOT NULL,
  full_name TEXT NOT NULL,
  full_address TEXT NOT NULL,
  whatsapp_mobile TEXT NOT NULL,
  other_mobile TEXT,
  email TEXT NOT NULL,
  birthdate DATE NOT NULL,
  sex TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  emergency_name TEXT NOT NULL,
  emergency_relation TEXT NOT NULL,
  emergency_mobile TEXT NOT NULL,
  has_health_issue TEXT NOT NULL,
  health_issue_details TEXT,
  doctor_name TEXT,
  doctor_no TEXT,
  identity_document TEXT NOT NULL,
  identity_photo_path TEXT NOT NULL,
  staff_photo_path TEXT NOT NULL,
  teach_strokes TEXT[],
  achievements TEXT,
  has_lifeguard_cert TEXT,
  lifeguard_expiry DATE,
  certificate_details TEXT,
  certificate_photo_1 TEXT,
  certificate_photo_2 TEXT,
  certificate_photo_3 TEXT,
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS teach_strokes TEXT[];
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS achievements TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS has_lifeguard_cert TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS lifeguard_expiry DATE;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS certificate_details TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS certificate_photo_1 TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS certificate_photo_2 TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS certificate_photo_3 TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS lifeguard_photo_path TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS suitable_batch_ids TEXT[];
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS post_name TEXT;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS salary NUMERIC(12, 2);
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS batch_schedule_settings (
  id SERIAL PRIMARY KEY,
  batch_minutes INT NOT NULL DEFAULT 60,
  break_minutes INT NOT NULL DEFAULT 15,
  first_start TIME NOT NULL DEFAULT '06:00',
  last_end TIME NOT NULL DEFAULT '20:00',
  sort_order INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE batch_schedule_settings ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 1;
ALTER TABLE batch_schedule_settings ADD COLUMN IF NOT EXISTS session TEXT NOT NULL DEFAULT 'Complete Day';

CREATE TABLE IF NOT EXISTS batch_slots (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'General',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass_types (
  id SERIAL PRIMARY KEY,
  pass_name TEXT NOT NULL,
  for_audience TEXT NOT NULL,
  prerequisite TEXT NOT NULL DEFAULT 'None',
  duration TEXT NOT NULL,
  pass_charges NUMERIC(12, 2) NOT NULL DEFAULT 0,
  coaching_charges NUMERIC(12, 2) NOT NULL DEFAULT 0,
  coach TEXT,
  test_required BOOLEAN NOT NULL DEFAULT FALSE,
  max_swimmers_per_coach INT,
  exceeding_limit_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  is_offer BOOLEAN NOT NULL DEFAULT FALSE,
  offer_start_date DATE,
  offer_end_date DATE,
  verification_mode TEXT NOT NULL DEFAULT 'ok_not_ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS max_swimmers_per_coach INT;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS exceeding_limit_allowed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS test_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS is_offer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS offer_start_date DATE;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS offer_end_date DATE;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS verification_mode TEXT NOT NULL DEFAULT 'ok_not_ok';
UPDATE pass_types SET verification_mode = 'ok_not_ok' WHERE verification_mode IS NULL OR TRIM(verification_mode) = '';

CREATE TABLE IF NOT EXISTS pool_expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  mode TEXT NOT NULL,
  has_bill BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_quality (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  ph_level NUMERIC(8, 2) NOT NULL DEFAULT 0,
  free_chlorine NUMERIC(8, 2) NOT NULL DEFAULT 0,
  total_alkalinity NUMERIC(8, 2) NOT NULL DEFAULT 0,
  calcium_hardness NUMERIC(8, 2) NOT NULL DEFAULT 0,
  tester_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate early placeholder schema (expense-shaped columns) if present.
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS record_date DATE;
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS ph_level NUMERIC(8, 2) NOT NULL DEFAULT 0;
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS free_chlorine NUMERIC(8, 2) NOT NULL DEFAULT 0;
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS total_alkalinity NUMERIC(8, 2) NOT NULL DEFAULT 0;
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS calcium_hardness NUMERIC(8, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS swimmer_progress (
  id SERIAL PRIMARY KEY,
  saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE,
  registration_id INT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  stroke TEXT NOT NULL,
  distance_m INT NOT NULL,
  time_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS swimmer_progress_entry_unique
  ON swimmer_progress (saas_account_id, registration_id, record_date, stroke, distance_m);
ALTER TABLE swimmer_progress ALTER COLUMN saas_account_id SET NOT NULL;
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS tester_name TEXT NOT NULL DEFAULT '';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'water_quality' AND column_name = 'expense_date'
  ) THEN
    EXECUTE 'UPDATE water_quality SET record_date = expense_date WHERE record_date IS NULL';
  END IF;
END $$;
UPDATE water_quality SET record_date = CURRENT_DATE WHERE record_date IS NULL;
ALTER TABLE water_quality ALTER COLUMN record_date SET NOT NULL;
ALTER TABLE water_quality DROP COLUMN IF EXISTS expense_date;
ALTER TABLE water_quality DROP COLUMN IF EXISTS description;
ALTER TABLE water_quality DROP COLUMN IF EXISTS amount;
ALTER TABLE water_quality DROP COLUMN IF EXISTS mode;
ALTER TABLE water_quality DROP COLUMN IF EXISTS has_bill;

CREATE TABLE IF NOT EXISTS swimmer_attendance (
  id SERIAL PRIMARY KEY,
  registration_id INT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registration_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS pass_payments (
  id SERIAL PRIMARY KEY,
  registration_id INT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  swimmer_name TEXT NOT NULL,
  pass_type TEXT NOT NULL,
  pass_charges NUMERIC(12, 2) NOT NULL DEFAULT 0,
  coaching_charges NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS test_upgrade_applied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS upgrade_source_payment_id INT REFERENCES pass_payments(id) ON DELETE SET NULL;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(6, 2) NOT NULL DEFAULT 18;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS screenshot_path TEXT;

CREATE TABLE IF NOT EXISTS pool_core_info (
  id SERIAL PRIMARY KEY,
  pool_name TEXT NOT NULL DEFAULT '',
  pool_address TEXT NOT NULL DEFAULT '',
  pool_logo_path TEXT,
  swimmer_terms TEXT NOT NULL DEFAULT '',
  staff_terms TEXT NOT NULL DEFAULT '',
  payment_qr_path TEXT,
  upi_details TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holiday_settings (
  id SERIAL PRIMARY KEY,
  weekly_holidays TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  holiday_type TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (holiday_type IN ('annual', 'surprise')),
  CHECK (end_date >= start_date)
);

ALTER TABLE holidays ADD COLUMN IF NOT EXISTS extend_pass_holders BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS day_span TEXT NOT NULL DEFAULT 'full';
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS end_time TIME;

CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  menu_access TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_name),
  UNIQUE (mobile)
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS menu_access TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS service_packages (
  id SERIAL PRIMARY KEY,
  package_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'Month',
  max_pools INT NOT NULL DEFAULT 1,
  max_users INT NOT NULL DEFAULT 5,
  features TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_name),
  CHECK (billing_period IN ('Month', 'Year')),
  CHECK (price >= 0),
  CHECK (max_pools >= 1),
  CHECK (max_users >= 1 AND max_users <= 10)
);

CREATE TABLE IF NOT EXISTS platform_payment_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payment_qr_path TEXT,
  upi_id TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS max_active_swimmers INT;
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 0;
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS modules TEXT NOT NULL DEFAULT 'core';
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS support_level TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS discounted_rate NUMERIC(12, 2);
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS feature_keys TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS saas_accounts (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  pool_address TEXT NOT NULL DEFAULT '',
  account_code TEXT,
  service_package_id INT REFERENCES service_packages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mobile),
  CHECK (status IN ('Trial', 'Active', 'Suspended'))
);

ALTER TABLE saas_accounts ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE saas_accounts ADD COLUMN IF NOT EXISTS pool_address TEXT NOT NULL DEFAULT '';
ALTER TABLE saas_accounts ADD COLUMN IF NOT EXISTS subscription_expires_at DATE;
CREATE UNIQUE INDEX IF NOT EXISTS saas_accounts_account_code_uidx
  ON saas_accounts (account_code)
  WHERE account_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_label TEXT NOT NULL DEFAULT 'This device',
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user
  ON webauthn_credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_account
  ON webauthn_credentials (saas_account_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  user_id INT REFERENCES app_users(id) ON DELETE CASCADE,
  actor_user_id INT REFERENCES app_users(id) ON DELETE CASCADE,
  session_kind TEXT NOT NULL DEFAULT 'account',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (session_kind IN ('account', 'platform', 'impersonation'))
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token
  ON auth_sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS server_monitor_days (
  day DATE PRIMARY KEY,
  samples INT NOT NULL DEFAULT 0,
  concurrent_max INT NOT NULL DEFAULT 0,
  concurrent_max_at TIMESTAMPTZ,
  unique_users INT NOT NULL DEFAULT 0,
  cpu_max_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  cpu_max_load1 DOUBLE PRECISION NOT NULL DEFAULT 0,
  cpu_max_at TIMESTAMPTZ,
  ram_max_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  ram_max_bytes BIGINT NOT NULL DEFAULT 0,
  ram_total_bytes BIGINT NOT NULL DEFAULT 0,
  ram_max_at TIMESTAMPTZ,
  disk_max_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  disk_max_bytes BIGINT NOT NULL DEFAULT 0,
  disk_total_bytes BIGINT NOT NULL DEFAULT 0,
  disk_max_at TIMESTAMPTZ,
  node_rss_max_bytes BIGINT NOT NULL DEFAULT 0,
  node_rss_max_at TIMESTAMPTZ,
  db_pool_used_max INT NOT NULL DEFAULT 0,
  db_pool_max INT NOT NULL DEFAULT 0,
  db_pool_max_at TIMESTAMPTZ,
  api_in_bps_max DOUBLE PRECISION NOT NULL DEFAULT 0,
  api_in_bytes_total BIGINT NOT NULL DEFAULT 0,
  api_in_max_at TIMESTAMPTZ,
  api_out_bps_max DOUBLE PRECISION NOT NULL DEFAULT 0,
  api_out_bytes_total BIGINT NOT NULL DEFAULT 0,
  api_out_max_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_outbound (
  id SERIAL PRIMARY KEY,
  saas_account_id INT REFERENCES saas_accounts(id) ON DELETE SET NULL,
  to_mobile TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_inbound (
  id SERIAL PRIMARY KEY,
  saas_account_id INT REFERENCES saas_accounts(id) ON DELETE SET NULL,
  registration_id INT REFERENCES registrations(id) ON DELETE SET NULL,
  from_mobile TEXT NOT NULL,
  wa_message_id TEXT,
  kind TEXT NOT NULL DEFAULT 'other',
  caption TEXT,
  mime_type TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS ocr_upi_ok BOOLEAN;
ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS ocr_amount NUMERIC(12, 2);
ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS ocr_transaction_id TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_inbound ADD COLUMN IF NOT EXISTS payment_notice_sent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_account ON whatsapp_inbound (saas_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_account ON whatsapp_outbound (saas_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  created_by_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'complaint',
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (category IN ('complaint', 'suggestion')),
  CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  author_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  attachment_path TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  attachment_mime TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (author_role IN ('account_admin', 'platform'))
);

ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachment_path TEXT NOT NULL DEFAULT '';
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT NOT NULL DEFAULT '';
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachment_mime TEXT NOT NULL DEFAULT '';

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'support_ticket_messages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%char_length%body%'
  LOOP
    EXECUTE format('ALTER TABLE support_ticket_messages DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;


CREATE INDEX IF NOT EXISTS idx_support_tickets_account
  ON support_tickets (saas_account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON support_ticket_messages (ticket_id, created_at ASC);

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_last_read_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS platform_last_read_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS account_notifications (
  id SERIAL PRIMARY KEY,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'package',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CHECK (kind IN ('package'))
);

CREATE INDEX IF NOT EXISTS idx_account_notifications_account
  ON account_notifications (saas_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_notifications_unread
  ON account_notifications (saas_account_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS account_audit_logs (
  id SERIAL PRIMARY KEY,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  actor_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
  actor_user_name TEXT NOT NULL DEFAULT 'Unknown',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  summary TEXT NOT NULL DEFAULT '',
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'login', 'approve', 'deny'))
);

CREATE INDEX IF NOT EXISTS idx_account_audit_logs_account
  ON account_audit_logs (saas_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_audit_logs_entity
  ON account_audit_logs (saas_account_id, entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_audit_logs_actor
  ON account_audit_logs (saas_account_id, actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_renew_sessions (
  saas_account_id INT PRIMARY KEY REFERENCES saas_accounts(id) ON DELETE CASCADE,
  ticket_id INT REFERENCES support_tickets(id) ON DELETE SET NULL,
  step TEXT NOT NULL DEFAULT 'awaiting_renew',
  expires_on DATE,
  selected_package_id INT REFERENCES service_packages(id) ON DELETE SET NULL,
  months INT NOT NULL DEFAULT 1,
  package_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  broadcast_count INT NOT NULL DEFAULT 0,
  broadcast_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (step IN (
    'awaiting_renew',
    'awaiting_same_or_change',
    'awaiting_package',
    'quoted',
    'done'
  ))
);

CREATE TABLE IF NOT EXISTS saas_package_renewals (
  id SERIAL PRIMARY KEY,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  requested_by_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
  from_mobile TEXT NOT NULL DEFAULT '',
  current_package_id INT REFERENCES service_packages(id) ON DELETE SET NULL,
  renew_package_id INT NOT NULL REFERENCES service_packages(id) ON DELETE RESTRICT,
  months INT NOT NULL DEFAULT 1,
  expected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  renew_from DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  inbound_id INT REFERENCES whatsapp_inbound(id) ON DELETE SET NULL,
  detected_amount NUMERIC(12, 2),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CHECK (months >= 1 AND months <= 36),
  CHECK (expected_amount >= 0),
  CHECK (status IN ('pending', 'verified', 'mismatch', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_saas_package_renewals_pending
  ON saas_package_renewals (saas_account_id, status, created_at DESC);

ALTER TABLE saas_package_renewals ADD COLUMN IF NOT EXISTS transaction_id TEXT NOT NULL DEFAULT '';
ALTER TABLE saas_package_renewals ADD COLUMN IF NOT EXISTS screenshot_path TEXT;

CREATE INDEX IF NOT EXISTS idx_saas_package_renewals_verified
  ON saas_package_renewals (status, verified_at DESC);

CREATE TABLE IF NOT EXISTS signup_otps (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'mobile')),
  destination TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_otps_dest
  ON signup_otps (channel, destination, created_at DESC);

CREATE TABLE IF NOT EXISTS pass_payment_intents (
  id SERIAL PRIMARY KEY,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  registration_id INT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  from_mobile TEXT NOT NULL DEFAULT '',
  pass_type TEXT NOT NULL,
  batch TEXT NOT NULL DEFAULT '',
  coach TEXT NOT NULL DEFAULT '',
  pass_valid_until DATE NOT NULL,
  expected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pass_charges NUMERIC(12, 2) NOT NULL DEFAULT 0,
  coaching_charges NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  inbound_id INT REFERENCES whatsapp_inbound(id) ON DELETE SET NULL,
  detected_amount NUMERIC(12, 2),
  transaction_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  share_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CHECK (expected_amount >= 0),
  CHECK (status IN ('pending', 'verified', 'cancelled', 'mismatch'))
);

CREATE INDEX IF NOT EXISTS idx_pass_payment_intents_pending
  ON pass_payment_intents (saas_account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pass_payment_intents_reg
  ON pass_payment_intents (registration_id, status);
ALTER TABLE pass_payment_intents ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pass_payment_intents_share_token_uidx
  ON pass_payment_intents (share_token)
  WHERE share_token IS NOT NULL AND TRIM(share_token) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS saas_accounts_email_lower_uidx
  ON saas_accounts (LOWER(TRIM(email)))
  WHERE TRIM(email) <> '';

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_account_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_user_name_key;
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_mobile_key;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_platform_user_name_uidx
  ON app_users (LOWER(user_name))
  WHERE saas_account_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_platform_mobile_uidx
  ON app_users (mobile)
  WHERE saas_account_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_user_name_uidx
  ON app_users (saas_account_id, LOWER(user_name))
  WHERE saas_account_id IS NOT NULL;
-- Tenant mobile uniqueness is applied in ensurePerAccountMobileUniqueIndexes().

-- Per-account app data (fresh empty app for each SaaS account)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE staff_registrations ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE batch_schedule_settings ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE batch_slots ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE pass_types ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE pool_expenses ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE water_quality ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE swimmer_progress ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE swimmer_attendance ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE pass_payments ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;

ALTER TABLE pool_core_info DROP CONSTRAINT IF EXISTS pool_core_info_id_check;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS payment_accept_cash BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS payment_accept_online BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pass_expiry_notice_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pass_expiry_notice_days INT NOT NULL DEFAULT 3;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS whatsapp_paid_messages_accepted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS whatsapp_paid_messages_accepted_at TIMESTAMPTZ;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS whatsapp_paid_messages_accepted_by INT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS whatsapp_broadcast_enabled BOOLEAN;
UPDATE pool_core_info
   SET whatsapp_broadcast_enabled = COALESCE(whatsapp_paid_messages_accepted, FALSE)
 WHERE whatsapp_broadcast_enabled IS NULL;
ALTER TABLE pool_core_info ALTER COLUMN whatsapp_broadcast_enabled SET DEFAULT FALSE;
UPDATE pool_core_info SET whatsapp_broadcast_enabled = FALSE WHERE whatsapp_broadcast_enabled IS NULL;
ALTER TABLE pool_core_info ALTER COLUMN whatsapp_broadcast_enabled SET NOT NULL;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pass_verification_mode TEXT NOT NULL DEFAULT 'ok_not_ok';
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pass_verification_configured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS coach_payment_basis TEXT NOT NULL DEFAULT 'month';
UPDATE pool_core_info pci
   SET pass_verification_mode = 'face',
       pass_verification_configured = TRUE
 WHERE EXISTS (
   SELECT 1 FROM pass_types pt
    WHERE pt.saas_account_id = pci.saas_account_id
      AND pt.verification_mode = 'face'
 );
UPDATE pool_core_info SET pass_verification_mode = 'ok_not_ok'
 WHERE pass_verification_mode IS NULL OR TRIM(pass_verification_mode) = '';

ALTER TABLE holiday_settings DROP CONSTRAINT IF EXISTS holiday_settings_id_check;
ALTER TABLE holiday_settings ADD COLUMN IF NOT EXISTS saas_account_id INT REFERENCES saas_accounts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS pool_core_info_saas_account_uidx
  ON pool_core_info (saas_account_id)
  WHERE saas_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS holiday_settings_saas_account_uidx
  ON holiday_settings (saas_account_id)
  WHERE saas_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS registrations_saas_account_idx ON registrations (saas_account_id);
CREATE INDEX IF NOT EXISTS registrations_saas_active_idx
  ON registrations (saas_account_id, is_active);
CREATE INDEX IF NOT EXISTS registrations_saas_pass_valid_idx
  ON registrations (saas_account_id, pass_valid_until);
CREATE INDEX IF NOT EXISTS registrations_saas_created_idx
  ON registrations (saas_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS registrations_saas_adult_idx
  ON registrations (saas_account_id)
  WHERE COALESCE(is_adult, FALSE) = TRUE;
CREATE INDEX IF NOT EXISTS staff_registrations_saas_account_idx ON staff_registrations (saas_account_id);
CREATE INDEX IF NOT EXISTS batch_slots_saas_account_idx ON batch_slots (saas_account_id);
CREATE INDEX IF NOT EXISTS pass_types_saas_account_idx ON pass_types (saas_account_id);
CREATE INDEX IF NOT EXISTS pool_expenses_saas_account_idx ON pool_expenses (saas_account_id);
CREATE INDEX IF NOT EXISTS water_quality_saas_account_idx ON water_quality (saas_account_id);
CREATE INDEX IF NOT EXISTS holidays_saas_account_idx ON holidays (saas_account_id);
CREATE INDEX IF NOT EXISTS swimmer_attendance_saas_date_idx
  ON swimmer_attendance (saas_account_id, attendance_date);
CREATE INDEX IF NOT EXISTS swimmer_attendance_reg_date_idx
  ON swimmer_attendance (registration_id, attendance_date);
CREATE INDEX IF NOT EXISTS pass_payments_saas_date_idx
  ON pass_payments (saas_account_id, payment_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pass_payments_invoice_number_uidx
  ON pass_payments (saas_account_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND BTRIM(invoice_number) <> '';
CREATE INDEX IF NOT EXISTS whatsapp_outbound_account_kind_idx
  ON whatsapp_outbound (saas_account_id, kind);
CREATE INDEX IF NOT EXISTS app_users_saas_admin_idx
  ON app_users (saas_account_id)
  WHERE COALESCE(is_account_admin, FALSE) = TRUE;

ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
/** Google Maps share link used to set pool coordinates (admin-friendly). */
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS google_maps_url TEXT NOT NULL DEFAULT '';
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pool_state TEXT NOT NULL DEFAULT '';
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pool_district TEXT NOT NULL DEFAULT '';
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS pin_code TEXT NOT NULL DEFAULT '';
/** Admin-chosen near-pool login distance (km) for users set to “swimming pool only”. */
ALTER TABLE pool_core_info ADD COLUMN IF NOT EXISTS login_near_km INT;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS remote_access_until TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_geo_mode TEXT NOT NULL DEFAULT 'pool_only';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_radius_km INT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login_type TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE saas_accounts ADD COLUMN IF NOT EXISTS login_session_timeout_minutes INT NOT NULL DEFAULT 30;

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

CREATE TABLE IF NOT EXISTS remote_login_requests (
  id SERIAL PRIMARY KEY,
  saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  pool_latitude DOUBLE PRECISION,
  pool_longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending',
  status_token TEXT NOT NULL UNIQUE,
  approval_token TEXT NOT NULL UNIQUE,
  decided_by_user_id INT REFERENCES app_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  remote_access_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'approved', 'denied', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_remote_login_requests_account
  ON remote_login_requests (saas_account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remote_login_requests_user
  ON remote_login_requests (user_id, status, created_at DESC);

DO $$
DECLARE
  cname text;
BEGIN
  IF to_regclass('public.account_audit_logs') IS NULL THEN
    RETURN;
  END IF;
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'account_audit_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE account_audit_logs DROP CONSTRAINT %I', cname);
  END LOOP;
  ALTER TABLE account_audit_logs
    ADD CONSTRAINT account_audit_logs_action_check
    CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'login', 'approve', 'deny'));
END $$;
`;

async function assignOrphanRowsToAccount(accountId: number) {
  const tables = [
    'registrations',
    'staff_registrations',
    'batch_schedule_settings',
    'batch_slots',
    'pass_types',
    'pool_expenses',
    'water_quality',
    'holidays',
    'swimmer_attendance',
    'pass_payments',
    'pool_core_info',
    'holiday_settings',
  ] as const;
  for (const tableName of tables) {
    const table = allowlistedSqlIdentifier(tableName, tables);
    await pool.query(
      `UPDATE ${table} SET saas_account_id = $1 WHERE saas_account_id IS NULL`,
      [accountId],
    );
  }
}

async function ensureAccountAppShells() {
  await pool.query(
    `INSERT INTO pool_core_info (saas_account_id, pool_name, pool_address)
     SELECT a.id, a.account_name, COALESCE(a.pool_address, '')
     FROM saas_accounts a
     WHERE NOT EXISTS (
       SELECT 1 FROM pool_core_info p WHERE p.saas_account_id = a.id
     )`,
  );
  await pool.query(
    `INSERT INTO holiday_settings (saas_account_id)
     SELECT a.id
     FROM saas_accounts a
     WHERE NOT EXISTS (
       SELECT 1 FROM holiday_settings h WHERE h.saas_account_id = a.id
     )`,
  );
}

/** Mark rows that already look fully configured (pre-setup_completed column). */
async function backfillPoolCoreSetupCompleted() {
  await pool.query(
    `UPDATE pool_core_info
     SET setup_completed = TRUE
     WHERE setup_completed = FALSE
       AND TRIM(COALESCE(pool_name, '')) <> ''
       AND TRIM(COALESCE(pool_address, '')) <> ''
       AND (
         payment_accept_online = FALSE
         OR (
           payment_qr_path IS NOT NULL
           AND TRIM(COALESCE(payment_qr_path, '')) <> ''
           AND TRIM(COALESCE(upi_details, '')) <> ''
         )
       )`,
  );
}

async function ensureDefaultServicePackages() {
  const defaults = [
    {
      name: 'Trial',
      description:
        '30-day entry plan with Starter limits. Core operations only — upgrade before trial ends.',
      price: 0,
      period: 'Month',
      maxPools: 1,
      maxUsers: 2,
      maxSwimmers: 100,
      trialDays: 30,
      modules: 'core',
      support: 'whatsapp',
      features: 'swimmers:100; modules:core; support:whatsapp; trial_days:30',
    },
    {
      name: 'Starter',
      description:
        'For a single small pool. Core ops: registration, batches, pass payment, scanner, attendance.',
      price: 1999,
      period: 'Month',
      maxPools: 1,
      maxUsers: 2,
      maxSwimmers: 100,
      trialDays: 0,
      modules: 'core',
      support: 'whatsapp',
      features: 'swimmers:100; modules:core; support:whatsapp',
    },
    {
      name: 'Professional',
      description:
        'Recommended for busy pools. Full modules including coach payment, expenses, holidays, and balance sheet.',
      price: 3999,
      period: 'Month',
      maxPools: 1,
      maxUsers: 5,
      maxSwimmers: 300,
      trialDays: 0,
      modules: 'full',
      support: 'priority',
      features: 'swimmers:300; modules:full; support:priority',
    },
    {
      name: 'Enterprise',
      description:
        'Unlimited active swimmers, more staff logins, full modules, and onboarding support.',
      price: 6999,
      period: 'Month',
      maxPools: 1,
      maxUsers: 10,
      maxSwimmers: null as number | null,
      trialDays: 0,
      modules: 'full',
      support: 'onboarding',
      features: 'swimmers:unlimited; modules:full; support:onboarding',
    },
  ];

  let seeded = 0;
  for (const pkg of defaults) {
    const existing = await pool.query(
      `SELECT id FROM service_packages WHERE LOWER(package_name) = LOWER($1) LIMIT 1`,
      [pkg.name],
    );
    if ((existing.rowCount ?? 0) > 0) continue;
    await pool.query(
      `INSERT INTO service_packages
       (package_name, description, price, billing_period, max_pools, max_users,
        max_active_swimmers, trial_days, modules, support_level, features, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)`,
      [
        pkg.name,
        pkg.description,
        pkg.price,
        pkg.period,
        pkg.maxPools,
        pkg.maxUsers,
        pkg.maxSwimmers,
        pkg.trialDays,
        pkg.modules,
        pkg.support,
        pkg.features,
      ],
    );
    seeded += 1;
  }
  if (seeded > 0) console.log(`Seeded ${seeded} default service package(s)`);

  // Existing Professional / Enterprise rows may still have modules=core from older seeds.
  const synced = await pool.query(
    `UPDATE service_packages
     SET modules = 'full',
         features = CASE
           WHEN features IS NULL OR TRIM(features) = '' THEN
             CASE LOWER(package_name)
               WHEN 'professional' THEN 'swimmers:300; modules:full; support:priority'
               WHEN 'enterprise' THEN 'swimmers:unlimited; modules:full; support:onboarding'
               ELSE features
             END
           ELSE regexp_replace(features, 'modules:\\s*core', 'modules:full', 'i')
         END
     WHERE LOWER(package_name) IN ('professional', 'enterprise')
       AND LOWER(COALESCE(modules, 'core')) IS DISTINCT FROM 'full'`,
  );
  const syncedN = synced.rowCount ?? 0;
  if (syncedN > 0) {
    console.log(`Updated ${syncedN} package(s) to full modules (Professional/Enterprise)`);
  }

  // Backfill empty feature_keys from modules (platform-editable checklist).
  const pkgs = await pool.query<{
    id: number;
    modules: string | null;
    package_name: string | null;
    feature_keys: string[] | null;
  }>(`SELECT id, modules, package_name, feature_keys FROM service_packages`);
  let featureBackfill = 0;
  for (const row of pkgs.rows) {
    if (Array.isArray(row.feature_keys) && row.feature_keys.length > 0) continue;
    const keys = defaultFeatureKeysForModules(row.modules, row.package_name);
    await pool.query(`UPDATE service_packages SET feature_keys = $1::text[] WHERE id = $2`, [
      keys,
      row.id,
    ]);
    featureBackfill += 1;
  }
  if (featureBackfill > 0) {
    console.log(`Backfilled feature_keys on ${featureBackfill} service package(s)`);
  }

  const allKeys = defaultFeatureKeysForModules('full');
  const granted = await pool.query(
    `UPDATE service_packages
     SET modules = 'full',
         feature_keys = $1::text[]
     WHERE LOWER(COALESCE(modules, '')) IS DISTINCT FROM 'full'
        OR cardinality(COALESCE(feature_keys, '{}'::text[])) < $2`,
    [allKeys, allKeys.length],
  );
  const grantedN = granted.rowCount ?? 0;
  if (grantedN > 0) {
    console.log(`Granted all modules on ${grantedN} service package(s)`);
  }
}

/** Unique mobile within one SaaS account; same mobile OK in another account. Skip if duplicates already exist. */
async function ensurePerAccountMobileUniqueIndexes() {
  const specs: Array<{
    name: string;
    dupCheck: string;
    createSql: string;
  }> = [
    {
      name: 'app_users_tenant_mobile_uidx',
      dupCheck: `
        SELECT 1
        FROM (
          SELECT saas_account_id, RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10) AS m
          FROM app_users
          WHERE saas_account_id IS NOT NULL
        ) t
        GROUP BY saas_account_id, m
        HAVING COUNT(*) > 1
        LIMIT 1`,
      createSql: `
        CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_mobile_uidx
          ON app_users (saas_account_id, RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10))
          WHERE saas_account_id IS NOT NULL`,
    },
    {
      name: 'app_users_tenant_email_uidx',
      dupCheck: `
        SELECT 1
        FROM (
          SELECT saas_account_id, LOWER(TRIM(email)) AS e
          FROM app_users
          WHERE saas_account_id IS NOT NULL AND TRIM(email) <> ''
        ) t
        GROUP BY saas_account_id, e
        HAVING COUNT(*) > 1
        LIMIT 1`,
      createSql: `
        CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_email_uidx
          ON app_users (saas_account_id, LOWER(TRIM(email)))
          WHERE saas_account_id IS NOT NULL AND TRIM(email) <> ''`,
    },
    {
      name: 'staff_registrations_tenant_whatsapp_mobile_uidx',
      dupCheck: `
        SELECT 1
        FROM (
          SELECT saas_account_id, RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10) AS m
          FROM staff_registrations
          WHERE saas_account_id IS NOT NULL
        ) t
        GROUP BY saas_account_id, m
        HAVING COUNT(*) > 1
        LIMIT 1`,
      createSql: `
        CREATE UNIQUE INDEX IF NOT EXISTS staff_registrations_tenant_whatsapp_mobile_uidx
          ON staff_registrations (saas_account_id, RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10))
          WHERE saas_account_id IS NOT NULL`,
    },
    {
      name: 'staff_registrations_tenant_email_uidx',
      dupCheck: `
        SELECT 1
        FROM (
          SELECT saas_account_id, LOWER(TRIM(email)) AS e
          FROM staff_registrations
          WHERE saas_account_id IS NOT NULL AND TRIM(email) <> ''
        ) t
        GROUP BY saas_account_id, e
        HAVING COUNT(*) > 1
        LIMIT 1`,
      createSql: `
        CREATE UNIQUE INDEX IF NOT EXISTS staff_registrations_tenant_email_uidx
          ON staff_registrations (saas_account_id, LOWER(TRIM(email)))
          WHERE saas_account_id IS NOT NULL AND TRIM(email) <> ''`,
    },
  ];

  // Swimmers: no DB unique on WhatsApp/email — under-18 may share parent contact.
  // Adult uniqueness is enforced in the registrations API.
  await pool.query(`DROP INDEX IF EXISTS registrations_tenant_whatsapp_mobile_uidx`);
  await pool.query(`DROP INDEX IF EXISTS registrations_tenant_email_uidx`);

  for (const spec of specs) {
    try {
      // Drop old plain-text mobile index if present (replaced by digit-normalized)
      if (spec.name === 'app_users_tenant_mobile_uidx') {
        const old = await pool.query(`
          SELECT indexdef FROM pg_indexes
          WHERE indexname = 'app_users_tenant_mobile_uidx'
        `);
        const def = String(old.rows[0]?.indexdef ?? '');
        if (def && !def.includes('regexp_replace')) {
          await pool.query(`DROP INDEX IF EXISTS app_users_tenant_mobile_uidx`);
        }
      }

      const dup = await pool.query(spec.dupCheck);
      if (dup.rows[0]) {
        console.warn(
          `[db] skip ${spec.name}: duplicate mobiles already exist within an account — clean duplicates then redeploy`,
        );
        continue;
      }
      await pool.query(spec.createSql);
    } catch (err) {
      console.warn(`[db] could not ensure ${spec.name}`, err);
    }
  }
}

async function init() {
  // Migrate legacy singleton tables (id = 1 CHECK) to SERIAL-style PKs if needed
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'pool_core_info_id_check'
      ) OR EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pool_core_info_id_check'
      ) THEN
        ALTER TABLE pool_core_info DROP CONSTRAINT IF EXISTS pool_core_info_id_check;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'holiday_settings_id_check'
      ) THEN
        ALTER TABLE holiday_settings DROP CONSTRAINT IF EXISTS holiday_settings_id_check;
      END IF;
    END $$;
  `).catch(() => undefined);

  await pool.query(sql);

  // Staging may reuse SaaS account contact mobiles across accounts.
  // User / swimmer / staff mobiles stay unique within each account (reuse across accounts OK).
  if (allowDuplicateAccountMobile()) {
    await pool.query(`ALTER TABLE saas_accounts DROP CONSTRAINT IF EXISTS saas_accounts_mobile_key`);
    console.info('[db] staging: allowed duplicate SaaS account contact mobiles');
  }

  await ensurePerAccountMobileUniqueIndexes();

  // Ensure singleton legacy tables can insert new per-account rows
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pool_core_info_id_seq') THEN
        CREATE SEQUENCE pool_core_info_id_seq;
        PERFORM setval('pool_core_info_id_seq', COALESCE((SELECT MAX(id) FROM pool_core_info), 1));
        ALTER TABLE pool_core_info ALTER COLUMN id SET DEFAULT nextval('pool_core_info_id_seq');
        ALTER SEQUENCE pool_core_info_id_seq OWNED BY pool_core_info.id;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'holiday_settings_id_seq') THEN
        CREATE SEQUENCE holiday_settings_id_seq;
        PERFORM setval('holiday_settings_id_seq', COALESCE((SELECT MAX(id) FROM holiday_settings), 1));
        ALTER TABLE holiday_settings ALTER COLUMN id SET DEFAULT nextval('holiday_settings_id_seq');
        ALTER SEQUENCE holiday_settings_id_seq OWNED BY holiday_settings.id;
      END IF;
    END $$;
  `);

  const { rows: firstAccount } = await pool.query(
    `SELECT id FROM saas_accounts ORDER BY id ASC LIMIT 1`,
  );
  if (firstAccount[0]) {
    await assignOrphanRowsToAccount(Number(firstAccount[0].id));
  }
  await ensureAccountAppShells();
  await backfillPoolCoreSetupCompleted();
  await ensureDefaultServicePackages();
  await ensureAllAccountsOnVolumePackage();

  const { rows: missing } = await pool.query(
    `SELECT a.id, a.mobile, a.account_code
     FROM saas_accounts a
     WHERE NOT EXISTS (
       SELECT 1 FROM app_users u
       WHERE u.saas_account_id = a.id AND COALESCE(u.is_account_admin, FALSE) = TRUE
     )`,
  );
  const { hashPassword } = await import('../password.js');
  const { ACCESS_PAGE_KEYS } = await import('../menuAccess.js');
  let created = 0;
  for (const account of missing) {
    try {
      const passwordHash = await hashPassword('admin');
      await pool.query(
        `INSERT INTO app_users
         (user_name, mobile, password_hash, menu_access, saas_account_id, must_change_password, is_account_admin)
         VALUES ('admin', $1, $2, $3, $4, TRUE, TRUE)`,
        [String(account.mobile), passwordHash, [...ACCESS_PAGE_KEYS], Number(account.id)],
      );
      created += 1;
      console.log(`Created admin user for account ${account.account_code}`);
    } catch (err) {
      console.error(`Failed to create admin for account ${account.account_code}`, err);
    }
  }
  console.log(
    'Database ready: registrations, staff, batches, pass types, pool expenses, attendance, pass payments, pool core info, holidays, users, service packages, and SaaS accounts (tenant-scoped)',
  );
  if (created > 0) console.log(`Backfilled ${created} account admin user(s) with password "admin"`);

  await migrateSensitivePiiColumns();
  await migrateInactiveAt();
  await ensureSwimItSuperadmin();
  await pool.end();
}

async function migrateInactiveAt() {
  await pool.query(
    `ALTER TABLE registrations ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ`,
  );
  // Existing inactive swimmers with a pass: start a 3-day Pass Payment window from deploy.
  const { rowCount } = await pool.query(
    `UPDATE registrations
     SET inactive_at = NOW()
     WHERE COALESCE(is_active, FALSE) = FALSE
       AND inactive_at IS NULL
       AND pass_valid_until IS NOT NULL`,
  );
  if (rowCount && rowCount > 0) {
    console.log(`[pass] Backfilled inactive_at on ${rowCount} inactive registration(s)`);
  }
}

async function migrateSensitivePiiColumns() {
  await pool.query(
    `ALTER TABLE registrations
     ALTER COLUMN birthdate TYPE TEXT USING birthdate::text`,
  );
  await pool.query(
    `ALTER TABLE staff_registrations
     ALTER COLUMN birthdate TYPE TEXT USING birthdate::text`,
  );

  const {
    sealBirthdate,
    sealIdentityDocument,
    isEncryptedValue,
    isAdultBirthdate,
    normalizeBirthdate,
    piiEncryptionEnabled,
  } = await import('../sensitiveData.js');

  if (!piiEncryptionEnabled()) {
    await pool.query(
      `UPDATE registrations
       SET is_adult = (birthdate ~ '^\\d{4}-\\d{2}-\\d{2}' AND birthdate::date <= (CURRENT_DATE - INTERVAL '18 years'))
       WHERE is_adult IS NULL`,
    );
    await pool.query(
      `UPDATE staff_registrations
       SET is_adult = (birthdate ~ '^\\d{4}-\\d{2}-\\d{2}' AND birthdate::date <= (CURRENT_DATE - INTERVAL '18 years'))
       WHERE is_adult IS NULL`,
    );
    console.warn(
      '[pii] Skipping encryption migration — set PII_ENCRYPTION_KEY to seal birthdate and identity fields',
    );
    return;
  }

  const piiTables = ['registrations', 'staff_registrations'] as const;
  for (const tableName of piiTables) {
    const table = allowlistedSqlIdentifier(tableName, piiTables);
    const { rows } = await pool.query<{
      id: number;
      birthdate: string;
      identity_document: string;
      is_adult: boolean | null;
    }>(`SELECT id, birthdate, identity_document, is_adult FROM ${table}`);

    let sealed = 0;
    for (const row of rows) {
      const birthRaw = String(row.birthdate ?? '');
      const docRaw = String(row.identity_document ?? '');
      let nextBirth = birthRaw;
      let nextDoc = docRaw;
      let nextAdult = row.is_adult;

      if (birthRaw && !isEncryptedValue(birthRaw)) {
        const sealedBirth = sealBirthdate(birthRaw.slice(0, 10));
        nextBirth = sealedBirth.sealed;
        nextAdult = sealedBirth.isAdult;
      } else if (nextAdult == null && birthRaw) {
        try {
          nextAdult = isAdultBirthdate(normalizeBirthdate(birthRaw));
        } catch {
          // leave is_adult null/false if decrypt fails
        }
      }

      if (docRaw && !isEncryptedValue(docRaw)) {
        nextDoc = sealIdentityDocument(docRaw);
      }

      if (
        nextBirth === birthRaw &&
        nextDoc === docRaw &&
        nextAdult === row.is_adult
      ) {
        continue;
      }

      await pool.query(
        `UPDATE ${table}
         SET birthdate = $1,
             identity_document = $2,
             is_adult = COALESCE($3, FALSE)
         WHERE id = $4`,
        [nextBirth, nextDoc, nextAdult, row.id],
      );
      sealed += 1;
    }
    if (sealed > 0) {
      console.log(`[pii] Sealed birthdate/identity_document on ${sealed} ${table} row(s)`);
    }
  }
}

/** Platform demo / operator account: code swimit, user superadmin / superadmin */
async function ensureSwimItSuperadmin() {
  const { hashPassword } = await import('../password.js');
  const { PLATFORM_ACCESS_PAGE_KEYS } = await import('../menuAccess.js');
  const code = 'swimit';
  const userName = 'superadmin';
  const password = 'superadmin';
  const mobile = '9000000001';
  const email = 'superadmin@swimit.local';

  let accountId: number;
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM saas_accounts WHERE LOWER(account_code) = $1`,
    [code],
  );
  if (existing.rows[0]) {
    accountId = Number(existing.rows[0].id);
  } else {
    const pkg = await pool.query<{ id: number }>(
      `SELECT id FROM service_packages WHERE LOWER(package_name) = 'enterprise' LIMIT 1`,
    );
    const packageId = pkg.rows[0] ? Number(pkg.rows[0].id) : null;
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO saas_accounts
       (account_name, contact_name, mobile, email, city, pool_address, account_code,
        service_package_id, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active', $9)
       RETURNING id`,
      [
        'SwimIT Super Admin',
        'Super Admin',
        mobile,
        email,
        '',
        '',
        code,
        packageId,
        'Seeded platform superadmin account',
      ],
    );
    accountId = Number(inserted.rows[0].id);
    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id, pool_name, pool_address)
       SELECT $1, $2, ''
       WHERE NOT EXISTS (SELECT 1 FROM pool_core_info WHERE saas_account_id = $1)`,
      [accountId, 'SwimIT Super Admin'],
    );
    await pool.query(
      `INSERT INTO holiday_settings (saas_account_id)
       SELECT $1
       WHERE NOT EXISTS (SELECT 1 FROM holiday_settings WHERE saas_account_id = $1)`,
      [accountId],
    );
    console.log(`Created SaaS account code "${code}"`);
  }

  const user = await pool.query<{ id: number }>(
    `SELECT id FROM app_users
     WHERE saas_account_id = $1 AND LOWER(user_name) = LOWER($2)`,
    [accountId, userName],
  );
  if (user.rows[0]) {
    await pool.query(
      `UPDATE app_users
       SET is_account_admin = TRUE,
           menu_access = $1
       WHERE id = $2`,
      [[...PLATFORM_ACCESS_PAGE_KEYS], Number(user.rows[0].id)],
    );
    console.log(`Updated user "${userName}" on account "${code}" (password unchanged)`);
  } else {
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO app_users
       (user_name, mobile, password_hash, menu_access, saas_account_id, must_change_password, is_account_admin)
       VALUES ($1, $2, $3, $4, $5, FALSE, TRUE)`,
      [userName, mobile, passwordHash, [...PLATFORM_ACCESS_PAGE_KEYS], accountId],
    );
    console.log(`Created user "${userName}" on account "${code}"`);
  }

  // Grant WhatsApp to existing SwimIT platform staff who were created before this key existed
  await pool.query(
    `UPDATE app_users u
     SET menu_access = array_append(menu_access, 'whatsapp')
     FROM saas_accounts a
     WHERE u.saas_account_id = a.id
       AND LOWER(a.account_code) = 'swimit'
       AND NOT ('whatsapp' = ANY (u.menu_access))`,
  );

  await pool.query(
    `UPDATE app_users u
     SET menu_access = array_append(menu_access, 'server-monitor')
     FROM saas_accounts a
     WHERE u.saas_account_id = a.id
       AND LOWER(a.account_code) = 'swimit'
       AND NOT ('server-monitor' = ANY (u.menu_access))`,
  );
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
