# COLLECTR — Football

**Collect. Trade. Compete.** A football collectibles game that combines three things in one game mode:

| Layer | What it means here |
| --- | --- |
| **Ultimate-Team-style collecting** | Open packs of Bronze / Silver / Gold player cards, build a Binder, complete sets, (later) trade on a Transfer Market. |
| **Manager-style squad management** | Each gameweek pick a 7-a-side squad (1 GK, 2 DEF, 2 MID, 2 ATT) plus an ordered 4-player bench, choose a formation, decide which competition each card plays in, scout form and fixtures. |
| **Real-life stats** | Points come only from real match events (goals, assists, clean sheets, saves, tackles, cards…), scored provisionally and then settled. No FIFA-style ratings anywhere. |

This repository implements the football world of the *COLLECTR Master Development Specification v1* (darts is out of scope for now, but the data model keeps `Sport` as a first-class entity so it can slot in later).

## Quick start

Requirements: Node 22+, PostgreSQL 16.

```bash
cp .env.example .env            # set DATABASE_URL
npm install                     # also runs prisma generate
npx prisma migrate deploy
npm run db:seed                 # real 2026-27 leagues/squads, first supply release, admin, 3 simulated gameweeks + GW4 open
npm run dev                     # http://localhost:3000
```

Seeded admin: `admin@collectr.dev` / `collectr-admin` (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Any email in `ADMIN_EMAILS` becomes an admin on registration.

### Play the loop locally

1. Register → you get a free **Starter Pack** → open it (11 locked, untradeable cards).
2. **Football → Open League → Auto-fill / pick your squad → Enter squad.** Your cards lock to that entry.
3. Log in as admin → **Admin → Gameweeks**: *DEV: play 3 fixtures* (provisional scores appear), *DEV: play all*, *DEV: send corrections* (watch scores change), then *Finalise & settle*.
4. Back as the player: final score, auto-subs, rank, and (dev only) a reward pack. MP values are recalculated.
5. **Admin → Create next gameweek** and go again.

### Look, navigation and community

- **Light / dark** switch in the header (saved in a cookie, rendered server-side so there's no flash). Every colour is a token in `src/app/globals.css`; cards stay dark-faced in both themes.
- **Live stats bar** (`/api/stats`, refreshed every 30s): squad deadline countdown, online now (active in the last 15 min), managers entered this gameweek, managers, cards in circulation, packs opened today.
- **Deadline rule:** squads lock 10 minutes before the gameweek's first kick-off (`DEADLINE_MINUTES` in `src/server/gameweeks.ts`).
- **Bottom dock:** Packs · My Club (cards, sets, transfers) · Games · Chat · Me.
- **Manager chat** (`/chat`): rooms in `src/config/chat.ts`, 3-second live updates, rate limits, no links, report (3 reports hide a message) and moderator removal (audited).

### Player images

Cards show a licensed headshot when `Player.imageUrl` is set; until then they show the player's shirt in club colours with their squad number. Load licensed images in bulk:

```bash
npm run images:import -- images.csv --dry-run   # columns: club_code,player_name,image_url,credit
npm run images:import -- images.csv
```

Refresh squads from Wikipedia with `npm run data:import` (writes `prisma/data/football-2026-27.json`).

### Tests

```bash
npm run test:unit          # pure domain: packs, squads, scoring, auto-subs, MP, simulator
npm run test:integration   # against Postgres DB "collectr_test" (TEST_DATABASE_URL); refuses any DB not ending in _test
npm run typecheck && npm run lint && npm run build
```

The integration suite covers the spec §17 acceptance tests: starter pack issues exactly 11 locked cards and records its version; packs never undercut their guarantee (an exhausted pool refuses the opening and leaves the pack unopened); double/concurrent opens issue nothing extra; squad validation; card locking across competitions; idempotent, revisioned event ingestion; provisional → final settlement; scores reproducible from stored source events after later corrections; no double sale under concurrent payments; webhook replays are no-ops; legal-gated features can't be switched on; supply reconciles.

## Architecture

```
src/
  domain/        Pure, framework-free rules (unit tested)
    random.ts            CSPRNG + audited draws (seeded PRNG only for tests / simulator)
    packs/               pack config schema, slot planning, guarantees
    football/            roster rules & formations, squad validation, scoring + auto-subs
    valuation/mp.ts      explainable, damped MP valuation
  providers/football/    data-provider abstraction + DEV simulated feed
  server/        Services over Prisma/Postgres — every mutation re-validated server-side
    packs.ts             pack engine (entitlements, atomic opening, pool draws, starter minting)
    competitions.ts      entries, card locks, deadlines, leaderboards
    ingestion.ts         idempotent raw-event store + revisioned stat lines
    scoring.ts           provisional/final scores, settlement, reproducibility
    supply.ts            weekly releases, caps, reconciliation report
    collections.ts       set completion + recirculation into the pack pool
    market.ts            listings, orders, verified/idempotent webhooks (legal-gated)
    flags.ts / audit.ts  feature flags with legal gates; append-only admin audit log
  app/           Next.js 16 App Router pages + server actions
prisma/          schema, migration (with hand-written integrity constraints), seed
scripts/jobs.ts  scheduled job runner: `npm run jobs -- tick|revalue|release|expire|reconcile`
```

Stack: Next.js 16, React 19, Tailwind 4, Prisma 7 (pg driver adapter), PostgreSQL, Zod, Vitest.

### Integrity guarantees (database-level, not just app code)

- A card is owned **iff** its supply state is `HELD`; only held cards can be locked; a lock always names its holder; untradeable cards can never be listed (`CHECK` constraints).
- At most one open ownership record per card, one active listing per card, one current stat revision per player per fixture (partial unique indexes).
- Every card instance is in exactly one supply state (`AVAILABLE`, `RECIRCULATING`, `HELD`, `RETIRED`); the admin supply report reconciles totals against ownership records.

### Game rules as configuration

Pack contents, roster rules, scoring tables and competition templates are versioned config (`src/config/*`, `src/domain/football/rules.ts`, `src/domain/football/scoring.ts`). Every pack opening stores its config snapshot and full RNG audit; every score stores its rule version and the exact stat revisions it used.

## Status of spec decisions

Things the spec marks **TO CONFIRM / PROPOSED** are implemented as configuration with a sensible default and labelled in code:

| Area | Current default | Where |
| --- | --- | --- |
| Pack prices | Bronze £2.99, Silver £5.99, Gold £9.99 (proposed) | `src/config/packs.ts` |
| Upgrade odds | **Approved:** Bronze pack 25% Silver in one slot; Silver pack 20% Gold in one slot; Gold pack 15% extra Gold in two slots | `src/config/packs.ts` |
| Gold pack | **Confirmed:** 2 top-flight Golds minimum, sometimes 3 or 4, rest Bronze/Silver (extra-Gold odds to confirm) | `src/config/packs.ts` |
| Starter pack mix | ~30% Silver chance per slot, 1 forced top-flight Bronze, positional coverage incl. a backup GK | `src/config/packs.ts` |
| Formations | **Confirmed:** 2-2-2, 2-3-1, 3-2-1, 3-1-2 (`football-roster-v3`) | `src/domain/football/rules.ts` |
| Auto-sub compatibility | GK↔GK only; outfield sub allowed if the resulting XI is an allowed formation; bench order is user-set | `src/domain/football/rules.ts` |
| Scoring | Spec §6.4 draft table; **confirmed:** clean sheets for GK/DEF only, 60+ minutes (`football-scoring-v2-draft`) | `src/domain/football/scoring.ts` |
| Competition rewards | None in production; DEV-only sample rewards when `DEV_TOOLS` is on | `src/config/competitions.ts` |
| MP valuation | 1 MP ≈ £1 reference, base by tier × scarcity × form × league, blended with median of eligible sales, ±15% damping per run | `src/domain/valuation/mp.ts` |
| Weekly supply | 6 Bronze / 3 Silver / 1 Gold per card design per week, capped by `maxSupply` | `src/server/supply.ts` |
| Collection rewards | **Confirmed:** 10 MP credit (≈ £10) per completed set, spendable on packs; append-only ledger, never withdrawable | `src/server/wallet.ts` |
| Weekly free pack | **Confirmed:** 1 untradeable 6-card pack per manager per week (Monday 00:00 UK reset); minted, doesn't count for sets | `src/server/weekly.ts` |
| Chat moderators | **Confirmed:** admins moderate; others only by admin invitation they accept; admins can revoke | `src/server/moderation.ts` |
| Kits & badges | Home-kit colours from club infoboxes + curated stripes/hoops/halves/quarters; lookalike generic badges (no copied crests) | `scripts/import_wikipedia.py`, `src/components/kit-shirt.tsx` |
| Card tiers for real players | **Confirmed:** by market value — £20m+ Gold, £2m–£20m Silver, under £2m Bronze. Load values in **Admin → Market values** (paste a table, preview, apply) or `npm run values:import`; squad-number fallback until then | `src/config/tiers.ts` |

### Blockers (deliberately not faked)

- **Legal / payments (spec §9.3):** `PAID_PACKS` and `MARKET` are off and *cannot* be switched on from the admin UI unless the deployment sets `LEGAL_GATES_CLEARED=PAID_PACKS,MARKET`. Only a sandbox payment provider exists. Seller payouts and cash withdrawal are not built.
- **Data provider (spec §10):** no licensed football feed has been chosen. The DEV simulated provider (`SIMULATED_DATA` flag) generates plausible matches so the loop can be played; a real provider is a new adapter implementing `FootballDataProvider`.
- **Rights (spec §10, §19):** leagues, clubs and squads are real (2026-27, imported from Wikipedia by `scripts/import_wikipedia.py`, CC BY-SA 4.0) and marked `rightsStatus = PENDING`. Player name/likeness, club and league marks need licences before commercial use. **Crests are not included**: clubs show a generated badge in their colours until licensed crest files are set on `Club.crestUrl`.
- **Accounts:** email verification tokens are generated but no email is sent yet; age/identity checks await the legal decision. Rate limiting is in-process only — production needs a shared store and bot protection.
