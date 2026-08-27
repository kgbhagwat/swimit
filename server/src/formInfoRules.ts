import { pool } from './db/pool.js';

export type FormKind = 'swimmer' | 'staff';

export type FormRulesMap = {
  swimmer: Record<string, boolean>;
  staff: Record<string, boolean>;
};

const SWIMMER_DEFAULTS: Record<string, boolean> = {
  fullName: true,
  fullAddress: true,
  whatsappMobile: true,
  otherMobile: false,
  email: false,
  birthdate: true,
  sex: true,
  bloodGroup: true,
  parentName: true,
  parentRelation: true,
  parentMobile: true,
  emergencyName: true,
  emergencyRelation: true,
  emergencyMobile: true,
  hasHealthIssue: true,
  healthIssueDetails: true,
  doctorName: false,
  doctorNo: false,
  identityDocument: true,
  identityNumber: false,
  identityPhoto: true,
  swimmerPhoto: true,
  acceptedTerms: true,
};

const STAFF_DEFAULTS: Record<string, boolean> = {
  registrationFor: true,
  fullName: true,
  fullAddress: true,
  whatsappMobile: true,
  otherMobile: false,
  email: false,
  birthdate: true,
  sex: true,
  bloodGroup: true,
  emergencyName: true,
  emergencyRelation: true,
  emergencyMobile: true,
  hasHealthIssue: true,
  healthIssueDetails: true,
  doctorName: false,
  doctorNo: false,
  identityDocument: true,
  identityNumber: false,
  identityPhoto: true,
  staffPhoto: true,
  teachStrokes: true,
  suitableBatchIds: true,
  achievements: false,
  hasLifeguardCert: false,
  lifeguardExpiry: true,
  lifeguardPhoto: true,
  certificateDetails: false,
  certificatePhotos: false,
  postName: true,
  salary: true,
  acceptedTerms: true,
};

const SWIMMER_LOCKED = new Set(['fullName', 'whatsappMobile', 'acceptedTerms']);
const STAFF_LOCKED = new Set(['registrationFor', 'fullName', 'whatsappMobile', 'acceptedTerms']);

function overlay(
  defaults: Record<string, boolean>,
  locked: Set<string>,
  incoming: unknown,
) {
  const next = { ...defaults };
  const raw = incoming && typeof incoming === 'object' ? (incoming as Record<string, unknown>) : {};
  for (const key of Object.keys(defaults)) {
    if (locked.has(key)) {
      next[key] = true;
      continue;
    }
    if (key in raw) next[key] = raw[key] === true;
  }
  return next;
}

export function mergeFormRules(raw: unknown): FormRulesMap {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    swimmer: overlay(SWIMMER_DEFAULTS, SWIMMER_LOCKED, body.swimmer),
    staff: overlay(STAFF_DEFAULTS, STAFF_LOCKED, body.staff),
  };
}

export function isFormFieldRequired(rules: FormRulesMap, kind: FormKind, key: string) {
  return rules[kind]?.[key] === true;
}

async function ensureRow(accountId: number) {
  await pool.query(
    `INSERT INTO form_info (saas_account_id)
     SELECT $1 WHERE NOT EXISTS (
       SELECT 1 FROM form_info WHERE saas_account_id = $1
     )`,
    [accountId],
  );
}

export async function getFormRules(accountId: number): Promise<FormRulesMap> {
  await ensureRow(accountId);
  const { rows } = await pool.query(
    `SELECT required_fields FROM form_info WHERE saas_account_id = $1`,
    [accountId],
  );
  return mergeFormRules(rows[0]?.required_fields);
}

export async function saveFormRules(accountId: number, raw: unknown): Promise<FormRulesMap> {
  const rules = mergeFormRules(raw);
  await pool.query(
    `INSERT INTO form_info (saas_account_id, required_fields, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (saas_account_id)
     DO UPDATE SET required_fields = EXCLUDED.required_fields, updated_at = NOW()`,
    [accountId, JSON.stringify(rules)],
  );
  return rules;
}
