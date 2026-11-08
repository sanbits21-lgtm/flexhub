# FlexHub

Multi-tenant B2B gym management SaaS: a Node/Express/MongoDB backend, a React/Vite staff website
(also installable as an app), an installable **member web app** at `/member`, and an Expo mobile app.

## What it does
- **Gyms (tenants)** with branches, members, trainers, equipment, membership plans, attendance,
  payments (UPI, recorded by staff), renewals, reports, class and personal-training scheduling,
  bulk member upload with custom fields, per-gym branding and its own web address.
- **Members** get a web/mobile app: membership status, schedule, workout and diet plans, entry QR
  pass, payments, profile. It works offline from saved copies.
- **The platform** (super-admins and platform admins) onboards gyms: self-registration with email
  confirmation and **approval**, **subscription packages** gyms choose from, trials, **renewals**,
  plan-ending reminders, and a per-gym feature switchboard.
- **Security:** short-lived access tokens with rotating refresh tokens, per-account lockout, a
  password-strength policy, a content-security policy, rate limits and tenant isolation.

## Documentation
| | |
|---|---|
| [CONTEXT.md](./CONTEXT.md) | Architecture, data model, API, frontend structure, how the main flows work |
| [docs/PLATFORM_ADMIN.md](./docs/PLATFORM_ADMIN.md) | Running the platform: packages, approving gyms, renewals, plan expiry, reminders |
| [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) | Every setting, with defaults |
| [docs/SECURITY.md](./docs/SECURITY.md) | Sessions, lockout, passwords, content-security policy, what is still open |
| [docs/MEMBER_APP.md](./docs/MEMBER_APP.md) | The member web app: install, sign-in, offline |
| [docs/RENDER.md](./docs/RENDER.md) | Deploying on Render, post-deploy checks, troubleshooting |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Deploying with Docker, mobile app stores, subdomains, self-registration |

## Quick start
```bash
npm run install:all     # root + backend + frontend
cp .env.example .env    # set MONGODB_URI and JWT_SECRET
npm run seed:super-admin   # first platform owner (SEED_* variables)
npm run dev             # API on :5000, website on :5173
npm test                # backend test suite (needs a MongoDB; uses a separate "-test" database)
```
