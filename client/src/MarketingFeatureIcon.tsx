import type { MarketingFeature } from './marketingFeatures';

export function MarketingFeatureIcon({
  icon,
}: {
  icon: MarketingFeature['icon'];
}) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case 'members':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5S14.2 16 15 19" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M16 14.2c2 .3 3.5 1.5 4.2 4.3" />
        </svg>
      );
    case 'schedule':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
          <circle cx="15.5" cy="15" r="2.4" />
          <path d="M15.5 13.8v1.4l.9.6" />
        </svg>
      );
    case 'water':
      return (
        <svg {...common}>
          <path d="M12 3c-3.6 4.2-6 7.4-6 10.2A6 6 0 0 0 12 19a6 6 0 0 0 6-5.8C18 10.4 15.6 7.2 12 3z" />
          <path d="M9.5 14.2c.4 1.4 1.5 2.3 2.5 2.3" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 16v-5M12 16V8M16 16v-3" />
        </svg>
      );
    case 'alerts':
      return (
        <svg {...common}>
          <path d="M6.5 16.5h11l-1.2-1.4a6.2 6.2 0 0 1-1-3.4V10a4.3 4.3 0 1 0-8.6 0v1.7c0 1.2-.35 2.4-1 3.4L6.5 16.5z" />
          <path d="M10.2 18.2a1.8 1.8 0 0 0 3.6 0" />
        </svg>
      );
    case 'integration':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6" />
        </svg>
      );
    default:
      return null;
  }
}
