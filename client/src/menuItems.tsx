import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from './i18n';
import type { MenuSection } from './menuCatalog';
import { tenantPath } from './tenantSession';

export type MenuItem = {
  to: string;
  label: string;
  icon: ReactNode;
  section: MenuSection;
  /** What this submenu does */
  does: string;
  /** How it helps the pool */
  helps: string;
};

const SECTION_INTROS: Record<MenuSection, string> = {
  Setup:
    'This is one time setup. It asks about basic information about your pool, which is mandatory for running any pool. You need to provide this information initially after opening an account with SwimIT. You can change it whenever you want.',
  Operations:
    'Run the daily desk and gate work — take pass payments, scan entries, message members, and track payables.',
  Information:
    'See the pool dashboard, look up swimmers and staff, review attendance, and check payment summaries.',
  Forms:
    'Capture new swimmer and staff details with standard registration forms.',
};

function IconWrap({ children }: { children: ReactNode }) {
  return (
    <span className="menu-tile-icon" aria-hidden>
      {children}
    </span>
  );
}

/** Shared section tile definitions (icons + labels) for AppShell / menus. */
export const MENU_ITEMS: MenuItem[] = [
  {
    section: 'Forms',
    to: '/register',
    label: 'Registration form',
    does: 'Registers a new swimmer with contact details, identity, and profile photo.',
    helps:
      'Keeps every swimmer record in one place so desk staff can enrol quickly without paper forms.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5" />
          <path d="M17.5 7.5v4M15.5 9.5h4" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Forms',
    to: '/staff-register',
    label: 'Staff registration',
    does: 'Registers coaches, lifeguards, and other staff with role and contact details.',
    helps:
      'Builds a clear staff roster you can assign to batches and use for coach payment later.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="10" cy="8" r="3" />
          <path d="M4.5 19c1-2.8 2.9-4.2 5.5-4.2 1.2 0 2.3.3 3.2.9" />
          <path d="M15.5 11.5c1.8 0 3.2 1.2 3.8 3.5" />
          <path d="M16.2 7.2l1.3-2.2 1.3 2.2 2.4.3-1.8 1.7.5 2.4-2.4-1.3-2.4 1.3.5-2.4-1.8-1.7z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/pass-payment',
    label: 'Pass Payment',
    does: 'Collects cash or online payment and issues or renews a swimmer’s digital pass.',
    helps:
      'Turns payment into an active pass in one step, ready to send on WhatsApp and scan at the gate.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/dashboard',
    label: 'Dashboard',
    does: 'Shows active swimmers, today’s attendance, expiring passes, and payment totals.',
    helps:
      'Gives owners and desk staff a clear picture of the pool before diving into detailed lists.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
          <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" />
          <rect x="3.5" y="13" width="7" height="7.5" rx="1.5" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/swimmers',
    label: "Swimmer's List",
    does: 'Lists active and inactive swimmers with pass, batch, and coach details.',
    helps:
      'Find anyone fast, open their profile or pass, and keep records up to date after registration.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="2.6" />
          <circle cx="16" cy="9" r="2.2" />
          <path d="M3.8 18.5c1-2.6 2.8-3.9 5.2-3.9 1.4 0 2.5.4 3.4 1.1" />
          <path d="M12.8 18.5c.7-1.8 2-2.8 3.8-2.8 1.5 0 2.6.6 3.4 1.8" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/pass-scanner',
    label: 'Pass Scanner',
    does: 'Scans a swimmer’s QR / ID pass at the gate to mark daily attendance.',
    helps:
      'Speeds entry, confirms who is allowed in today, and keeps attendance accurate without a paper register.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 4H5a1 1 0 0 0-1 1v2M17 4h2a1 1 0 0 1 1 1v2M7 20H5a1 1 0 0 1-1-1v-2M17 20h2a1 1 0 0 0 1-1v-2" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/attendance-sheet',
    label: 'Attendance Sheet',
    does: 'Shows month-wise attendance for batches or individual swimmers.',
    helps:
      'Gives coaches and managers a clear view of who came, for follow-up and pass validity checks.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/pool-core-info',
    label: 'Core Info',
    does: 'Stores your swimming pool name, address, timings, and basic facility details.',
    helps:
      'Keeps the account identity consistent on passes, forms, and reports so members see the right pool details.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 19h16" />
          <path d="M6 19V9l6-4 6 4v10" />
          <path d="M10 19v-4h4v4" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/batches',
    label: 'Batches',
    does: 'Defines swimming session schedules — start/end times, duration, and breaks.',
    helps:
      'Lets you assign swimmers to the right slots and avoid overlapping batches at the pool.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/pass-types',
    label: 'Pass Type',
    does: 'Creates pass products with duration, pricing, and rules for sale at the desk.',
    helps:
      'Standardises what you sell (monthly, quarterly, etc.) so payments and expiry dates stay consistent.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <circle cx="9" cy="12" r="1.6" />
          <path d="M13 11h4M13 14h3" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/coaches',
    label: 'Staff List',
    does: 'Lists coaches, lifeguards, and other staff with their role and contact info.',
    helps:
      'Makes it easy to pick the right coach for a batch and keep staff certificates and details organised.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="6" width="6" height="12" rx="3" />
          <rect x="13" y="6" width="6" height="12" rx="3" />
          <circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/pool-expenses',
    label: 'Pool Expenses',
    does: 'Records day-to-day pool costs such as chemicals, utilities, and supplies.',
    helps:
      'Tracks spending in one place so you can see where money goes and feed the balance sheet.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v4h4M8 12h8M8 16h6" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/coach-payment',
    label: 'Coach Payment',
    does: 'Calculates coach payouts from attendance or agreed payment rules for a period.',
    helps:
      'Saves manual spreadsheet work and gives a fair, clear summary before you pay coaches.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="2.8" />
          <path d="M4 18.5c1-2.8 2.9-4.2 5-4.2s4 1.4 5 4.2" />
          <circle cx="17.5" cy="13.5" r="3.2" />
          <path d="M17.5 11.8v3.4M16.2 13.5h2.6" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/swimmer-progress',
    label: 'Swimmer Progress',
    does: 'Records race times for competitive batch swimmers by date, stroke, and distance.',
    helps:
      'Lets coaches track how each competitive swimmer is improving over timed repeats.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 7.5v5.1l3.2 1.8" />
          <path d="M5 16.5h3.2l1.1 2.1h5.4l1.1-2.1H19" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/water-quality',
    label: 'Water Quality',
    does: 'Records daily water quality checks and related readings for the pool.',
    helps:
      'Keeps a month-wise log so staff can track water conditions and download records when needed.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3c-3.6 4.2-6 7.4-6 10.2A6 6 0 0 0 12 19a6 6 0 0 0 6-5.8C18 10.4 15.6 7.2 12 3z" />
          <path d="M9.5 14.2c.4 1.4 1.5 2.3 2.5 2.3" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Operations',
    to: '/whatsapp',
    label: 'WhatsApp Broadcast',
    does: 'Sends messages to active swimmers or staff and reviews inbound WhatsApp images.',
    helps:
      'Reaches members quickly for notices, and collects payment screenshots or certificates without email chase-ups.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3.5a8 8 0 0 0-6.9 12.1L4 20.5l5-1.1A8 8 0 1 0 12 3.5z" />
          <path d="M9.2 9.4c.3-.5.6-.5.9-.5h.3c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.3.5.8 1.1 1.4 1.5.4.3.7.2.9 0l.6-.7c.2-.2.4-.2.6-.1l1.8.5c.3.1.4.2.4.5v.4c0 .3-.2.7-.7.9-.9.4-2.1.3-3.6-.6-1.7-1.1-2.9-2.7-3.3-3.8-.3-.8-.2-1.4.1-1.7z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/balance-sheet',
    label: 'Balance Sheet',
    does: 'Summarises income, expenses, and overall pool profitability for a period.',
    helps:
      'Gives owners a quick health check of the business without exporting data to Excel.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 19V10M10 19V6M15 19v-7M20 19V8" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/payment-details',
    label: 'Payment Details',
    does: 'Shows pass payment history and transaction details for swimmers.',
    helps:
      'Helps resolve payment queries, confirm online transfers, and audit who paid for which pass.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h3" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Information',
    to: '/progress-trend',
    label: 'Progress Trend',
    does: 'Shows all recorded dates for a selected stroke and distance.',
    helps:
      'Lets coaches compare each swimmer’s times across sessions without changing stroke or distance per column.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 7.5v5.1l3.2 1.8" />
          <path d="M5 16.5h3.2l1.1 2.1h5.4l1.1-2.1H19" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/holiday-management',
    label: 'Holidays',
    does: 'Marks pool holidays and closed days on the calendar.',
    helps:
      'Stops attendance and scheduling surprises on closed days and keeps members informed.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/user-management',
    label: 'User Management',
    does: 'Creates login users, sets which menus each person can open or edit, and how long a login session stays active.',
    helps:
      'Onboards staff with WhatsApp passwords and protects sensitive screens by role.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="2.8" />
          <circle cx="16.5" cy="9" r="2.2" />
          <path d="M3.5 18.5c1-2.7 2.8-4 5.5-4 1.3 0 2.4.3 3.3.9" />
          <path d="M13.2 18.5c.7-1.7 2-2.7 3.8-2.7 1.4 0 2.5.5 3.3 1.6" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/pool-website',
    label: 'Pool website',
    does: 'Edits the public pool webpage: about, batches, coaches, and achievements.',
    helps:
      'Lets visitors see your pool story on the account website, while staff still log in from the top right.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16" />
          <path d="M12 4c2.5 2.8 2.5 13.2 0 16" />
          <path d="M12 4c-2.5 2.8-2.5 13.2 0 16" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/form-info',
    label: 'Form Info',
    does: 'Lists registration form fields and lets you mark each one mandatory or optional.',
    helps:
      'Keeps swimmer and staff forms aligned with what your pool actually needs to collect.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'Setup',
    to: '/activity-log',
    label: 'Activity Log',
    does: 'Shows who created, edited, or deleted records in this account, with date and time.',
    helps:
      'Gives admins a clear trail of changes so mistakes and unauthorised edits can be traced.',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 4.5h14v15H5z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </IconWrap>
    ),
  },
];

export function MenuTiles({
  items,
  section,
}: {
  items: MenuItem[];
  section: MenuSection;
}) {
  const t = useT();

  if (items.length === 0) {
    return <p className="menu-section-empty">{t(`No pages in ${section} yet.`)}</p>;
  }

  return (
    <div className="menu-section-overview">
      <p className="lede menu-section-intro">{t(SECTION_INTROS[section])}</p>
      <nav className="menu-desc-list" aria-label={`${t(section)} pages`}>
        {items.map((item) => (
          <article key={item.to} className="menu-desc-item">
            <h2 className="menu-desc-title">
              <Link className="menu-desc-link" to={tenantPath(item.to)}>
                {t(item.label)}
              </Link>
            </h2>
            <p className="menu-desc-text">{t(item.does)}</p>
            <p className="menu-desc-text">{t(item.helps)}</p>
          </article>
        ))}
      </nav>
    </div>
  );
}
