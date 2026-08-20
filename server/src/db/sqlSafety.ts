/**
 * SQL values must always be passed separately to pg as $1, $2, ... parameters.
 * PostgreSQL cannot parameterize identifiers, so dynamic table/column names must
 * pass through this explicit allowlist before they are included in query text.
 */
export function allowlistedSqlIdentifier<const T extends string>(
  value: string,
  allowlist: readonly T[],
): T {
  if (!/^[a-z_][a-z0-9_]*$/.test(value) || !allowlist.includes(value as T)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value as T;
}

