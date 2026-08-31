import { Link } from 'react-router-dom';
import { useEffect, useState, type CSSProperties } from 'react';
import { BatchTypeIcon } from './BatchTypeIcon';
import { useT } from './i18n';
import {
  emptyWebsiteContent,
  formatBatchTimeRange,
  customBoxHasContent,
  introCellRect,
  isLayoutRectVisible,
  poolWebsiteIsCustomized,
  rectStyle,
  resolvePublicWebsiteLayout,
  websiteThemeStyle,
  withWebsiteSamples,
  type LayoutRect,
  type PoolWebsiteContent,
} from './poolWebsite';

const POOL_SITE_STACK_BREAKPOINT = 1024;

function usePoolSiteStacked() {
  const [stacked, setStacked] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${POOL_SITE_STACK_BREAKPOINT}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${POOL_SITE_STACK_BREAKPOINT}px)`);
    const update = () => setStacked(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return stacked;
}

function boxStyle(stacked: boolean, rect: LayoutRect): CSSProperties | undefined {
  return stacked ? undefined : rectStyle(rect);
}

function SectionPhoto({
  src,
  className,
}: {
  src: string | null | undefined;
  className: string;
}) {
  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}

export function AccountPoolLanding({
  content,
  registerHref,
  onLogin,
  appHref,
}: {
  content: PoolWebsiteContent | null;
  registerHref: string;
  onLogin: () => void;
  appHref?: string;
}) {
  const t = useT();
  const raw = content ?? emptyWebsiteContent();
  const customized = poolWebsiteIsCustomized(raw);
  const site = withWebsiteSamples(raw, raw.poolName);
  const name = site.poolName.trim() || 'Swimming pool';
  const initial = name.slice(0, 1).toUpperCase() || 'P';
  const layout = resolvePublicWebsiteLayout(site.layout);
  const stacked = usePoolSiteStacked();

  return (
    <div
      className={['pool-site', stacked ? 'pool-site--stacked' : ''].filter(Boolean).join(' ')}
      style={websiteThemeStyle(site.themeColor)}
    >
      <header className="pool-site-nav">
        <div className="pool-site-brand">
          {site.poolLogoUrl ? (
            <img src={site.poolLogoUrl} alt="" className="pool-site-logo" />
          ) : (
            <span className="pool-site-logo pool-site-logo-fallback" aria-hidden>
              {initial}
            </span>
          )}
          <div className="pool-site-brand-text">
            <strong>{name}</strong>
            {!customized ? <span>{t('Sample website')}</span> : null}
          </div>
        </div>
        <div className="pool-site-nav-actions">
          <Link to={registerHref} className="pool-site-cta">
            {t('Join as a swimmer')}
          </Link>
          {appHref ? (
            <Link to={appHref} className="pool-site-login">
              {t('Back to application')}
            </Link>
          ) : (
            <button type="button" className="pool-site-login" onClick={onLogin}>
              {t('Login')}
            </button>
          )}
        </div>
      </header>

      <div
        className={[
          'pool-site-split',
          'pool-site-split--free',
          stacked ? 'pool-site-split--stacked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isLayoutRectVisible(layout.banner) ? (
        <aside
          className="pool-site-banner pool-site-free-box"
          style={boxStyle(stacked, layout.banner)}
        >
          <img src={site.bannerPhotoUrl || '/marketing-hero-swimmer.jpg'} alt="" />
          <div className="pool-site-banner-copy">
            <p className="pool-site-kicker">{t('Swimming pool')}</p>
            <h1>
              {t('Welcome to')} {name}
            </h1>
            <p>{site.about}</p>
          </div>
        </aside>
        ) : null}

        {isLayoutRectVisible(layout.intro) ? (
          <>
            <section
              className={[
                'pool-site-panel',
                'pool-site-info-cell',
                'pool-site-free-box',
                site.infoPhotoUrl ? 'pool-site-info-cell--photo' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={boxStyle(stacked, introCellRect(layout, 'batches'))}
            >
              {site.infoPhotoUrl ? (
                <SectionPhoto src={site.infoPhotoUrl} className="pool-site-info-photo" />
              ) : null}
              <div>
                <h2>{t('Opening hours')}</h2>
                <p>{site.openingHours}</p>
              </div>
            </section>
            <section
              className="pool-site-panel pool-site-info-cell pool-site-free-box"
              style={boxStyle(stacked, introCellRect(layout, 'coaches'))}
            >
              <h2>{t('Facilities')}</h2>
              <p>{site.facilities}</p>
            </section>
            <section
              className="pool-site-panel pool-site-info-cell pool-site-free-box"
              style={boxStyle(stacked, introCellRect(layout, 'achievements'))}
            >
              <h2>{t('Contact')}</h2>
              <p>{site.poolAddress || t('Visit us at the pool, or join as a new swimmer.')}</p>
            </section>
          </>
        ) : null}

        {isLayoutRectVisible(layout.batches) ? (
        <section className="pool-site-panel pool-site-free-box" style={boxStyle(stacked, layout.batches)}>
          <h2>{t('Our batches')}</h2>
          <p className="pool-site-section-lead">{site.batchesText}</p>
          <ul className="pool-site-list">
            {site.batches.map((batch) => (
              <li key={`${batch.name}-${batch.startTime}`}>
                <div className="pool-site-batch-row">
                  <BatchTypeIcon type={batch.type} />
                  <div>
                    <strong>{batch.name}</strong>
                    <span>{batch.type}</span>
                  </div>
                </div>
                <span className="pool-site-time">
                  {formatBatchTimeRange(batch.startTime, batch.endTime)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        ) : null}

        {isLayoutRectVisible(layout.coaches) ? (
        <section className="pool-site-panel pool-site-free-box" style={boxStyle(stacked, layout.coaches)}>
          <h2>{t('Our coaches')}</h2>
          <p className="pool-site-section-lead">{site.coachesText}</p>
          <ul className="pool-site-list">
            {site.coaches.map((coach) => (
              <li key={`${coach.name}-${coach.role}`}>
                <div className="pool-site-coach-row">
                  {site.showCoachPhotos ? (
                    coach.photoUrl ? (
                      <img src={coach.photoUrl} alt="" className="pool-site-coach-avatar" />
                    ) : (
                      <span
                        className="pool-site-coach-avatar pool-site-coach-avatar-fallback"
                        aria-hidden
                      >
                        {coach.name.slice(0, 1).toUpperCase() || 'C'}
                      </span>
                    )
                  ) : null}
                  <div>
                    <strong>{coach.name}</strong>
                    <span>{coach.role}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        ) : null}

        {isLayoutRectVisible(layout.achievements) ? (
        <section
          className="pool-site-panel pool-site-free-box"
          style={boxStyle(stacked, layout.achievements)}
        >
          <SectionPhoto src={site.achievementsPhotoUrl} className="pool-site-panel-photo" />
          <h2>{t('Achievements')}</h2>
          <ul className="pool-site-list">
            {site.achievements.map((item) => (
              <li key={`${item.title}-${item.detail}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
        ) : null}

        {isLayoutRectVisible(layout.story) ? (
        <section
          className={[
            'pool-site-story',
            'pool-site-free-box',
            site.historyPhotoUrl ? 'pool-site-story--photo' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={boxStyle(stacked, layout.story)}
        >
          <SectionPhoto src={site.historyPhotoUrl} className="pool-site-story-photo" />
          <div>
            <h2>{t('Background & history')}</h2>
            <p>{site.history}</p>
          </div>
        </section>
        ) : null}

        {layout.customBoxes
          .filter((box) => isLayoutRectVisible(box.rect) && customBoxHasContent(box))
          .map((box) => (
          <section
            key={box.id}
            className={[
              'pool-site-custom-box',
              'pool-site-free-box',
              box.photoUrl ? 'pool-site-custom-box--photo' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={boxStyle(stacked, box.rect)}
          >
            {box.photoUrl ? (
              <img src={box.photoUrl} alt="" className="pool-site-custom-box-photo" />
            ) : null}
            <div className="pool-site-custom-box-copy">
              {box.title ? <h2>{box.title}</h2> : null}
              {box.body ? <p>{box.body}</p> : null}
            </div>
          </section>
        ))}
      </div>

      <footer className="pool-site-footer">
        <span>{customized ? name : `${name} · ${t('Sample website')}`}</span>
        <Link to="/">{t('Powered by SwimIT')}</Link>
      </footer>
    </div>
  );
}
