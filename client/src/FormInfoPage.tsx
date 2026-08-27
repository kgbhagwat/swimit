import { FormEvent, useEffect, useState } from 'react';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import {
  emptyFormRules,
  mergeFormRules,
  STAFF_FORM_FIELDS,
  SWIMMER_FORM_FIELDS,
  type FormFieldDef,
  type FormKind,
  type FormRulesMap,
} from './formInfo';

function FieldRow({
  field,
  required,
  onToggle,
}: {
  field: FormFieldDef;
  required: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <div className={`form-info-row${field.locked ? ' is-locked' : ''}`}>
      <div className="form-info-row-copy">
        <strong>{t(field.label)}</strong>
        {field.hint ? <span>{t(field.hint)}</span> : null}
        {field.locked ? <span>{t('This field is always required.')}</span> : null}
      </div>
      <label className={`status-switch form-info-switch${required ? ' is-on' : ''}`}>
        <span className={required ? 'status-on' : 'status-off'}>
          {required ? t('Mandatory') : t('Optional')}
        </span>
        <input
          type="checkbox"
          checked={required}
          disabled={field.locked}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`${t(field.label)} ${t('Mandatory')}`}
        />
      </label>
    </div>
  );
}

function FieldList({
  kind,
  fields,
  rules,
  onToggle,
}: {
  kind: FormKind;
  fields: FormFieldDef[];
  rules: FormRulesMap;
  onToggle: (kind: FormKind, key: string, next: boolean) => void;
}) {
  return (
    <div className="form-info-list">
      {fields.map((field) => (
        <FieldRow
          key={`${kind}-${field.key}`}
          field={field}
          required={rules[kind][field.key] === true}
          onToggle={(next) => onToggle(kind, field.key, next)}
        />
      ))}
    </div>
  );
}

export function FormInfo() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rules, setRules] = useState<FormRulesMap>(emptyFormRules);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/form-info');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load form info');
        if (!cancelled) setRules(mergeFormRules(body));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load form info');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function onToggle(kind: FormKind, key: string, next: boolean) {
    setSuccess('');
    setRules((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [key]: next },
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/form-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save form info');
      setRules(mergeFormRules(body));
      setSuccess('Form info saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save form info');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformPage
      title="Form Info"
      actions={
        <button type="submit" className="submit" form="form-info-form" disabled={saving || loading}>
          {saving ? t('Saving…') : t('Save')}
        </button>
      }
    >
      <p className="lede batch-list-lede">
        {t('Choose which fields must be filled on registration forms.')}
      </p>
      {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
      {error ? <p className="error">{t(error)}</p> : null}
      {success ? <p className="success">{t(success)}</p> : null}

      {!loading ? (
        <form id="form-info-form" className="form-info-page" onSubmit={onSubmit}>
          <section className="pass-form-card pool-core-form form-info-pane">
            <h2>{t('Swimmer registration')}</h2>
            <FieldList kind="swimmer" fields={SWIMMER_FORM_FIELDS} rules={rules} onToggle={onToggle} />
          </section>
          <section className="pass-form-card pool-core-form form-info-pane">
            <h2>{t('Staff registration')}</h2>
            <FieldList kind="staff" fields={STAFF_FORM_FIELDS} rules={rules} onToggle={onToggle} />
          </section>
        </form>
      ) : null}
    </PlatformPage>
  );
}
