import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { PlatformShell } from './PlatformShell';

export function ApplicationGuide() {
  const t = useT();
  return (
    <PlatformShell>
      <PlatformPage title="View Application">
      <article className="app-guide">
        <p className="lede">
          {t('Read-only guide to what SwimIT is, how to use it, and why pools choose it.')}
        </p>

        <section className="app-guide-section">
          <h2>{t("1. What is SwimIT?")}</h2>
          <p>
            <strong>SwimIT</strong> is a cloud-based <strong>Swimming Pool Management System</strong>{' '}
            (SaaS) built for pool operators, coaching academies, and aquatic clubs.
          </p>
          <p>
            It digitizes the daily work of running a pool: swimmer registration, pass sales, gate
            entry (QR scan), attendance, staff/coach records, expenses, and basic financial overview
            — all from a browser, with a separate login for each pool account.
          </p>
        </section>

        <section className="app-guide-section">
          <h2>{t("2. Who is it for?")}</h2>
          <div className="batch-saved-table-wrap">
            <table className="batch-saved-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>How they use SwimIT</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>SwimIT platform operator</strong>
                  </td>
                  <td>Creates accounts, assigns service packages, manages SaaS plans</td>
                </tr>
                <tr>
                  <td>
                    <strong>Pool owner / admin</strong>
                  </td>
                  <td>Signs in with an account code, configures the pool, manages users and access</td>
                </tr>
                <tr>
                  <td>
                    <strong>Front-desk / cashier</strong>
                  </td>
                  <td>Registers swimmers, collects pass payments, issues passes</td>
                </tr>
                <tr>
                  <td>
                    <strong>Gate / reception</strong>
                  </td>
                  <td>Scans QR codes and marks attendance</td>
                </tr>
                <tr>
                  <td>
                    <strong>Accountant / manager</strong>
                  </td>
                  <td>Reviews expenses, coach payouts, and balance sheet (Full plans)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="app-guide-section">
          <h2>{t("3. What the application does")}</h2>

          <h3>{t("3.1 Platform (SaaS control)")}</h3>
          <p>Outside the main app card, platform tools include:</p>
          <ul>
            <li>
              <strong>Accounts</strong> — list of all pool operator accounts, login links, and
              credential resend
            </li>
            <li>
              <strong>Create Account</strong> — provision a new pool with a unique 6-character
              account code and admin login
            </li>
            <li>
              <strong>Service Packages</strong> — define Trial, Starter, Professional, and Enterprise
              plans
            </li>
          </ul>
          <p>
            Each pool gets its <strong>own isolated data</strong>. One account never sees another
            pool’s swimmers, payments, or settings.
          </p>

          <h3>{t("3.2 Pool application (per account)")}</h3>
          <p>
            After signing in at <code>/{'{account-code}'}</code> (example: <code>/srktnk</code>),
            operators use:
          </p>

          <h4>{t("Setup")}</h4>
          <ul>
            <li>
              <strong>Batches</strong> — define swimming batch timings
            </li>
            <li>
              <strong>Pass Type</strong> — pass names, duration, charges, and coaching fees. A
              separate Pass verification tick turns on face matching at the scanner. WhatsApp
              broadcast opt-in and pass-expiry reminders are also on this page.
            </li>
            <li>
              <strong>Pool Core Info</strong> — pool name, address, logo, terms, UPI / QR
            </li>
            <li>
              <strong>Holiday Management</strong> — weekly offs and special holidays{' '}
              <em>(Full)</em>
            </li>
            <li>
              <strong>User Management</strong> — create staff logins, set page-level access, and
              choose how long a login session stays active when nobody is using the app{' '}
              <em>(Full)</em>
            </li>
            <li>
              <strong>Pool website</strong> — public webpage copy, photos, and colour: about, batches, coaches, and
              achievements
            </li>
            <li>
              <strong>Form Info</strong> — list registration fields and mark each one mandatory or optional
            </li>
          </ul>

          <h4>{t("Operations")}</h4>
          <ul>
            <li>
              <strong>Pass Payment</strong> — activate or renew swimmer passes
            </li>
            <li>
              <strong>Pass Scanner</strong> — scan QR / ID and mark attendance; if face
              verification is ticked on Pass Type, staff confirm the face matches the pass photo
              before OK
            </li>
            <li>
              <strong>Pool Expenses</strong> — record day-to-day expenses <em>(Full)</em>
            </li>
            <li>
              <strong>Coach Payment</strong> — calculate coach dues <em>(Full)</em>
            </li>
            <li>
              <strong>Swimmer Progress</strong> — record competitive batch race times
            </li>
            <li>
              <strong>Water Quality</strong> — record water quality checks <em>(Full)</em>
            </li>
            <li>
              <strong>WhatsApp Broadcast</strong> — shown after the account admin ticks WhatsApp
              broadcast message on Pass Type (₹1 per message){' '}
              <em>(Full)</em>
            </li>
          </ul>

          <p>
            <strong>Dashboard</strong> (top of the menu) — active swimmers, present today, expiring
            passes, and payments
          </p>

          <h4>{t("Information")}</h4>
          <ul>
            <li>
              <strong>Swimmer’s List</strong> — view and manage swimmers
            </li>
            <li>
              <strong>Attendance Sheet</strong> — month / swimmer attendance views
            </li>
            <li>
              <strong>Staff List</strong> — coaches and staff
            </li>
            <li>
              <strong>Balance Sheet</strong> — credits, debits, closing view <em>(Full)</em>
            </li>
            <li>
              <strong>Progress Trend</strong> — times by date for a selected stroke and distance
            </li>
          </ul>

          <h4>{t("Forms")}</h4>
          <ul>
            <li>
              <strong>Registration form</strong> — new swimmer intake (with photos &amp; terms)
            </li>
            <li>
              <strong>Staff registration</strong> — coaches / staff with certificates and batch fit
            </li>
          </ul>
        </section>

        <section className="app-guide-section">
          <h2>{t("4. How to use SwimIT")}</h2>

          <h3>{t('4.1 Platform operator — onboard a pool')}</h3>
          <ol>
            <li>Open the SwimIT platform home.</li>
            <li>(Optional) Review <strong>Service Packages</strong>.</li>
            <li>
              Go to <strong>Create Account</strong>.
            </li>
            <li>
              Enter pool name, address, contact, mobile, email, and a unique{' '}
              <strong>6-character account code</strong> (letters/numbers).
            </li>
            <li>
              Save — the system creates:
              <ul>
                <li>the SaaS account</li>
                <li>
                  an <strong>admin</strong> user (temporary password <code>admin</code>)
                </li>
                <li>an empty app for that account only</li>
              </ul>
            </li>
            <li>
              Share the <strong>login URL</strong>, account code, and temporary password (or use{' '}
              <strong>Resend</strong> from Accounts).
            </li>
          </ol>

          <h3>{t('4.2 Pool admin — first login')}</h3>
          <ol>
            <li>
              Open <code>https://your-domain/{'{account-code}'}</code>.
            </li>
            <li>
              Sign in as <strong>admin</strong> with the temporary password.
            </li>
            <li>
              <strong>Change password</strong> when prompted (required on first login).
            </li>
            <li>
              Complete <strong>Pool Core Info</strong>, <strong>Pool website</strong>,{' '}
              <strong>Batches</strong>, and <strong>Pass Types</strong>.
            </li>
            <li>Create staff users and grant only the menus they need.</li>
          </ol>

          <h3>{t("4.3 Daily operations (typical flow)")}</h3>
          <ol>
            <li>
              <strong>Register</strong> a new swimmer (form).
            </li>
            <li>
              Take <strong>Pass Payment</strong> (cash/online) — pass becomes valid.
            </li>
            <li>
              Swimmer shows <strong>QR / ID card</strong> at the gate.
            </li>
            <li>
              Staff use <strong>Pass Scanner</strong> — attendance is marked if the pass is valid.
              If face verification is ticked on Pass Type, staff must confirm the face matches the
              pass photo before OK.
            </li>
            <li>
              Review <strong>Attendance Sheet</strong> and, on Full plans,{' '}
              <strong>Expenses / Coach Payment / Balance Sheet</strong>.
            </li>
          </ol>

          <h3>{t("4.4 Staff users")}</h3>
          <ul>
            <li>
              Each staff user has a login and a custom <strong>menu access</strong> list.
            </li>
            <li>They only see allowed sections and pages.</li>
            <li>
              First login forces a <strong>password change</strong>.
            </li>
            <li>
              Profile menu supports <strong>change password</strong>,{' '}
              <strong>create desktop shortcut</strong>, and <strong>sign out</strong>.
            </li>
          </ul>
        </section>

        <section className="app-guide-section">
          <h2>{t("5. Service packages (pricing model)")}</h2>
          <p>
            Plans are designed for <strong>single-pool</strong> operators (multi-pool is rare). Limits
            focus on <strong>active swimmers</strong>, <strong>staff users</strong>, and{' '}
            <strong>modules</strong>.
          </p>

          <div className="batch-saved-table-wrap">
            <table className="batch-saved-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Price</th>
                  <th>Trial</th>
                  <th>Active swimmers</th>
                  <th>Users</th>
                  <th>Modules</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Trial</strong>
                  </td>
                  <td>Free</td>
                  <td>30 days</td>
                  <td>100</td>
                  <td>2</td>
                  <td>Core</td>
                </tr>
                <tr>
                  <td>
                    <strong>Starter</strong>
                  </td>
                  <td>₹1,999 / month</td>
                  <td>—</td>
                  <td>100</td>
                  <td>2</td>
                  <td>Core</td>
                </tr>
                <tr>
                  <td>
                    <strong>Professional</strong>
                  </td>
                  <td>₹3,999 / month</td>
                  <td>—</td>
                  <td>300</td>
                  <td>5</td>
                  <td>Full</td>
                </tr>
                <tr>
                  <td>
                    <strong>Enterprise</strong>
                  </td>
                  <td>₹6,999 / month</td>
                  <td>—</td>
                  <td>Unlimited</td>
                  <td>15</td>
                  <td>Full</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>{t("Core vs Full modules")}</h3>
          <p>
            <strong>Core</strong> — run the desk: registration, batches, pass types, pass payment,
            scanner, swimmers, attendance, pool info.
          </p>
          <p>
            <strong>Full</strong> — Core plus: coach payment, expenses, balance sheet, holidays, user
            management &amp; access control, and WhatsApp Broadcast messaging.
          </p>
        </section>

        <section className="app-guide-section">
          <h2>{t("6. Advantages")}</h2>

          <h3>{t("For pool owners")}</h3>
          <ul>
            <li>
              <strong>Less cash leakage</strong> — pass sales and expenses are recorded digitally
            </li>
            <li>
              <strong>Faster gate entry</strong> — QR-based pass check and attendance
            </li>
            <li>
              <strong>Clear coach dues</strong> — payment calculations from pass/attendance data
            </li>
            <li>
              <strong>Role-based staff</strong> — front desk need not see finance screens
            </li>
            <li>
              <strong>Own private space</strong> — each account is a fresh, isolated application
            </li>
          </ul>

          <h3>{t("For SwimIT (as SaaS)")}</h3>
          <ul>
            <li>
              <strong>Repeatable onboarding</strong> — create account → share link → pool is live
            </li>
            <li>
              <strong>Package-based selling</strong> — Trial → Starter → Professional → Enterprise
            </li>
            <li>
              <strong>Credential recovery</strong> — resend login details and reset temp password
            </li>
            <li>
              <strong>Scalable model</strong> — many pools on one platform without mixing data
            </li>
          </ul>

          <h3>{t("For staff &amp; swimmers")}</h3>
          <ul>
            <li>Structured registration and ID / pass views</li>
            <li>Consistent attendance records</li>
            <li>Fewer paper registers and disputes</li>
          </ul>
        </section>

        <section className="app-guide-section">
          <h2>{t("7. Key product principles")}</h2>
          <ol>
            <li>
              <strong>One account = one pool app</strong> — no shared operational data between
              tenants.
            </li>
            <li>
              <strong>Login by account code</strong> — simple URL for each customer.
            </li>
            <li>
              <strong>Security basics</strong> — forced password change on first login; show/hide
              password controls.
            </li>
            <li>
              <strong>Least privilege</strong> — users see only granted menus.
            </li>
            <li>
              <strong>Grow with the pool</strong> — start on Trial/Starter; upgrade to Full modules
              as needs grow.
            </li>
          </ol>
        </section>

        <section className="app-guide-section app-guide-pitch">
          <h2>{t("8. Short elevator pitch")}</h2>
          <blockquote>
            <strong>SwimIT</strong> helps swimming pools run registration, pass sales, gate entry,
            and attendance on one simple web app — with separate logins for each pool, staff access
            control, and optional finance tools for growing operators.
          </blockquote>
        </section>

        <p className="app-guide-footer muted">
          Document version: July 2026 — SwimIT SaaS packaging (Trial / Starter / Professional /
          Enterprise) and tenant-isolated pool operations.
        </p>
      </article>
      </PlatformPage>
    </PlatformShell>
  );
}
