# Running FlexHub for real clients

The checklist and the runbook for the things that are not code: where data lives, how it is backed up, how you hear
about problems, and what to do when something goes wrong. Work through **Before the first client** once, then use the
rest when you need it.

## Before the first client

Tick each one. Nothing here is optional for a paying client.

- [ ] **Development uses its own database** (see [Environments](#environments)). Your laptop must not be able to
      change the live data.
- [ ] **Atlas backups are on, and you have restored one** (see [Backups](#backups-and-restore)).
- [ ] **The uploads disk is backed up** (member photos live on it).
- [ ] **Uptime monitor** pointed at `/readyz`, and `ALERT_EMAIL` set (see [Monitoring](#monitoring)).
- [ ] **Email works** and `MAIL_FROM` is an address on your own domain (Platform Settings > Email > send a test).
- [ ] **A real domain** with `PUBLIC_URL` set, and `BASE_DOMAIN` if gyms get their own addresses.
- [ ] **Terms of Service and Privacy Policy reviewed by a lawyer**, `TERMS_OPERATOR_NAME`, `TERMS_GOVERNING_LAW`,
      `PRIVACY_OPERATOR_NAME` and `PRIVACY_CONTACT_EMAIL` filled in, and the pages at `/terms` and `/privacy` read through.
- [ ] **First super-admin created** and `SUPER_ADMIN_PASSWORD` removed from the environment.
- [ ] **Atlas network access** limited to the host, not `0.0.0.0/0`, and the database password rotated.
- [ ] **A test gym walked through by hand** on the live site: register, confirm, approve, add a member, take a UPI
      payment, renew, open the member app on a phone, reset a password from the "Forgot password" link.

## Environments

| | Where | Database |
|---|---|---|
| **Production** | Render | its own Atlas database |
| **Development** (your computer) | `npm run dev` | **a different database**: local MongoDB |
| **Tests** | `npm test` | the same cluster as development but a database named `<name>-test`; the suite refuses to run against any other name |

Run a local MongoDB for development:

```bash
docker compose up -d mongo
```

and in `.env` (never commit it):

```
MONGODB_URI=mongodb://localhost:27017/flexhub
```

If `MONGODB_URI` points at a hosted database while `NODE_ENV` is not `production`, the server prints a loud warning at
start-up. Set `REQUIRE_LOCAL_DB=on` to make that an error instead, so a mistake cannot happen.

If your development `.env` has ever pointed at the live Atlas database, assume test gyms and test members were created
there. Look for them under Platform > Tenants and delete them before real clients arrive.

## Backups and restore

Your members' data is the product. Two places hold it:

1. **MongoDB Atlas** (everything except photos). The free M0 tier has **no continuous backups**. For real clients use
   an M10 or above and turn on **Cloud Backup** (Atlas > your cluster > Backup), with point-in-time recovery if you can.
2. **The Render disk** mounted at `/data/uploads` (member and staff photos). Render takes disk snapshots (Render
   dashboard > the service > Disks). Photos can be re-uploaded; the rest cannot be recreated, so Atlas matters most.

**Restore drill, once, before launch.** A backup you have never restored is a hope, not a backup.

1. In Atlas, restore the latest snapshot into a **new, separate cluster** (never over the live one).
2. Point a local copy of the app at it (`MONGODB_URI=...`), start it, and sign in as a gym owner.
3. Check that members, payments and plans are there. Write down how long it took.
4. Delete the scratch cluster.

A second, independent copy is cheap insurance. From a machine with the MongoDB tools installed:

```bash
mongodump --uri "<your production MONGODB_URI>" --gzip --archive=flexhub-$(date +%F).gz
```

Keep these somewhere that is not Render or Atlas (an encrypted drive, a different cloud bucket).

**If a gym asks for its data** (they are leaving, or you are asked under the law): the owner can export members from the
app. For everything else, a super-admin can export a gym's records from the database by `tenantId`.

## Monitoring

Three layers, none of which needs an account beyond what you already have:

1. **Uptime.** Point a free uptime monitor (UptimeRobot, Better Stack, or similar) at
   `https://<your-site>/readyz`, every 1 to 5 minutes, alerting your phone or email. `/readyz` answers 200 only while the
   database also answers; `/health` is the lighter check Render itself uses.
2. **Error emails.** When a request fails on the server, or the process crashes, the server emails `ALERT_EMAIL`
   (comma-separated; empty means the super-admins). Each distinct error is sent once per 15 minutes and at most 20 an hour.
   The email names the route and the error, never what the visitor sent. Switch off with `ALERTS=off`.
3. **Logs.** Render > the service > Logs. Errors are printed there in full. Lines starting `[csp]` are blocked page
   resources; `password reset email failed` and `could not send the error alert` mean mail is failing.

Check the email path actually works: set `ALERT_EMAIL` to yourself, and confirm an alert arrives (the Email card in
Platform Settings sends a test message; an error email uses the same sender).

If you outgrow this, add a hosted error tracker (Sentry) and log search. It is a small change in `app.js` and
`server.js` where `notifyError` is called.

## When something breaks

| Symptom | Look at |
|---|---|
| Site down | Render dashboard: is the deploy healthy? Logs for a crash. `/health` and `/readyz` |
| `/readyz` is 503 but `/health` is fine | Atlas: cluster paused, IP access list, or a rotated password |
| Nobody can sign in, "Invalid session" | Was `JWT_SECRET` changed? That ends every login. People sign in again |
| Sign-up says it could not send the confirmation | Platform Settings > Email: the card says why |
| A client is locked out | Wrong passwords lock an account for 15 minutes. **Forgot password** also lifts the lock |
| A client forgot their password | Tell them to use **Forgot your password?** on the login page. Members with no email on file: a manager uses *App login / reset* on the Members page |
| Photos missing after a deploy | The Render disk is not mounted at `UPLOAD_DIR`. See RENDER.md |
| A gym is read-only | Its trial or plan ended. Platform > Tenants > Renew |

**A deploy went wrong:** Render > the service > Events > roll back to the previous deploy. Data is not rolled back, so a
change that migrates data needs more care: read the commit before rolling back.

**You think an account was compromised:** deactivate the person, or reset their password (this ends their sessions).
For everyone, see SECURITY.md "If you think a session was stolen".

## Pilot with your first gyms

- Choose two or three gyms you can reach by phone. Tell them it is early access.
- Onboard them yourself the first time: register, approve, add their plans, import members.
- Give them one support channel (a WhatsApp number or email) and answer the same day.
- Look at the logs and your alert emails every day for the first two weeks.
- Write down every question they ask. Those are the next things to build or to explain on screen.
