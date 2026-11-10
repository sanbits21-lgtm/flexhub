# FlexHub — Project Context

Multi-tenant B2B Gym Management SaaS. Each gym brand is a **Tenant** with N **Branches**. Full architecture rationale lives in the plan at `C:\Users\santh\.claude\plans\as-project-architect-i-prancy-deer.md`; this file documents the as-built state.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 4, Mongoose 8, bcryptjs, JWT access tokens (jsonwebtoken) + rotating refresh sessions, Helmet, Zod |
| Frontend | React 18, React Router v7, Tailwind CSS, Axios, Recharts, Vite (installable PWA) |
| Database | MongoDB (shared DB, app-layer tenant/branch scoping) |
| Mobile | React Native / Expo (`mobile/`): members, trainers and branch managers; the member screens also exist as a web app at `/member` (see `docs/MEMBER_APP.md`) |

## Environment

`.env` lives at the project root, loaded by the backend via `path.join(__dirname, '../.env')`. Copy `.env.example` to `.env` and fill in:
```
MONGODB_URI=mongodb://localhost:27017/flexhub
JWT_SECRET=...
PORT=5000
SEED_EMAIL / SEED_PASSWORD / SEED_NAME / SEED_PHONE   # for the seed script
```
Everything else (sessions, lockout, content-security policy, email, trial, reminders, production
address) is listed with its default in [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).

## Running the App

```bash
npm run install:all   # root + backend + frontend
npm run dev            # backend :5000, frontend :5173 (proxied to /api), via concurrently
npm run seed:super-admin  # one-time: creates the first Super Admin from SEED_* env vars
npm test               # Jest + supertest API suite (see Testing below)
```

## Testing

`npm test` runs the backend suite (Jest + supertest, `backend/tests/`). The express app
lives in `backend/app.js` and `server.js` only connects the DB and listens, so tests
mount the real app without opening a port.

Tests hit a **separate database on the same cluster** — `MONGODB_URI`'s db name with a
`-test` suffix (override via `MONGODB_URI_TEST`). `tests/helpers.js` refuses to run
against any database whose name doesn't end in `-test`, and wipes collections between
suites (the Atlas user has read/write but not `dropDatabase`, so cleanup is deletes, not
a drop). `NODE_ENV=test` disables rate limiting, which the suite would otherwise trip
(`FORCE_RATE_LIMIT=on` turns it back on for the suites that test it).

Coverage: RBAC role matrix and validation errors (`rbac.test.js`), cross-tenant/branch
isolation and `enforceWriteScope` tampering (`scoping.test.js`), membership date
derivation, derived expiry status, expiry-window filters and soft delete
(`members.test.js`), payment lifecycle, filters, pagination and renewal date rules
(`payments.test.js`). Later suites cover: self-registration, email confirmation and approval
(`signup.test.js`), subscription packages and approval terms (`packages.test.js`), plan expiry,
renewal, reminder emails and tenant-edit validation (`expiry.test.js`), access/refresh sessions
(`sessions.test.js`), the per-account lockout (`lockout.test.js`), rate limits, request size and the
production start-up check (`security.test.js`), the content-security policy (`csp.test.js`), the
password policy (`passwordPolicy.test.js`), the member web app's API (`memberPwa.test.js`), custom
member fields and bulk upload, the first super-admin from the environment, and more. About 390 tests
in 27 suites at the time of writing. `security.test.js` sets `FORCE_RATE_LIMIT=on` because limits are
otherwise off under test.

## PWA (installable mobile app)

The staff app is an installable PWA via `vite-plugin-pwa` (Workbox) — configured in
`frontend/vite.config.js`. Key decisions:

- **`registerType: 'prompt'`, not `autoUpdate`.** Staff fill in member/payment forms; an
  automatic reload when a new build lands would discard their input.
  `components/PwaStatus.jsx` renders the "new version available" prompt and the offline
  banner.
- **App shell caching only — no `runtimeCaching` for `/api`.** Responses are authenticated
  and tenant-scoped; serving one gym cached data, or showing stale membership/payment
  figures, is worse than an honest network error. `navigateFallbackDenylist` keeps `/api`
  and `/health` from being answered with the SPA shell when offline.
- Icons are generated from `public/icons/icon.svg` by `npm run icons --prefix frontend`
  (`scripts/generateIcons.js`, uses `sharp`) and committed, so the normal build has no
  image-processing step. The maskable variant is padded to 60% for Android's circular crop.
- iOS needs its own meta tags (it ignores the manifest for home-screen installs) — see
  `index.html`. `viewport-fit=cover` plus the `pt-safe`/`pb-safe` utilities in `index.css`
  keep the mobile header and sidebar footer clear of the notch and home indicator.
- `backend/app.js` serves `sw.js` with `Cache-Control: no-cache`, so a stale worker can't
  pin users to an old bundle.

**Service workers require HTTPS** (localhost excepted), so installing on a real device
needs an HTTPS deployment or tunnel.

## Production Deployment

Single-service model: the backend serves both the API and the built frontend from one
Node process/port — no separate static host or CORS setup needed unless you deliberately
split them.

```bash
npm run build   # vite build -> frontend/dist
npm run start   # node backend/server.js (no nodemon) — serves API + frontend/dist together
```

Set `NODE_ENV=production` in `.env` for this deploy target. `server.js` only serves
`frontend/dist` and applies the production CORS default when it's set. `CORS_ORIGIN`
(comma-separated) is only needed if the frontend is hosted on a different origin than the
API — see `.env.example`.

**Hardening already in place:** Helmet headers plus a **Content-Security-Policy** built for this bundle
(`backend/middleware/csp.js`, hash-allowed inline blocks, `CSP_MODE`), rate limits mounted *before* the
public routes (sign-up 5/h, confirmation 20/h, sign-in 10 failed/15 min, refresh 120/15 min, `/api` 300/15 min),
`trust proxy` for correct client addresses, a small default request body (5 MB only for bulk import and
photos), `GET /health`, and a start-up check that refuses production without a strong `JWT_SECRET` and a
public address (`PUBLIC_URL`, falling back to Render's own). Full list: `docs/SECURITY.md`.

**Still needed before a real public launch:** no "forgot password" flow for staff or members; no
error-tracking service; no payment gateway for the platform's own billing (renewals are recorded by
hand); real email delivery and the mobile app's new sessions are untested on a device; and **rotate the
MongoDB Atlas password** in `.env` before going live if it was ever weak.

---

## Role Hierarchy & Scoping

Six actors, strictly nested: **Super Admin** → **Platform Admin** → **Tenant Admin** → **Branch Manager** → **Trainer** / **Member**.

Staff (first five) share one `User` collection with a `role` enum. `Member` is a separate collection (different auth client — mobile — different field set and volume).

### `backend/middleware/auth.js`
- `protect` — verifies the (15-minute) access JWT, branches on `decoded.actorType` (`'member'` vs `'user'`) to load `req.member` or `req.user`, and records `req.sid` (which login this is). An expired token answers 401 `TOKEN_EXPIRED` so clients refresh and retry; any other 401 means the session is gone. Also applies the gym-state gate: unapproved or rejected (403), suspended (403), and read-only after a trial or paid plan ends (402 `TRIAL_ENDED` / `PLAN_EXPIRED`, writes by staff only).
- `scopeContext` — computes `req.scope`, the Mongo filter base every controller must spread into its queries (a `tenantId`/`branchId` query value that is not a plain string is rejected with 400):
  - `member` → `{ memberId, tenantId, branchId }`
  - `super-admin` → `{}` (optional `?tenantId=` override)
  - `platform-admin` → `{ tenantId: { $in: managedTenantIds } }` or unscoped (`{}`,
    sees every tenant) when `managedTenantIds` is empty. **This transition is
    one-directional in only one place**: `tenantController.js create()` used to
    `$addToSet` the newly-created tenant into `managedTenantIds` unconditionally,
    which flipped an unscoped platform-admin to scoped the moment they created their
    first tenant — silently hiding every other tenant they could see a second before.
    Fixed by only doing that `$addToSet` when `managedTenantIds` was already non-empty
    (`backend/tests/platformAdminScoping.test.js` covers this). Also surfaced a second,
    unrelated bug in the same request path: `logAudit` (`backend/utils/audit.js`) used
    to pass `req.scope.tenantId` straight through as `AuditLog.tenantId`, which is a
    `{$in: [...]}` query shape for a scoped platform-admin, not a single ObjectId — the
    schema cast failed silently (caught, never thrown), so **every scoped
    platform-admin's actions went completely unlogged**. Fixed by falling back to
    `target.id` when the action's own target is a Tenant, else leaving it unset.
  - `tenant-admin` → `{ tenantId }`, or `+ branchId` when drilling in via `?branchId=`
  - `branch-manager` → `{ tenantId, branchId }`
  - `trainer` → `{ tenantId, branchId, trainerId }` (controllers translate `trainerId` into an `assignedMembers` filter — it is never a real field on any collection)
- `enforceWriteScope` — on create/update, overwrites any client-supplied `tenantId`/`branchId` with the caller's own scope (tenant-admin/branch-manager/trainer). Closes cross-tenant injection from a buggy/malicious frontend.
- `requireRole(...roles)` — allow-list guard. Rejects every member-actor token by design.
- `allowActors({ member, roles })` — for routes a member is *also* legitimately allowed to
  hit (self check-in, own attendance history). `requireRole` can't express that, which is
  why those attendance routes previously had no gate at all.

Request bodies are validated by `backend/middleware/validate.js` (Zod) before reaching a
controller — shape only; ownership/scoping checks stay in controllers where `req.scope`
lives. It runs *after* `enforceWriteScope`, so the schema sees server-stamped ids; the
id validators therefore accept both JSON strings and real ObjectIds.

**Golden rule**: every list/read controller filters by spreading `req.scope`; every scoped Mongoose schema has `tenantId`/`branchId` as `required: true` with a leading `{tenantId, branchId}` compound index. Writes never trust client-supplied tenant/branch IDs except from super-admin/platform-admin explicit onboarding actions.

Every mutating controller call also fires `logAudit(req, action, target)` (`backend/utils/audit.js`) — fire-and-forget write to `AuditLog`, forensic backstop for scoping bugs.

### Member role — intended self-service access (spec, not fully built)

The Member is deliberately the lowest-privilege actor — **never** trainer/branch-manager/tenant-admin-level access (no managing other members, no equipment/trainer CRUD, no financial or admin visibility, no cross-branch reach). Onboarded by a tenant-admin or branch-manager (staff-created only, no self-registration). Within that ceiling, intended self-service scope:

**Can see/do (target state):**
- View own profile — ✅ built (`GET /api/members/me`)
- Update own profile — name, and *optional* health/body fields: weight, height, age, any known health issue/condition — ❌ not built (no self-service update endpoint exists at all yet; today only staff can edit a member's record)
- Update own profile photo — ✅ built (`utils/photos.js`: JPEG/PNG/WebP, 200x200 px minimum, 1 MB maximum, stored on the uploads disk). Trainers, branch managers and gym owners set their own from the sidebar (`/api/profile/photo`); members from their Profile screen
- View the equipment list for their own branch (read-only) — ❌ not built (`/api/equipment` currently blocks the member actor type entirely)
- View the trainers list for their own branch (read-only) — ❌ not built (`/api/staff` currently blocks the member actor type entirely)
- Basic workout suggestions, AI-generated "for now" — ❌ not built (no workout data model, no AI integration exists anywhere in the app; "for now" implies this is a placeholder-quality v1, not a full program-builder)

**Explicitly cannot do:** anything at trainer level or above — no visibility into other members, no CUD on equipment/trainers/branches/plans, no payments/financial data beyond their own, no cross-branch or cross-tenant reach. Same `{ tenantId, branchId }` ceiling as today.

**Member self-service IDOR — fixed.** `GET /api/members/:id`, `GET /api/members/:id/progress` and `GET /api/attendance/member/:id` are now restricted to the caller's own id for a member actor (`forbidCrossMemberAccess` in `memberController.js`, inline check in `attendanceController.js`). `POST /api/attendance/check-out` had the same class of hole — a member could close any open record in their branch by guessing the id — and now forces `memberId` to the caller.

---

## Authentication and sessions

Signing in (`POST /api/auth/login`, `/api/member-auth/login`) starts a **session**: a 15-minute
access JWT (`{id, actorType, sid}`) plus a random refresh token whose **hash** is stored in the
`Session` collection (`backend/utils/sessions.js`). The website gets the refresh token as an
`httpOnly`, `SameSite=Strict`, path-limited cookie (and must send `X-Requested-With: flexhub` to use
it); the native app sends `X-Client: native` and receives it in the response body instead.

`POST /refresh` rotates: the used token is retired (kept 24 h so reuse is detectable) and a new
one issued in the same family. A retired token presented after the 20-second grace window ends
the whole family. A refresh re-checks everything login checks (active person, gym address, email
confirmed, approved, not suspended). Logins end after 30 days unused or 180 days in total.
`logout`, `logout-all`, a password change (other devices), a forced reset, deactivation and
account deletion remove sessions (`revokeActor`). Tokens made before `passwordResetAt` are also
rejected by `protect`.

Sign-in is guarded by a per-IP limiter and a **per-account lockout** (`utils/loginThrottle.js`,
`LoginAttempt`): keyed by what was typed, so an unknown account behaves identically, with a dummy
password check for equal timing. Passwords pass `utils/passwordPolicy.js`. Registration answers the
same whether or not the email exists. Settings: `docs/CONFIGURATION.md`; behaviour and gaps:
`docs/SECURITY.md`.

## Self-registration, packages and the plan lifecycle

`/signup` → `signupController` creates a **pending** tenant, branch and unconfirmed owner, and emails
a confirmation link. When the owner confirms, platform staff are emailed. **Approve**
(`tenantController.approve`) grants the chosen `SubscriptionPackage`'s limits (or the platform trial),
sets `trialEndsAt` (package with trial days) or `planEndsAt` = now + `billingMonths`
(package with none), and emails the owner. `confirmEmail: true` ("Approve anyway") confirms the
owner's email on their behalf. **Renew** adds months to `planEndsAt` (from today if it had lapsed, from
the current end otherwise), records a paid `TenantSubscriptionInvoice`, converts a trial to a paid
plan and resets reminders. `utils/subscription.js` holds the rules (`subscriptionOf`, `expiryBlock`,
`addMonths`; 3 grace days for paid plans, none for trials). `utils/expiryNotices.js` emails owners at
7 days, 1 day and at the end (claimed with one conditional write so several servers never double-send)
and runs every 6 hours from `server.js`. Details for operators: `docs/PLATFORM_ADMIN.md`.

## Database Models (`backend/models/`)

| Model | Key fields |
|---|---|
| `Tenant` | name, slug (unique, = the gym's address), brand{color,color2,gradientAngle,logoUrl,tagline}, memberFields[] (custom member fields), contactEmail/Phone, billingPlan, billingStatus, maxBranches, maxMembers, trialEndsAt, **planEndsAt**, **approvalStatus** (pending/approved/rejected), signupSource, **requestedPackageId / packageId / packageName**, expiryNotice (which reminder was sent), features (Map), isActive, upiId, upiPaymentLink |
| `Branch` | tenantId, name, address{}, phone, timezone, capacity, isActive |
| `User` | name, email (unique), phone, password (bcrypt), role enum, tenantId, branchId, managedTenantIds[], specialization (trainer), salary, emailVerified (+ confirmation hash/expiry), passwordResetAt, accountNoticeSentAt |
| `Member` | tenantId, branchId, memberCode (unique), name, email, phone, password (bcrypt), membershipPlanId, membershipStart/End, membershipStatus, bodyMetrics[], assignedTrainerId, qrCode (unique) |
| `MembershipPlan` | tenantId, name, durationUnit (monthly/quarterly/half_yearly/yearly), price, features[] |
| `Equipment` | tenantId, branchId, name, category, status, nextServiceDue |
| `Attendance` | tenantId, branchId, memberId, checkInAt, checkOutAt, method |
| `MemberPayment` | tenantId, branchId, memberId, amount, status, invoiceNumber (unique) |
| `TenantSubscriptionInvoice` | tenantId, billingPlan, periodStart/End, amount, status — the platform's own SaaS billing of tenants |
| `AuditLog` | tenantId, actorId, actorRole, action, targetType/Id, metadata, createdAt |
| `SubscriptionPackage` | name, description, price, **billingMonths** (1-60), trialDays (0 = live at approval), maxBranches, maxMembers (unset = unlimited), highlights[], isFeatured, isActive, sortOrder — the plans gyms pick when registering |
| `Session` | actorType (user/member), actorId, familyId, tokenHash, startedAt, expiresAt (TTL), rotatedAt — one row per **refresh token**; a login is a family of rotated tokens |
| `LoginAttempt` | key (account typed, real or not), failures, windowStart, lockedUntil, lockCount, expiresAt (TTL) — the per-account lockout |
| `PlatformSettings` | one document: selfSignupEnabled, trialDays, trialMaxMembers, trialMaxBranches (override the env defaults) |
| `MemberPlan` | a member's stored workout or diet plan (from a trainer, or generated) |
| `ClassType`, `ClassSession`, `Booking`, `PtSession` | group classes, their schedule and bookings; one-to-one personal training |

---

## API Routes

| Base path | Roles | Notes |
|---|---|---|
| `/api/public` | public | `GET /tenant` (a gym's name and look for its login page), `GET /signup-config` (incl. the offered packages), `POST /signup`, `POST /verify-email`, `POST /resend-verification`; `GET /member.webmanifest` is served separately |
| `/api/auth` | public/JWT | staff `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `GET /me`, `POST /change-password` |
| `/api/member-auth` | public/JWT | member `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `GET /me` |
| `/api/packages` | super-admin (write), platform-admin (read) | subscription packages: list, create, update, delete (refused while any gym uses it) |
| `/api/platform-settings` | super-admin (write), platform staff (read) | trial terms and whether self-registration is open |
| `/api/csp-report` | public | browsers post content-security-policy violation reports here; logged, size-limited |
| `/api/platform-admins` | super-admin | CRUD platform admins |
| `/api/tenants` | super-admin, platform-admin | list, onboard tenant + first tenant-admin, edit (validated; a `packageId` applies a package), suspend, add more tenant-admins; **`POST /:id/approve`** (takes optional `packageId`, term overrides, and `confirmEmail: true` for "Approve anyway"), `POST /:id/reject`, **`POST /:id/renew`** (months + amount: extends the plan, records a paid invoice, emails the owner) |
| `/api/branches` | tenant-admin (own), read for platform/super | CRUD, `POST /:id/managers` creates a branch-manager |
| `/api/staff` | tenant-admin (read), branch-manager (CUD trainers) | `role` query filters; `GET /:id/assigned-members` |
| `/api/members` | branch-manager (CUD), tenant-admin/trainer (read, scoped) | `GET /me` for member self-service, `GET /:id/progress`, `POST /:id/body-metrics`, `POST /:id/renew` (extends dates + records payment atomically) |
| `/api/equipment` | branch-manager (CUD), tenant-admin (read) | `GET /maintenance-due` |
| `/api/membership-plans` | tenant-admin (CUD), branch-manager (read) | tenant-wide catalog |
| `/api/attendance` | branch-manager/trainer/tenant-admin + member (own), via `allowActors` | `POST /check-in` (member self via QR or staff manual), `POST /check-out` |
| `/api/dashboard` | all staff (payload varies by role), member | `GET /summary` branches on role; `GET /platform` (super/platform only) |
| `/api/tenant-settings` | tenant-admin (read/write), branch-manager (read) | tenant's own UPI collection details (`upiId`, `upiPaymentLink`) — no payment gateway |
| `/api/tenants/:id/features` | super-admin, platform-admin | Workspace — get/update per-tenant feature flags (see below) |

Routes under `/api/public`, the `/login`, `/refresh` and `/logout` endpoints, and `/api/csp-report` are public. Everything else goes through `protect → scopeContext`; write routes add `enforceWriteScope` + `requireRole(...)`. Also mounted: `/api/member-app` (the member's own screens: profile, photo, plans, sessions, pass, payments), `/api/class-types`, `/api/class-sessions`, `/api/bookings`, `/api/pt-sessions`, `/api/payments`, `/api/reports`, `/api/audit-logs`.

### Dashboard (`backend/controllers/dashboardController.js`)
One `getSummary` branches on `req.user.role` / `req.actorType`:
- super-admin/platform-admin → platform-wide tenant/MRR stats
- tenant-admin → cross-branch aggregation (or single-branch when `req.scope.branchId` is set)
- branch-manager → single-branch KPIs
- trainer → assigned-member stats
- member → own membership/attendance/payment summary

### Payments — UPI collection (no gateway)

Each tenant sets its own UPI ID (and optional fallback payment link) on the
**Payment Settings** page (`tenant-admin` only, `frontend/src/pages/tenant/PaymentSettings.jsx`
→ `/api/tenant-settings`). No Razorpay/payment gateway is used — deliberately skipped in
favor of this simpler model after discussing multi-tenant settlement tradeoffs (a shared
gateway account would collect every tenant's money into one bank account). Each tenant's
money goes straight to their own UPI handle.

In the Add Member flow (`frontend/src/pages/branch/Members.jsx`), once a membership plan
is selected staff pick a payment method:
- **Cash** — unchanged: member is created and a `paid` `MemberPayment` (`method: 'cash'`)
  is recorded immediately.
- **UPI** — the member is created first, then the modal shows a QR code (`qrcode.react`'s
  `QRCodeSVG`, built via `frontend/src/utils/upi.js`'s `buildUpiLink` — a standard
  `upi://pay?...` deep link with the amount pre-filled) plus the raw UPI ID and optional
  payment link. Staff click **Mark as Paid** once the member has paid, which is what
  actually records the `MemberPayment` (`method: 'upi'`); a success step confirms this
  inside the same modal. If the modal is closed before that, the member still exists
  (unpaid) — the payment can be recorded later from the **Payments** page.

There is no gateway callback to verify against, so payment confirmation is always a manual
staff action — this is intentional, not a gap. Walking away from the QR ("Pay later")
records a **pending** payment rather than nothing, so the debt is visible on the Payments
page and can be settled there with Mark Paid.

The Payments page also filters by status/method/date range, paginates, reprints a receipt
for any past payment, and supports refunds. A refund clears `paidAt` as well as setting
`status: 'refunded'`, so refunded money stops counting toward the month's revenue in the
`paidAt`-based aggregations.

### Bulk member upload — plan + payment

`frontend/src/components/BulkUploadMembersModal.jsx` → `POST /api/members/bulk`
(`memberController.bulkCreate`). Plan resolution per row, in order: (1) the row's own
Plan column, matched by name case-insensitively against the tenant's plans; (2) if
blank or no match, the **"Plan for this batch"** selector on the mapping screen — the
fallback for the common case of an entire sheet being one plan, and it also quietly
fixes what used to be a silent failure mode (a typo'd plan name importing the member
with no plan and no warning).

Whichever way a row ends up with a plan, `bulkCreate` now also records a `MemberPayment`
for it — `method: 'cash'`, `status: 'paid'`, `amount` = the plan's list price, same as
the single Add Member flow's default before any discount. This closes a gap where bulk
imports could set `membershipPlanId`/`membershipEnd` but never create a payment, so an
imported member could look active with zero revenue trail. No per-row discount/amount
override exists for bulk (unlike single Add Member) — deliberately out of scope; a
per-row amount column would be the natural place to add it later. The response's
`paymentsRecorded` count and the `BULK_CREATE_MEMBERS` audit entry's `metadata.paymentsRecorded`
both reflect how many of the batch actually got one.

Soft delete: `isActive: false` now means **hidden by default** everywhere (member lists,
dashboard counts, expiry/renewal chases, trainer assignments, plan mix), with
`?includeInactive=true` — surfaced as a "Show deactivated" toggle — to find and reactivate
them. `applyActiveFilter` in `memberController.js` is the read-side gate; dashboard
aggregations use a separate `memberMatch` because `MemberPayment`/`Attendance`/`Equipment`
have no `isActive` field and reusing it there would match nothing.

### Renewals & derived membership status

`POST /api/members/:id/renew` (tenant-admin, branch-manager) moves the membership dates
**and** records the payment in one handler — deliberately not two client calls, since that
is how money gets collected while the membership silently stays expired. Date rule:
renewing early extends from the current `membershipEnd` (unused days are kept); an already
lapsed membership restarts from today. Same `addPlanDuration` calendar math as onboarding.

`membershipStatus` is a stored field that nothing automatically flips when a membership
lapses, so it is **derived from `membershipEnd` at read time** via
`backend/utils/membershipStatus.js` (`withDerivedStatus` on member reads, `statusFilter`
translating `?membershipStatus=` queries). Only `active` is re-derived — `frozen` and
`cancelled` are deliberate staff decisions and are never overwritten. No cron job involved;
this matches how the dashboards already computed expiry.

UI: `frontend/src/components/RenewMembershipModal.jsx` (plan, discount, editable amount,
Cash/UPI, QR step, `PaymentReceipt`), reachable from the Members table Actions column and
from the Dashboard's Expired / Expiring Soon tables — the latter being the real workflow,
since staff work down the expired list.

The same modal also doubles as **"Add Plan"** for a member who was created without one
(Add Member's "No plan yet" option, or an unmatched bulk-import row) — the backend
needed no change (a member with no `membershipEnd` has nothing to extend from, so the
existing "lapsed restarts from today" rule already does the right thing), only the
label/copy is conditional on `!!member.membershipPlanId`. Deliberately **not** a Plan
field on plain Edit (`Members.jsx`'s inline edit form) — Edit doesn't move
`membershipEnd` or record a payment, and a plan change needs to do both atomically.

**Renew vs. Change Plan** — picking a *different* plan than the member is currently on
is treated as a correction, not a top-up: it starts **today**, discarding whatever time
was left on the old plan, rather than queuing the new plan up behind the remaining days
(which is what same-plan renewal still correctly does). `memberController.js`'s `renew`
computes `isPlanChange = member.membershipPlanId && String(member.membershipPlanId) !==
String(plan._id)` and only takes the "extend from remaining end" branch when that's
false. The frontend mirrors this exactly (`RenewMembershipModal.jsx`'s own `isPlanChange`,
derived from the currently-selected plan vs. the member's existing one) so the on-screen
preview ("Starts today" vs. "Renews from — remaining days kept") always matches what the
server is actually about to do, and the modal's title/button text says "Add Plan" /
"Change Plan" / "Renew" accordingly.

The Members list also takes `?expiringInDays=N` (7/15/30/60 in the UI), returning
memberships lapsing between now and N days out, excluding `frozen`/`cancelled`. It
combines with `?membershipStatus=` under `$and` — both conditions constrain
`membershipEnd` and can each carry an `$or`, so merging them into one object literal
would let the later key silently win.

### Workspace — per-tenant feature flags

Platform-admin/super-admin only (`GET/PUT /api/tenants/:id/features`, rides on
`tenants.js`'s existing router-level `requireRole`). Lets a platform-admin turn
individual pages/features/fields on or off **per tenant**, independent of
`billingPlan` — nothing auto-derives flags from plan tier.

- **Registry**: `backend/config/featureRegistry.js` — the single source of truth for
  what can be toggled (`{key: {label, description, category, default}}`). Adding a new
  toggle is one entry here plus one gate point, never a migration.
- **Storage**: `Tenant.features` is a sparse `Map<String, Boolean>` — only overrides are
  stored; an empty map means every flag sits at its registry default, so existing
  tenants are unaffected until a platform-admin explicitly changes something. **Keys use
  `:` as the namespace separator (`pages:reports`, not `pages.reports`)** — Mongoose/
  MongoDB forbid dots in Map keys; this bit once during development (`Mongoose maps do
  not support keys that contain "."`) and the whole registry was renamed to `:` as a
  result.
- **Resolution**: `backend/utils/features.js`'s `resolveFeatures(tenant)` merges
  registry defaults with tenant overrides into a plain `{key: boolean}` — the one place
  this merge happens, used by both request gating and the `/api/auth/me` response.
- **Enforcement, two patterns**: (A) whole route/router — `backend/middleware/
  features.js`'s `attachFeatures` (loads `req.features`, skipped entirely for
  super-admin/platform-admin — they're never gated) + `requireFeature(key)` (403 if
  explicitly `false`), composed into route chains the same way `requireRole` already is.
  (B) inline controller check — for flags gating one *choice* within a shared endpoint
  rather than a whole route (`features:upiPayments` on `method === 'upi'` in both
  `memberPaymentController.create` and `memberController.renew`; `features:
  paymentRefunds` on `status === 'refunded'`; `features:trainerAssignment` silently
  drops `assignedTrainerId` rather than erroring, since a stale client shouldn't
  hard-fail over a disabled optional field).
- **Frontend**: `AuthContext` carries `features` from login/me (undefined for
  super-admin/platform-admin); `hooks/useFeature.js` reads it (defaults to `true` when
  absent); `components/FeatureRoute.jsx` wraps page *content* inside `AppLayout` (not
  the route itself) so the sidebar nav link stays visible and clickable — a disabled
  page shows "Not included in your plan" instead of the link just vanishing. Sub-feature
  UI (Bulk Upload button, UPI radio, Refund button, Trainer field) uses a plain
  `useFeature()` conditional at the exact spot.
- **UI**: `frontend/src/pages/platform/Workspace.jsx` (`/tenants/:id/workspace`,
  reached via a "Workspace" link on the Tenants list) — grouped checkboxes by category,
  load-edit-save shape matching `PaymentSettings.jsx`.
- **Audit**: `UPDATE_TENANT_FEATURES` logs only the keys that actually changed
  (`{key: {from, to}}`), not the whole payload resent.

---

## Frontend Structure (`frontend/src/`)

```
context/AuthContext.jsx      # user, login/logout; on load renews the in-memory access token from the refresh cookie, then GET /api/auth/me
services/authToken.js        # the access token, held in memory only (never localStorage)
services/api.js              # axios instance + one API module per resource
components/RoleRoute.jsx     # <RoleRoute allow={[...]}> — generalized role route guard
components/FeatureRoute.jsx  # wraps page CONTENT inside AppLayout (not the route) — sidebar link stays visible
components/Sidebar.jsx       # nav filtered by role
components/StatCard.jsx, DataTable.jsx   # shared dashboard/table primitives
hooks/useFeature.js          # useFeature('pages:reports') — reads AuthContext, true if absent (super/platform-admin)
pages/
  Login.jsx, Dashboard.jsx   # Dashboard branches its rendering on user.role
  platform/  PlatformAdmins.jsx, Tenants.jsx (approvals, renew, edit), Packages.jsx, PlatformSettings.jsx, AuditLogs.jsx, Workspace.jsx, PlatformDashboard.jsx
  member/    (the member web app at /member: MemberApp.jsx, MemberAuth.jsx, Shell.jsx, api.js, pages/{Home,Sessions,Plans,Gym,Pass,Payments,Profile,Login}.jsx)
  tenant/    Branches.jsx, MembershipPlans.jsx, TrainerReport.jsx, Reports.jsx, PaymentSettings.jsx, Branding.jsx
  dashboard/ role dashboards (widgets can be removed and re-added from a slide-in library)
  branch/    Members.jsx, Trainers.jsx, Equipment.jsx, Attendance.jsx, Payments.jsx
  trainer/   MyMembers.jsx
utils/upi.js                 # buildUpiLink({upiId, payeeName, amount, note}) -> upi://pay deep link
utils/packages.js            # price / trial / limits labels for packages
utils/receipt.js, bulkImport.js, memberFields.js, brand.js   # printable/WhatsApp receipts, bulk-upload mapping, custom fields, brand colours + gradient
components/                  # also: ListToolbar (title+count, search, filters), PackagesManager, PendingApprovals, TrialBanner, WidgetLibrary, Modal
```

Auth flow: login returns a 15-minute access token (kept in memory) and sets an `httpOnly` refresh cookie → the Axios interceptor attaches `Authorization: Bearer` → when the server answers 401 `TOKEN_EXPIRED` the interceptor makes **one** shared `POST /api/auth/refresh` and repeats the failed requests → on a page load `AuthContext` renews from the cookie, then calls `GET /api/auth/me`. The member app (`frontend/src/member/api.js`) does the same with its own cookie and also keeps the user signed in while offline. The native app keeps the refresh token in `SecureStore` and sends `X-Client: native`. See "Authentication and sessions" below.

**Built since this file was first written:** the Expo app (`mobile/`), the member web app, payments UI, Trainer Collections/Salary report, branch drill-down, workout/diet plans, class and personal-training scheduling, bulk upload with custom fields, branding, widgets, packages, approvals and renewals.

### Deferred follow-ups (intentionally out of scope so far)

- **Member self-onboarding via WhatsApp link.** `memberController.create` no longer takes a password from staff — it stamps a random placeholder (`crypto.randomBytes`) that nobody knows, so the member can't log in with it. The real flow (WhatsApp message with a link, member sets their own password) isn't built. Natural landing spot: a token-based `POST /api/member-auth/set-password` plus whatever sends the WhatsApp message.
- **Member-facing notifications.** The Dashboard's Expiring Soon / Expired sections (`dashboardController.js` → `tenantSummary`/`branchSummary`) surface *who* needs contacting, but nothing is sent to members — staff still act manually (call/WhatsApp). Email exists (`utils/mailer.js`) and is used for sign-up, approvals, renewals and the **gym-owner plan-ending reminders**, but there is no SMS/WhatsApp/push to members.
- **No payment gateway for the platform's own billing.** Packages carry a price and billing period, and **Renew** records a paid `TenantSubscriptionInvoice` (which feeds the platform dashboard's monthly total), but the money is collected outside the app and entered by hand. Tenants also can't be deleted, only suspended.
- **No "forgot password" flow** for staff or members (a manager re-issues a member's app login), no two-factor sign-in, no list of signed-in devices, and no error-tracking service.
- **Member-facing self-service expansion** (see Member role section above) — self-update profile (weight/height/age/health notes, all optional), profile photo upload (needs a storage decision first), read-only equipment/trainer visibility for their own branch, and a "for now" AI-suggested basic workout feature (needs a data model + an actual AI integration — none exists in the app today).

## First-Time Setup Flow

1. Copy `.env.example` → `.env`, set `MONGODB_URI`/`JWT_SECRET`.
2. `npm run seed:super-admin` — creates the first Super Admin from `SEED_*` env vars.
3. Super Admin logs in → **Platform Admins** page → create a Platform Admin.
4. Platform Admin (or Super Admin) → **Tenants** page → onboard a Tenant (creates the Tenant + its first Tenant Admin in one call).
5. Tenant Admin logs in → **Branches** page → create a Branch, then **+ Add Manager** to create its Branch Manager.
6. Branch Manager logs in → **Members**/**Trainers**/**Equipment** pages to onboard the branch.

**Or let gyms register themselves:** the super-admin creates subscription packages (**Packages**), a gym registers at `/signup` and confirms its email, a platform admin approves it (**Tenants > Pending approval**), and the owner signs in. Later, **Renew** extends the plan. See `docs/PLATFORM_ADMIN.md`.
