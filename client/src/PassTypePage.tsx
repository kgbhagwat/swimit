import { FormEvent, useEffect, useState } from 'react';
import { MenuBackLink } from './MenuBackLink';

type PassType = {
  id: number;
  passName: string;
  forAudience: string;
  prerequisite: string;
  duration: string;
  passCharges: number;
  coachingCharges: number;
  coach: string;
};

type PassForm = {
  passName: string;
  forOptions: string[];
  prerequisites: string[];
  durationValue: string;
  durationUnit: string;
  passCharges: string;
  coachingCharges: string;
  coach: string;
};

const FOR_OPTIONS = [
  'Swimming',
  'Free Style',
  'Back Stroke',
  'Breast Stroke',
  'Butterfly',
  'Any Stroke',
  'Competitive',
] as const;

const PREREQ_OPTIONS = [
  'Free Style',
  'Back Stroke',
  'Breast Stroke',
  'Butterfly',
  'Any Stroke',
  'Nothing',
] as const;

const DURATION_UNITS = ['Day', 'Week', 'Month', 'Year'] as const;

const emptyForm: PassForm = {
  passName: '',
  forOptions: ['Swimming'],
  prerequisites: ['Nothing'],
  durationValue: '30',
  durationUnit: 'Day',
  passCharges: '',
  coachingCharges: '',
  coach: 'Not Required',
};

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

function splitList(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDuration(duration: string) {
  const match = duration.trim().match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  if (!match) {
    return { durationValue: '30', durationUnit: 'Day' };
  }
  const unitRaw = match[2];
  const unit =
    DURATION_UNITS.find((u) => u.toLowerCase() === unitRaw.toLowerCase()) ?? 'Day';
  return { durationValue: match[1], durationUnit: unit };
}

const STROKE_OPTIONS = ['Free Style', 'Back Stroke', 'Breast Stroke', 'Butterfly'] as const;

function toggleForOption(current: string[], option: string): string[] {
  const has = current.includes(option);
  if (option === 'Any Stroke') {
    if (has) return current.filter((item) => item !== option);
    return [
      ...current.filter(
        (item) => !(STROKE_OPTIONS as readonly string[]).includes(item) && item !== 'Any Stroke',
      ),
      'Any Stroke',
    ];
  }
  if ((STROKE_OPTIONS as readonly string[]).includes(option)) {
    const withoutAny = current.filter((item) => item !== 'Any Stroke');
    if (has) return withoutAny.filter((item) => item !== option);
    return [...withoutAny, option];
  }
  if (has) return current.filter((item) => item !== option);
  return [...current, option];
}

function togglePrerequisite(current: string[], option: string): string[] {
  const has = current.includes(option);
  if (option === 'Nothing') {
    return has ? [] : ['Nothing'];
  }
  if (option === 'Any Stroke') {
    return has ? [] : ['Any Stroke'];
  }
  const withoutExclusive = current.filter(
    (item) => item !== 'Nothing' && item !== 'Any Stroke',
  );
  if (has) return withoutExclusive.filter((item) => item !== option);
  return [...withoutExclusive, option];
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
  const [items, setItems] = useState<PassType[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PassForm>(emptyForm);

  const matchingCoaches = coachesForSelection(coaches, form.forOptions);

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

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError('');
  }

  function openEdit(item: PassType) {
    const { durationValue, durationUnit } = parseDuration(item.duration);
    setEditingId(item.id);
    setForm({
      passName: item.passName,
      forOptions: splitList(item.forAudience),
      prerequisites: splitList(item.prerequisite),
      durationValue,
      durationUnit,
      passCharges: String(item.passCharges),
      coachingCharges: String(item.coachingCharges),
      coach: item.coach || 'Not Required',
    });
    setFormOpen(true);
    setError('');
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.forOptions.length === 0) {
      setError('Select at least one option under For');
      return;
    }
    if (form.prerequisites.length === 0) {
      setError('Select at least one prerequisite');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        passName: form.passName.trim(),
        forAudience: form.forOptions.join(', '),
        prerequisite: form.prerequisites.join(', '),
        duration: `${form.durationValue} ${form.durationUnit}`,
        passCharges: Number(form.passCharges),
        coachingCharges: Number(form.coachingCharges || 0),
        coach: form.coach.trim() || 'Not Required',
      };
      const res = await fetch(editingId ? `/api/pass-types/${editingId}` : '/api/pass-types', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save');
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm('Delete this pass type?')) return;
    setError('');
    try {
      const res = await fetch(`/api/pass-types/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete');
      }
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <div className="pass-head">
        <div>
          <h1>Pass Type</h1>
          <p className="pass-count">
            {items.length} pass type{items.length === 1 ? '' : 's'}
          </p>
        </div>
        {!formOpen ? (
          <button type="button" className="submit" onClick={openCreate}>
            Add pass type
          </button>
        ) : null}
      </div>

      {formOpen ? (
        <section className="pass-form-card" aria-labelledby="pass-form-title">
          <h2 id="pass-form-title">{editingId ? 'Edit pass type' : 'Add pass type'}</h2>
          <form className="pass-form" onSubmit={onSubmit}>
            <label className="field">
              <span className="label">
                Pass name <span className="req">*</span>
              </span>
              <input
                value={form.passName}
                onChange={(e) => setForm({ ...form, passName: e.target.value })}
                placeholder="e.g. Beginners, Advanced, Ladies only"
                required
              />
            </label>

            <div className="pass-option-row">
              <span className="pass-option-label">For</span>
              <div className="pass-check-row">
                {FOR_OPTIONS.map((option) => (
                  <label className="pass-check" key={option}>
                    <input
                      type="checkbox"
                      checked={form.forOptions.includes(option)}
                      onChange={() => updateForOptions(option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pass-option-row">
              <span className="pass-option-label">Prerequisite</span>
              <div className="pass-check-row">
                {PREREQ_OPTIONS.map((option) => (
                  <label className="pass-check" key={option}>
                    <input
                      type="checkbox"
                      checked={form.prerequisites.includes(option)}
                      onChange={() =>
                        setForm({
                          ...form,
                          prerequisites: togglePrerequisite(form.prerequisites, option),
                        })
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pass-charges-row">
              <div className="pass-inline-field">
                <span className="pass-option-label">Duration</span>
                <div className="duration-inputs">
                  <input
                    type="number"
                    min={1}
                    value={form.durationValue}
                    onChange={(e) => setForm({ ...form, durationValue: e.target.value })}
                    required
                    aria-label="Duration value"
                  />
                  <select
                    value={form.durationUnit}
                    onChange={(e) => setForm({ ...form, durationUnit: e.target.value })}
                    aria-label="Duration unit"
                  >
                    {DURATION_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pass-inline-field">
                <span className="pass-option-label">Pass Charges</span>
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
                    placeholder="e.g. 1500"
                    required
                    aria-label="Pass charges"
                  />
                </div>
              </div>

              {form.coach !== 'Not Required' ? (
                <div className="pass-inline-field">
                  <span className="pass-option-label pass-option-label-wide">Coaching Charges</span>
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
                      placeholder="e.g. 2100"
                      aria-label="Coaching charges"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <label className="field">
              <span className="label">Coach</span>
              <select
                value={form.coach}
                onChange={(e) => {
                  const coach = e.target.value;
                  setForm({
                    ...form,
                    coach,
                    coachingCharges: coach === 'Not Required' ? '' : form.coachingCharges,
                  });
                }}
              >
                <option value="Not Required">Not Required</option>
                <option value="Any">Any</option>
                {matchingCoaches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {error && formOpen ? <p className="error">{error}</p> : null}

            <div className="pass-form-actions">
              <button type="button" className="pass-cancel" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" className="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save pass type'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!formOpen ? (
        <section className="pass-table-card">
          <div className="pass-table-head">
            <span>Pass name</span>
            <span>For</span>
            <span>Prerequisite</span>
            <span>Duration</span>
            <span>Pass Charges</span>
            <span>Coaching Charges</span>
            <span>Coach</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <p className="pass-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="pass-empty">No pass types defined yet. Use Add pass type to create one.</p>
          ) : (
            <div className="pass-table-body">
              {items.map((item) => (
                <div className="pass-row" key={item.id}>
                  <strong>{item.passName}</strong>
                  <span>{item.forAudience}</span>
                  <span>{item.prerequisite}</span>
                  <span>{item.duration}</span>
                  <span>{formatMoney(item.passCharges)}</span>
                  <span>{formatMoney(item.coachingCharges)}</span>
                  <span>{item.coach || 'Not Required'}</span>
                  <span className="pass-actions">
                    <button type="button" className="terms-link" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    <button type="button" className="remove-link" onClick={() => onDelete(item.id)}>
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {error && !formOpen ? <p className="error">{error}</p> : null}
    </div>
  );
}
