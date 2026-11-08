# Deploying on Render

The whole product (API + staff website) is one Docker web service; the database is MongoDB Atlas.
`render.yaml` describes it. The mobile app is built separately with EAS (see DEPLOY.md).

## Before you start
1. **MongoDB Atlas:** a cluster and a database user. Under *Network Access*, allow Render to
   connect. Render's outbound addresses are listed on the service's *Connect* menu; for a first
   deploy `0.0.0.0/0` works, but tighten it afterwards.
2. **Email (SMTP):** an account with any provider (Brevo, Mailgun, SES, Gmail app password).
   Needed for gym sign-up confirmation. Without it, sign-up stays closed in production.
3. A domain you can edit DNS for (optional at first: Render gives you `<name>.onrender.com`).

## Deploy
1. Push this repo to GitHub, then in Render: **New > Blueprint**, choose the repo.
2. Fill the prompted values: `MONGODB_URI`, `SMTP_URL`, `MAIL_FROM`,
   `PRIVACY_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL` (and `BASE_DOMAIN` if you want subdomains).
   `JWT_SECRET` is generated for you. **`PUBLIC_URL` can stay empty on Render**: the server uses
   the `https://<name>.onrender.com` address Render gives the service. Set it yourself once you
   add a custom domain (it always takes priority). The server refuses to start in production
   with no public address at all, so email links can never be built from a forged request.
   Every setting is described in [CONFIGURATION.md](./CONFIGURATION.md).
3. First deploy builds the Docker image (a few minutes). It is healthy when `/health` answers.
4. Create the first platform owner. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` (12+
   characters) in the service's environment; the account is created at startup if it does not exist.
   Sign in, change the password, then delete `SUPER_ADMIN_PASSWORD` from the environment. An
   existing account is never modified, so a restart cannot undo your new password.
   With paid Render Shell access you can instead run:
   `SEED_EMAIL=you@example.com SEED_PASSWORD='a-strong-password' SEED_NAME='Your Name' SEED_PHONE=9000000000 node scripts/seedSuperAdmin.js`
   then sign in at your site and change the password.

## Checks to run right after the first deploy
- **Client IP is right.** Sign-up is limited to 5 per hour per address, so Render's proxy must not
  make everyone look like one visitor. Register once, then check the response headers of
  `POST /api/public/signup` for `RateLimit-Remaining`; it should count down only for you, and the
  service log should show real client addresses. If every request shows the same internal address,
  raise `TRUST_PROXY` by one; if clients can spoof addresses, lower it.
- **Member photos persist.** Sign in as a member, upload a profile photo, then redeploy and confirm it
  is still there. If the upload fails with a permissions error, the disk mount is not writable by the
  app's non-root user: tell me and I will change the container to fix the folder's owner at start-up.
- **Health and HTTPS:** `https://<your-service>/health` returns `{"status":"ok"}`.
- **Privacy page:** `https://<your-service>/privacy` loads without signing in.
- **Email links are right.** Register a test gym: the confirmation email's link must start with your
  site's address, not `localhost`.
- **Sign-in works and sessions persist.** Sign in on the website, reload the page, and you should
  stay signed in (the session is renewed from a cookie). Sign out and reload: you should land on the
  login page.
- **Lockout and password rules.** Five wrong passwords on a test account show a "try again in 15
  minutes" message; a weak password such as `Welcome2024!` is refused with a reason.
- **Nothing blocked by the browser policy.** Open the main pages with the browser's developer tools
  console open: there should be no "Content Security Policy" errors. If something does not load, set
  `CSP_MODE=report-only`, redeploy, and read the `[csp]` lines in the logs (see [SECURITY.md](./SECURITY.md)).
- **Packages are there.** Sign in as the super-admin and open **Packages**; create your plans there
  (they are stored in the database, so each environment has its own).

## Your own domain and a subdomain per gym
1. Render service > **Settings > Custom Domains**: add `yourdomain.com` **and** `*.yourdomain.com`.
   Render issues HTTPS certificates for both automatically (a wildcard certificate covers gym
   subdomains but not the bare domain, so add both).
2. Add the DNS records Render shows you: a `CNAME` for the wildcard, plus the `_acme-challenge`
   record it asks for. The root domain must also point at Render, or the wildcard will fail.
   Certificates sometimes sit at "Certificate Pending" for a while after DNS changes; use *Verify* again.
3. Set `BASE_DOMAIN=yourdomain.com` and `PUBLIC_URL=https://yourdomain.com`, then redeploy.
   Each gym is then at `https://<gym>.yourdomain.com`. (Render terminates HTTPS, so you do not
   use the Caddy setup from DEPLOY.md here.)

## Costs and limits to know
- The **Starter** plan is the minimum that supports a persistent disk. The free plan sleeps and has
  no disk, so it is unsuitable for a real gym.
- A persistent disk ties the service to one instance: no horizontal scaling and a short pause on each
  deploy. Fine for launch; the usual next step is object storage (S3) for photos.
- Render's disk is not backed up by Atlas: member photos are only on that disk (Render offers disk
  snapshots). Your data itself is in Atlas, so enable Atlas backups.

## If sign-up says "We couldn't send your confirmation email"
The server reached for your mail provider and failed. Sign in as the super-admin and open
**Platform Settings > Email**: it shows what the server is configured to send with, whether the
mail server accepts the login, and **why** the last send failed. **Send a test email to me** checks the
whole chain. (The server log also has an `Email send failed:` line with the same reason.)

| What the Email card says | Usual fix |
|---|---|
| "Email is not set up" | Set `SMTP_URL` (or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) and `MAIL_FROM` in the service's Environment, then redeploy. |
| "rejected the username or password" | Use the provider's **SMTP key or app password**, not your account password. In `SMTP_URL`, special characters in the password must be percent-encoded (`@` → `%40`, `#` → `%23`, `/` → `%2F`). Gmail app passwords have no spaces. |
| "could not reach the mail server" | Check host and port. Some hosting plans block outgoing mail on ports 25, 465 and 587; use port **2525** if your provider offers it (Brevo, Mailgun and SendGrid do), or a paid instance. |
| "port and the security setting do not match" | Port 465 needs `smtps://` (or `SMTP_SECURE=true`); 587 and 2525 use `smtp://` with `SMTP_SECURE=false`. |
| "refused the sender address" | `MAIL_FROM` must be an address or domain you have **verified** with the provider. |

Typical `SMTP_URL` shapes: `smtp://LOGIN:KEY@smtp-relay.brevo.com:587` or
`smtps://LOGIN:KEY@smtp.example.com:465`.

Until email works, a gym can still be created by hand (**Tenants > Onboard Tenant**), and nothing is
left half-made by a failed sign-up.

## If the deploy keeps restarting
Open the service's **Logs**. The server prints one clear line before it exits:
- `JWT_SECRET must be a random string of at least 32 characters in production` — Render generates it; only
  a hand-set value can be too short.
- `PUBLIC_URL must be set in production` — set `PUBLIC_URL` to your site's `https://` address. (On
  Render this is automatic from the current version; if you still see it, the new version has not deployed yet.)
- A MongoDB connection error — check `MONGODB_URI` and Atlas *Network Access*.

## After a deploy the site looks like the old version
The website installs itself like an app and only updates when asked. Click **Update** on the "new
version available" bar, or hard-refresh (Ctrl+Shift+R). Everyone is also signed out once if a release
changes how sign-in works; they simply sign in again.

## The mobile app
Set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` to your final HTTPS address (the custom domain, not
the `onrender.com` one, so it never changes), then follow DEPLOY.md > Mobile app.
