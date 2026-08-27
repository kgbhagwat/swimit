import { Link } from 'react-router-dom';
import { useT } from './i18n';
import {
  emptyWebsiteContent,
  websiteThemeStyle,
  withWebsiteSamples,
  type PoolWebsiteContent,
} from './poolWebsite';

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
}: {
  content: PoolWebsiteContent | null;
  registerHref: string;
  onLogin: () => void;
}) {
  const t = useT();
  const raw = content ?? emptyWebsiteContent();
  const site = withWebsiteSamples(raw, raw.poolName);
  const name = site.poolName.trim() || 'Swimming pool';
  const initial = name.slice(0, 1).toUpperCase() || 'P';

  return (
    <div className="pool-site" style={websiteThemeStyle(site.themeColor)}>
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
            <span>{t('Sample website')}</span>
          </div>
        </div>
        <div className="pool-site-nav-actions">
          <Link to={registerHref} className="pool-site-cta">
            {t('Join as a swimmer')}
          </Link>
          <button type="button" className="pool-site-login" onClick={onLogin}>
            {t('Login')}
          </button>
        </div>
      </header>

      <div className="pool-site-split">
        <aside className="pool-site-banner">
          <img src={site.bannerPhotoUrl || '/marketing-hero-swimmer.jpg'} alt="" />
          <div className="pool-site-banner-copy">
            <p className="pool-site-kicker">{t('Swimming pool')}</p>
            <h1>
              {t('Welcome to')} {name}
            </h1>
            <p>{site.about}</p>
          </div>
        </aside>

        <section className={`pool-site-story${site.historyPhotoUrl ? ' pool-site-story--photo' : ''}`}>
          <SectionPhoto src={site.historyPhotoUrl} className="pool-site-story-photo" />
          <div>
            <h2>{t('Background & history')}</h2>
            <p>{site.history}</p>
          </div>
        </section>

        <main className="pool-site-board">
          <section className={`pool-site-intro${site.infoPhotoUrl ? ' pool-site-intro--photo' : ''}`}>
            <SectionPhoto src={site.infoPhotoUrl} className="pool-site-info-photo" />
            <div className="pool-site-meta">
              <article>
                <h2>{t('Opening hours')}</h2>
                <p>{site.openingHours}</p>
              </article>
              <article>
                <h2>{t('Facilities')}</h2>
                <p>{site.facilities}</p>
              </article>
              <article>
                <h2>{t('Contact')}</h2>
                <p>{site.poolAddress || t('Visit us at the pool, or join as a new swimmer.')}</p>
              </article>
            </div>
          </section>

          <div className="pool-site-columns">
            <section className="pool-site-panel">
              <SectionPhoto src={site.batchesPhotoUrl} className="pool-site-panel-photo" />
              <h2>{t('Our batches')}</h2>
              <p className="pool-site-section-lead">{site.batchesText}</p>
              <ul className="pool-site-list">
                {site.batches.map((batch) => (
                  <li key={`${batch.name}-${batch.startTime}`}>
                    <div>
                      <strong>{batch.name}</strong>
                      <span>{batch.type}</span>
                    </div>
                    <span className="pool-site-time">
                      {batch.startTime} – {batch.endTime}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="pool-site-panel">
              <SectionPhoto src={site.coachesPhotoUrl} className="pool-site-panel-photo" />
              <h2>{t('Our coaches')}</h2>
              <p className="pool-site-section-lead">{site.coachesText}</p>
              <ul className="pool-site-list">
                {site.coaches.map((coach) => (
                  <li key={`${coach.name}-${coach.role}`}>
                    <div>
                      <strong>{coach.name}</strong>
                      <span>{coach.role}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="pool-site-panel">
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
          </div>
        </main>
      </div>

      <footer className="pool-site-footer">
        <span>
          {name} · {t('Sample website')}
        </span>
        <Link to="/">{t('Powered by SwimIT')}</Link>
      </footer>
    </div>
  );
}
