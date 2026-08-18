import { Link } from 'react-router-dom';
import { useT } from './i18n';

/** Hotspots are percentages of the 1280×720 workflow image. */
const WORKFLOW_HOTSPOTS: {
  to: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}[] = [
  { to: '/create-account', label: 'Create Account', left: 0.55, top: 14.58, width: 22.42, height: 15.28 },
  { to: '/application/pool-core-info', label: 'Add pool information', left: 25.86, top: 14.58, width: 22.42, height: 15.28 },
  { to: '/application/batches', label: 'Batches', left: 51.09, top: 14.58, width: 7.5, height: 15.28 },
  { to: '/application/pass-types', label: 'Pass Type', left: 58.59, top: 14.58, width: 7.5, height: 15.28 },
  { to: '/application/holiday-management', label: 'Holidays', left: 66.09, top: 14.58, width: 7.5, height: 15.28 },
  { to: '/application/staff-register', label: 'Registration of Coach/Staff', left: 76.33, top: 14.58, width: 22.42, height: 15.28 },
  { to: '/application/pass-payment', label: 'Payment and pass creation', left: 0.55, top: 41.67, width: 22.42, height: 13.61 },
  { to: '/application/pass-payment', label: 'Batch & Coach Selection', left: 25.86, top: 41.67, width: 22.42, height: 13.61 },
  { to: '/application/register', label: 'Registration of swimmer', left: 51.09, top: 41.67, width: 22.42, height: 13.61 },
  { to: '/application/user-management', label: 'Create users and control access per role', left: 76.33, top: 41.67, width: 22.42, height: 13.61 },
  { to: '/application/pass-scanner', label: 'Scan pass for attendance', left: 0.55, top: 68.61, width: 22.42, height: 15.14 },
  { to: '/application/pool-expenses', label: 'Enter day to day expenses', left: 25.86, top: 68.61, width: 23.05, height: 15.14 },
  { to: '/application/dashboard', label: 'Dashboard', left: 61.72, top: 69.17, width: 22.03, height: 13.89 },
];

type WorkflowDiagramProps = {
  onNavigate?: () => void;
};

export function WorkflowDiagram({ onNavigate }: WorkflowDiagramProps) {
  const t = useT();

  return (
    <figure className="home-workflow-figure workflow-map" aria-label={t('SwimIT workflow')}>
      <img
        src="/swimit-workflow.png"
        alt={t('SwimIT workflow')}
        className="home-workflow-image"
      />
      <nav className="workflow-hotspots" aria-label={t('SwimIT workflow')}>
        {WORKFLOW_HOTSPOTS.map((spot) => (
          <Link
            key={`${spot.to}-${spot.label}`}
            to={spot.to}
            className="workflow-hotspot"
            style={{
              left: `${spot.left}%`,
              top: `${spot.top}%`,
              width: `${spot.width}%`,
              height: `${spot.height}%`,
            }}
            title={t(spot.label)}
            aria-label={t(spot.label)}
            onClick={() => onNavigate?.()}
          />
        ))}
      </nav>
    </figure>
  );
}
