import { FormEvent, useEffect, useState } from 'react';
import { PlatformNav } from './PlatformNav';
import { getPlatformSession } from './platformSession';

type ServicePackage = {
  id: number;
  packageName: string;
  description: string;
  price: number;
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
  return on ? (
    <span className="package-tick" aria-label="Included">
      ✓
    </span>
  ) : (
    <span className="package-tick-off" aria-label="Not included">
      —
    </span>
  );
}

export function ServicePackages() {
  const session = getPlatformSession();
  const canManagePackages = Boolean(
    session &&
      (session.isAccountAdmin || session.menuAccess.includes('service-packages')),
  );
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [form, setForm] = useState<PackageForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
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

  function startEdit(item: ServicePackage) {
    setEditingId(item.id);
    setForm({
      packageName: item.packageName,
      description: item.description,
      price: String(item.price),
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
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
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

    setSaving(true);
    try {
      const payload = {
        packageName: form.packageName.trim(),
        description: form.description.trim(),
        price,
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
    <>
      <PlatformNav />
      <div className="page">
      <h1>Service packages</h1>

      {canManagePackages ? (
      <form className="pass-form-card" onSubmit={onSubmit}>
        <h2>{editingId ? 'Edit package' : 'New package'}</h2>

        <label className="field">
          <span className="label">
            Package name <span className="req">*</span>
          </span>
          <input
            value={form.packageName}
            onChange={(e) => setField('packageName', e.target.value)}
            placeholder="e.g. Trial, Starter, Professional"
            required
          />
        </label>

        <label className="field">
          <span className="label">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Short summary of what this plan includes"
            rows={3}
          />
        </label>

        <div className="form-grid-2">
          <label className="field">
            <span className="label">
              Price (₹) <span className="req">*</span>
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
            <span className="label">
              Billing period <span className="req">*</span>
            </span>
            <select
              value={form.billingPeriod}
              onChange={(e) => setField('billingPeriod', e.target.value)}
            >
              <option value="Month">Month</option>
              <option value="Year">Year</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Max active swimmers</span>
            <input
              type="number"
              min={0}
              value={form.maxActiveSwimmers}
              onChange={(e) => setField('maxActiveSwimmers', e.target.value)}
              placeholder="Blank = unlimited"
            />
          </label>

          <label className="field">
            <span className="label">Max users</span>
            <input
              type="number"
              min={1}
              value={form.maxUsers}
              onChange={(e) => setField('maxUsers', e.target.value)}
            />
          </label>

          <label className="field">
            <span className="label">Trial days</span>
            <input
              type="number"
              min={0}
              value={form.trialDays}
              onChange={(e) => setField('trialDays', e.target.value)}
              placeholder="0 = paid plan"
            />
          </label>

          <label className="field">
            <span className="label">Modules</span>
            <select value={form.modules} onChange={(e) => setField('modules', e.target.value)}>
              <option value="core">Core (ops)</option>
              <option value="full">Full (ops + finance)</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Support</span>
            <select
              value={form.supportLevel}
              onChange={(e) => setField('supportLevel', e.target.value)}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="priority">Priority</option>
              <option value="onboarding">Onboarding</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Max pools</span>
            <input
              type="number"
              min={1}
              value={form.maxPools}
              onChange={(e) => setField('maxPools', e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="label">Features (optional override)</span>
          <textarea
            value={form.features}
            onChange={(e) => setField('features', e.target.value)}
            placeholder="Leave blank to auto-fill from swimmers / modules / support"
            rows={2}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          <span>Active (available for new accounts)</span>
        </label>

        <div className="submit-wrap">
          {editingId ? (
            <button type="button" className="ghost-btn" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
          <button type="submit" className="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update package' : 'Create package'}
          </button>
        </div>
      </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}

      <section className="pass-table-card" style={{ marginTop: '1.25rem' }}>
        <h2>Service packages</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : packages.length === 0 ? (
          <p className="pass-empty">
            {canManagePackages
              ? 'No service packages yet. Create the first SwimIT plan above.'
              : 'No service packages yet.'}
          </p>
        ) : (
          <div className="batch-saved-table-wrap package-compare-wrap">
            <table className="batch-saved-table package-compare-table">
              <thead>
                <tr>
                  <th scope="col" className="package-compare-label-col">
                    Field
                  </th>
                  {packages.map((item) => (
                    <th key={item.id} scope="col" className="package-compare-col">
                      <strong className="batch-saved-name">{item.packageName}</strong>
                      {item.trialDays > 0 ? (
                        <div className="muted package-compare-sub">
                          {item.trialDays}-day entry trial
                        </div>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Description</th>
                  {packages.map((item) => (
                    <td key={item.id}>{item.description || '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Price</th>
                  {packages.map((item) => (
                    <td key={item.id}>
                      <strong>
                        {item.price === 0
                          ? 'Free'
                          : `${formatMoney(item.price)} / ${item.billingPeriod}`}
                      </strong>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Billing</th>
                  {packages.map((item) => (
                    <td key={item.id}>{item.billingPeriod}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Max active swimmers</th>
                  {packages.map((item) => (
                    <td key={item.id}>
                      {item.maxActiveSwimmers == null ? 'Unlimited' : item.maxActiveSwimmers}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Max users</th>
                  {packages.map((item) => (
                    <td key={item.id}>{item.maxUsers}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Trial days</th>
                  {packages.map((item) => (
                    <td key={item.id}>{item.trialDays > 0 ? item.trialDays : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Max pools</th>
                  {packages.map((item) => (
                    <td key={item.id}>{item.maxPools}</td>
                  ))}
                </tr>
                <tr className="package-feature-section">
                  <th scope="row" colSpan={packages.length + 1}>
                    Core features
                  </th>
                </tr>
                {PACKAGE_FEATURES.filter((f) => f.level === 'core').map((feature) => (
                  <tr key={feature.label} className="package-feature-row">
                    <th scope="row">{feature.label}</th>
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
                    Full features
                  </th>
                </tr>
                {PACKAGE_FEATURES.filter((f) => f.level === 'full').map((feature) => (
                  <tr key={feature.label} className="package-feature-row">
                    <th scope="row">{feature.label}</th>
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
                  <th scope="row">Actions</th>
                  {packages.map((item) => (
                    <td key={item.id}>
                      <button type="button" className="menu-link" onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      {' · '}
                      <button
                        type="button"
                        className="remove-link"
                        onClick={() => void removePackage(item.id)}
                      >
                        Delete
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
    </div>
    </>
  );
}
