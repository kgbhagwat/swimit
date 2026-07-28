/** Staging (or explicit flag) may reuse account mobiles; production must not. */

export function allowDuplicateAccountMobile() {
  const flag = String(process.env.ALLOW_DUPLICATE_ACCOUNT_MOBILE ?? '')
    .trim()
    .toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;

  const hay = [
    process.env.DOMAIN,
    process.env.CORS_ORIGIN,
    process.env.PUBLIC_APP_URL,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return hay.includes('staging');
}
