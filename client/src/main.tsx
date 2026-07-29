import { StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { installTenantFetch } from './tenantSession';
import { App } from './App';
import { BatchList } from './BatchList';
import { CoachList } from './CoachList';
import { MainMenu } from './MainMenu';
import { AppShell } from './AppShell';
import { PassScanner } from './PassScanner';
import { CoachPayment } from './CoachPayment';
import { AttendanceSheet } from './AttendanceSheet';
import { BalanceSheet } from './BalanceSheet';
import { PaymentDetails } from './PaymentDetails';
import { PoolExpenses } from './PoolExpenses';
import { PassPayment } from './PassPayment';
import { PassTypePage } from './PassTypePage';
import { PassView } from './PassView';
import { IdCardView } from './IdCardView';
import { SwimmerList } from './SwimmerList';
import { StaffRegistration } from './StaffRegistration';
import { PoolCoreInfo } from './PoolCoreInfo';
import { HolidayManagement } from './HolidayManagement';
import { RenewPayment } from './RenewPayment';
import { CreateUser } from './CreateUser';
import { UserManagement } from './UserManagement';
import { WhatsAppMessaging } from './WhatsAppMessaging';
import { CreateAccount } from './CreateAccount';
import { Accounts } from './Accounts';
import { ServicePackages } from './ServicePackages';
import { ApplicationGuide } from './ApplicationGuide';
import { AccountPortal } from './AccountPortal';
import { ApplicationDemoSync } from './ApplicationDemoSync';
import { RequirePlatformSession } from './RequirePlatformSession';
import { PlatformUsersLayout } from './PlatformUsersLayout';
import { PlatformPayment } from './PlatformPayment';
import { PublicOpenForm } from './PublicOpenForm';

installTenantFetch();

function withPlatformAuth(element: ReactElement) {
  return <RequirePlatformSession>{element}</RequirePlatformSession>;
}

/** Preserve path + search when moving old root features under `/application`. */
function RedirectToApplication() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/application${pathname}${search}${hash}`} replace />;
}

/** Feature pages nested under AppShell (`/application/...` or `/:accountCode/...`). */
function appFeatureRoutes() {
  return (
    <>
      <Route path="register" element={<App />} />
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
      <Route path="pass-scanner" element={<PassScanner />} />
      <Route path="coach-payment" element={<CoachPayment />} />
      <Route path="attendance-sheet" element={<AttendanceSheet />} />
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
    <Route path="/pass-scanner" element={<RedirectToApplication />} />
    <Route path="/coach-payment" element={<RedirectToApplication />} />
    <Route path="/attendance-sheet" element={<RedirectToApplication />} />
    <Route path="/balance-sheet" element={<RedirectToApplication />} />
    <Route path="/payment-details" element={<RedirectToApplication />} />
    <Route path="/pool-core-info" element={<RedirectToApplication />} />
    <Route path="/holiday-management" element={<RedirectToApplication />} />
  </>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ApplicationDemoSync />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/accounts" element={withPlatformAuth(<Accounts />)} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/create-account/:id" element={withPlatformAuth(<CreateAccount />)} />
        <Route path="/service-packages" element={<ServicePackages />} />
        <Route
          path="/platform"
          element={withPlatformAuth(<PlatformUsersLayout />)}
        >
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
    </BrowserRouter>
  </StrictMode>,
);
