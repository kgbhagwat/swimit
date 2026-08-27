import { useEffect, useState } from 'react';

export type FormKind = 'swimmer' | 'staff';

export type FormFieldDef = {
  key: string;
  label: string;
  defaultRequired: boolean;
  locked?: boolean;
  hint?: string;
};

export type FormRulesMap = {
  swimmer: Record<string, boolean>;
  staff: Record<string, boolean>;
};

export const SWIMMER_FORM_FIELDS: FormFieldDef[] = [
  { key: 'fullName', label: 'Full name', defaultRequired: true, locked: true },
  { key: 'fullAddress', label: 'Full address', defaultRequired: true },
  { key: 'whatsappMobile', label: 'WhatsApp mobile no.', defaultRequired: true, locked: true },
  { key: 'otherMobile', label: 'Another mobile no.', defaultRequired: false },
  { key: 'email', label: 'Email', defaultRequired: false },
  { key: 'birthdate', label: 'Birth Date', defaultRequired: true },
  { key: 'sex', label: 'Sex', defaultRequired: true },
  { key: 'bloodGroup', label: 'Blood group', defaultRequired: true },
  {
    key: 'parentName',
    label: 'Parent / guardian name',
    defaultRequired: true,
    hint: 'Shown when the swimmer is under 18.',
  },
  {
    key: 'parentRelation',
    label: 'Parent / guardian relationship',
    defaultRequired: true,
    hint: 'Shown when the swimmer is under 18.',
  },
  {
    key: 'parentMobile',
    label: 'Parent / guardian contact no.',
    defaultRequired: true,
    hint: 'Shown when the swimmer is under 18.',
  },
  { key: 'emergencyName', label: 'Emergency contact name', defaultRequired: true },
  { key: 'emergencyRelation', label: 'Relation', defaultRequired: true },
  { key: 'emergencyMobile', label: 'Emergency contact no.', defaultRequired: true },
  { key: 'hasHealthIssue', label: 'Do you have any health issue?', defaultRequired: true },
  {
    key: 'healthIssueDetails',
    label: 'Disease / health issue',
    defaultRequired: true,
    hint: 'Asked when health issue is Yes.',
  },
  { key: 'doctorName', label: 'Doctor name', defaultRequired: false },
  { key: 'doctorNo', label: 'Doctor no.', defaultRequired: false },
  { key: 'identityDocument', label: 'Identity document', defaultRequired: true },
  { key: 'identityNumber', label: 'Identity number', defaultRequired: false },
  { key: 'identityPhoto', label: 'Photo of identity proof', defaultRequired: true },
  { key: 'swimmerPhoto', label: 'Swimmer photo', defaultRequired: true },
  {
    key: 'acceptedTerms',
    label: 'Terms & Conditions',
    defaultRequired: true,
    locked: true,
  },
];

export const STAFF_FORM_FIELDS: FormFieldDef[] = [
  { key: 'registrationFor', label: 'Registration for', defaultRequired: true, locked: true },
  { key: 'fullName', label: 'Full name', defaultRequired: true, locked: true },
  { key: 'fullAddress', label: 'Full address', defaultRequired: true },
  { key: 'whatsappMobile', label: 'WhatsApp mobile no.', defaultRequired: true, locked: true },
  { key: 'otherMobile', label: 'Another mobile no.', defaultRequired: false },
  { key: 'email', label: 'Email', defaultRequired: false },
  { key: 'birthdate', label: 'Birth Date', defaultRequired: true },
  { key: 'sex', label: 'Sex', defaultRequired: true },
  { key: 'bloodGroup', label: 'Blood group', defaultRequired: true },
  { key: 'emergencyName', label: 'Emergency contact name', defaultRequired: true },
  { key: 'emergencyRelation', label: 'Relation', defaultRequired: true },
  { key: 'emergencyMobile', label: 'Emergency contact no.', defaultRequired: true },
  { key: 'hasHealthIssue', label: 'Do you have any health issue?', defaultRequired: true },
  {
    key: 'healthIssueDetails',
    label: 'Disease / health issue',
    defaultRequired: true,
    hint: 'Asked when health issue is Yes.',
  },
  { key: 'doctorName', label: 'Doctor name', defaultRequired: false },
  { key: 'doctorNo', label: 'Doctor no.', defaultRequired: false },
  { key: 'identityDocument', label: 'Identity document', defaultRequired: true },
  { key: 'identityNumber', label: 'Identity number', defaultRequired: false },
  { key: 'identityPhoto', label: 'Photo of identity proof', defaultRequired: true },
  { key: 'staffPhoto', label: 'Photo', defaultRequired: true },
  {
    key: 'teachStrokes',
    label: 'Interested to teach',
    defaultRequired: true,
    hint: 'Shown for coaches.',
  },
  {
    key: 'suitableBatchIds',
    label: 'Suitable Batch Slot',
    defaultRequired: true,
    hint: 'Shown for coaches.',
  },
  { key: 'achievements', label: 'Achievements', defaultRequired: false },
  {
    key: 'hasLifeguardCert',
    label: 'Do you have life guard certification?',
    defaultRequired: false,
    hint: 'Shown for coaches and lifeguards.',
  },
  {
    key: 'lifeguardExpiry',
    label: 'Expiring On',
    defaultRequired: true,
    hint: 'Asked when Life Guard certificate is Yes.',
  },
  {
    key: 'lifeguardPhoto',
    label: 'Life Guard certificate photo',
    defaultRequired: true,
    hint: 'Asked when Life Guard certificate is Yes.',
  },
  { key: 'certificateDetails', label: 'Certificate details', defaultRequired: false },
  { key: 'certificatePhotos', label: 'Certificate photos', defaultRequired: false },
  {
    key: 'postName',
    label: 'Post name',
    defaultRequired: true,
    hint: 'Used when editing Other staff.',
  },
  {
    key: 'salary',
    label: 'Salary',
    defaultRequired: true,
    hint: 'Used when editing Other or Lifeguard staff.',
  },
  {
    key: 'acceptedTerms',
    label: 'Terms & Conditions',
    defaultRequired: true,
    locked: true,
  },
];

function defaultsFrom(fields: FormFieldDef[]) {
  const out: Record<string, boolean> = {};
  for (const field of fields) out[field.key] = field.locked ? true : field.defaultRequired;
  return out;
}

export function emptyFormRules(): FormRulesMap {
  return {
    swimmer: defaultsFrom(SWIMMER_FORM_FIELDS),
    staff: defaultsFrom(STAFF_FORM_FIELDS),
  };
}

function overlayKind(
  fields: FormFieldDef[],
  incoming: unknown,
  defaults: Record<string, boolean>,
) {
  const next = { ...defaults };
  const raw = incoming && typeof incoming === 'object' ? (incoming as Record<string, unknown>) : {};
  for (const field of fields) {
    if (field.locked) {
      next[field.key] = true;
      continue;
    }
    if (field.key in raw) next[field.key] = raw[field.key] === true;
  }
  return next;
}

export function mergeFormRules(raw: unknown): FormRulesMap {
  const base = emptyFormRules();
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    swimmer: overlayKind(SWIMMER_FORM_FIELDS, body.swimmer, base.swimmer),
    staff: overlayKind(STAFF_FORM_FIELDS, body.staff, base.staff),
  };
}

export function isFormFieldRequired(rules: FormRulesMap, kind: FormKind, key: string) {
  return rules[kind]?.[key] === true;
}

export function useFormFieldRequired(kind: FormKind) {
  const [rules, setRules] = useState<FormRulesMap>(() => emptyFormRules());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/form-info')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load form info');
        return body;
      })
      .then((body) => {
        if (!cancelled) setRules(mergeFormRules(body));
      })
      .catch(() => {
        if (!cancelled) setRules(emptyFormRules());
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return (key: string) => isFormFieldRequired(rules, kind, key);
}
