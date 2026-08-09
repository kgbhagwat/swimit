import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from './i18n';
import { MarketingLayout } from './MarketingLayout';
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
  { label: 'Water quality', level: 'full' },
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

function isPopularPlan(item: ServicePackage, list: ServicePackage[]) {
  const name = item.packageName.toLowerCase().trim();
  if (name === 'professional') return true;
  if (list.some((p) => p.packageName.toLowerCase().trim() === 'professional')) return false;
  const paid = list.filter((p) => p.price > 0);
  if (paid.length === 0) return false;
  return item.id === paid[Math.floor((paid.length - 1) / 2)]?.id;
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

  const visiblePackages = useMemo(
    () => (canManagePackages ? packages : packages.filter((p) => p.isActive)),
    [packages, canManagePackages],
  );

  const pricingPackages = useMemo(
    () => packages.filter((p) => p.isActive),
    [packages],
  );

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
    <MarketingLayout>
      <div className="pricing-page">
        <header className="pricing-hero">
          <p className="marketing-eyebrow">{t('Pricing')}</p>
          <h1>{t('Simple plans for every pool')}</h1>
          <p className="pricing-hero-lead">
            {t(
              'Choose a SwimIT plan that fits your pool size and operations. Start free, upgrade anytime.',
            )}
          </p>
        </header>

        {error ? <p className="error pricing-status">{t(error)}</p> : null}
        {success ? <p className="success pricing-status">{t(success)}</p> : null}

        {loading ? (
          <p className="muted pricing-status">{t('Loading…')}</p>
        ) : pricingPackages.length === 0 ? (
          <p className="pass-empty pricing-status">{t('No service packages yet.')}</p>
        ) : (
          <section className="pricing-cards" aria-label={t('Pricing')}>
            {pricingPackages.map((item) => {
              const popular = isPopularPlan(item, pricingPackages);
              const hasDiscount =
                item.discountedRate != null && item.discountedRate > 0;
              const displayPrice = hasDiscount ? item.discountedRate! : item.price;
              const highlights = [
                item.maxActiveSwimmers == null
                  ? t('Unlimited swimmers')
                  : `${item.maxActiveSwimmers} ${t('active swimmers')}`,
                `${item.maxUsers} ${t('users')}`,
                item.trialDays > 0
                  ? `${item.trialDays}-${t('day trial')}`
                  : item.modules === 'full'
                    ? t('Full modules')
                    : t('Core modules'),
              ];
              if (item.supportLevel === 'onboarding') {
                highlights.push(t('Onboarding support'));
              } else if (item.supportLevel === 'whatsapp' && item.modules === 'full') {
                // Skip WhatsApp on Trial/Starter (core); keep it on full plans like Enterprise.
                highlights.push('WhatsApp');
              }

              return (
                <article
                  key={item.id}
                  className={`pricing-card${popular ? ' is-popular' : ''}`}
                >
                  {popular ? <span className="pricing-card-badge">{t('Most popular')}</span> : null}
                  <h2 className="pricing-card-name">{item.packageName}</h2>
                  <p className="pricing-card-desc">
                    {item.description || t('SwimIT service package for pool operations.')}
                  </p>
                  <div className="pricing-card-price">
                    {item.price === 0 && !hasDiscount ? (
                      <span className="pricing-card-amount">{t('Free')}</span>
                    ) : (
                      <>
                        {hasDiscount ? (
                          <span className="pricing-card-was">{formatMoney(item.price)}</span>
                        ) : null}
                        <span className="pricing-card-amount">{formatMoney(displayPrice)}</span>
                        <span className="pricing-card-period">/ {t(item.billingPeriod)}</span>
                      </>
                    )}
                  </div>
                  <ul className="pricing-card-points">
                    {highlights.map((line) => (
                      <li key={line}>
                        <span className="pricing-card-check" aria-hidden>
                          ✓
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/create-account?package=${item.id}`}
                    className={`marketing-btn pricing-card-cta${
                      popular ? ' marketing-btn--primary' : ' marketing-btn--outline'
                    }`}
                  >
                    {t('Get Started')}
                  </Link>
                </article>
              );
            })}
          </section>
        )}

        {!loading && pricingPackages.length > 0 ? (
          <section className="pricing-compare" aria-labelledby="pricing-compare-heading">
            <h2 id="pricing-compare-heading">{t('Compare plans')}</h2>
            <p className="pricing-compare-lead">
              {t('See what is included in each SwimIT package.')}
            </p>
            <div className="pricing-compare-wrap">
              <table className="pricing-compare-table">
                <thead>
                  <tr>
                    <th scope="col">{t('Features')}</th>
                    {pricingPackages.map((item) => (
                      <th key={item.id} scope="col">
                        {item.packageName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{t('Price')}</th>
                    {pricingPackages.map((item) => (
                      <td key={item.id}>
                        {item.price === 0
                          ? t('Free')
                          : `${formatMoney(
                              item.discountedRate != null && item.discountedRate > 0
                                ? item.discountedRate
                                : item.price,
                            )} / ${t(item.billingPeriod)}`}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Max active swimmers')}</th>
                    {pricingPackages.map((item) => (
                      <td key={item.id}>
                        {item.maxActiveSwimmers == null ? t('Unlimited') : item.maxActiveSwimmers}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t('Max users')}</th>
                    {pricingPackages.map((item) => (
                      <td key={item.id}>{item.maxUsers}</td>
                    ))}
                  </tr>
                  {PACKAGE_FEATURES.map((feature) => (
                    <tr key={feature.label}>
                      <th scope="row">{t(feature.label)}</th>
                      {pricingPackages.map((item) => (
                        <td key={item.id}>
                          <FeatureTick
                            on={packageHasFeature(item.modules, feature, item.packageName)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="pricing-footer-cta">
          <h2>{t('Ready to run your pool better?')}</h2>
          <p>{t('Create your SwimIT account and start with the plan that fits you.')}</p>
          <Link to="/create-account" className="marketing-btn marketing-btn--primary marketing-btn--lg">
            {t('Get Started')}
          </Link>
        </section>

        {canManagePackages ? (
          <section className="pricing-admin" aria-label={t('Service Packages')}>
            <div className="pricing-admin-head">
              <div>
                <h2>{t('Manage packages')}</h2>
                <p>{t('Platform tools for creating and editing SwimIT plans.')}</p>
              </div>
              <button type="button" className="marketing-btn marketing-btn--primary" onClick={startCreate}>
                {t('Create package')}
              </button>
            </div>

            {showForm ? (
              <form className="pricing-admin-form" onSubmit={onSubmit}>
                <h3>{editingId ? t('Edit package') : t('New package')}</h3>

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
                    <span className="label">{t('Max active swimmers')}</span>
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

            {visiblePackages.length > 0 ? (
              <div className="pricing-admin-list">
                {visiblePackages.map((item) => (
                  <div key={item.id} className="pricing-admin-row">
                    <div>
                      <strong>{item.packageName}</strong>
                      <span className="muted">
                        {item.isActive ? t('Active') : t('Inactive')} ·{' '}
                        {item.price === 0
                          ? t('Free')
                          : `${formatMoney(item.price)} / ${t(item.billingPeriod)}`}
                      </span>
                    </div>
                    <div className="pricing-admin-row-actions">
                      <button type="button" className="menu-link" onClick={() => startEdit(item)}>
                        {t('Edit')}
                      </button>
                      <button
                        type="button"
                        className="remove-link"
                        onClick={() => void removePackage(item.id)}
                      >
                        {t('Delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </MarketingLayout>
  );
}
