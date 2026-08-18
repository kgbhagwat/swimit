import { useT } from './i18n';
import { PlatformShell } from './PlatformShell';
import { PlatformPage } from './PlatformPage';
import { WorkflowDiagram } from './WorkflowDiagram';

/** Marketing home (`/`) — application overview only; no permanent app chrome. */
export function MainMenu() {
  const t = useT();

  return (
    <PlatformShell>
      <PlatformPage title="Application overview" className="home-overview-page">
        <section className="home-app-overview" aria-label={t('Application overview')}>
          <figure className="home-app-functionality">
            <img
              src="/swimit-functionality.png"
              alt={t('SwimIT functionality overview')}
              className="home-app-functionality-image"
            />
          </figure>

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
            {t(
              'Helps to send broadcast message to all active swimmers and All staff members.',
            )}{' '}
            {t('Pass-expiry reminders and broadcasts are ₹1 per message, billed separately.')}
            </li>
          </ul>

          <WorkflowDiagram />

        </section>
      </PlatformPage>
    </PlatformShell>
  );
}
