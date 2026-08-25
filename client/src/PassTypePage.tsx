import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { useT } from './i18n';
import { InPageSelect } from './InPageSelect';
import { PlatformPage } from './PlatformPage';

type PassType = {
  id: number;
  passName: string;
  forAudience: string;
  duration: string;
  passCharges: number;
  coachingCharges: number;
  coach: string;
  testRequired: boolean;
  maxSwimmersPerCoach: number | null;
  exceedingLimitAllowed: boolean;
  isOffer: boolean;
  offerStartDate: string | null;
  offerEndDate: string | null;
};

type PassForm = {
  passName: string;
  forOptions: string[];
  durationValue: string;
  durationUnit: string;
  passCharges: string;
  coachingCharges: string;
  coach: string;
  testRequired: boolean;
  maxSwimmersPerCoach: string;
  exceedingLimitAllowed: 'Yes' | 'No';
  isOffer: 'Yes' | 'No';
  offerStartDate: string;
  offerEndDate: string;
};

const FOR_OPTIONS = ['Walking', 'Swimming', 'Competitive', 'Water Polo'] as const;

const DURATION_UNITS = ['Day', 'Week', 'Month', 'Year'] as const;

const emptyForm: PassForm = {
  passName: '',
  forOptions: ['Swimming'],
  durationValue: '1',
  durationUnit: 'Month',
  passCharges: '',
  coachingCharges: '',
  coach: 'Not Required',
  testRequired: false,
  maxSwimmersPerCoach: 'No Limit',
  exceedingLimitAllowed: 'Yes',
  isOffer: 'No',
  offerStartDate: '',
  offerEndDate: '',
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

type PaymentBasis = 'pass' | 'month' | 'day';

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

function passTypeCoachChoice(coach: string) {
  const value = String(coach ?? '').trim() || 'Not Required';
  if (value === 'Not Required' || value === 'Any') return value;
  return 'Any';
}

export function PassTypePage() {
  const t = useT();
  const [items, setItems] = useState<PassType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PassForm>(() => createEmptyForm());
  const [paymentBasis, setPaymentBasis] = useState<PaymentBasis>('month');
  const [basisLoading, setBasisLoading] = useState(true);
  const [basisSaving, setBasisSaving] = useState(false);
  const [basisError, setBasisError] = useState('');

  const coachSelectOptions = useMemo(
    () => [
      { value: 'Not Required', label: t('Not Required') },
      { value: 'Any', label: t('Any') },
    ],
    [t],
  );
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
    if (isApplicationDemo()) {
      setBasisLoading(false);
    } else {
      void fetch('/api/pass-types/payment-calculation')
        .then(async (res) => {
          if (!res.ok) throw new Error(await readApiError(res, 'Failed to load'));
          return res.json() as Promise<{ basis?: PaymentBasis }>;
        })
        .then((body) => {
          if (body.basis === 'pass' || body.basis === 'day' || body.basis === 'month') {
            setPaymentBasis(body.basis);
          }
        })
        .catch((err) =>
          setBasisError(err instanceof Error ? err.message : 'Failed to load payment calculation'),
        )
        .finally(() => setBasisLoading(false));
    }
  }, []);

  async function savePaymentBasis(basis: PaymentBasis) {
    if (basis === paymentBasis || basisSaving) return;
    const previous = paymentBasis;
    setPaymentBasis(basis);
    setBasisSaving(true);
    setBasisError('');
    try {
      if (isApplicationDemo()) return;
      const res = await fetch('/api/pass-types/payment-calculation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basis }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to save'));
    } catch (err) {
      setPaymentBasis(previous);
      setBasisError(err instanceof Error ? err.message : 'Failed to save payment calculation');
    } finally {
      setBasisSaving(false);
    }
  }

  function updateForOptions(option: string) {
    setForm({
      ...form,
      forOptions: toggleForOption(form.forOptions, option),
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
      coach: passTypeCoachChoice(item.coach),
      testRequired: Boolean(item.testRequired),
      maxSwimmersPerCoach: formatMaxSwimmers(item.maxSwimmersPerCoach),
      exceedingLimitAllowed: item.exceedingLimitAllowed === false ? 'No' : 'Yes',
      isOffer: item.isOffer ? 'Yes' : 'No',
      offerStartDate: item.offerStartDate ?? '',
      offerEndDate: item.offerEndDate ?? '',
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
      form.isOffer === 'Yes' &&
      form.offerStartDate &&
      form.offerEndDate &&
      form.offerEndDate < form.offerStartDate
    ) {
      setError('Offer end date must be on or after the start date');
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
        testRequired: form.coach === 'Not Required' && form.testRequired,
        maxSwimmersPerCoach: maxSwimmers,
        exceedingLimitAllowed: form.exceedingLimitAllowed === 'Yes',
        isOffer: form.isOffer === 'Yes',
        offerStartDate: form.isOffer === 'Yes' ? form.offerStartDate : null,
        offerEndDate: form.isOffer === 'Yes' ? form.offerEndDate : null,
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
                  <span data-label="Coach">{t(passTypeCoachChoice(item.coach))}</span>
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

      <section className="pass-form-card payment-calculation-card">
        <h2>{t('Payment calculation')}</h2>
        <p className="muted">
          {t('Select how coaching charges should be calculated on the Coach Payment page.')}
        </p>
        <div className="staff-role-radios" role="radiogroup" aria-label={t('Payment calculation')}>
          {(
            [
              ['pass', 'Pass basis'],
              ['month', 'Month basis'],
              ['day', 'Day basis'],
            ] as const
          ).map(([value, label]) => (
            <label
              className={`staff-role-option${paymentBasis === value ? ' selected' : ''}`}
              key={value}
            >
              <input
                type="radio"
                name="coachPaymentBasis"
                checked={paymentBasis === value}
                disabled={basisLoading || basisSaving}
                onChange={() => void savePaymentBasis(value)}
              />
              {t(label)}
            </label>
          ))}
        </div>
        {basisLoading ? <p className="muted">{t('Loading…')}</p> : null}
        {basisError ? <p className="error">{t(basisError)}</p> : null}
      </section>

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
                    testRequired: coach === 'Not Required' ? form.testRequired : false,
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
            ) : (
              <label className="pass-test-required">
                <input
                  type="checkbox"
                  checked={form.testRequired}
                  onChange={(e) => setForm({ ...form, testRequired: e.target.checked })}
                />
                <span>{t('Test required')}</span>
              </label>
            )}
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

          <div className="pass-offer-section">
            <div className="pass-inline-field pass-offer-choice">
              <span className="pass-option-label">{t('Is this an offer?')}</span>
              <div className="pass-yes-no" role="radiogroup" aria-label={t('Is this an offer?')}>
                {(['Yes', 'No'] as const).map((option) => (
                  <label key={option} className="pass-yes-no-option">
                    <input
                      type="radio"
                      name="isOffer"
                      value={option}
                      checked={form.isOffer === option}
                      onChange={() =>
                        setForm({
                          ...form,
                          isOffer: option,
                          offerStartDate: option === 'Yes' ? form.offerStartDate : '',
                          offerEndDate: option === 'Yes' ? form.offerEndDate : '',
                        })
                      }
                    />
                    <span>{t(option)}</span>
                  </label>
                ))}
              </div>
            </div>

            {form.isOffer === 'Yes' ? (
              <div className="pass-offer-dates">
                <label className="pass-inline-field">
                  <span className="pass-option-label">
                    {t('Offer start date')} <span className="req">*</span>
                  </span>
                  <input
                    type="date"
                    value={form.offerStartDate}
                    onChange={(e) => setForm({ ...form, offerStartDate: e.target.value })}
                    required
                  />
                </label>
                <label className="pass-inline-field">
                  <span className="pass-option-label">
                    {t('Offer end date')} <span className="req">*</span>
                  </span>
                  <input
                    type="date"
                    min={form.offerStartDate || undefined}
                    value={form.offerEndDate}
                    onChange={(e) => setForm({ ...form, offerEndDate: e.target.value })}
                    required
                  />
                </label>
              </div>
            ) : null}
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
