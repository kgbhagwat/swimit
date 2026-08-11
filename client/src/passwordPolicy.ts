export const PASSWORD_POLICY_MSG =
  'Password must be at least 8 characters with at least 1 letter and 1 number';

/** Returns an error message when the password fails policy; otherwise null. */
export function passwordPolicyError(password: string): string | null {
  const value = String(password ?? '');
  if (value.length < 8) return PASSWORD_POLICY_MSG;
  if (!/[A-Za-z]/.test(value)) return PASSWORD_POLICY_MSG;
  if (!/\d/.test(value)) return PASSWORD_POLICY_MSG;
  return null;
}
