export type MarketingFeature = {
  id: string;
  title: string;
  summary: string;
  details: string[];
  icon: 'members' | 'schedule' | 'reports' | 'alerts' | 'integration';
};

export const MARKETING_FEATURES: MarketingFeature[] = [
  {
    id: 'members',
    title: 'Members Management',
    summary: 'Manage member details, plans, renewals and attendance seamlessly.',
    details: [
      'Register swimmers with standard forms and digital records',
      'Track pass types, renewals, and active membership status',
      'Mark attendance with QR / ID scanning at the gate',
    ],
    icon: 'members',
  },
  {
    id: 'schedule',
    title: 'Schedule Management',
    summary: 'Create, manage and update schedules in real-time.',
    details: [
      'Define batches, coaches, and holiday calendars for your pool',
      'Keep desk and coaching staff aligned on daily slots',
      'Update schedules without paper registers or scattered sheets',
    ],
    icon: 'schedule',
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    summary: 'Get actionable insights with detailed reports and analytics.',
    details: [
      'Review attendance, payments, and expenses together',
      'Check pool profitability with balance sheet views',
      'Export lists when you need offline follow-up',
    ],
    icon: 'reports',
  },
  {
    id: 'alerts',
    title: 'Automated Alerts',
    summary: 'Receive instant alerts for critical tasks and important updates.',
    details: [
      'Notify members about payments and renewals',
      'Send broadcast messages to swimmers and staff',
      'Keep operations moving with timely WhatsApp updates',
    ],
    icon: 'alerts',
  },
  {
    id: 'integration',
    title: 'System Integration',
    summary: 'Integrate with devices and tools for a truly connected system.',
    details: [
      'Connect payments, messaging, and scanning into one workflow',
      'Give each role controlled access to the right screens',
      'Run pool operations from a single cloud platform',
    ],
    icon: 'integration',
  },
];
