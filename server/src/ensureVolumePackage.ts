import { pool } from './db/pool.js';
import { defaultFeatureKeysForModules, pageKeysForPackage } from './packageFeatures.js';

/** Seed/update Volume and put every existing account on it. Safe to run on every boot. */
export async function ensureAllAccountsOnVolumePackage() {
  const packagesExist = await pool.query(`SELECT to_regclass('public.service_packages') AS rel`);
  if (!packagesExist.rows[0]?.rel) return;
  const accountsExist = await pool.query(`SELECT to_regclass('public.saas_accounts') AS rel`);
  if (!accountsExist.rows[0]?.rel) return;

  const allKeys = defaultFeatureKeysForModules('full');
  const description =
    'Same full product, 100 billable swimmers included, lower extra-swimmer rate as the pool grows.';
  const features = 'swimmers:100; modules:full; extra:20; support:priority';

  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM service_packages WHERE LOWER(package_name) = 'volume' LIMIT 1`,
  );

  let volumeId: number;
  if (existing.rows[0]) {
    volumeId = Number(existing.rows[0].id);
    await pool.query(
      `UPDATE service_packages
       SET description = $1,
           price = 3499,
           discounted_rate = NULL,
           billing_period = 'Month',
           max_pools = 1,
           max_users = 15,
           max_active_swimmers = 100,
           trial_days = 0,
           modules = 'full',
           support_level = 'priority',
           features = $2,
           feature_keys = $3::text[],
           is_active = TRUE
       WHERE id = $4`,
      [description, features, allKeys, volumeId],
    );
  } else {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO service_packages
       (package_name, description, price, billing_period, max_pools, max_users,
        max_active_swimmers, trial_days, modules, support_level, features, feature_keys, is_active)
       VALUES ($1, $2, 3499, 'Month', 1, 15, 100, 0, 'full', 'priority', $3, $4::text[], TRUE)
       RETURNING id`,
      ['Volume', description, features, allKeys],
    );
    volumeId = Number(inserted.rows[0].id);
    console.log('Seeded Volume service package');
  }

  const retired = await pool.query(
    `UPDATE service_packages
     SET is_active = FALSE
     WHERE LOWER(package_name) IN ('starter', 'professional', 'business', 'enterprise')
       AND COALESCE(is_active, TRUE) = TRUE`,
  );
  const retiredN = retired.rowCount ?? 0;
  if (retiredN > 0) {
    console.log(`Retired ${retiredN} legacy service package(s)`);
  }

  const moved = await pool.query(
    `UPDATE saas_accounts
     SET service_package_id = $1
     WHERE service_package_id IS DISTINCT FROM $1`,
    [volumeId],
  );
  const movedN = moved.rowCount ?? 0;
  if (movedN > 0) {
    console.log(`Moved ${movedN} account(s) to Volume package`);
  }

  const usersExist = await pool.query(`SELECT to_regclass('public.app_users') AS rel`);
  if (!usersExist.rows[0]?.rel) return;

  const menuKeys = pageKeysForPackage({
    modules: 'full',
    packageName: 'Volume',
    featureKeys: allKeys,
  });
  await pool.query(
    `UPDATE app_users
     SET menu_access = $1
     WHERE COALESCE(is_account_admin, FALSE) = TRUE
       AND saas_account_id IS NOT NULL`,
    [menuKeys],
  );
}
