import { Link } from 'react-router-dom';
import { PlatformNav } from './PlatformNav';

/** Marketing home (`/`) — application overview only; no permanent app chrome. */
export function MainMenu() {
  return (
    <div className="menu-shell">
      <PlatformNav />

      <div className="menu-card">
        <header className="menu-brand">
          <h1>SwimIT</h1>
          <p>Swimming Pool Management System</p>
        </header>

        <section className="home-app-overview" aria-label="Application overview">
          <h2>Application overview</h2>
          <p>
            <strong>SwimIT</strong> is a cloud-based Swimming Pool Management System (SaaS) built for
            pool operators and aquatic clubs.
          </p>
          <p>
            It helps digitize the day-to-day work of a pool. You can create batches, pass types, and a
            holiday calendar as per pool requirements, then register swimmers and coaches/staff with
            standard registration forms.
          </p>
          <p>
            After selecting batch and coach, payments can be taken in cash or online. This creates a
            digital pass for the swimmer, which is sent to their mobile and can be scanned daily for
            attendance — so attendance stays up to date automatically.
          </p>
          <p>
            It also helps maintain pool expenses in one place and calculate coach payments, so you can
            check pool profitability anytime with the balance sheet feature. Different roles can be
            assigned to staff, with controlled access to the features each person needs.
          </p>

          <h3>How it helps pool management</h3>
          <ul className="home-app-overview-points">
            <li>
              One place for <strong>registration, payments, attendance, and staff</strong> instead of
              paper registers and scattered sheets
            </li>
            <li>
              Faster gate control with <strong>QR / ID scanning</strong> and clear who is allowed in
              today
            </li>
            <li>Role-based access so desk, gate, coaches, and admin see only what they need</li>
            <li>Optional finance tools for expenses, coach payouts, and a simple balance view</li>
            <li>
              Helps to send broadcast message to all active swimmers and All staff members.
            </li>
          </ul>

          <h3>Workflow</h3>
          <div className="home-workflow" aria-label="SwimIT workflow">
            <div className="home-workflow-row">
              <div className="home-workflow-step">Create Account</div>
              <div className="home-workflow-step">Add pool information</div>
              <div className="home-workflow-step">Define Batch, Pass type, holidays calendar</div>
              <div className="home-workflow-step">Registration of Coach/Staff</div>
            </div>
            <div className="home-workflow-row home-workflow-row-rtl">
              <div className="home-workflow-step">Create users and control access per role</div>
              <div className="home-workflow-step">Registration of swimmer</div>
              <div className="home-workflow-step">Batch &amp; Coach Selection</div>
              <div className="home-workflow-step">Payment and pass creation</div>
            </div>
            <div className="home-workflow-row home-workflow-row-tail">
              <div className="home-workflow-step">Scan pass for attendance</div>
              <div className="home-workflow-step">Enter day to day expenses</div>
            </div>
          </div>

          <h3>Information get created</h3>
          <div className="home-info-flow" aria-label="Information created by SwimIT">
            <div className="home-info-flow-step">Swimmer List</div>
            <div className="home-info-flow-step">Coach/ Staff List along with Certificate</div>
            <div className="home-info-flow-step">Coach Payment calculation</div>
            <div className="home-info-flow-step">Balance Sheet</div>
          </div>

          <div className="home-app-overview-cta">
            <Link className="home-cta-btn" to="/create-account">
              Create Account
            </Link>
            <Link className="home-cta-btn" to="/application">
              View Application
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
