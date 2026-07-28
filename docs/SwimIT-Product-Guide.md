# SwimIT — Product Description, Usage & Advantages

## 1. What is SwimIT?

**SwimIT** is a cloud-based **Swimming Pool Management System** (SaaS) built for pool operators, coaching academies, and aquatic clubs.

It digitizes the daily work of running a pool: swimmer registration, pass sales, gate entry (QR scan), attendance, staff/coach records, expenses, and basic financial overview — all from a browser, with a separate login for each pool account.

---

## 2. Who is it for?

| Role | How they use SwimIT |
|------|---------------------|
| **SwimIT platform operator** | Creates accounts, assigns service packages, manages SaaS plans |
| **Pool owner / admin** | Signs in with an account code, configures the pool, manages users and access |
| **Front-desk / cashier** | Registers swimmers, collects pass payments, issues passes |
| **Gate / reception** | Scans QR codes and marks attendance |
| **Accountant / manager** | Reviews expenses, coach payouts, and balance sheet (Full plans) |

---

## 3. What the application does

### 3.1 Platform (SaaS control)

Outside the main app card, platform tools include:

- **Accounts** — list of all pool operator accounts, login links, and credential resend  
- **Create Account** — provision a new pool with a unique 6-character account code and admin login  
- **Service Packages** — define Trial, Starter, Professional, and Enterprise plans  

Each pool gets its **own isolated data**. One account never sees another pool’s swimmers, payments, or settings.

### 3.2 Pool application (per account)

After signing in at `/{account-code}` (example: `/srktnk`), operators use:

#### Setup
- **Batch List** — define swimming batch timings  
- **Pass Type** — pass names, duration, charges, coaching fees  
- **Pool Core Info** — pool name, address, logo, terms, UPI / QR  
- **Holiday Management** — weekly offs and special holidays *(Full)*  

#### Operations
- **Pass Payment** — activate or renew swimmer passes  
- **Pass Scanner** — scan QR / ID and mark attendance  
- **Coach Payment** — calculate coach dues *(Full)*  
- **Pool Expenses** — record day-to-day expenses *(Full)*  

#### Information
- **Swimmer’s List** — view and manage swimmers  
- **Attendance Sheet** — month / swimmer attendance views  
- **Staff List** — coaches and staff  
- **Balance Sheet** — credits, debits, closing view *(Full)*  

#### Forms
- **Registration form** — new swimmer intake (with photos & terms)  
- **Staff registration** — coaches / staff with certificates and batch fit  

#### User Management
- **Create User** / **User Management** — staff logins and page-level access *(Full)*  

---

## 4. How to use SwimIT

### 4.1 Platform operator — onboard a pool

1. Open the SwimIT platform home.  
2. (Optional) Review **Service Packages**.  
3. Go to **Create Account**.  
4. Enter pool name, address, contact, mobile, email, and a unique **6-character account code** (letters/numbers).  
5. Save — the system creates:
   - the SaaS account  
   - an **admin** user (temporary password `admin`)  
   - an empty app for that account only  
6. Share the **login URL**, account code, and temporary password (or use **Resend** from Accounts).  

### 4.2 Pool admin — first login

1. Open `https://your-domain/{account-code}`.  
2. Sign in as **admin** with the temporary password.  
3. **Change password** when prompted (required on first login).  
4. Complete **Pool Core Info**, **Batches**, and **Pass Types**.  
5. Create staff users and grant only the menus they need.  

### 4.3 Daily operations (typical flow)

1. **Register** a new swimmer (form).  
2. Take **Pass Payment** (cash/online) — pass becomes valid.  
3. Swimmer shows **QR / ID card** at the gate.  
4. Staff use **Pass Scanner** — attendance is marked if the pass is valid.  
5. Review **Attendance Sheet** and, on Full plans, **Expenses / Coach Payment / Balance Sheet**.  

### 4.4 Staff users

- Each staff user has a login and a custom **menu access** list.  
- They only see allowed sections and pages.  
- First login forces a **password change**.  
- Profile menu supports **change password**, **create desktop shortcut**, and **sign out**.  

---

## 5. Service packages (pricing model)

Plans are designed for **single-pool** operators (multi-pool is rare). Limits focus on **active swimmers**, **staff users**, and **modules**.

| Package | Price | Trial | Active swimmers | Users | Modules |
|---------|-------|-------|-----------------|-------|---------|
| **Trial** | Free | 30 days | 100 | 2 | Core |
| **Starter** | ₹1,999 / month | — | 100 | 2 | Core |
| **Professional** | ₹3,999 / month | — | 300 | 5 | Full |
| **Enterprise** | ₹6,999 / month | — | Unlimited | 15 | Full |

### Core vs Full modules

**Core** — run the desk: registration, batches, pass types, pass payment, scanner, swimmers, attendance, pool info.

**Full** — Core plus: coach payment, expenses, balance sheet, holidays, user management & access control.

---

## 6. Advantages

### For pool owners
- **Less cash leakage** — pass sales and expenses are recorded digitally  
- **Faster gate entry** — QR-based pass check and attendance  
- **Clear coach dues** — payment calculations from pass/attendance data  
- **Role-based staff** — front desk need not see finance screens  
- **Own private space** — each account is a fresh, isolated application  

### For SwimIT (as SaaS)
- **Repeatable onboarding** — create account → share link → pool is live  
- **Package-based selling** — Trial → Starter → Professional → Enterprise  
- **Credential recovery** — resend login details and reset temp password  
- **Scalable model** — many pools on one platform without mixing data  

### For staff & swimmers
- Structured registration and ID / pass views  
- Consistent attendance records  
- Fewer paper registers and disputes  

---

## 7. Key product principles

1. **One account = one pool app** — no shared operational data between tenants.  
2. **Login by account code** — simple URL for each customer.  
3. **Security basics** — forced password change on first login; show/hide password controls.  
4. **Least privilege** — users see only granted menus.  
5. **Grow with the pool** — start on Trial/Starter; upgrade to Full modules as needs grow.  

---

## 8. Short elevator pitch

> **SwimIT** helps swimming pools run registration, pass sales, gate entry, and attendance on one simple web app — with separate logins for each pool, staff access control, and optional finance tools for growing operators.

---

*Document version: July 2026 — reflects SwimIT SaaS packaging (Trial / Starter / Professional / Enterprise) and tenant-isolated pool operations.*
