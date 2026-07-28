import { Link, useLocation } from 'react-router-dom';
import { isApplicationDemo } from './applicationDemo';
import { menuBackState } from './menuCatalog';
import {
  getActiveAccountCode,
  isPlatformUsersPath,
  tenantPath,
} from './tenantSession';

type MenuBackLinkProps = {
  label?: string;
};

const PLATFORM_HOME_PATHS = new Set([
  '/',
  '/accounts',
  '/create-account',
  '/service-packages',
  '/application',
  '/application-guide',
]);

function platformBackTarget(pathname: string) {
  if (PLATFORM_HOME_PATHS.has(pathname) || isPlatformUsersPath(pathname)) {
    return '/';
  }
  return '/application';
}

export function MenuBackLink({ label = '← Back' }: MenuBackLinkProps) {
  const { pathname } = useLocation();
  const accountCode = getActiveAccountCode();
  const to =
    isApplicationDemo() || !accountCode || isPlatformUsersPath(pathname)
      ? platformBackTarget(pathname)
      : tenantPath('/');

  return (
    <Link className="menu-link" to={to} state={menuBackState(pathname)}>
      {label}
    </Link>
  );
}
