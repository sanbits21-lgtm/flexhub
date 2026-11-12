# Deploying FitzyClub

## What runs where
| Piece | How it ships |
|---|---|
| API + staff website | **One Docker image** (`Dockerfile`): Express serves the built website. |
| Database | MongoDB Atlas (recommended) or the bundled `mongo` service (`--profile db`). |
| HTTPS | Caddy (`--profile proxy`) or your host's load balancer. |
| Member/staff mobile app | Not Docker. Built with EAS and submitted to the stores. |

## First deploy
1. `cp .env.example .env` and set:
   - `MONGODB_URI` (Atlas, or `mongodb://mongo:27017/flexhub` with `--profile db`)
   - `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
     The container refuses to start in production with a short or placeholder secret.
   - `PUBLIC_URL`, your site's `https://` address. **Required in production**: the server will not
     start without it (email links are built from it).
   - `DOMAIN` if using the Caddy profile; `ANTHROPIC_API_KEY` is optional.
   - Every other setting is in [CONFIGURATION.md](./CONFIGURATION.md).
2. `docker compose up -d --build` (add `--profile db` and/or `--profile proxy`).
3. Create the platform owner once:
   `docker compose run --rm app node scripts/seedSuperAdmin.js` (uses `SEED_*` vars), then
   remove `SEED_PASSWORD` from `.env`.
4. Check: `curl http://localhost:8080/health`.

## Operations
- **Logs:** `docker compose logs -f app` (rotated, 5 x 10 MB).
- **Update:** `git pull && docker compose up -d --build`. Stops gracefully (SIGTERM, 15 s).
- **Backups:** Atlas snapshots, or for the bundled DB
  `docker compose exec mongo mongodump --archive --gzip > flexhub-$(date +%F).gz`.
  Member photos are in the `uploads` volume - back that up too.
- The container is non-root, read-only, drops all capabilities; only `/data/uploads` is writable.
- Behind a proxy the app trusts one hop (`trust proxy`), so rate limiting sees real client IPs.

## Mobile app (Android + iOS)
Already in the repo: `mobile/eas.json`, store-ready `app.json` (named FitzyClub, dark adaptive-icon
background, camera-only permissions, no microphone), in-app **Delete my account**, and a public
privacy policy at `https://<your-domain>/privacy`.

Set before you build:
1. In `eas.json`, replace `https://REPLACE-WITH-YOUR-DOMAIN` (preview + production) with your API URL.
2. In `.env` on the server: `PRIVACY_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL` (shown on `/privacy`).
3. `app.json`: change `com.fitzyclub.member` (iOS bundle id + Android package) to an id you own.
   **It cannot be changed after the first store upload.**
4. Replace `mobile/assets/icon.png` (1024x1024), the three `android-icon-*.png` and
   `splash-icon.png` with real FitzyClub artwork (they are still the Expo template).

Then, from `mobile/`:
```
npm i -g eas-cli && eas login && eas init
eas build -p android --profile production     # .aab for Google Play
eas build -p ios --profile production         # needs your Apple Developer account
eas submit -p android   /   eas submit -p ios
```
Store listing checklist: privacy policy URL, screenshots, content rating, Data Safety / App
Privacy answers (name, phone, email, photo, health & fitness info, payments), and a **demo
login for reviewers** (create a demo gym with sample data). New personal Play accounts need a
closed test with 12 testers for 14 days before production.

## One address per gym (subdomains)
Each gym's `slug` is its address: `https://<slug>.yourdomain.com`. Its login page shows the
gym's name, logo, colour and tagline, and only that gym's staff and members can sign in there.
The mobile app is unaffected (it keeps using the single API address).

1. **DNS:** add `A  *.yourdomain.com -> <server IP>` (plus the plain `yourdomain.com` record).
2. **`.env`:** `BASE_DOMAIN=yourdomain.com`, `DOMAIN=yourdomain.com`,
   `CADDYFILE=Caddyfile.wildcard`, `CLOUDFLARE_API_TOKEN=...`
   (Cloudflare is the default DNS provider. For another, change `DNS_PLUGIN` in `caddy/Dockerfile`
   and the `dns` line in `Caddyfile.wildcard`. If you already terminate HTTPS elsewhere, e.g. a
   Cloudflare proxy or a cloud load balancer with a wildcard certificate, skip Caddy and make sure
   it forwards the original `Host` header.)
3. `docker compose --profile proxy up -d --build`

**Changing an address later:** the gym admin does it under *Branding & Address* once the platform
admin enables **Choose own subdomain** for that gym in Workspace (platform staff can always
rename via the Tenants API). The old address redirects to the new one for 90 days and cannot be
claimed by another gym in that window. Names like `www`, `api`, `admin` are reserved.

## Self-registration, email confirmation and approval
New gyms register at `/signup` (linked from the login page). Nobody is signed in or can use
anything until **both** happen:
1. the owner clicks the confirmation link emailed to them (valid 24 h; can be re-sent), then
2. a platform administrator approves the gym under **Tenants > Pending approval**
   (platform staff are emailed when a confirmed registration is waiting; the owner is emailed
   the decision). Approval needs a confirmed email; a rejected gym can be approved later.

The **trial starts at approval**, not at registration. Its terms are a setting, not an env var:
**Platform Settings** (super-admin) sets trial days, member limit, branch limit and whether
self-registration is open at all. When approving, platform staff can change the terms for that one
gym. The `TRIAL_*` / `SELF_SIGNUP` variables in `.env` are only the starting defaults.

**Subscription packages** (the **Packages** page, super-admin) replace those plain trial terms:
each package has a price, billing period in months, trial days, branch and member limits. The
registration page shows them and the gym must pick one; approving the gym grants that package.
Full guide: [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md).

**Email must be configured** (`SMTP_URL` or `SMTP_HOST`..., `MAIL_FROM`, `PUBLIC_URL`; see
`.env.example`). Without it, in production the signup page closes itself, because confirmation
links could not be delivered. In development the email is printed to the server log instead.

- **When the trial ends** the owner can still sign in and view everything, but cannot change
  anything (HTTP 402). Members are not affected. Suspended gyms are locked out completely.
- **To keep a gym:** in *Tenants*, press **Renew** (**Activate plan** for a trial gym), enter the
  months and the amount you received. Paid plans end on a date, keep working for **3 grace days**
  after it, then go read-only; owners are emailed 7 days before, 1 day before and when it ends.
  *+7 days* extends a trial. Billing itself is manual: there is no payment gateway, the app only
  records what you were paid. See [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md).
- **"Approve anyway":** if the owner never confirmed their email (e.g. mail is not set up), the
  approve button lets a platform admin vouch for it; tell the owner yourself that they can sign in.
- **Abuse limits:** 5 registrations per network address per hour, a hidden honeypot field, unknown
  fields rejected, and every gym needs human approval.
- Gyms created by platform staff need no approval and have no trial end date.
- Registering with an email that already has an account creates nothing and looks identical to a
  new registration; that address is emailed instead (so the form cannot be used to find out who is
  registered).

## Security and sign-in
Sessions use a short-lived key plus a rotating refresh cookie, wrong passwords lock an account
temporarily, weak passwords are refused, and the browser is restricted to the site's own scripts
(Content-Security-Policy). All of it, the settings, what to check after deploying, and what to do
if a session is stolen: [SECURITY.md](./SECURITY.md).
