import { StrictMode, Suspense, lazy, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { LanguageProvider, useT } from './i18n';
import { installTenantFetch } from './tenantSession';
import { ApplicationDemoSync } from './ApplicationDemoSync';
import { RequirePlatformSession } from './RequirePlatformSession';

installTenantFetch();

const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
const BatchList = lazy(() => import('./BatchList').then((m) => ({ default: m.BatchList })));
const CoachList = lazy(() => import('./CoachList').then((m) => ({ default: m.CoachList })));
const MainMenu = lazy(() => import('./MainMenu').then((m) => ({ default: m.MainMenu })));
const AppShell = lazy(() => import('./AppShell').then((m) => ({ default: m.AppShell })));
const PassScanner = lazy(() => import('./PassScanner').then((m) => ({ default: m.PassScanner })));
const CoachPayment = lazy(() =>
  import('./CoachPayment').then((m) => ({ default: m.CoachPayment })),
);
const AttendanceSheet = lazy(() =>
  import('./AttendanceSheet').then((m) => ({ default: m.AttendanceSheet })),
);
const BalanceSheet = lazy(() =>
  import('./BalanceSheet').then((m) => ({ default: m.BalanceSheet })),
);
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));
const PaymentDetails = lazy(() =>
  import('./PaymentDetails').then((m) => ({ default: m.PaymentDetails })),
);
const PoolExpenses = lazy(() =>
  import('./PoolExpenses').then((m) => ({ default: m.PoolExpenses })),
);
const WaterQuality = lazy(() =>
  import('./WaterQuality').then((m) => ({ default: m.WaterQuality })),
);
const PassPayment = lazy(() => import('./PassPayment').then((m) => ({ default: m.PassPayment })));
const PassTypePage = lazy(() =>
  import('./PassTypePage').then((m) => ({ default: m.PassTypePage })),
);
const PassView = lazy(() => import('./PassView').then((m) => ({ default: m.PassView })));
const IdCardView = lazy(() => import('./IdCardView').then((m) => ({ default: m.IdCardView })));
const SwimmerList = lazy(() => import('./SwimmerList').then((m) => ({ default: m.SwimmerList })));
const StaffRegistration = lazy(() =>
  import('./StaffRegistration').then((m) => ({ default: m.StaffRegistration })),
);
const PoolCoreInfo = lazy(() =>
  import('./PoolCoreInfo').then((m) => ({ default: m.PoolCoreInfo })),
);
const HolidayManagement = lazy(() =>
  import('./HolidayManagement').then((m) => ({ default: m.HolidayManagement })),
);
const RenewPayment = lazy(() =>
  import('./RenewPayment').then((m) => ({ default: m.RenewPayment })),
);
const CreateUser = lazy(() => import('./CreateUser').then((m) => ({ default: m.CreateUser })));
const UserManagement = lazy(() =>
  import('./UserManagement').then((m) => ({ default: m.UserManagement })),
);
const WhatsAppMessaging = lazy(() =>
  import('./WhatsAppMessaging').then((m) => ({ default: m.WhatsAppMessaging })),
);
const CreateAccount = lazy(() =>
  import('./CreateAccount').then((m) => ({ default: m.CreateAccount })),
);
const Accounts = lazy(() => import('./Accounts').then((m) => ({ default: m.Accounts })));
const ServicePackages = lazy(() =>
  import('./ServicePackages').then((m) => ({ default: m.ServicePackages })),
);
const ApplicationGuide = lazy(() =>
  import('./ApplicationGuide').then((m) => ({ default: m.ApplicationGuide })),
);
const MarketingHome = lazy(() =>
  import('./MarketingHome').then((m) => ({ default: m.MarketingHome })),
);
const FeaturesPage = lazy(() =>
  import('./FeaturesPage').then((m) => ({ default: m.FeaturesPage })),
);
const AccountPortal = lazy(() =>
  import('./AccountPortal').then((m) => ({ default: m.AccountPortal })),
);
const PlatformUsersLayout = lazy(() =>
  import('./PlatformUsersLayout').then((m) => ({ default: m.PlatformUsersLayout })),
);
const PlatformPayment = lazy(() =>
  import('./PlatformPayment').then((m) => ({ default: m.PlatformPayment })),
);
const PublicOpenForm = lazy(() =>
  import('./PublicOpenForm').then((m) => ({ default: m.PublicOpenForm })),
);

function withPlatformAuth(element: ReactElement) {
  return <RequirePlatformSession>{element}</RequirePlatformSession>;
}

function RouteFallback() {
  const t = useT();
  return (
    <div className="page">
      <p className="muted">{t('Loading…')}</p>
    </div>
  );
}

/** Preserve path + search when moving old root features under `/application`. */
function RedirectToApplication() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/application${pathname}${search}${hash}`} replace />;
}

/** Empty outlet so AppShell can render the section menu (Setup / Operations / …). */
function AppSectionMenu() {
  return null;
}

/** Feature pages nested under AppShell (`/application/...` or `/:accountCode/...`). */
function appFeatureRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="menu" element={<AppSectionMenu />} />
      <Route path="register" element={<App />} />
      <Route path="register/:id" element={<App />} />
      <Route path="staff-register" element={<StaffRegistration />} />
      <Route path="staff-register/:id" element={<StaffRegistration />} />
      <Route path="user-management" element={<UserManagement />} />
      <Route path="create-user" element={<CreateUser />} />
      <Route path="batches" element={<BatchList />} />
      <Route path="pass-types" element={<PassTypePage />} />
      <Route path="coaches" element={<CoachList />} />
      <Route path="swimmers" element={<SwimmerList />} />
      <Route path="pass/:id" element={<PassView />} />
      <Route path="id-card/:id" element={<IdCardView />} />
      <Route path="pass-payment" element={<PassPayment />} />
      <Route path="whatsapp" element={<WhatsAppMessaging />} />
      <Route path="pool-expenses" element={<PoolExpenses />} />
      <Route path="water-quality" element={<WaterQuality />} />
      <Route path="pass-scanner" element={<PassScanner />} />
      <Route path="coach-payment" element={<CoachPayment />} />
      <Route path="attendance-sheet" element={<AttendanceSheet />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="balance-sheet" element={<BalanceSheet />} />
      <Route path="payment-details" element={<PaymentDetails />} />
      <Route path="pool-core-info" element={<PoolCoreInfo />} />
      <Route path="holiday-management" element={<HolidayManagement />} />
      <Route path="renew-payment" element={<RenewPayment />} />
    </>
  );
}

/** Old root feature paths → `/application/...` */
const legacyFeatureRedirects = (
  <>
    <Route path="/register" element={<RedirectToApplication />} />
    <Route path="/register/:id" element={<RedirectToApplication />} />
    <Route path="/staff-register" element={<RedirectToApplication />} />
    <Route path="/staff-register/:id" element={<RedirectToApplication />} />
    <Route path="/user-management" element={<RedirectToApplication />} />
    <Route path="/create-user" element={<RedirectToApplication />} />
    <Route path="/batches" element={<RedirectToApplication />} />
    <Route path="/pass-types" element={<RedirectToApplication />} />
    <Route path="/coaches" element={<RedirectToApplication />} />
    <Route path="/swimmers" element={<RedirectToApplication />} />
    <Route path="/pass/:id" element={<RedirectToApplication />} />
    <Route path="/id-card/:id" element={<RedirectToApplication />} />
    <Route path="/pass-payment" element={<RedirectToApplication />} />
    <Route path="/whatsapp" element={<RedirectToApplication />} />
    <Route path="/pool-expenses" element={<RedirectToApplication />} />
    <Route path="/water-quality" element={<RedirectToApplication />} />
    <Route path="/pass-scanner" element={<RedirectToApplication />} />
    <Route path="/coach-payment" element={<RedirectToApplication />} />
    <Route path="/attendance-sheet" element={<RedirectToApplication />} />
    <Route path="/dashboard" element={<RedirectToApplication />} />
    <Route path="/balance-sheet" element={<RedirectToApplication />} />
    <Route path="/payment-details" element={<RedirectToApplication />} />
    <Route path="/pool-core-info" element={<RedirectToApplication />} />
    <Route path="/holiday-management" element={<RedirectToApplication />} />
  </>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <ApplicationDemoSync />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<MarketingHome />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/application-overview" element={<MainMenu />} />
            <Route path="/accounts" element={withPlatformAuth(<Accounts />)} />
            <Route path="/create-account" element={<CreateAccount />} />
            <Route path="/create-account/:id" element={withPlatformAuth(<CreateAccount />)} />
            <Route path="/service-packages" element={<ServicePackages />} />
            <Route path="/platform" element={withPlatformAuth(<PlatformUsersLayout />)}>
              <Route path="user-management" element={<UserManagement />} />
              <Route path="create-user" element={<CreateUser />} />
              <Route path="whatsapp" element={<WhatsAppMessaging />} />
              <Route path="payment" element={<PlatformPayment />} />
            </Route>
            <Route path="/application-guide" element={<ApplicationGuide />} />
            <Route path="/application" element={<AppShell />}>
              {appFeatureRoutes()}
            </Route>
            {legacyFeatureRedirects}
            <Route path="/:accountCode/open/register" element={<PublicOpenForm kind="swimmer" />} />
            <Route
              path="/:accountCode/open/staff-register"
              element={<PublicOpenForm kind="staff" />}
            />
            <Route path="/:accountCode" element={<AccountPortal />}>
              {appFeatureRoutes()}
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
);
