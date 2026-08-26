import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from './i18n';
import { MarketingLayout } from './MarketingLayout';
import {
  defaultFeatureKeysForModules,
  PACKAGE_FEATURE_DEFS,
  resolvedFeatureKeys,
} from './packageFeatures';
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
  featureKeys?: string[];
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
  featureKeys: string[];
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
  modules: 'full',
  supportLevel: 'whatsapp',
  features: '',
  featureKeys: defaultFeatureKeysForModules('full'),
  isActive: true,
};

/** Public pricing is the draft seat plans. Hide the old package editor on this page. */
const SHOW_PACKAGE_ADMIN = false;

function formatMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function packageIncludesFeature(item: {
  modules: string;
  packageName?: string;
  featureKeys?: string[];
}, featureId: string) {
  return resolvedFeatureKeys({
    modules: item.modules,
    packageName: item.packageName,
    featureKeys: item.featureKeys,
  }).includes(featureId);
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
    if (SHOW_PACKAGE_ADMIN && canManagePackages) void load();
    else setLoading(false);
  }, [canManagePackages]);

  function setField<K extends keyof PackageForm>(key: K, value: PackageForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSuccess('');
  }

  function startCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      featureKeys: defaultFeatureKeysForModules('core'),
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function toggleFeature(featureId: string) {
    setForm((prev) => {
      const on = prev.featureKeys.includes(featureId);
      const featureKeys = on
        ? prev.featureKeys.filter((id) => id !== featureId)
        : [...prev.featureKeys, featureId];
      const hasFull = PACKAGE_FEATURE_DEFS.some(
        (f) => f.level === 'full' && featureKeys.includes(f.id),
      );
      return {
        ...prev,
        featureKeys,
        modules: hasFull ? 'full' : 'core',
      };
    });
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
      featureKeys: resolvedFeatureKeys({
        modules: item.modules || 'core',
        packageName: item.packageName,
        featureKeys: item.featureKeys,
      }),
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
        featureKeys: form.featureKeys,
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

  const packageCatalog = (
    <>
      {loading ? (
        <p className="muted pricing-status">{t('Loading…')}</p>
      ) : pricingPackages.length === 0 ? (
        <p className="pass-empty pricing-status">{t('No service packages yet.')}</p>
      ) : (
        <section className="pricing-cards" aria-label={t('Previous pricing (package plans)')}>
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
              t('All modules included'),
            ];
            if (item.trialDays > 0) {
              highlights.push(`${item.trialDays}-${t('day trial')}`);
            }
            if (item.supportLevel === 'onboarding') {
              highlights.push(t('Onboarding support'));
            } else {
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
                {PACKAGE_FEATURE_DEFS.map((feature) => (
                  <tr key={feature.id}>
                    <th scope="row">{t(feature.label)}</th>
                    {pricingPackages.map((item) => (
                      <td key={item.id}>
                        <FeatureTick on={packageIncludesFeature(item, feature.id)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );

  const pageBody = (
      <div className={`pricing-page${canManagePackages ? ' pricing-page--platform' : ''}`}>
        <header className="pricing-hero">
          <p className="marketing-eyebrow">{t('Pricing')}</p>
          <p className="pricing-draft-note">{t('Draft pricing — we will update these numbers later.')}</p>
          <h1>{t('Pay for the swimmers you run')}</h1>
          <p className="pricing-hero-lead">
            {t(
              'Every plan includes every SwimIT module. Pay in advance for expected active swimmers, then recharge if you grow during the month.',
            )}
          </p>
        </header>

        <section className="pricing-cards pricing-cards--new" aria-label={t('Pricing')}>
            <article className="pricing-card">
              <h2 className="pricing-card-name">{t('Trial')}</h2>
              <p className="pricing-card-desc">
                {t('Try the full product for 30 days. Convert to Standard or Volume before the trial ends.')}
              </p>
              <div className="pricing-card-price">
                <span className="pricing-card-amount">{t('Free')}</span>
                <span className="pricing-card-period">/ {t('30 days')}</span>
              </div>
              <ul className="pricing-card-points">
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>{t('All modules included')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>50 {t('billable swimmers')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>{t('3 broadcasts and 3 pass reminders included')}</span>
                </li>
              </ul>
              <Link to="/create-account" className="marketing-btn pricing-card-cta marketing-btn--outline">
                {t('Get Started')}
              </Link>
            </article>

            <article className="pricing-card">
              <h2 className="pricing-card-name">{t('Standard')}</h2>
              <p className="pricing-card-desc">
                {t('For a single pool. Floor covers 50 billable swimmers; extras billed per head.')}
              </p>
              <div className="pricing-card-price">
                <span className="pricing-card-amount">₹1,999</span>
                <span className="pricing-card-period">/ {t('Month')}</span>
              </div>
              <ul className="pricing-card-points">
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>{t('All modules included')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>50 {t('billable swimmers included')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>₹25 {t('per extra swimmer per month')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>{t('3 broadcasts and 3 pass reminders included')}</span>
                </li>
              </ul>
              <Link to="/create-account" className="marketing-btn pricing-card-cta marketing-btn--outline">
                {t('Get Started')}
              </Link>
            </article>

            <article className="pricing-card is-popular">
              <span className="pricing-card-badge">{t('Most popular')}</span>
              <h2 className="pricing-card-name">{t('Volume')}</h2>
              <p className="pricing-card-desc">
                {t('Same full product, lower extra-swimmer rate as the pool grows.')}
              </p>
              <div className="pricing-card-price">
                <span className="pricing-card-amount">₹3,499</span>
                <span className="pricing-card-period">/ {t('Month')}</span>
              </div>
              <ul className="pricing-card-points">
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>{t('All modules included')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>100 {t('billable swimmers included')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>₹20 {t('per extra swimmer per month')}</span>
                </li>
                <li>
                  <span className="pricing-card-check" aria-hidden>✓</span>
                  <span>{t('3 broadcasts and 3 pass reminders included')}</span>
                </li>
              </ul>
              <Link to="/create-account" className="marketing-btn pricing-card-cta marketing-btn--primary">
                {t('Get Started')}
              </Link>
            </article>
          </section>

          <section className="pricing-rules" aria-labelledby="pricing-rules-heading">
            <h2 id="pricing-rules-heading">{t('How we count swimmers')}</h2>
            <ul>
              <li>{t('A monthly or longer pass that overlaps the month counts as 1 billable swimmer.')}</li>
              <li>{t('30 daily passes count as 1 billable swimmer.')}</li>
              <li>{t('Pay in advance for the seats you expect. We will ask you to recharge extra seats if you are close to the pack.')}</li>
              <li>{t('Extra WhatsApp messages beyond the included bundle are ₹1 each, billed on the next recharge.')}</li>
            </ul>
          </section>

        {error ? <p className="error pricing-status">{t(error)}</p> : null}
        {success ? <p className="success pricing-status">{t(success)}</p> : null}

        {SHOW_PACKAGE_ADMIN && canManagePackages ? (
          <section className="pricing-admin" aria-label={t('Service Packages')}>
            <div className="pricing-admin-head">
              <div>
                <h2>{t('Manage packages')}</h2>
                <p>{t('Platform tools for creating and editing SwimIT plans.')}</p>
              </div>
              <button type="button" className="submit" onClick={startCreate}>
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
                      max={10}
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
                    <select
                      value={form.modules}
                      onChange={(e) => {
                        const modules = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          modules,
                          featureKeys: defaultFeatureKeysForModules(modules, prev.packageName),
                        }));
                        setError('');
                        setSuccess('');
                      }}
                    >
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

                <div className="pricing-admin-features">
                  <div className="pricing-admin-features-head">
                    <span className="label">{t('Feature list')}</span>
                    <span className="muted">
                      {t('Toggle features included in this package. Modules preset updates the defaults.')}
                    </span>
                  </div>
                  <ul className="pricing-admin-feature-list">
                    {PACKAGE_FEATURE_DEFS.map((feature) => {
                      const included = form.featureKeys.includes(feature.id);
                      return (
                        <li key={feature.id}>
                          <label
                            className={
                              included
                                ? 'pricing-admin-feature is-on'
                                : 'pricing-admin-feature is-off'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => toggleFeature(feature.id)}
                              aria-label={t(feature.label)}
                            />
                            <span>{t(feature.label)}</span>
                            <em className="muted">
                              {feature.level === 'core' ? t('Core') : t('Full')}
                            </em>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
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

        {SHOW_PACKAGE_ADMIN ? (
          <details className="pricing-legacy">
            <summary>{t('Previous pricing (package plans)')}</summary>
            <p className="pricing-legacy-lead">
              {t('These were the older flat monthly packages with swimmer caps. New accounts should use the seat-based plans above.')}
            </p>
            {packageCatalog}
          </details>
        ) : null}

        <section className="pricing-footer-cta">
          <h2>{t('Ready to run your pool better?')}</h2>
          <p>{t('Create your SwimIT account and start with the plan that fits you.')}</p>
          <Link to="/create-account" className="marketing-btn marketing-btn--primary marketing-btn--lg">
            {t('Get Started')}
          </Link>
        </section>
      </div>
  );

  return <MarketingLayout>{pageBody}</MarketingLayout>;
}
