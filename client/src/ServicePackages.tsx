import { FormEvent, useEffect, useState } from 'react';
import { useT } from './i18n';
import { PlatformShell } from './PlatformShell';
import { PlatformPage } from './PlatformPage';
import { getPlatformSession } from './platformSession';

type ServicePackage = {
  id: number;
  packageName: string;
  description: string;
  price: number;
  discountedRate: number | null;
  billingPeriod: string;
  maxPools: number;
  maxUsers: number;
  maxActiveSwimmers: number | null;
  trialDays: number;
  modules: string;
  supportLevel: string;
  features: string;
  isActive: boolean;
};

type PackageForm = {
  packageName: string;
  description: string;
  price: string;
  discountedRate: string;
  billingPeriod: string;
  maxPools: string;
  maxUsers: string;
  maxActiveSwimmers: string;
  trialDays: string;
  modules: string;
  supportLevel: string;
  features: string;
  isActive: boolean;
};

const emptyForm: PackageForm = {
  packageName: '',
  description: '',
  price: '',
  discountedRate: '',
  billingPeriod: 'Month',
  maxPools: '1',
  maxUsers: '5',
  maxActiveSwimmers: '100',
  trialDays: '0',
  modules: 'core',
  supportLevel: 'whatsapp',
  features: '',
  isActive: true,
};

function formatMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

type PackageFeature = {
  label: string;
  level: 'core' | 'full';
};

const PACKAGE_FEATURES: PackageFeature[] = [
  { label: 'Registration & staff forms', level: 'core' },
  { label: 'Batches & pass types', level: 'core' },
  { label: 'Pass payment & scanner', level: 'core' },
  { label: "Swimmer list & attendance", level: 'core' },
  { label: 'Pool core info', level: 'core' },
  { label: 'Coach payment', level: 'full' },
  { label: 'Pool expenses', level: 'full' },
  { label: 'Balance sheet', level: 'full' },
  { label: 'Payment details', level: 'full' },
  { label: 'Holiday management', level: 'full' },
  { label: 'User management & access', level: 'full' },
  { label: 'WhatsApp Broadcast messaging', level: 'full' },
];

function packageHasFeature(modules: string, feature: PackageFeature, packageName?: string) {
  if (feature.level === 'core') return true;
  const level = String(modules ?? '').toLowerCase().trim();
  if (level === 'full') return true;
  // Professional & Enterprise are full-module plans even if an older DB row still says core.
  const name = String(packageName ?? '').toLowerCase().trim();
  return name === 'professional' || name === 'enterprise';
}

function FeatureTick({ on }: { on: boolean }) {
  const t = useT();
  return on ? (
    <span className="package-tick" aria-label={t('Included')}>
      ✓
    </span>
  ) : (
    <span className="package-tick-off" aria-label={t('Not included')}>
      —
    </span>
  );
}

export function ServicePackages() {
  const t = useT();
  const session = getPlatformSession();
  const canManagePackages = Boolean(
    session &&
      (session.isAccountAdmin || session.menuAccess.includes('service-packages')),
  );
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [form, setForm] = useState<PackageForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/service-packages');
      const body = await res.json().catch(() => []);
      if (!res.ok) throw new Error(body.error ?? 'Failed to load service packages');
      setPackages(Array.isArray(body) ? body : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service packages');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function setField<K extends keyof PackageForm>(key: K, value: PackageForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSuccess('');
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function startEdit(item: ServicePackage) {
    setEditingId(item.id);
    setForm({
      packageName: item.packageName,
      description: item.description,
      price: String(item.price),
      discountedRate:
        item.discountedRate != null && item.discountedRate > 0
          ? String(item.discountedRate)
          : '',
      billingPeriod: item.billingPeriod,
      maxPools: String(item.maxPools),
      maxUsers: String(item.maxUsers),
      maxActiveSwimmers: item.maxActiveSwimmers == null ? '' : String(item.maxActiveSwimmers),
      trialDays: String(item.trialDays ?? 0),
      modules: item.modules || 'core',
      supportLevel: item.supportLevel || 'whatsapp',
      features: item.features,
      isActive: item.isActive,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.packageName.trim()) {
      setError('Enter package name');
      return;
    }
    const price = Number(form.price);
    if (Number.isNaN(price) || price < 0) {
      setError('Enter a valid price');
      return;
    }
    const discountedRaw = form.discountedRate.trim();
    let discountedRate: number | null = null;
    if (discountedRaw !== '') {
      discountedRate = Number(discountedRaw);
      if (Number.isNaN(discountedRate) || discountedRate < 0) {
        setError('Enter a valid discounted rate');
        return;
      }
      if (discountedRate === 0) discountedRate = null;
      if (discountedRate != null && discountedRate > price) {
        setError('Discounted rate cannot be greater than price');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        packageName: form.packageName.trim(),
        description: form.description.trim(),
        price,
        discountedRate,
        billingPeriod: form.billingPeriod,
        maxPools: Number(form.maxPools) || 1,
        maxUsers: Number(form.maxUsers) || 5,
        maxActiveSwimmers: form.maxActiveSwimmers.trim() === '' ? null : Number(form.maxActiveSwimmers),
        trialDays: Number(form.trialDays) || 0,
        modules: form.modules,
        supportLevel: form.supportLevel,
        features: form.features.trim(),
        isActive: form.isActive,
      };
      const res = await fetch(
        editingId ? `/api/service-packages/${editingId}` : '/api/service-packages',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save service package');
      setSuccess(editingId ? 'Service package updated.' : 'Service package created.');
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service package');
    } finally {
      setSaving(false);
    }
  }

  async function removePackage(id: number) {
    if (!window.confirm('Delete this service package?')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/service-packages/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete service package');
      }
      if (editingId === id) resetForm();
      setSuccess('Service package deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service package');
    }
  }

  return (
    <PlatformShell>
      <PlatformPage
        title="Service packages"
        className="service-packages-page"
        actions={
          canManagePackages ? (
            <button type="button" className="submit" onClick={startCreate}>
              {t('Create package')}
            </button>
          ) : undefined
        }
      >
        {error ? <p className="error">{t(error)}</p> : null}
        {success ? <p className="success">{t(success)}</p> : null}

        {canManagePackages && showForm ? (
          <form className="pass-form-card service-packages-form" onSubmit={onSubmit}>
            <h2>{editingId ? t('Edit package') : t('New package')}</h2>

            <label className="field">
              <span className="label">
                {t('Package name')} <span className="req">*</span>
              </span>
              <input
                value={form.packageName}
                onChange={(e) => setField('packageName', e.target.value)}
                placeholder={t('e.g. Trial, Starter, Professional')}
                required
              />
            </label>

            <label className="field">
              <span className="label">{t('Description')}</span>
              <textarea
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder={t('Short summary of what this plan includes')}
                rows={3}
              />
            </label>

            <div className="form-grid-2">
              <label className="field">
                <span className="label">
                  {t('Price (₹)')} <span className="req">*</span>
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setField('price', e.target.value)}
                  placeholder="0"
                  required
                />
              </label>

              <label className="field">
                <span className="label">{t('Discounted rate (₹)')}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.discountedRate}
                  onChange={(e) => setField('discountedRate', e.target.value)}
                  placeholder={t('Blank = no discount')}
                />
              </label>

              <label className="field">
                <span className="label">
                  {t('Billing period')} <span className="req">*</span>
                </span>
                <select
                  value={form.billingPeriod}
                  onChange={(e) => setField('billingPeriod', e.target.value)}
                >
                  <option value="Month">{t('Month')}</option>
                  <option value="Year">{t('Year')}</option>
                </select>
              </label>

              <label className="field">
                <span className="label">Max active swimmers</span>
                <input
                  type="number"
                  min={0}
                  value={form.maxActiveSwimmers}
                  onChange={(e) => setField('maxActiveSwimmers', e.target.value)}
                  placeholder={t('Blank = unlimited')}
                />
              </label>

              <label className="field">
                <span className="label">{t('Max users')}</span>
                <input
                  type="number"
                  min={1}
                  value={form.maxUsers}
                  onChange={(e) => setField('maxUsers', e.target.value)}
                />
              </label>

              <label className="field">
                <span className="label">{t('Trial days')}</span>
                <input
                  type="number"
                  min={0}
                  value={form.trialDays}
                  onChange={(e) => setField('trialDays', e.target.value)}
                  placeholder={t('0 = paid plan')}
                />
              </label>

              <label className="field">
                <span className="label">{t('Modules')}</span>
                <select value={form.modules} onChange={(e) => setField('modules', e.target.value)}>
                  <option value="core">{t('Core (ops)')}</option>
                  <option value="full">{t('Full (ops + finance)')}</option>
                </select>
              </label>

              <label className="field">
                <span className="label">{t('Support')}</span>
                <select
                  value={form.supportLevel}
                  onChange={(e) => setField('supportLevel', e.target.value)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="priority">{t('Priority')}</option>
                  <option value="onboarding">{t('Onboarding')}</option>
                </select>
              </label>

              <label className="field">
                <span className="label">{t('Max pools')}</span>
                <input
                  type="number"
                  min={1}
                  value={form.maxPools}
                  onChange={(e) => setField('maxPools', e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span className="label">{t('Features (optional override)')}</span>
              <textarea
                value={form.features}
                onChange={(e) => setField('features', e.target.value)}
                placeholder={t('Leave blank to auto-fill from swimmers / modules / support')}
                rows={2}
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setField('isActive', e.target.checked)}
              />
              <span>{t('Active (available for new accounts)')}</span>
            </label>

            <div className="submit-wrap">
              <button type="button" className="ghost-btn" onClick={resetForm}>
                {t('Cancel')}
              </button>
              <button type="submit" className="submit" disabled={saving}>
                {saving ? t('Saving…') : editingId ? t('Update package') : t('Create package')}
              </button>
            </div>
          </form>
        ) : null}

        <section className="pass-table-card service-packages-card">
          {loading ? (
            <p className="muted">{t('Loading…')}</p>
          ) : packages.length === 0 ? (
            <p className="pass-empty">
              {canManagePackages ? (
                <>
                  {t('No service packages yet.')}{' '}
                  <button type="button" className="terms-link" onClick={startCreate}>
                    {t('Create the first SwimIT plan')}
                  </button>
                  .
                </>
              ) : (
                t('No service packages yet.')
              )}
            </p>
          ) : (
            <div className="batch-saved-table-wrap package-compare-wrap">
              <table className="batch-saved-table package-compare-table">
                <thead>
                  <tr>
                    <th scope="col" className="package-compare-label-col">
                      {t('Field')}
                    </th>
                    {packages.map((item) => (
                      <th key={item.id} scope="col" className="package-compare-col">
                        <strong className="batch-saved-name">{item.packageName}</strong>
                        {item.trialDays > 0 ? (
                          <div className="muted package-compare-sub">
                            {item.trialDays}-{t('day entry trial')}
                          </div>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{t('Description')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>{item.description || '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Price')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>
                        <strong>
                          {item.price === 0
                            ? t('Free')
                            : `${formatMoney(item.price)} / ${item.billingPeriod}`}
                        </strong>
                      </td>
                    ))}
                  </tr>
                  {packages.some(
                    (item) => item.discountedRate != null && item.discountedRate > 0,
                  ) ? (
                    <tr>
                      <th scope="row">{t('Discounted rate')}</th>
                      {packages.map((item) => (
                        <td key={item.id}>
                          {item.discountedRate != null && item.discountedRate > 0 ? (
                            <strong>
                              {formatMoney(item.discountedRate)} / {item.billingPeriod}
                            </strong>
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                  <tr>
                    <th scope="row">{t('Billing')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>{item.billingPeriod}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Max active swimmers')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>
                        {item.maxActiveSwimmers == null ? t('Unlimited') : item.maxActiveSwimmers}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Max users')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>{item.maxUsers}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Trial days')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>{item.trialDays > 0 ? item.trialDays : '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Max pools')}</th>
                    {packages.map((item) => (
                      <td key={item.id}>{item.maxPools}</td>
                    ))}
                  </tr>
                  <tr className="package-feature-section">
                    <th scope="row" colSpan={packages.length + 1}>
                      {t('Core features')}
                    </th>
                  </tr>
                  {PACKAGE_FEATURES.filter((f) => f.level === 'core').map((feature) => (
                    <tr key={feature.label} className="package-feature-row">
                      <th scope="row">{t(feature.label)}</th>
                      {packages.map((item) => (
                        <td key={item.id}>
                          <FeatureTick
                            on={packageHasFeature(item.modules, feature, item.packageName)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="package-feature-section">
                    <th scope="row" colSpan={packages.length + 1}>
                      {t('Full features')}
                    </th>
                  </tr>
                  {PACKAGE_FEATURES.filter((f) => f.level === 'full').map((feature) => (
                    <tr key={feature.label} className="package-feature-row">
                      <th scope="row">{t(feature.label)}</th>
                      {packages.map((item) => (
                        <td key={item.id}>
                          <FeatureTick
                            on={packageHasFeature(item.modules, feature, item.packageName)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {canManagePackages ? (
                    <tr>
                      <th scope="row">{t('Actions')}</th>
                      {packages.map((item) => (
                        <td key={item.id}>
                          <button type="button" className="menu-link" onClick={() => startEdit(item)}>
                            {t('Edit')}
                          </button>
                          {' · '}
                          <button
                            type="button"
                            className="remove-link"
                            onClick={() => void removePackage(item.id)}
                          >
                            {t('Delete')}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </PlatformPage>
    </PlatformShell>
  );
}
