import { Link, useNavigate } from 'react-router-dom';
import { useT } from './i18n';
import { MarketingFeatureIcon } from './MarketingFeatureIcon';
import { MarketingLayout } from './MarketingLayout';
import { MARKETING_FEATURES } from './marketingFeatures';

export function MarketingHome() {
  const t = useT();
  const navigate = useNavigate();

  function openExpandedApplication() {
    try {
      sessionStorage.setItem('swimIT.applicationPreviewFullscreen', '1');
    } catch {
      /* ignore */
    }
    navigate('/application/dashboard?expand=1');
  }

  return (
    <MarketingLayout>
      <section className="marketing-hero" aria-label={t('Home')}>
        <div className="marketing-hero-copy">
          <h1 className="marketing-hero-title">
            {t('Smart Pool Management,')}{' '}
            <span className="marketing-hero-accent">{t('Simplified.')}</span>
          </h1>
          <p className="marketing-hero-lead">
            {t(
              'SwimIT is an all-in-one platform to manage your swimming pool operations, members, schedules and more — effortlessly.',
            )}
          </p>
          <div className="marketing-hero-actions">
            <Link to="/create-account" className="marketing-btn marketing-btn--primary marketing-btn--lg">
              {t('Get Started')}
              <span className="marketing-btn-arrow" aria-hidden>
                →
              </span>
            </Link>
            <Link to="/features" className="marketing-btn marketing-btn--outline marketing-btn--lg">
              {t('Explore Features')}
            </Link>
          </div>
        </div>
        <div className="marketing-hero-visual" aria-hidden="true">
          <img
            src="/marketing-hero-swimmer.jpg"
            alt=""
            className="marketing-hero-image"
          />
        </div>
      </section>

      <div className="marketing-wave" aria-hidden="true">
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none">
          <path
            d="M0,48 C240,90 480,8 720,40 C960,72 1200,18 1440,48 L1440,90 L0,90 Z"
            fill="#d7ebf8"
          />
          <path
            d="M0,58 C260,20 520,88 780,52 C1040,16 1240,70 1440,42 L1440,90 L0,90 Z"
            fill="#c5e2f5"
          />
        </svg>
      </div>

      <section className="marketing-highlights" aria-label={t('Why SwimIT')}>
        <div className="marketing-highlight">
          <span className="marketing-highlight-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3.5l7 3v5.2c0 4.4-2.9 7.8-7 9.3-4.1-1.5-7-4.9-7-9.3V6.5l7-3z" />
              <path d="M9.2 12.1l1.9 1.9 3.8-4" />
            </svg>
          </span>
          <span>{t('Easy to Use')}</span>
        </div>
        <div className="marketing-highlight">
          <span className="marketing-highlight-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8.5a4 4 0 0 1 8 0V11" />
            </svg>
          </span>
          <span>{t('Secure & Reliable')}</span>
        </div>
        <div className="marketing-highlight">
          <span className="marketing-highlight-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 19V5M4 19h16" />
              <path d="M8 16v-5M12 16V8M16 16v-3" />
            </svg>
          </span>
          <span>{t('Data Driven')}</span>
        </div>
      </section>

      <section className="marketing-features-strip" aria-labelledby="marketing-features-heading">
        <h2 id="marketing-features-heading" className="marketing-section-title">
          {t('Everything You Need To Run Your Pool Better')}
        </h2>
        <div className="marketing-features-grid">
          {MARKETING_FEATURES.map((feature) => (
            <article key={feature.id} className="marketing-feature-item">
              <div className="marketing-feature-icon">
                <MarketingFeatureIcon icon={feature.icon} />
              </div>
              <h3>{t(feature.title)}</h3>
              <p>{t(feature.summary)}</p>
            </article>
          ))}
        </div>
        <div className="marketing-features-cta">
          <button
            type="button"
            className="marketing-btn marketing-btn--outline"
            onClick={openExpandedApplication}
          >
            {t('View Application')}
          </button>
        </div>
      </section>
    </MarketingLayout>
  );
}
