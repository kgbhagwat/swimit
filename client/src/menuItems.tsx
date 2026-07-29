import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MenuSection } from './menuCatalog';

export type MenuItem = {
  to: string;
  label: string;
  icon: ReactNode;
  section: MenuSection;
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
    section: 'Operations',
    to: '/whatsapp',
    label: 'WhatsApp',
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
    to: '/swimmers',
    label: "Swimmer's List",
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
    label: 'Pool Core Info',
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
    label: 'Batch List',
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
    to: '/coach-payment',
    label: 'Coach Payment',
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
    to: '/pool-expenses',
    label: 'Pool Expenses',
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
    section: 'Information',
    to: '/balance-sheet',
    label: 'Balance Sheet',
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
    section: 'Setup',
    to: '/holiday-management',
    label: 'Holiday Management',
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
    section: 'User Management',
    to: '/create-user',
    label: 'Create User',
    icon: (
      <IconWrap>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="10" cy="8" r="3.2" />
          <path d="M4 19c1.1-3 3.2-4.5 6-4.5" />
          <path d="M16 11v6M13 14h6" />
        </svg>
      </IconWrap>
    ),
  },
  {
    section: 'User Management',
    to: '/user-management',
    label: 'User Management',
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
];

export function MenuTiles({
  items,
  appPath,
  section,
}: {
  items: MenuItem[];
  appPath: (path: string) => string;
  section: MenuSection;
}) {
  if (items.length === 0) {
    return <p className="menu-section-empty">No pages in {section} yet.</p>;
  }

  return (
    <nav className="menu-grid" aria-label={`${section} pages`}>
      {items.map((item) => (
        <Link key={item.to} className="menu-tile" to={appPath(item.to)}>
          {item.icon}
          <span className="menu-tile-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
