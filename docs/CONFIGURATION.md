# Configuration reference

Every setting the server reads, in one place. They go in `.env` (local and Docker) or in the
service's *Environment* tab (Render). `.env.example` has the same list with comments.

Only **`MONGODB_URI`** and **`JWT_SECRET`** are needed to run locally. In production you also need
**`PUBLIC_URL`** (or, on Render, nothing: see below) and, to let gyms sign themselves up,
**email**.

## Required

| Setting | What it is |
|---|---|
| `MONGODB_URI` | MongoDB connection string. The test suite uses a second database named `<name>-test` on the same cluster (override with `MONGODB_URI_TEST`). |
| `JWT_SECRET` | Signs login tokens. **In production it must be 32+ random characters or the server refuses to start.** Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Render generates it for you. |

## Address and network

| Setting | Default | What it does |
|---|---|---|
| `PUBLIC_URL` | none | The site's public address, e.g. `https://app.example.com` (no path). Links in emails are built from it. **Required in production** (the server refuses to start without it) so a forged `Host` header cannot poison email links. **On Render it is optional:** Render's own address (`RENDER_EXTERNAL_URL`) is used when this is empty. Set it explicitly once you add a custom domain; it always wins. |
| `BASE_DOMAIN` | none | Your root domain (`example.com`) to give every gym its own address `<gym>.example.com`. Leave empty for a single address. |
| `PORT` | `5000` | Port the server listens on (Render uses `10000`, the Docker image `8080`). |
| `TRUST_PROXY` | `1` | How many proxies sit in front of the app (1 for Render or Caddy). Too low and everyone shares the proxy's address, which breaks rate limiting; too high lets a client forge its address. |
| `CORS_ORIGIN` | none | Comma-separated allowed origins. Leave empty when the server also serves the website (same origin). Only needed if the website is hosted on a different domain. |
| `UPLOAD_DIR` | `backend/uploads` | Where member photos are stored. In Docker/Render this is the mounted disk (`/data/uploads`). |

## Email

Sign-up confirmation, approval notices, renewal receipts and plan-ending reminders are emailed.
Without email, **sign-up closes itself in production** (confirmation links could not be
delivered). In development the email is printed to the server log instead.

**Two ways to send. Pick one.** The first is simpler (one key) and works on hosts that block SMTP.

| Setting | What it does |
|---|---|
| `BREVO_API_KEY` | **Brevo web API.** One key (starts with `xkeysib-`), created under *SMTP & API > API Keys* in Brevo. Sends over ordinary HTTPS (port 443), so no host blocks it. Wins over the SMTP settings if both are set. Needs `MAIL_FROM` to be a sender verified in Brevo. |
| `SMTP_URL` | e.g. `smtps://user:password@smtp.example.com:465`. Or use the four below. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | The same thing spelled out (`SMTP_PORT` defaults to 587). |
| `MAIL_FROM` | The sender, e.g. `FitzyClub <no-reply@example.com>`. Most providers only accept an address or domain you have verified with them. |
| `MAIL_TIMEOUT_SECONDS` | How long to wait for the mail server before giving up (default `10`). A blocked port used to leave sign-up and the Email check waiting two minutes; now they fail in about this long. |

**To check it:** sign in as the super-admin, open **Platform Settings > Email**. It shows the host and
port in use (never the password), whether the mail server accepts the connection and login, the
reason for the last failed send, and a **Send a test email to me** button. Common failures and fixes:
see [RENDER.md](./RENDER.md#if-sign-up-says-we-couldnt-send-your-confirmation-email).

## Self-registration and free trial

These are only the **starting defaults**. Once a super-admin saves **Platform Settings**, the saved
values win. Subscription **packages** (the **Packages** page) are stored in the database, not in
settings, and take over from these numbers: see [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md).

| Setting | Default | What it does |
|---|---|---|
| `SELF_SIGNUP` | `on` | `off` closes `/signup`. |
| `TRIAL_DAYS` | `14` | Free trial length for gyms that register with no package. |
| `TRIAL_MAX_MEMBERS` | `50` | Member limit during that trial. |
| `TRIAL_MAX_BRANCHES` | `1` | Branch limit during that trial. |
| `SIGNUP_PER_HOUR` | `5` | Registrations allowed per network address per hour. |

## Sign-in sessions

Details in [SECURITY.md](./SECURITY.md#sessions-access-and-refresh-tokens).

| Setting | Default | What it does |
|---|---|---|
| `ACCESS_TOKEN_MINUTES` | `15` | Life of the short token every request carries. |
| `REFRESH_TOKEN_DAYS` | `30` | A login ends after this many days **without use**. |
| `REFRESH_MAX_DAYS` | `180` | Even a login in daily use must sign in again after this long. |
| `REFRESH_GRACE_SECONDS` | `20` | A just-replaced refresh token is still accepted this long (lost replies, two browser tabs). After that, reuse ends the whole login. |

## Wrong-password lockout

| Setting | Default | What it does |
|---|---|---|
| `LOGIN_MAX_FAILURES` | `5` | Wrong passwords inside the window that lock the account. |
| `LOGIN_WINDOW_MINUTES` | `15` | Failures older than this stop counting. |
| `LOGIN_LOCK_MINUTES` | `15` | First lock length. Each later lock doubles, up to 4x (so 15, 30, then 60 minutes). |

## Security policy and reminders

| Setting | Default | What it does |
|---|---|---|
| `CSP_MODE` | `enforce` | The browser content-security policy. `report-only` logs what it *would* block without blocking; `off` disables it. |
| `EXPIRY_NOTICES` | `on` | `off` stops the plan-ending emails (the read-only lock after a plan ends still applies). |

## Running it for real clients

See [OPERATIONS.md](./OPERATIONS.md) for what to do with these.

| Setting | Default | What it does |
|---|---|---|
| `ALERT_EMAIL` | the super-admins | Who is emailed when the server fails (comma-separated). |
| `ALERTS` | on in production, off elsewhere | `on` / `off` forces error emails either way. |
| `REQUIRE_LOCAL_DB` | off | `on`: outside production, refuse to start against a hosted database. A warning is printed regardless. |
| `TERMS_REQUIRED` | `on` | `off` stops requiring the Terms checkbox at sign-up. |
| `TERMS_OPERATOR_NAME` | `FitzyClub` | The company named in the Terms of Service page. |
| `TERMS_GOVERNING_LAW` | `India` | The jurisdiction named in the Terms of Service page. |

`/health` (process is up) and `/readyz` (process and database are up) are public, for hosts and uptime monitors.

## First platform owner

| Setting | What it does |
|---|---|
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Creates the first super-admin at start-up if that email does not exist (no shell needed). The password must be **12+ characters and not a common password**. An existing account is never changed. Remove the password from the environment after you have signed in and changed it. |
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_PHONE` | Optional details for that account. |
| `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_NAME`, `SEED_PHONE` | The same, for `scripts/seedSuperAdmin.js` when you have a shell. |

## Other

| Setting | What it does |
|---|---|
| `PRIVACY_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL` | Shown on the public `/privacy` page. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional. Without a key, workout and diet plans come from the built-in rules. |
| `NODE_ENV` | `production` turns on the production checks above and serves the built website. |
| `FORCE_RATE_LIMIT` | Tests only: `on` keeps rate limiting active under `NODE_ENV=test` (it is normally off so the suite does not trip its own limits). |

## Fixed rules (not settings)

| Rule | Value |
|---|---|
| Password length | 8 to 72 characters, and not on the common/guessable list (see SECURITY.md) |
| Grace after a paid plan ends | 3 days, then read-only |
| Plan-ending reminders | 7 days before, 1 day before, and when it ends; checked every 6 hours |
| Default request body size | 100 KB (5 MB for bulk member import and profile photos) |
| API rate limit | 300 requests per 15 minutes per address (sign-up, confirmation and refresh have their own, see SECURITY.md) |
