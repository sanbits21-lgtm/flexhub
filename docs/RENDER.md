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
2. Fill the prompted values: `MONGODB_URI`, `PUBLIC_URL`, `SMTP_URL`, `MAIL_FROM`,
   `PRIVACY_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL` (and `BASE_DOMAIN` if you want subdomains).
   `JWT_SECRET` is generated for you.
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

## The mobile app
Set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` to your final HTTPS address (the custom domain, not
the `onrender.com` one, so it never changes), then follow DEPLOY.md > Mobile app.
