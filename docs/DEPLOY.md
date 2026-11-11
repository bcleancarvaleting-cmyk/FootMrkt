# Deploying MATCHX

MATCHX is one Next.js server plus one Postgres database, and a job that runs every 5 minutes.
Any host that runs a Docker image or Node 22 works (Railway, Render, Fly.io, a VPS…).

## 1. Database

Postgres 16+. Use a managed one with automatic daily backups and point-in-time recovery if you can
(Neon, Supabase, Railway, RDS). Set `DATABASE_URL`.

## 2. Environment

Copy `.env.example`. The ones that matter in production:

| Variable | What |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | `https://your-domain` (used in emails and payment return links) |
| `SESSION_SECRET` / `IP_HASH_SALT` | long random strings |
| `CRON_SECRET` | long random string; the 5-minute job sends it |
| `API_FOOTBALL_KEY` | live match data |
| `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | card payments |
| `ERROR_WEBHOOK_URL` | Slack/Discord webhook for error alerts |
| `FLAG_DEV_TOOLS=false`, `FLAG_SIMULATED_DATA=false` | turn the dev helpers off |
| `LEGAL_GATES_CLEARED` | only once your lawyer has signed off, e.g. `MARKET,PAID_PACKS,DEPOSITS` |

## 3. Build and release

```bash
docker build -t matchx .                        # web app
docker build -t matchx-tools --target tools .   # migrations + jobs
docker run --rm --env-file .env matchx-tools npx prisma migrate deploy   # every release, before the app starts
docker run -d -p 3000:3000 --env-file .env matchx
```

Without Docker: `npm ci && npx prisma migrate deploy && npm run build && node .next/standalone/server.js`
(copy `public/` and `.next/static/` next to `server.js` first, as the Dockerfile does).

First time only: `npm run db:seed` loads the leagues, clubs, players and packs.

## 4. The 5-minute job

It opens and locks gameweeks, pulls live scores, releases cards, expires listings, settles auctions
and grants welcome packs. Either:

- call `https://your-domain/api/cron` every 5 minutes with header `Authorization: Bearer $CRON_SECRET`
  (your host's cron, or cron-job.org), or
- run `docker run --rm --env-file .env matchx-tools` from a scheduler every 5 minutes.

## 5. Monitoring

- **Uptime:** point a monitor (UptimeRobot, Better Stack) at `/api/health`. It returns 503 if the
  database is down, and `"jobs": "late"` if the 5-minute job has stopped.
- **Errors:** set `ERROR_WEBHOOK_URL`; server errors and failed jobs are posted there.

## 6. Backups

If your Postgres host doesn't back up for you, run nightly:

```bash
DATABASE_URL=… BACKUP_DIR=/backups scripts/backup.sh
```

It keeps 14 daily and 8 weekly copies and checks each one opens. Copy them off the server too
(the script has an example). **Test a restore before launch:**

```bash
createdb restore_check
pg_restore --no-owner -d postgres://…/restore_check /backups/daily/matchx-YYYY-MM-DD.dump
```

## 7. Payments webhook

In Stripe: Developers → Webhooks → add `https://your-domain/api/webhooks/payments` with the events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`. Copy the signing secret into
`STRIPE_WEBHOOK_SECRET`.

## 8. Football data (Sportmonks) — from your phone

No server settings needed. Once the site is up:

1. Log in as the admin and open **Admin → Integrations**.
2. Paste your Sportmonks API token (my.sportmonks.com → API → Tokens). It's checked with Sportmonks,
   then stored encrypted.
3. Press **Test connection**. It checks the plan's leagues, every league's clubs, a squad, and that
   last week's real matches add up.
4. On a test site, press **Rebuild from Sportmonks** to replace the starter data with the real 92
   squads and this season's real matches (several minutes; log in again afterwards).
5. Data now comes from Sportmonks: live scores, the nightly transfer check and the footer credit.

(`SPORTMONKS_API_TOKEN` and `DATA_PROVIDER=sportmonks` on the server still work and take priority.)
