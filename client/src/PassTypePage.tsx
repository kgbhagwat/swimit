import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { useT } from './i18n';
import { InPageSelect } from './InPageSelect';
import { PlatformPage } from './PlatformPage';
import { PassVerificationCard } from './PassVerificationCard';
import { WhatsAppChargesCard } from './WhatsAppChargesCard';

type PassType = {
  id: number;
  passName: string;
  forAudience: string;
  duration: string;
  passCharges: number;
  coachingCharges: number;
  coach: string;
  maxSwimmersPerCoach: number | null;
  exceedingLimitAllowed: boolean;
};

type PassForm = {
  passName: string;
  forOptions: string[];
  durationValue: string;
  durationUnit: string;
  passCharges: string;
  coachingCharges: string;
  coach: string;
  maxSwimmersPerCoach: string;
  exceedingLimitAllowed: 'Yes' | 'No';
};

const FOR_OPTIONS = ['Walking', 'Swimming', 'Competitive'] as const;

const DURATION_UNITS = ['Day', 'Week', 'Month', 'Year'] as const;

const emptyForm: PassForm = {
  passName: '',
  forOptions: ['Swimming'],
  durationValue: '1',
  durationUnit: 'Month',
  passCharges: '',
  coachingCharges: '',
  coach: 'Not Required',
  maxSwimmersPerCoach: 'No Limit',
  exceedingLimitAllowed: 'Yes',
};

/** Application preview starts with no pre-selected options. */
function createEmptyForm(): PassForm {
  if (!isApplicationDemo()) return { ...emptyForm };
  return {
    ...emptyForm,
    forOptions: [],
    passCharges: '',
    coachingCharges: '',
  };
}

type CoachOption = {
  name: string;
  teachStrokes: string[];
};

const STROKE_FILTER_OPTIONS = [
  'Free Style',
  'Back Stroke',
  'Breast Stroke',
  'Butterfly',
  'Competitive',
] as const;

function formatMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatMaxSwimmers(value: number | null | undefined) {
  if (value == null || Number.isNaN(value) || value <= 0) return 'No Limit';
  return String(value);
}

function parseMaxSwimmersInput(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed || /^no\s*limit$/i.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num <= 0) return 'invalid';
  return num;
}

async function readApiError(res: Response, fallback: string) {
  const raw = await res.text();
  let body: { error?: unknown } = {};
  try {
    body = raw ? (JSON.parse(raw) as { error?: unknown }) : {};
  } catch {
    /* HTML / empty proxy error */
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  return res.status ? `${fallback} (${res.status})` : fallback;
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function splitList(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDuration(duration: string) {
  const match = duration.trim().match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  if (!match) {
    return { durationValue: '1', durationUnit: 'Month' };
  }
  const unitRaw = match[2];
  const unit =
    DURATION_UNITS.find((u) => u.toLowerCase() === unitRaw.toLowerCase()) ?? 'Day';
  return { durationValue: match[1], durationUnit: unit };
}

function toggleForOption(current: string[], option: string): string[] {
  if (current.includes(option)) return current.filter((item) => item !== option);
  return [...current, option];
}

function selectedStrokeFilters(forOptions: string[]) {
  if (forOptions.includes('Any Stroke')) return [...STROKE_FILTER_OPTIONS];
  return forOptions.filter((option) =>
    (STROKE_FILTER_OPTIONS as readonly string[]).includes(option),
  );
}

function coachesForSelection(coaches: CoachOption[], forOptions: string[]) {
  const strokes = selectedStrokeFilters(forOptions);
  if (strokes.length === 0) {
    return coaches.map((coach) => coach.name);
  }
  return coaches
    .filter((coach) => strokes.some((stroke) => coach.teachStrokes.includes(stroke)))
    .map((coach) => coach.name);
}

export function PassTypePage() {
  const t = useT();
  const [items, setItems] = useState<PassType[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PassForm>(() => createEmptyForm());

  const coachSelectOptions = useMemo(() => {
    const matching = coachesForSelection(coaches, form.forOptions);
    return [
      { value: 'Not Required', label: t('Not Required') },
      { value: 'Any', label: t('Any') },
      ...matching.map((name) => ({ value: name, label: name })),
    ];
  }, [coaches, form.forOptions, t]);
  const durationUnitOptions = useMemo(
    () => DURATION_UNITS.map((unit) => ({ value: unit, label: t(unit) })),
    [t],
  );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pass-types');
      if (!res.ok) throw new Error('Failed to load pass types');
      const data = (await res.json()) as PassType[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void fetch('/api/staff-registrations')
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (
          rows: Array<{
            registration_for?: string;
            full_name?: string;
            teach_strokes?: string[] | null;
          }>,
        ) => {
          const byName = new Map<string, CoachOption>();
          for (const row of rows) {
            if (row.registration_for !== 'Coach' || !row.full_name?.trim()) continue;
            const name = row.full_name.trim();
            const teachStrokes = Array.isArray(row.teach_strokes) ? row.teach_strokes : [];
            const existing = byName.get(name);
            if (existing) {
              byName.set(name, {
                name,
                teachStrokes: [...new Set([...existing.teachStrokes, ...teachStrokes])],
              });
            } else {
              byName.set(name, { name, teachStrokes });
            }
          }
          setCoaches([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
        },
      )
      .catch(() => setCoaches([]));
  }, []);

  function updateForOptions(option: string) {
    const forOptions = toggleForOption(form.forOptions, option);
    const nextCoaches = coachesForSelection(coaches, forOptions);
    const coachStillValid =
      form.coach === 'Not Required' ||
      form.coach === 'Any' ||
      nextCoaches.includes(form.coach);
    setForm({
      ...form,
      forOptions,
      coach: coachStillValid ? form.coach : 'Not Required',
      coachingCharges:
        coachStillValid && form.coach !== 'Not Required' ? form.coachingCharges : '',
    });
  }

  function openEdit(item: PassType) {
    const { durationValue, durationUnit } = parseDuration(item.duration);
    const forOptions = splitList(item.forAudience).filter((option) =>
      (FOR_OPTIONS as readonly string[]).includes(option),
    );
    setEditingId(item.id);
    setForm({
      passName: item.passName,
      forOptions: forOptions.length > 0 ? forOptions : ['Swimming'],
      durationValue,
      durationUnit,
      passCharges: String(item.passCharges),
      coachingCharges: String(item.coachingCharges),
      coach: item.coach || 'Not Required',
      maxSwimmersPerCoach: formatMaxSwimmers(item.maxSwimmersPerCoach),
      exceedingLimitAllowed: item.exceedingLimitAllowed === false ? 'No' : 'Yes',
    });
    setError('');
  }

  function closeForm() {
    setEditingId(null);
    setForm(createEmptyForm());
    setError('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.forOptions.length === 0) {
      setError('Select at least one option under For');
      return;
    }
    if (form.coach !== 'Not Required') {
      const coaching = Number(form.coachingCharges);
      if (!String(form.coachingCharges).trim() || Number.isNaN(coaching) || coaching < 0) {
        setError('Enter coaching charges when Coach is selected');
        return;
      }
    }
    const maxSwimmers = parseMaxSwimmersInput(form.maxSwimmersPerCoach);
    if (maxSwimmers === 'invalid') {
      setError('Max swimmers must be a positive number or No Limit');
      return;
    }
    const passCharges = Number(form.passCharges);
    const coachingCharges = Number(form.coachingCharges || 0);
    if (Number.isNaN(passCharges) || passCharges < 0) {
      setError('Pass charges are required');
      return;
    }
    if (
      form.coach !== 'Not Required' &&
      !Number.isNaN(coachingCharges) &&
      coachingCharges >= passCharges &&
      !(passCharges === 0 && coachingCharges === 0)
    ) {
      setError('Coaching charges must be less than pass charges');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        passName: form.passName.trim(),
        forAudience: form.forOptions.join(', '),
        prerequisite: 'None',
        duration: `${form.durationValue} ${form.durationUnit}`,
        passCharges,
        coachingCharges: form.coach === 'Not Required' ? 0 : coachingCharges,
        coach: form.coach.trim() || 'Not Required',
        maxSwimmersPerCoach: maxSwimmers,
        exceedingLimitAllowed: form.exceedingLimitAllowed === 'Yes',
      };
      const res = await fetch(editingId ? `/api/pass-types/${editingId}` : '/api/pass-types', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to save'));
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm(t('Delete this pass type?'))) return;
    setError('');
    try {
      const res = await fetch(`/api/pass-types/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to delete'));
      }
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  function translateList(value: string) {
    return splitList(value)
      .map((part) => t(part))
      .join(', ');
  }

  return (
    <PlatformPage title="Pass Type">
      <p className="lede batch-list-lede">
        {items.length}{' '}
        {items.length === 1 ? t('pass type') : t('pass types')}
      </p>

      <section className="pass-table-card">
        <div className="pass-table-head">
          <span>{t('Pass name')}</span>
          <span>{t('For')}</span>
          <span>{t('Duration')}</span>
          <span>{t('Pass Charges')}</span>
          <span>{t('Coaching Charges')}</span>
          <span>{t('Coach')}</span>
          <span>{t('Actions')}</span>
        </div>

        {loading ? (
          <p className="pass-empty">{t('Loading…')}</p>
        ) : items.length === 0 ? (
          <p className="pass-empty">
            {t('No pass types defined yet. Add one using the form below.')}
          </p>
        ) : (
          <div className="pass-table-body">
            {items.map((item, index) => (
              <div className={`pass-row pass-row-tone-${index % 4}`} key={item.id}>
                <div className="pass-block-row">
                  <strong data-label="Pass name">{item.passName}</strong>
                  <span data-label="For">{translateList(item.forAudience)}</span>
                  <span data-label="Duration">{item.duration}</span>
                </div>
                <div className="pass-block-row">
                  <span data-label="Pass Charges">{formatMoney(item.passCharges)}</span>
                  <span data-label="Coaching Charges">{formatMoney(item.coachingCharges)}</span>
                  <span data-label="Coach">{t(item.coach || 'Not Required')}</span>
                  <span className="pass-actions" data-label="Actions">
                    <button
                      type="button"
                      className="accounts-icon-btn accounts-icon-edit"
                      onClick={() => openEdit(item)}
                      aria-label={`${t('Edit')} ${item.passName}`}
                      title={t('Edit')}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="accounts-icon-btn accounts-icon-delete"
                      onClick={() => onDelete(item.id)}
                      aria-label={`${t('Delete')} ${item.passName}`}
                      title={t('Delete')}
                    >
                      <DeleteIcon />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <PassVerificationCard />

      <WhatsAppChargesCard />

      <section className="pass-form-card pool-core-form" aria-labelledby="pass-form-title">
        <form className="pass-form" onSubmit={onSubmit}>
          <h2 id="pass-form-title">
            {editingId ? t('Edit pass type') : t('Add pass type')}
          </h2>
          <label className="pass-name-field">
            <span className="pass-option-label">
              {t('Pass name')} <span className="req">*</span>
            </span>
            <input
              value={form.passName}
              onChange={(e) => setForm({ ...form, passName: e.target.value })}
              placeholder={t('e.g. General, Level 1, Level 2, Competitive etc')}
              required
              aria-label={t('Pass name')}
            />
          </label>

          <div className="pass-option-row">
            <span className="pass-option-label">{t('For')}</span>
            <div className="pass-check-rows">
              <div className="pass-check-row">
                {FOR_OPTIONS.map((option) => (
                  <label className="pass-check" key={option}>
                    <input
                      type="checkbox"
                      checked={form.forOptions.includes(option)}
                      onChange={() => updateForOptions(option)}
                    />
                    <span>{t(option)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="pass-coach-row">
            <div className="pass-inline-field pass-coach-field">
              <span className="pass-option-label">{t('Coach')}</span>
              <InPageSelect
                value={form.coach}
                onChange={(coach) => {
                  setForm({
                    ...form,
                    coach,
                    coachingCharges: coach === 'Not Required' ? '' : form.coachingCharges,
                    maxSwimmersPerCoach:
                      coach === 'Not Required' ? 'No Limit' : form.maxSwimmersPerCoach,
                    exceedingLimitAllowed:
                      coach === 'Not Required' ? 'Yes' : form.exceedingLimitAllowed,
                  });
                }}
                options={coachSelectOptions}
                required
                aria-label={t('Coach')}
              />
            </div>

            {form.coach !== 'Not Required' ? (
              <>
                <div className="pass-inline-field pass-max-swimmers-field">
                  <span className="pass-option-label pass-option-label-wide">
                    {t('Max no of swimmers in a batch per coach')}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.maxSwimmersPerCoach}
                    onFocus={(e) => {
                      if (/^no\s*limit$/i.test(e.target.value.trim())) {
                        e.target.select();
                      }
                    }}
                    onChange={(e) => setForm({ ...form, maxSwimmersPerCoach: e.target.value })}
                    onBlur={() => {
                      const parsed = parseMaxSwimmersInput(form.maxSwimmersPerCoach);
                      if (parsed === null || !form.maxSwimmersPerCoach.trim()) {
                        setForm({ ...form, maxSwimmersPerCoach: 'No Limit' });
                      } else if (parsed !== 'invalid') {
                        setForm({ ...form, maxSwimmersPerCoach: formatMaxSwimmers(parsed) });
                      }
                    }}
                    placeholder={t('No Limit')}
                    aria-label={t('Max no of swimmers in a batch per coach')}
                  />
                </div>

                <div className="pass-inline-field pass-exceed-limit-field">
                  <span className="pass-option-label pass-option-label-wide">
                    {t('Is Exceeding this limit allowed?')}
                  </span>
                  <div
                    className="pass-yes-no"
                    role="radiogroup"
                    aria-label={t('Is Exceeding this limit allowed?')}
                  >
                    {(['Yes', 'No'] as const).map((option) => (
                      <label key={option} className="pass-yes-no-option">
                        <input
                          type="radio"
                          name="exceedingLimitAllowed"
                          value={option}
                          checked={form.exceedingLimitAllowed === option}
                          onChange={() => setForm({ ...form, exceedingLimitAllowed: option })}
                        />
                        <span>{t(option)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="pass-charges-row">
            <div className="pass-inline-field">
              <span className="pass-option-label">{t('Duration')}</span>
              <div className="duration-inputs">
                <input
                  type="number"
                  min={1}
                  value={form.durationValue}
                  onChange={(e) => setForm({ ...form, durationValue: e.target.value })}
                  required
                  aria-label={t('Duration value')}
                />
                <InPageSelect
                  value={form.durationUnit}
                  onChange={(durationUnit) => setForm({ ...form, durationUnit })}
                  options={durationUnitOptions}
                  required
                  aria-label={t('Duration unit')}
                />
              </div>
            </div>

            <div className="pass-inline-field">
              <span className="pass-option-label">{t('Pass Charges')}</span>
              <div className="money-input">
                <span className="money-prefix" aria-hidden="true">
                  ₹
                </span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={form.passCharges}
                  onChange={(e) => setForm({ ...form, passCharges: e.target.value })}
                  placeholder={t('e.g. 1500')}
                  required
                  aria-label={t('Pass charges')}
                />
              </div>
            </div>
          </div>

          {form.coach !== 'Not Required' ? (
            <div className="pass-charges-row pass-coaching-charges-row">
              <div className="pass-inline-field">
                <span className="pass-option-label pass-option-label-wide">
                  {t('Coaching Charges')} <span className="req">*</span>
                </span>
                <div className="money-input">
                  <span className="money-prefix" aria-hidden="true">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.coachingCharges}
                    onChange={(e) => setForm({ ...form, coachingCharges: e.target.value })}
                    placeholder={t('e.g. 400')}
                    required
                    aria-label={t('Coaching charges')}
                  />
                </div>
                <span className="pass-coach-charges-note">
                  {t('(It should be part of pass charges)')}
                </span>
              </div>
            </div>
          ) : null}

          {error ? <p className="error">{t(error)}</p> : null}

          <div className="pass-form-actions">
            <button type="button" className="pass-cancel" onClick={closeForm}>
              {t('Cancel')}
            </button>
            <button type="submit" className="submit" disabled={saving}>
              {saving ? t('Saving…') : t('Save Pass')}
            </button>
          </div>
        </form>
      </section>
    </PlatformPage>
  );
}
