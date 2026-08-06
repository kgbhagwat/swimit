import { useT } from './i18n';
import { PlatformShell } from './PlatformShell';
import { PlatformPage } from './PlatformPage';

/** Marketing home (`/`) — application overview only; no permanent app chrome. */
export function MainMenu() {
  const t = useT();

  return (
    <PlatformShell>
      <PlatformPage title="Application overview" className="home-overview-page">
        <section className="home-app-overview" aria-label={t('Application overview')}>
          <p>
            <strong>SwimIT</strong>{' '}
            {t(
              'is a cloud-based Swimming Pool Management System (SaaS) built for pool operators and aquatic clubs.',
            )}
          </p>
          <p>
            {t(
              'It helps digitize the day-to-day work of a pool. You can create batches, pass types, and a holiday calendar as per pool requirements. Register swimmers and coaches/staff with standard registration form.',
            )}
          </p>
          <p>
            {t(
              'After selecting batch and coach, payments can be taken in cash or online. This creates a digital pass for the swimmer, which is sent to their mobile. Which can be scanned daily for attendance. So attendance stays up to date automatically.',
            )}
          </p>
          <p>
            {t(
              'It helps to maintain pool expenses in one place. It calculates coach payments as well. This helps to check pool profitability anytime with the balance sheet feature. Different roles can be assigned to staff with controlled access for this application.',
            )}
          </p>

          <h3>{t('How it helps pool management')}</h3>
          <ul className="home-app-overview-points">
            <li>
              {t('One place for')}{' '}
              <strong>{t('registration, payments, attendance, and staff')}</strong>{' '}
              {t('instead of paper registers and scattered sheets')}
            </li>
            <li>
              {t('Faster gate control with')} <strong>{t('QR / ID scanning')}</strong>{' '}
              {t('and clear who is allowed in today')}
            </li>
            <li>
              {t('Role-based access so desk, gate, coaches, and admin see only what they need')}
            </li>
            <li>
              {t('Optional finance tools for expenses, coach payouts, and a simple balance view')}
            </li>
            <li>
              {t('Helps to send broadcast message to all active swimmers and All staff members.')}
            </li>
          </ul>

          <h3>{t('Workflow')}</h3>
          <div className="home-workflow" aria-label={t('SwimIT workflow')}>
            <div className="home-workflow-row">
              <div className="home-workflow-step">{t('Create Account')}</div>
              <div className="home-workflow-step">{t('Add pool information')}</div>
              <div className="home-workflow-step">
                {t('Define Batch, Pass type, holidays calendar')}
              </div>
              <div className="home-workflow-step">{t('Registration of Coach/Staff')}</div>
            </div>
            <div className="home-workflow-row home-workflow-row-rtl">
              <div className="home-workflow-step">
                {t('Create users and control access per role')}
              </div>
              <div className="home-workflow-step">{t('Registration of swimmer')}</div>
              <div className="home-workflow-step">{t('Batch & Coach Selection')}</div>
              <div className="home-workflow-step">{t('Payment and pass creation')}</div>
            </div>
            <div className="home-workflow-row home-workflow-row-tail">
              <div className="home-workflow-step">{t('Scan pass for attendance')}</div>
              <div className="home-workflow-step">{t('Enter day to day expenses')}</div>
            </div>
          </div>

          <h3>{t('Information get created')}</h3>
          <div className="home-info-flow" aria-label={t('Information created by SwimIT')}>
            <div className="home-info-flow-step">{t('Swimmer List')}</div>
            <div className="home-info-flow-step">
              {t('Coach/ Staff List along with Certificate')}
            </div>
            <div className="home-info-flow-step">{t('Coach Payment calculation')}</div>
            <div className="home-info-flow-step">{t('Balance Sheet')}</div>
          </div>
        </section>
      </PlatformPage>
    </PlatformShell>
  );
}
