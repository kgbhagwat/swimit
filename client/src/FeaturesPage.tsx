import { Link } from 'react-router-dom';
import { useT } from './i18n';
import { MarketingFeatureIcon } from './MarketingFeatureIcon';
import { MarketingLayout } from './MarketingLayout';
import { MARKETING_FEATURES } from './marketingFeatures';

export function FeaturesPage() {
  const t = useT();

  return (
    <MarketingLayout>
      <section className="marketing-features-page">
        <header className="marketing-features-page-head">
          <p className="marketing-eyebrow">{t('Features')}</p>
          <h1>{t('Everything You Need To Run Your Pool Better')}</h1>
          <p className="marketing-features-page-lead">
            {t(
              'Explore the SwimIT toolkit for members, schedules, water quality, payments, attendance, messaging, and day-to-day pool operations.',
            )}
          </p>
        </header>

        <div className="marketing-features-list">
          {MARKETING_FEATURES.map((feature) => (
            <article key={feature.id} className="marketing-feature-detail">
              <div className="marketing-feature-icon marketing-feature-icon--lg">
                <MarketingFeatureIcon icon={feature.icon} />
              </div>
              <div className="marketing-feature-detail-copy">
                <h2>{t(feature.title)}</h2>
                <p>{t(feature.summary)}</p>
                <ul>
                  {feature.details.map((detail) => (
                    <li key={detail}>{t(detail)}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <div className="marketing-features-page-actions">
          <Link to="/create-account" className="marketing-btn marketing-btn--primary marketing-btn--lg">
            {t('Get Started')}
          </Link>
          <Link to="/service-packages" className="marketing-btn marketing-btn--outline marketing-btn--lg">
            {t('Pricing')}
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
