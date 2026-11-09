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
npm run db:seed                 # placeholder catalogue, first supply release, admin user, gameweek 1
npm run dev                     # http://localhost:3000
```

Seeded admin: `admin@collectr.dev` / `collectr-admin` (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Any email in `ADMIN_EMAILS` becomes an admin on registration.

### Play the loop locally

1. Register → you get a free **Starter Pack** → open it (11 locked, untradeable cards).
2. **Football → Open League → Auto-fill / pick your squad → Enter squad.** Your cards lock to that entry.
3. Log in as admin → **Admin → Gameweeks**: *DEV: play 3 fixtures* (provisional scores appear), *DEV: play all*, *DEV: send corrections* (watch scores change), then *Finalise & settle*.
4. Back as the player: final score, auto-subs, rank, and (dev only) a reward pack. MP values are recalculated.
5. **Admin → Create next gameweek** and go again.

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
| Upgrade odds | Bronze pack 25% Silver in one slot; Silver pack 20% Gold in one slot; Gold pack 10% per Silver slot | `src/config/packs.ts` |
| Gold pack minimum | 2 guaranteed top-flight Golds (treated as a hard minimum) | `src/config/packs.ts` |
| Starter pack mix | ~30% Silver chance per slot, 1 forced top-flight Bronze, positional coverage incl. a backup GK | `src/config/packs.ts` |
| Formations | 2-2-2 confirmed; 3-2-1, 2-3-1, 3-1-2, 2-1-3, 1-3-2 **proposed** and only enabled in the "Tactics Open" competition | `src/domain/football/rules.ts` |
| Auto-sub compatibility | GK↔GK only; outfield sub allowed if the resulting XI is an allowed formation; bench order is user-set | `src/domain/football/rules.ts` |
| Scoring | Spec §6.4 draft table; clean sheet applied to all positions with 60+ minutes (to confirm) | `src/domain/football/scoring.ts` |
| Competition rewards | None in production; DEV-only sample rewards when `DEV_TOOLS` is on | `src/config/competitions.ts` |
| MP valuation | 1 MP ≈ £1 reference, base by tier × scarcity × form × league, blended with median of eligible sales, ±15% damping per run | `src/domain/valuation/mp.ts` |
| Weekly supply | 6 Bronze / 3 Silver / 1 Gold per card design per week, capped by `maxSupply` | `src/server/supply.ts` |
| Collection rewards | None (set `CollectionSet.reward` to grant a pack) | `src/server/collections.ts` |

### Blockers (deliberately not faked)

- **Legal / payments (spec §9.3):** `PAID_PACKS` and `MARKET` are off and *cannot* be switched on from the admin UI unless the deployment sets `LEGAL_GATES_CLEARED=PAID_PACKS,MARKET`. Only a sandbox payment provider exists. Seller payouts and cash withdrawal are not built.
- **Data provider (spec §10):** no licensed football feed has been chosen. The DEV simulated provider (`SIMULATED_DATA` flag) generates plausible matches so the loop can be played; a real provider is a new adapter implementing `FootballDataProvider`.
- **Rights (spec §10, §19):** every player, club and league in the seed is fictional (`rightsStatus = PLACEHOLDER`). No real names, photos, badges or league marks.
- **Accounts:** email verification tokens are generated but no email is sent yet; age/identity checks await the legal decision. Rate limiting is in-process only — production needs a shared store and bot protection.
