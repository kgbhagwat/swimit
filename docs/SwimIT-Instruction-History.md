# SwimIT — Instructions given to build the application (to date)

Compiled from Cursor chat history for this project folder (`d:\projects\swimIT`), mainly **4–11 Aug 2026**.  
Earlier core product work may exist outside this transcript; the product baseline is also described in `docs/SwimIT-Product-Guide.md`.

---

## 1. Project / ops

1. Continue the same SwimIT project after folder move to `d:\projects\swimIT`.
2. Commit and push to Git when asked (multiple times).
3. Provide / fix staging deploy commands from the new folder (`scripts/deploy-staging-from-pc.sh` + Lightsail key).
4. Help connect WhatsApp gateway; later set up WhatsApp on staging for production numbers.
5. Guide Meta WhatsApp Business / SIM setup step by step.
6. Clarify multi-tenant WhatsApp: customers should know which pool sent the message.
7. Discuss PWA / “install like an app” for mobile URL convenience.

---

## 2. Attendance

1. Current month: show all dates of the month, but attendance only till today.
2. **Swimmer month** view: each swimmer’s own date heading from pass start → pass end; attendance till today.

---

## 3. Staff / coaches

1. Edit button to open coach form for editing; toggle to activate/deactivate.
2. Only active coaches available for swimmer allocation.
3. Action icons side by side; inactive coaches in red.
4. In View Application (sample) show same editable coach behaviour.
5. Show all batches so editor can add/remove batches for a coach.
6. Download button top-right on relevant lists.
7. Header alignment with columns; Action heading starts where icons start.

---

## 4. Payment details / tables / filters

1. “More transactions” → date range (From / To) + Get.
2. Date selection above the divider; From/To and Get in one row; Get blue/3D, vertically centered.
3. Row/column borders; darker header.
4. Excel-style header filters (Clear + up/down sort); opaque filter panel.
5. Same header-filter pattern for Swimmer list (and initially Staff); later swimmer column filter only.
6. Swimmer column different colour; borders on attendance/payment grids.

---

## 5. Registration forms (swimmer & staff)

1. Layout: 2/3-column sections; labels with entry boxes beside headings; aligned start points.
2. Medical info in 2 columns (doctor details in second column).
3. Optimise sizes for mobile (10-digit), date, blood group, relation, 6-char account code, city.
4. Validate 10-digit mobile.
5. Identity document select + upload beside heading; size rules inside upload popup.
6. Match Core Info style for background/font/upload.
7. **Send QR**: send open form link + QR so anyone can register without login.
8. Staff registration: same design as swimmer registration.
9. Achievements & certificates: one Certificates control; multi-upload; max size in popup.
10. Restore/fix registration layout after regressions (document/photo/certificate/emergency/medical).

---

## 6. SaaS platform pages (Accounts, packages, users, payment, WhatsApp)

1. Service Packages / Create Account / Users: Batches-like fonts; SaaS pages use light orange → saffron (`#FFA87D` → `#FFB68F` → later purple `#CA8AFF` / `#DFB8FF`).
2. Create User: fields beside labels; Create + Clear same row; mobile 10-digit validation.
3. New Package button top-right; package name/description 2-col; rest 4-col.
4. Platform Payment: UPI beside heading; QR + Edit centered; validate UPI must not contain 10-digit mobile; error under UPI field.
5. WhatsApp broadcast: swimming pool code selector (active accounts); audiences include Active account Admins & Active account users (then pool code not required).
6. Sticky menubar while scrolling.
7. App User Management background like Batches.
8. Payment confirmation text: “I confirmed amount and upi id of successful payment”.

---

## 7. Dashboard (pool account)

1. Clear pool picture: active users, today’s present, expiring count.
2. Payments: today’s cash, online, total.
3. New admissions by batch / coach / pass type.
4. Active swimmers by batch / coach / pass type.
5. Date selector top-right to view that day’s dashboard.
6. Layout/colour polish; sample watermark in View Application.
7. Later: Water Quality trend graphs below Active swimmers; remove New admissions today section.
8. Graphs: trend lines, Y from 0, reading then Pass/Fail.

---

## 8. Mobile UX

1. Same vertical menu as laptop; hamburger drawer; close after navigate.
2. Dashboard KPIs wrap; differentiate batch/coach/pass colours.
3. Lists/tables: column/card layouts, borders, alternate row colours; fix overflow.
4. Pricing packages scrollable / 3-column where needed.
5. Marketing mobile: Language/Login/Get Started top-right; Home/Features/Pricing above hero; pricing cards **2·1·2**.

---

## 9. Language

1. English ↔ Marathi language switcher.
2. Translate all pages when Marathi selected (including terms).

---

## 10. Login, branding, overview, terms

1. SaaS login image on left (sky blue); SwimIT logo/wordmark above login; account login same pattern without account code on image side.
2. Forgot password: match email + mobile → send random password on mobile and email.
3. Application overview: functionality image + workflow image; Home overview copy updated.
4. Default **swimmer** terms (Marathi + English); editable per account.
5. Default **coach/staff** terms with bold headings.
6. Create Account: must accept SaaS Terms & Conditions (from provided doc); Accept button; cannot create without accept.
7. Rename “Terms & Conditions and Rules & Regulations” → “Terms & Conditions” everywhere.

---

## 11. Navigation defaults

1. View Application and account login always open **Dashboard** first.
2. Setup section: open section overview (not stay stuck on Dashboard); don’t show Setup as selected on Dashboard.

---

## 12. Support chat & renew

1. Private support channel: account admin ↔ platform; not visible to other accounts.
2. Bell icon on account admin top bar; WhatsApp-like chat (messages, attach image/doc); typing at bottom; panel under top bar.
3. Platform: bell per account on Accounts; Clear chat on platform.
4. Remove separate full Support page / ticket-heavy UX.
5. **Renew flow (7 days before expiry):** chat message to renew → same package or change → show amount + GST + pending broadcast charges (₹0.25/message previous month) → amount-locked UPI QR (no amount entry) → after pay, send screenshot with UPI id on WhatsApp.
6. Ignore renew chip replies for unread badges; only real typed messages count.
7. Same locked-amount QR idea for pass payment where useful.
8. Service packages page: packages list + top-right create; discounted rate row when present.

---

## 13. Marketing site (new Home / Features / Pricing / Get Started)

1. New marketing Home (without breaking old until cutover): Get Started → Create Account; Pricing → Service Packages; Features page for feature list.
2. Replace old Home with new marketing Home.
3. Wordmark logo; match logo bg to page; faint white top nav; hero height/image adjustments; feature icons like sample.
4. “View all features” → **View Application** (expandable / fullscreen app preview).
5. Minimize View Application → go to Home.
6. Redesign Pricing and Create Account (Get Started) to match Home.
7. Signup: verify email OTP (email) + mobile OTP (WhatsApp) before create; layout Contact|City then Mobile/Email + OTP rows; mobile alignment rules.
8. Restore Water Quality in marketing features; 6 features in one full-width row; summary without “automated alerts”.

---

## 14. Water Quality (Operations)

1. New page under Operations (like Pool Expenses).
2. Columns: Date, pH, Free Chlorine, Total Alkalinity, Calcium Hardness, Tester Name, Save → Result.
3. Ranges: pH 7.2–7.6; Free Chlorine 1–3 ppm; TA 80–120; CH 200–400 → red out-of-range + Pass/Fail.
4. No future dates; no range placeholders in inputs; sample rows in View Application (dates ≤ today).
5. Full package / menu wiring, i18n, packages, guide.

---

## 15. App visual system & theme

1. Menubar `#02204D`; selected `#004EBD`; app surfaces `#F2F8FE` / `#E5F2FD`; top bar match menubar.
2. Unified download button green; primary buttons match Pool Expenses save colour.
3. Rework application pages to suit marketing Home look (light shell, Outfit, etc.).
4. Light/dark theme toggle icon.
5. Dark mode: flip fonts, entry/selection boxes, logos, chips, tables, registration panels, pricing compare table, etc.
6. View Application opens in **dark** initially.
7. Home always opens in **light**; user may switch to dark.

---

## 16. Cross-cutting UI patterns (repeated)

1. Entry/selection boxes next to headings; shared column start alignment.
2. Optimise control widths (mobile 10-digit, account code 6-char, etc.).
3. Remove unnecessary lines/gaps/watermarks when asked.
4. Sample watermark on View Application demo screens.
5. Consistent backgrounds: Batches cyan for pool app; saffron/purple for SaaS admin cards.

---

*Raw chronological extract of chat user messages: `docs/_user-instructions-raw.txt` (404 entries). This file is the curated product-oriented list.*
