import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { RegistrationPhotoField } from './RegistrationPhotoField';
import { useObjectUrl } from './useObjectUrl';
import { WebsiteLayoutEditor } from './WebsiteLayoutEditor';
import {
  emptyWebsiteContent,
  defaultCustomBoxRect,
  cloneWebsiteLayout,
  defaultWebsiteLayout,
  mapWebsiteResponse,
  resolvePublicWebsiteLayout,
  sanitizeWebsiteLayout,
  websiteThemeStyle,
  parseThemeColor,
  WEBSITE_THEME_PRESETS,
  withWebsiteSamples,
  type PoolWebsiteAchievement,
  type PoolWebsiteContent,
  type PoolWebsiteCustomBox,
  type PoolWebsiteLayout,
  type WebsitePhotoKey,
} from './poolWebsite';

const EMPTY_PHOTOS: Record<WebsitePhotoKey, File | null> = {
  banner: null,
  history: null,
  info: null,
  achievements: null,
};

const EMPTY_CLEARS: Record<WebsitePhotoKey, boolean> = {
  banner: false,
  history: false,
  info: false,
  achievements: false,
};

const PHOTO_UPLOAD: Record<WebsitePhotoKey, { file: string; clear: string; url: keyof PoolWebsiteContent }> = {
  banner: { file: 'bannerPhoto', clear: 'clearBannerPhoto', url: 'bannerPhotoUrl' },
  history: { file: 'historyPhoto', clear: 'clearHistoryPhoto', url: 'historyPhotoUrl' },
  info: { file: 'infoPhoto', clear: 'clearInfoPhoto', url: 'infoPhotoUrl' },
  achievements: { file: 'achievementsPhoto', clear: 'clearAchievementsPhoto', url: 'achievementsPhotoUrl' },
};

function WebsiteSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="pool-website-section">
      <header className="pool-website-section-head">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="pool-website-section-body">{children}</div>
    </section>
  );
}

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
  const [customBoxPhotoFiles, setCustomBoxPhotoFiles] = useState<Record<string, File | null>>({});
  const [clearCustomBoxPhotos, setClearCustomBoxPhotos] = useState<Record<string, boolean>>({});
  const [photoSavedAt, setPhotoSavedAt] = useState(0);
  const [layoutHistory, setLayoutHistory] = useState<{
    past: PoolWebsiteLayout[];
    future: PoolWebsiteLayout[];
  }>({ past: [], future: [] });
  const layoutRef = useRef(form.layout);
  layoutRef.current = form.layout;

  function resetLayoutHistory() {
    setLayoutHistory({ past: [], future: [] });
  }

  function checkpointLayoutHistory() {
    setLayoutHistory((history) => ({
      past: [...history.past.slice(-49), cloneWebsiteLayout(layoutRef.current)],
      future: [],
    }));
  }

  function setLayoutLive(next: PoolWebsiteLayout) {
    setForm((prev) => ({ ...prev, layout: next }));
  }

  function undoLayout() {
    setLayoutHistory((history) => {
      if (history.past.length === 0) return history;
      const previous = history.past[history.past.length - 1];
      const current = cloneWebsiteLayout(layoutRef.current);
      setForm((prev) => ({ ...prev, layout: previous }));
      return {
        past: history.past.slice(0, -1),
        future: [current, ...history.future],
      };
    });
  }

  function redoLayout() {
    setLayoutHistory((history) => {
      if (history.future.length === 0) return history;
      const next = history.future[0];
      const current = cloneWebsiteLayout(layoutRef.current);
      setForm((prev) => ({ ...prev, layout: next }));
      return {
        past: [...history.past, current],
        future: history.future.slice(1),
      };
    });
  }

  function bustPhotoUrl(url: string | null) {
    if (!url || url.startsWith('blob:')) return null;
    if (!photoSavedAt) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${photoSavedAt}`;
  }

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
          const mapped = mapWebsiteResponse(body);
          const next = withWebsiteSamples(
            {
              ...mapped,
              layout: resolvePublicWebsiteLayout(mapped.layout),
            },
            mapped.poolName,
          );
          setForm(next);
          setLoaded(next);
          setPhotoFiles(EMPTY_PHOTOS);
          setClearPhotos(EMPTY_CLEARS);
          setCustomBoxPhotoFiles({});
          setClearCustomBoxPhotos({});
          resetLayoutHistory();
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

  function updateCustomBoxPhoto(boxId: string, file: File | null) {
    setCustomBoxPhotoFiles((prev) => ({ ...prev, [boxId]: file }));
    if (file) setClearCustomBoxPhotos((prev) => ({ ...prev, [boxId]: false }));
  }

  function clearCustomBoxPhoto(boxId: string) {
    setCustomBoxPhotoFiles((prev) => ({ ...prev, [boxId]: null }));
    setClearCustomBoxPhotos((prev) => ({ ...prev, [boxId]: true }));
  }

  function resetEdits() {
    setForm(loaded);
    setPhotoFiles(EMPTY_PHOTOS);
    setClearPhotos(EMPTY_CLEARS);
    setCustomBoxPhotoFiles({});
    setClearCustomBoxPhotos({});
    resetLayoutHistory();
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

  function resetLayoutToDefault() {
    checkpointLayoutHistory();
    setForm((prev) => ({ ...prev, layout: defaultWebsiteLayout() }));
  }

  function updateLayout(patch: Partial<PoolWebsiteLayout>) {
    checkpointLayoutHistory();
    setForm((prev) => ({
      ...prev,
      layout: sanitizeWebsiteLayout({ ...prev.layout, ...patch }),
    }));
  }

  function updateCustomBox(index: number, patch: Partial<PoolWebsiteCustomBox>) {
    setForm((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        customBoxes: prev.layout.customBoxes.map((box, i) =>
          i === index ? { ...box, ...patch } : box,
        ),
      },
    }));
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
      data.append('showCoachPhotos', form.showCoachPhotos ? '1' : '0');
      data.append(
        'achievements',
        JSON.stringify(form.achievements.filter((row) => row.title.trim() || row.detail.trim())),
      );
      data.append(
        'layoutConfig',
        JSON.stringify(
          sanitizeWebsiteLayout({
            ...form.layout,
            customBoxes: form.layout.customBoxes,
          }),
        ),
      );
      (Object.keys(PHOTO_UPLOAD) as WebsitePhotoKey[]).forEach((key) => {
        const spec = PHOTO_UPLOAD[key];
        const file = photoFiles[key];
        if (file) data.append(spec.file, file);
        else if (clearPhotos[key]) data.append(spec.clear, '1');
      });
      form.layout.customBoxes.forEach((box, index) => {
        const file = customBoxPhotoFiles[box.id];
        if (file) data.append(`customBoxPhoto_${index}`, file);
        else if (clearCustomBoxPhotos[box.id]) data.append(`clearCustomBoxPhoto_${index}`, '1');
      });
      const res = await fetch('/api/pool-website', { method: 'PUT', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save pool website');
      const next = mapWebsiteResponse(body);
      const withGuidelines = withWebsiteSamples(next, next.poolName);
      setForm(withGuidelines);
      setLoaded(withGuidelines);
      setPhotoFiles(EMPTY_PHOTOS);
      setClearPhotos(EMPTY_CLEARS);
      setCustomBoxPhotoFiles({});
      setClearCustomBoxPhotos({});
      resetLayoutHistory();
      setEditing(false);
      setSuccess('Website saved.');
      setPhotoSavedAt(Date.now());
      window.dispatchEvent(
        new CustomEvent('swimit:pool-website-updated', { detail: body }),
      );
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
              setCustomBoxPhotoFiles({});
              setClearCustomBoxPhotos({});
              resetLayoutHistory();
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
        <form id="pool-website-form" className="pass-form-card pool-core-form pool-website-form" onSubmit={onSubmit}>
          {error && editing ? <p className="error">{t(error)}</p> : null}
          <div className="pool-website-sections">
            <WebsiteSection
              title={t('Website appearance')}
              description={t('Choose the colour theme visitors see on your public pool website.')}
            >
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
                <div className="pool-website-theme-preview" style={websiteThemeStyle(form.themeColor)}>
                  <span className="pool-website-theme-preview-chip">{t('Join as a swimmer')}</span>
                  <span className="pool-website-theme-preview-text">{t('Sample website')}</span>
                </div>
              </div>
            </WebsiteSection>

            <WebsiteSection
              title={t('Welcome banner')}
              description={t('Welcome message and large image at the top of your public website.')}
            >
              <label className="field">
                <span className="label">{t('About the pool')}</span>
                {editing ? (
                  <textarea
                    rows={3}
                    value={form.about}
                    onChange={(e) => update({ about: e.target.value })}
                    placeholder={t('Leave blank to show the sample welcome text.')}
                  />
                ) : (
                  <p className="pool-core-view-value pool-core-view-multiline pool-website-view-text">
                    {form.about.trim() || '—'}
                  </p>
                )}
              </label>
              <WebsitePhotoField
                label={t('Banner photo')}
                editing={editing}
                file={photoFiles.banner}
                existingUrl={bustPhotoUrl(form.bannerPhotoUrl)}
                cleared={clearPhotos.banner}
                onPick={(file) => updatePhoto('banner', file)}
                onClear={() => clearPhoto('banner')}
              />
            </WebsiteSection>

            <WebsiteSection
              title={t('Background & history')}
              description={t('Your pool’s story and an optional photo beside this section on the website.')}
            >
              <label className="field">
                <span className="label">{t('History text')}</span>
                {editing ? (
                  <textarea
                    rows={4}
                    value={form.history}
                    onChange={(e) => update({ history: e.target.value })}
                    placeholder={t('Leave blank to show the sample history text.')}
                  />
                ) : (
                  <p className="pool-core-view-value pool-core-view-multiline pool-website-view-text">
                    {form.history.trim() || '—'}
                  </p>
                )}
              </label>
              <WebsitePhotoField
                label={t('Background photo')}
                editing={editing}
                file={photoFiles.history}
                existingUrl={bustPhotoUrl(form.historyPhotoUrl)}
                cleared={clearPhotos.history}
                onPick={(file) => updatePhoto('history', file)}
                onClear={() => clearPhoto('history')}
              />
            </WebsiteSection>

            <WebsiteSection
              title={t('Pool information')}
              description={t('Opening hours, facilities, and a photo shown with these details on the website.')}
            >
              <div className="pool-website-section-grid-2">
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
                    <p className="pool-core-view-value pool-core-view-multiline pool-website-view-text">
                      {form.facilities.trim() || '—'}
                    </p>
                  )}
                </label>
              </div>
              <WebsitePhotoField
                label={t('Pool info photo')}
                editing={editing}
                file={photoFiles.info}
                existingUrl={bustPhotoUrl(form.infoPhotoUrl)}
                cleared={clearPhotos.info}
                onPick={(file) => updatePhoto('info', file)}
                onClear={() => clearPhoto('info')}
              />
            </WebsiteSection>

            <WebsiteSection
              title={t('Our batches')}
              description={t('Intro text for the batches area. Batch names and times come from your Batches setup.')}
            >
              <label className="field">
                <span className="label">{t('About batches')}</span>
                {editing ? (
                  <textarea
                    rows={3}
                    value={form.batchesText}
                    onChange={(e) => update({ batchesText: e.target.value })}
                  />
                ) : (
                  <p className="pool-core-view-value pool-core-view-multiline pool-website-view-text">
                    {form.batchesText.trim() || '—'}
                  </p>
                )}
              </label>
            </WebsiteSection>

            <WebsiteSection
              title={t('Our coaches')}
              description={t('Intro text for coaches. Names come from staff registration; optionally show their photos.')}
            >
              <label className="field">
                <span className="label">{t('About coaches')}</span>
                {editing ? (
                  <textarea
                    rows={3}
                    value={form.coachesText}
                    onChange={(e) => update({ coachesText: e.target.value })}
                  />
                ) : (
                  <p className="pool-core-view-value pool-core-view-multiline pool-website-view-text">
                    {form.coachesText.trim() || '—'}
                  </p>
                )}
              </label>
              <div className="field">
                <label className="checkbox-row pool-website-coach-photo-toggle">
                  <input
                    type="checkbox"
                    checked={form.showCoachPhotos}
                    onChange={(e) => update({ showCoachPhotos: e.target.checked })}
                    disabled={!editing}
                  />
                  <span>{t('Add photo')}</span>
                </label>
                <p className="hint">
                  {t('When ticked, each coach’s staff registration photo appears beside their name on the website.')}
                </p>
              </div>
            </WebsiteSection>

            <WebsiteSection
              title={t('Achievements')}
              description={t('Medals, programmes, or milestones you want to highlight on the website.')}
            >
              <div className="field">
                <span className="label">{t('Achievement list')}</span>
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
                existingUrl={bustPhotoUrl(form.achievementsPhotoUrl)}
                cleared={clearPhotos.achievements}
                onPick={(file) => updatePhoto('achievements', file)}
                onClear={() => clearPhoto('achievements')}
              />
            </WebsiteSection>

            <WebsiteSection
              title={t('Page layout')}
              description={t('Drag section borders to set how much space each area uses on the public website.')}
            >
              <WebsiteLayoutEditor
                layout={form.layout}
                disabled={!editing}
                onLayoutChange={setLayoutLive}
                onLayoutCheckpoint={checkpointLayoutHistory}
                canUndo={layoutHistory.past.length > 0}
                canRedo={layoutHistory.future.length > 0}
                onUndo={undoLayout}
                onRedo={redoLayout}
              />

              {editing ? (
                <p className="pool-layout-editor-reset">
                  <button type="button" className="terms-link" onClick={resetLayoutToDefault}>
                    {t('Reset layout to default')}
                  </button>
                </p>
              ) : null}

              <div className="field">
                <span className="label">{t('Custom boxes')}</span>
                {editing ? (
                  <div className="pool-website-custom-boxes">
                    {form.layout.customBoxes.map((box, index) => (
                      <div className="pool-website-custom-box-row" key={box.id}>
                        <input
                          value={box.title}
                          onChange={(e) => updateCustomBox(index, { title: e.target.value })}
                          placeholder={t('Box title')}
                          aria-label={t('Box title')}
                        />
                        <textarea
                          rows={3}
                          value={box.body}
                          onChange={(e) => updateCustomBox(index, { body: e.target.value })}
                          placeholder={t('Box text')}
                          aria-label={t('Box text')}
                        />
                        <WebsitePhotoField
                          label={t('Box photo')}
                          editing={editing}
                          file={customBoxPhotoFiles[box.id] ?? null}
                          existingUrl={bustPhotoUrl(box.photoUrl ?? null)}
                          cleared={clearCustomBoxPhotos[box.id] ?? false}
                          onPick={(file) => updateCustomBoxPhoto(box.id, file)}
                          onClear={() => clearCustomBoxPhoto(box.id)}
                        />
                        <button
                          type="button"
                          className="terms-link"
                          onClick={() => {
                            setCustomBoxPhotoFiles((prev) => {
                              const next = { ...prev };
                              delete next[box.id];
                              return next;
                            });
                            setClearCustomBoxPhotos((prev) => {
                              const next = { ...prev };
                              delete next[box.id];
                              return next;
                            });
                            updateLayout({
                              customBoxes: form.layout.customBoxes.filter((_, i) => i !== index),
                            });
                          }}
                        >
                          {t('Remove')}
                        </button>
                      </div>
                    ))}
                    {form.layout.customBoxes.length < 8 ? (
                      <button
                        type="button"
                        className="terms-link"
                        onClick={() => {
                          const index = form.layout.customBoxes.length;
                          updateLayout({
                            customBoxes: [
                              ...form.layout.customBoxes,
                              {
                                id: `custom-${Date.now()}`,
                                title: '',
                                body: '',
                                rect: defaultCustomBoxRect(index),
                                photoUrl: null,
                              },
                            ],
                          });
                        }}
                      >
                        {t('Add box')}
                      </button>
                    ) : null}
                  </div>
                ) : form.layout.customBoxes.length === 0 ? (
                  <p className="pool-core-view-value">—</p>
                ) : (
                  <ul className="pool-website-custom-box-view">
                    {form.layout.customBoxes.map((box) => (
                      <li key={box.id}>
                        <strong>{box.title || '—'}</strong>
                        {box.photoUrl ? (
                          <img src={bustPhotoUrl(box.photoUrl) ?? box.photoUrl} alt="" />
                        ) : null}
                        {box.body ? <span>{box.body}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </WebsiteSection>
          </div>
        </form>
      ) : null}
    </PlatformPage>
  );
}
