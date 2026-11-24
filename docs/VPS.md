# Running everything on one server (Hostinger VPS)

The database, the app (API and website), the HTTPS front door and daily backups, all on one server, started by one command.
Try it on your own computer first (below), then do the same on the server.

```
internet ──443──> caddy ──> app ──> mongo        backup (daily) ──> ./backups
                   (HTTPS)  (API + website)  (database, private)
```

| Piece | What it does | Reachable from the internet? |
|---|---|---|
| `caddy` | HTTPS for your domain and for every gym's own address; passes requests to the app | **Yes** (ports 80, 443) |
| `app` | The API and the website (one container) | No |
| `mongo` | The database, with a password, on a private network (not started if you use Atlas, below) | No |
| `backup` | Every day: the database and the member photos, kept 14 days | No |

Data lives in Docker volumes (`mongo-data`, `uploads`, `caddy-data`), so it survives restarts, updates and rebuilds.

## Try it on your computer first

You need Docker Desktop running. From the project folder:

1. Create a test settings file. `.env.docker` for local testing is already set up for you if you used the steps in the chat; otherwise copy
   `.env.docker.example` to `.env.docker` and set these (leave the rest):
   ```
   DOMAIN=localhost
   PUBLIC_URL=https://localhost:8443
   BASE_DOMAIN=localhost
   HTTP_PORT=8080
   HTTPS_PORT=8443
   CADDY_LOCAL_CERTS=local_certs
   ```
   plus the three secrets (`MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `JWT_SECRET`) and `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.
2. Start it (the first build takes a few minutes):
   ```bash
   docker compose --env-file .env.docker up -d --build
   docker compose --env-file .env.docker ps
   ```
   All four should say `running`, and `mongo` / `app` should say `healthy`.
3. Open **https://localhost:8443**. Your browser warns about the certificate because Caddy made it itself for this test: continue
   past the warning. (To trust it once and for all: `docker compose --env-file .env.docker exec caddy caddy trust`.)
4. Sign in at `/login` with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`.
5. A gym's own address works too, for example **https://iron.localhost:8443** once a gym with the address `iron` exists
   (browsers send `*.localhost` to your computer on their own).
6. Stop it with `docker compose --env-file .env.docker down`. Your data stays. (`down -v` erases it: only for a fresh start.)

## Set up the server

### 1. The server
Order a Hostinger **VPS** (KVM 1 is enough to start; KVM 2 is comfortable). Choose **Ubuntu 24.04**, and add your SSH key.
Hostinger's panel also offers a firewall: allow **22** (SSH), **80** and **443** (TCP, and 443 UDP) and nothing else.

### 2. Point your domain at it
In Hostinger's DNS editor for your domain add two records, both with the server's IP address:

| Type | Name | Value |
|---|---|---|
| A | `@` | the server IP |
| A | `*` | the server IP |

The `*` record is what gives every gym its own address. Delete any parked-page `A` or `AAAA` record on `@`. Wait a few minutes,
then check from your computer: `nslookup fitzyclub.in` and `nslookup iron.fitzyclub.in` should both show the server's IP.

### 3. Install Docker on the server
```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
apt-get install -y git ufw
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```
(Docker adds its own firewall rules for published ports, so the Hostinger panel firewall above is the one to rely on.)

### 4. Put the code there and start it
```bash
git clone git@github.com:sanbits21-lgtm/flexhub.git fitzyclub && cd fitzyclub
cp .env.docker.example .env.docker
nano .env.docker           # fill in: DOMAIN, PUBLIC_URL, BASE_DOMAIN, ACME_EMAIL, the three secrets, SUPER_ADMIN_*, SMTP_URL, MAIL_FROM
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```
Open `https://yourdomain` and sign in. Then **delete `SUPER_ADMIN_PASSWORD` from `.env.docker`** and run the `up -d` command again.

The first visit to a gym's address takes a second longer: that is its certificate being fetched.

### 5. Things to do the same day
- **Monitoring:** point an uptime monitor (UptimeRobot, Better Stack) at `https://yourdomain/readyz`.
- **Off-server copy of the backups** (see below). A backup on the same disk is not a backup.
- **Updates and security patches:** `apt-get install -y unattended-upgrades`, and turn on Hostinger's weekly VPS snapshots as a second safety net.
- **Swap** on a 1 to 2 GB server, so a memory spike does not kill the database: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`.
- Email must work (`SMTP_URL`, `MAIL_FROM`), or new gyms cannot register. Send a test from Platform Settings.

## Day to day

```bash
cd fitzyclub
docker compose --env-file .env.docker ps                       # is everything healthy?
docker compose --env-file .env.docker logs -f app              # watch the app (also: mongo, caddy, backup)
git pull && docker compose --env-file .env.docker up -d --build   # update to the newest code (a few seconds of downtime)
docker compose --env-file .env.docker restart app              # restart one piece
```
Update safely: run a backup first (`... exec backup /backup.sh once`), then update. To go back, `git checkout` the older version and
`up -d --build` again; data is not rolled back, so read the change before you do.

## Backups

The `backup` container saves, every day at `BACKUP_HOUR` (server time), into the **`backups/`** folder next to the compose file:
- `db-YYYY-MM-DD_HHMM.gz`, the whole database
- `photos-YYYY-MM-DD_HHMM.tgz`, member and staff photos
- `LAST_OK`, the time of the last good backup (check it is recent)

Old ones are deleted after `BACKUP_KEEP_DAYS` (14).

Run one now: `docker compose --env-file .env.docker exec backup /backup.sh once`

**Copy them off the server.** Simplest: from your own computer, a daily `rsync`/`scp`:
```bash
rsync -az root@YOUR_SERVER_IP:/root/fitzyclub/backups/ ~/fitzyclub-backups/
```
or install `rclone` on the server and copy `backups/` to a cloud bucket (Cloudflare R2, Backblaze B2, Google Drive).

### Restore (and test this once before you need it)
To a **new empty database** (safest first test; leaves live data alone):
```bash
docker compose --env-file .env.docker exec -T mongo sh -c \
  'mongorestore -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --gzip --archive --nsFrom "fitzyclub.*" --nsTo "restoretest.*"' \
  < backups/db-2026-11-23_0200.gz
```
Look inside with `mongosh`, then drop it. For a real restore over the live database, stop the app first
(`docker compose ... stop app`), restore with the same command but without `--nsFrom/--nsTo` and with `--drop`, then `start app`.
Photos: `tar -xzf backups/photos-....tgz -C /tmp` and copy back into the `uploads` volume.

## Using MongoDB Atlas instead (or as the fallback)

The database can live on **Atlas** instead of on the server. Everything else (app, HTTPS, photos, backups) stays the same.

| | Database on the server (default) | Atlas |
|---|---|---|
| Cost | Included in the VPS | Free M0 (512 MB), paid from about $9/month |
| If the VPS dies | Only the backups you copied off the server survive | The data is untouched on Atlas |
| Speed | Same machine, fastest | A network hop each query (choose the Mumbai region) |
| Looking after it | You: updates, disk, backups | Atlas does |
| Built-in backups | None, ours only | Free M0: **none**. Paid clusters: Atlas snapshots |

**Switch to Atlas** (edit `.env.docker`):
```
COMPOSE_PROFILES=
DATABASE_URL=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/fitzyclub?retryWrites=true&w=majority
```
then `docker compose --env-file .env.docker up -d --build`. The `mongo` container no longer starts; `ps` shows `app`, `caddy`, `backup`.
In Atlas: **Network Access** must allow the server's IP address (`curl ifconfig.me` on the server), and a password with symbols
must be URL-encoded (`@` becomes `%40`). Check `logs app` shows it connected.

**Backups still run** with Atlas: the same `backup` container dumps the Atlas database every day to `backups/`, so you have your own copy
even on the free M0, which has no backups of its own. Restore into Atlas with:
```bash
docker compose --env-file .env.docker exec -T backup sh -c 'mongorestore --uri "$MONGODB_URI" --gzip --archive --drop' < backups/db-2026-11-23_0200.gz
```

**The fallback plan, both directions** (this is what makes either choice safe):
- *Atlas goes down or you leave it:* restore the latest `backups/db-*.gz` into the bundled database (see "Restore"), set `COMPOSE_PROFILES=localdb`, empty `DATABASE_URL`, `up -d`.
- *The VPS goes down:* order another, `git clone`, copy `.env.docker`, set `DATABASE_URL`, `up -d --build`, point DNS at it. The data is still in Atlas; only
  member photos live on the VPS, so keep the off-server copy of `photos-*.tgz`.
- Moving between them is a `mongodump` of one and a `mongorestore` of the other, as in the next section. Keep the old one for a week.

## Moving your data from Atlas (or your laptop)

1. On any computer with the MongoDB tools: `mongodump --uri "<your Atlas URI>" --gzip --archive=atlas.gz`
2. Copy `atlas.gz` to the server, then restore it into the new database:
   ```bash
   docker compose --env-file .env.docker exec -T mongo sh -c \
     'mongorestore -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --gzip --archive --nsFrom "OLDNAME.*" --nsTo "fitzyclub.*"' \
     < atlas.gz
   ```
   (`OLDNAME` is the database name in your Atlas URI.)
3. Member photos: copy the old `uploads` folder into the `uploads` volume.
4. Switch the domain's DNS to the new server, watch `logs -f app`, and keep Atlas for a week as a fallback before you delete it.

## If something is wrong

| Symptom | Look at |
|---|---|
| `up` stops with "Set X in .env.docker" | A required setting is empty. Fill it in. |
| Site does not open | `ps` (is `caddy` running?), `logs caddy`, DNS (`nslookup`), firewall ports 80 and 443 |
| Browser says the certificate is wrong | Local test: expected (see "Try it on your computer"). Server: `logs caddy`; a gym's address needs the `*` DNS record and a gym with that exact address |
| `app` keeps restarting | `logs app`. The usual causes: `JWT_SECRET` shorter than 32 characters, or `PUBLIC_URL` empty |
| `app` cannot reach the database | The `MONGO_APP_PASSWORD` was changed after the first start. The database user is created only once: restore the old value, or change the password inside the database with `mongosh` |
| Everyone was signed out | `JWT_SECRET` changed. People sign in again |
| Disk filling up | `docker system df`; shrink `BACKUP_KEEP_DAYS`; `docker image prune` |

## How a gym's own address gets HTTPS

There is no wildcard certificate to manage. The first time someone opens `iron.yourdomain`, Caddy asks the app "is `iron` a real gym?"
(`/internal/tls-ask`), and only if yes does it fetch a certificate from Let's Encrypt, then keeps and renews it. Made-up names are
refused, so nobody can make your server request certificates it should not. Let's Encrypt allows 50 new certificates per week per
domain, plenty for new gyms joining. The check is for Caddy only: the public internet cannot reach it.

## Security notes
- The database is on a private network with a password; the app uses its own user that can touch only its own database.
- The app container is non-root, read-only, drops all Linux capabilities, and has a memory limit; Docker keeps its logs to 50 MB.
- Secrets live in `.env.docker` on the server only (`chmod 600 .env.docker`). The app is given only the settings it uses, not the database root password.
- Keep the server patched, use SSH keys only (`PasswordAuthentication no` in `/etc/ssh/sshd_config`), and consider `fail2ban`.
