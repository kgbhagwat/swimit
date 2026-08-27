import { FormEvent, useEffect, useState } from 'react';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { RegistrationPhotoField } from './RegistrationPhotoField';
import { useObjectUrl } from './useObjectUrl';
import {
  emptyWebsiteContent,
  mapWebsiteResponse,
  websiteThemeStyle,
  parseThemeColor,
  WEBSITE_THEME_PRESETS,
  type PoolWebsiteAchievement,
  type PoolWebsiteContent,
  type WebsitePhotoKey,
} from './poolWebsite';

const EMPTY_PHOTOS: Record<WebsitePhotoKey, File | null> = {
  banner: null,
  history: null,
  info: null,
  batches: null,
  coaches: null,
  achievements: null,
};

const EMPTY_CLEARS: Record<WebsitePhotoKey, boolean> = {
  banner: false,
  history: false,
  info: false,
  batches: false,
  coaches: false,
  achievements: false,
};

const PHOTO_UPLOAD: Record<WebsitePhotoKey, { file: string; clear: string; url: keyof PoolWebsiteContent }> = {
  banner: { file: 'bannerPhoto', clear: 'clearBannerPhoto', url: 'bannerPhotoUrl' },
  history: { file: 'historyPhoto', clear: 'clearHistoryPhoto', url: 'historyPhotoUrl' },
  info: { file: 'infoPhoto', clear: 'clearInfoPhoto', url: 'infoPhotoUrl' },
  batches: { file: 'batchesPhoto', clear: 'clearBatchesPhoto', url: 'batchesPhotoUrl' },
  coaches: { file: 'coachesPhoto', clear: 'clearCoachesPhoto', url: 'coachesPhotoUrl' },
  achievements: { file: 'achievementsPhoto', clear: 'clearAchievementsPhoto', url: 'achievementsPhotoUrl' },
};

function WebsitePhotoField({
  label,
  editing,
  file,
  existingUrl,
  cleared,
  onPick,
  onClear,
}: {
  label: string;
  editing: boolean;
  file: File | null;
  existingUrl: string | null;
  cleared: boolean;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  const t = useT();
  const preview = useObjectUrl(file);
  const shown = cleared && !file ? null : preview || existingUrl;
  if (!editing) {
    return shown ? (
      <div className="pool-website-photo-view">
        <img src={shown} alt="" />
      </div>
    ) : (
      <p className="hint">{t('No photo uploaded.')}</p>
    );
  }
  return (
    <RegistrationPhotoField
      label={label}
      hint={t('Images max 200 KB')}
      file={file}
      preview={preview}
      existingUrl={cleared ? null : existingUrl}
      onPick={(next) => {
        onPick(next);
      }}
      onClearExisting={onClear}
      cameraFacing="environment"
    />
  );
}

export function PoolWebsite() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<PoolWebsiteContent>(emptyWebsiteContent());
  const [loaded, setLoaded] = useState<PoolWebsiteContent>(emptyWebsiteContent());
  const [photoFiles, setPhotoFiles] = useState(EMPTY_PHOTOS);
  const [clearPhotos, setClearPhotos] = useState(EMPTY_CLEARS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/pool-website');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load pool website');
        if (!cancelled) {
          const next = mapWebsiteResponse(body);
          setForm(next);
          setLoaded(next);
          setPhotoFiles(EMPTY_PHOTOS);
          setClearPhotos(EMPTY_CLEARS);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load pool website');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(patch: Partial<PoolWebsiteContent>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function updatePhoto(key: WebsitePhotoKey, file: File | null) {
    setPhotoFiles((prev) => ({ ...prev, [key]: file }));
    if (file) setClearPhotos((prev) => ({ ...prev, [key]: false }));
  }

  function clearPhoto(key: WebsitePhotoKey) {
    setPhotoFiles((prev) => ({ ...prev, [key]: null }));
    setClearPhotos((prev) => ({ ...prev, [key]: true }));
  }

  function resetEdits() {
    setForm(loaded);
    setPhotoFiles(EMPTY_PHOTOS);
    setClearPhotos(EMPTY_CLEARS);
    setEditing(false);
    setError('');
    setSuccess('');
  }

  function updateAchievement(index: number, patch: Partial<PoolWebsiteAchievement>) {
    setForm((prev) => {
      const list = prev.achievements.length > 0 ? prev.achievements : [{ title: '', detail: '' }];
      return {
        ...prev,
        achievements: list.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = new FormData();
      data.append('about', form.about);
      data.append('history', form.history);
      data.append('openingHours', form.openingHours);
      data.append('facilities', form.facilities);
      data.append('batchesText', form.batchesText);
      data.append('coachesText', form.coachesText);
      data.append('themeColor', form.themeColor);
      data.append(
        'achievements',
        JSON.stringify(form.achievements.filter((row) => row.title.trim() || row.detail.trim())),
      );
      (Object.keys(PHOTO_UPLOAD) as WebsitePhotoKey[]).forEach((key) => {
        const spec = PHOTO_UPLOAD[key];
        const file = photoFiles[key];
        if (file) data.append(spec.file, file);
        else if (clearPhotos[key]) data.append(spec.clear, '1');
      });
      const res = await fetch('/api/pool-website', { method: 'PUT', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save pool website');
      const next = mapWebsiteResponse(body);
      setForm(next);
      setLoaded(next);
      setPhotoFiles(EMPTY_PHOTOS);
      setClearPhotos(EMPTY_CLEARS);
      setEditing(false);
      setSuccess('Website saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pool website');
    } finally {
      setSaving(false);
    }
  }

  const achievements = form.achievements.length > 0 ? form.achievements : [{ title: '', detail: '' }];

  return (
    <PlatformPage
      title="Pool website"
      actions={
        loading ? undefined : editing ? (
          <>
            <button type="button" className="ghost-btn" disabled={saving} onClick={resetEdits}>
              {t('Cancel')}
            </button>
            <button type="submit" className="submit" form="pool-website-form" disabled={saving}>
              {saving ? t('Saving…') : t('Save')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="submit"
            onClick={() => {
              setPhotoFiles(EMPTY_PHOTOS);
              setClearPhotos(EMPTY_CLEARS);
              setEditing(true);
              setSuccess('');
              setError('');
            }}
          >
            {t('Edit')}
          </button>
        )
      }
    >
      <p className="lede batch-list-lede">
        {t('These details appear on your public pool website.')}
      </p>
      {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
      {error && !editing ? <p className="error">{t(error)}</p> : null}
      {success && !editing ? <p className="success">{t(success)}</p> : null}

      {!loading ? (
        <form id="pool-website-form" className="pass-form-card pool-core-form" onSubmit={onSubmit}>
          {error && editing ? <p className="error">{t(error)}</p> : null}
          <div className="field">
            <span className="label">{t('Website colour')}</span>
            {editing ? (
              <div className="pool-website-theme">
                {WEBSITE_THEME_PRESETS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={`pool-website-theme-swatch${parseThemeColor(form.themeColor) === color ? ' is-selected' : ''}`}
                    style={{ background: color }}
                    aria-label={color}
                    aria-pressed={parseThemeColor(form.themeColor) === color}
                    onClick={() => update({ themeColor: color })}
                  />
                ))}
                <label className="pool-website-theme-custom">
                  <input
                    type="color"
                    value={parseThemeColor(form.themeColor)}
                    onChange={(e) => update({ themeColor: parseThemeColor(e.target.value) })}
                    aria-label={t('Website colour')}
                  />
                  <span>{form.themeColor}</span>
                </label>
              </div>
            ) : (
              <p className="pool-core-view-value pool-website-theme-view">
                <span className="pool-website-theme-swatch" style={{ background: form.themeColor }} />
                {form.themeColor}
              </p>
            )}
            <p className="hint">{t('This colour is used for the public pool website.')}</p>
            <div className="pool-website-theme-preview" style={websiteThemeStyle(form.themeColor)}>
              <span className="pool-website-theme-preview-chip">{t('Join as a swimmer')}</span>
              <span className="pool-website-theme-preview-text">{t('Sample website')}</span>
            </div>
          </div>
          <label className="field">
            <span className="label">{t('About the pool')}</span>
            {editing ? (
              <textarea
                rows={4}
                value={form.about}
                onChange={(e) => update({ about: e.target.value })}
                placeholder={t('Leave blank to show the sample welcome text.')}
              />
            ) : (
              <p className="pool-core-view-value pool-core-view-multiline">
                {form.about.trim() || '—'}
              </p>
            )}
          </label>
          <WebsitePhotoField
            label={t('Banner photo')}
            editing={editing}
            file={photoFiles.banner}
            existingUrl={form.bannerPhotoUrl}
            cleared={clearPhotos.banner}
            onPick={(file) => updatePhoto('banner', file)}
            onClear={() => clearPhoto('banner')}
          />
          <label className="field">
            <span className="label">{t('Background & history')}</span>
            {editing ? (
              <textarea
                rows={5}
                value={form.history}
                onChange={(e) => update({ history: e.target.value })}
                placeholder={t('Leave blank to show the sample history text.')}
              />
            ) : (
              <p className="pool-core-view-value pool-core-view-multiline">
                {form.history.trim() || '—'}
              </p>
            )}
          </label>
          <WebsitePhotoField
            label={t('Background photo')}
            editing={editing}
            file={photoFiles.history}
            existingUrl={form.historyPhotoUrl}
            cleared={clearPhotos.history}
            onPick={(file) => updatePhoto('history', file)}
            onClear={() => clearPhoto('history')}
          />
          <div className="form-grid-2">
            <label className="field">
              <span className="label">{t('Opening hours')}</span>
              {editing ? (
                <input
                  value={form.openingHours}
                  onChange={(e) => update({ openingHours: e.target.value })}
                  placeholder={t('6:00 AM – 9:00 PM')}
                />
              ) : (
                <p className="pool-core-view-value">{form.openingHours.trim() || '—'}</p>
              )}
            </label>
            <label className="field">
              <span className="label">{t('Facilities')}</span>
              {editing ? (
                <textarea
                  rows={3}
                  value={form.facilities}
                  onChange={(e) => update({ facilities: e.target.value })}
                />
              ) : (
                <p className="pool-core-view-value pool-core-view-multiline">
                  {form.facilities.trim() || '—'}
                </p>
              )}
            </label>
          </div>
          <WebsitePhotoField
            label={t('Pool info photo')}
            editing={editing}
            file={photoFiles.info}
            existingUrl={form.infoPhotoUrl}
            cleared={clearPhotos.info}
            onPick={(file) => updatePhoto('info', file)}
            onClear={() => clearPhoto('info')}
          />
          <label className="field">
            <span className="label">{t('About batches')}</span>
            {editing ? (
              <textarea
                rows={3}
                value={form.batchesText}
                onChange={(e) => update({ batchesText: e.target.value })}
              />
            ) : (
              <p className="pool-core-view-value pool-core-view-multiline">
                {form.batchesText.trim() || '—'}
              </p>
            )}
          </label>
          <WebsitePhotoField
            label={t('Batches photo')}
            editing={editing}
            file={photoFiles.batches}
            existingUrl={form.batchesPhotoUrl}
            cleared={clearPhotos.batches}
            onPick={(file) => updatePhoto('batches', file)}
            onClear={() => clearPhoto('batches')}
          />
          <label className="field">
            <span className="label">{t('About coaches')}</span>
            {editing ? (
              <textarea
                rows={3}
                value={form.coachesText}
                onChange={(e) => update({ coachesText: e.target.value })}
              />
            ) : (
              <p className="pool-core-view-value pool-core-view-multiline">
                {form.coachesText.trim() || '—'}
              </p>
            )}
          </label>
          <WebsitePhotoField
            label={t('Coaches photo')}
            editing={editing}
            file={photoFiles.coaches}
            existingUrl={form.coachesPhotoUrl}
            cleared={clearPhotos.coaches}
            onPick={(file) => updatePhoto('coaches', file)}
            onClear={() => clearPhoto('coaches')}
          />

          <div className="field">
            <span className="label">{t('Achievements')}</span>
            {editing ? (
              <div className="pool-website-achievements">
                {achievements.map((row, index) => (
                  <div className="pool-website-achievement-row" key={index}>
                    <input
                      value={row.title}
                      onChange={(e) => updateAchievement(index, { title: e.target.value })}
                      placeholder={t('Achievement title')}
                      aria-label={t('Achievement title')}
                    />
                    <textarea
                      rows={2}
                      value={row.detail}
                      onChange={(e) => updateAchievement(index, { detail: e.target.value })}
                      placeholder={t('Achievement detail')}
                      aria-label={t('Achievement detail')}
                    />
                    <button
                      type="button"
                      className="terms-link"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          achievements: prev.achievements.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      {t('Remove')}
                    </button>
                  </div>
                ))}
                {form.achievements.length < 12 ? (
                  <button
                    type="button"
                    className="terms-link"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        achievements: [...prev.achievements, { title: '', detail: '' }],
                      }))
                    }
                  >
                    {t('Add achievement')}
                  </button>
                ) : null}
              </div>
            ) : form.achievements.length === 0 ? (
              <p className="pool-core-view-value">—</p>
            ) : (
              <ul className="pool-website-achievement-view">
                {form.achievements.map((row) => (
                  <li key={`${row.title}-${row.detail}`}>
                    <strong>{row.title || '—'}</strong>
                    {row.detail ? <span>{row.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <WebsitePhotoField
            label={t('Achievements photo')}
            editing={editing}
            file={photoFiles.achievements}
            existingUrl={form.achievementsPhotoUrl}
            cleared={clearPhotos.achievements}
            onPick={(file) => updatePhoto('achievements', file)}
            onClear={() => clearPhoto('achievements')}
          />
        </form>
      ) : null}
    </PlatformPage>
  );
}
