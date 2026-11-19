# AKAZ Sports Hub

This repository holds two things:

| Path | What it is | Status |
| --- | --- | --- |
| `src/`, `db/`, `scripts/`, `integration-tests/`, `nginx/`, `.github/`, `Dockerfile`, `docker-compose*.yml` | **Platform API** — the NestJS backend core of the AKAZ Sports Hub super-app (court discovery, split-pay bookings, payment webhooks, referee match sync, ringer recruitment) | New, described below |
| `mobile/` | **Player app** (Flutter) — find a court, hold a slot, pay, manage bookings, answer ringer invites | New, first version — see `mobile/README.md` |
| `backend/`, `frontend/` | The existing B2B wholesale catalogue (FastAPI + MongoDB + React) | Unchanged |

The two are independent: they share no code, database or port.

---

## Platform API

A modular monolith (NestJS 10, TypeScript) on PostgreSQL 16 + PostGIS and Redis 7 + BullMQ.

### What is built

| Module | Folder | What it does |
| --- | --- | --- |
| Venues | `src/venues` | PostGIS radius search (`ST_DWithin`), venue detail, per-day slot availability in the venue's time zone |
| Bookings | `src/bookings` | 15-minute soft hold, equal or custom split between payers, cancellation with refund |
| Payments | `src/payments` | Payment attempts, escrow state machine, capture / void / refund, Tap and Checkout.com clients, a mock provider for local work |
| Webhooks | `src/webhooks` | Tap (`hashstring`) and Checkout.com (`Cko-Signature`) HMAC verification, idempotent processing |
| Matches | `src/matches` | Offline-first referee event batch sync, live score, 2-minute White Card sin-bin timers |
| Ringers | `src/ringers` | Substitute-player requests and invitations |
| Queues | `src/queues` | Redis connection, distributed lock, BullMQ producers |
| Workers | `src/workers` | Hold expiry (TTL), payment settlement, ringer recruitment, once-a-minute safety sweep |
| Auth | `src/auth` | JWT access-token guard and role guard (`PLAYER`, `PARENT`, `VENUE_MANAGER`, `REFEREE`, `ADMIN`) |

### How a split-pay booking works

1. `POST /v1/bookings` reserves the slot (`HOLD`) for `HOLD_MINUTES` (15) and creates one share per payer. Shares always add up to the total exactly; an indivisible remainder goes to the first payers one minor unit at a time.
2. Each payer calls `POST /v1/bookings/:id/shares/:shareId/pay` and is sent to the provider's hosted payment page.
   - `flow: "AUTHORIZE"` holds the amount on a credit card.
   - `flow: "CHARGE"` (default) takes it immediately — required for debit rails such as mada, NAPS, BenefitPay and OmanNet, which cannot hold funds.
3. The provider's webhook marks the share paid. When the **last** share is paid the booking becomes `CONFIRMED` and card holds are captured.
4. If the hold runs out first, the booking becomes `EXPIRED`, the court is free again, card holds are voided and charges refunded. The same happens to a payment that lands after the deadline, and to the second payment if a share is paid twice.

Double-booking is prevented in the database itself: `bookings` carries an `EXCLUDE USING gist (court_id WITH =, slot_range WITH &&)` constraint over live bookings, so two overlapping bookings on one court cannot both be stored whatever the application does. A short Redis lock per court sits in front of it to queue simultaneous requests; if Redis is down, bookings still work on the database guarantee alone.

No provider call runs inside a database transaction. Each capture, void or refund is claimed first (`… → *_PENDING`) and settled afterwards, and a sweep that runs every minute re-queues anything whose job was lost and flags provider actions that were never confirmed (`payment_attempts.needs_review`).

### Run it locally

```bash
cp .env.example .env          # set JWT_SECRET and POSTGRES_PASSWORD
docker compose up --build     # Postgres + PostGIS, Redis, migrations, API on http://localhost:3000
curl http://localhost:3000/v1/health
```

`package-lock.json` is committed, so the Dockerfile and CI both use the reproducible `npm ci`.

Without Docker: `npm install`, start Postgres (with PostGIS) and Redis yourself, then `npm run db:migrate` and `npm run start:dev`.

`PAYMENT_PROVIDER=mock` (the default, refused in production) lets you run the whole flow without a payment account:

```bash
TOKEN=$(npm run -s dev:token -- 00000000-0000-4000-a000-000000000010 PLAYER)

# 1. hold a slot (pick a future date; 18:00 Doha time)
curl -s -X POST localhost:3000/v1/bookings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"court_id":"00000000-0000-4000-d000-000000000001","starts_at":"2026-12-01T18:00:00+03:00","ends_at":"2026-12-01T19:00:00+03:00"}'

# 2. start the payment for the share id returned above
curl -s -X POST localhost:3000/v1/bookings/<booking-id>/shares/<share-id>/pay -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'

# 3. play the provider's part
curl -s -X POST localhost:3000/v1/dev/payments/attempts/<attempt-id>/simulate -H 'Content-Type: application/json' -d '{"outcome":"CAPTURED"}'
```

### API

All routes are under `/v1` and need `Authorization: Bearer <token>` unless marked public.

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /health` | public | Database and Redis status |
| `GET /venues/nearby?lat&lng&radius_km&sport&limit` | public | Venues around a point, nearest first |
| `GET /venues/:id` | public | Venue with its courts and rules (e.g. TF turf footwear) |
| `GET /courts/:id/availability?date=YYYY-MM-DD` | public | Slots of one local day, each available or not |
| `POST /bookings` | any user | Hold a slot and create the shares |
| `GET /bookings/mine` | any user | Bookings organized or shared by the caller |
| `GET /bookings/:id` | organizer, payers, venue manager, admin | Booking with shares and escrow status |
| `POST /bookings/:id/shares/:shareId/pay` | payer, organizer, admin | Returns `checkout_url` |
| `POST /bookings/:id/cancel` | organizer (until the venue's cut-off), venue manager, admin | Cancel and refund everyone |
| `POST /bookings/:id/ringer-requests` | organizer | Ask for N extra players |
| `GET /ringer-invites/mine` | any user | Invitations received |
| `POST /ringer-invites/:id/respond` | invited player | Accept or decline; first to accept get the places |
| `POST /matches` | referee, venue manager, admin | Create a match |
| `GET /matches/:id` | any user | Match, events, active sin bins |
| `GET /matches/:id/sin-bins` | any user | Live White Card countdowns |
| `POST /matches/:id/events/batch` | match referee, admin | Idempotent offline sync (max 200 events) |
| `POST /webhooks/tap`, `POST /webhooks/checkout` | provider (HMAC-signed) | Payment notifications |

Errors have the shape `{ "code": "SLOT_TAKEN", "message": "…" }`; the app should branch on `code`.

Amounts are integers in minor units everywhere (`25000` = QAR 250.00, `30000` = BHD 30.000). Timestamps must carry a UTC offset.

### Database

- `db/migrations/001_initial_schema.sql` — schema, PostGIS and GiST indexes, the double-booking constraint, and `court_slot_violation()` (opening hours and slot alignment in the venue's time zone, including courts open past midnight).
- `db/migrations/002_seed_data.sql` — **demo data**: six venues across Qatar, Saudi Arabia, UAE, Bahrain and Oman, eleven courts, twelve users. Names, coordinates, prices and phone numbers are placeholders.
- `scripts/migrate.sh` applies migrations once each and records them in `schema_migrations`. Use `SKIP_SEED=true` in production.

`slot_range` is a `TSTZRANGE`, not the `TSRANGE` named in the master guide: the platform spans UTC+3 and UTC+4, and a range without a time zone would let two countries' bookings be compared wrongly.

### Tests

```bash
npm test                      # 72 unit tests: split maths, money, webhook signatures, sin-bin timing, config
npm run db:check              # schema guarantees, straight in SQL (rolls back)
npm run test:integration      # 43 end-to-end flows through the real services against a *_test database
```

The integration suite covers the full payment lifecycle (pay, confirm, capture, expire, cancel, refund, double payment, late payment, provider outage, amount mismatch), simultaneous requests for one slot, the referee sync and ringer recruitment. It replaces Redis and the payment providers with in-memory stand-ins and needs a migrated database whose name ends in `_test`.

### Configuration

See `.env.example`. The process refuses to start with a missing or invalid setting and lists every problem at once. `RUN_WORKERS=false` turns a replica into API-only; at least one process must run the workers.

### Going live with payments

1. Set `PAYMENT_PROVIDER` and the provider's keys.
2. Point the provider's webhook at `<PUBLIC_BASE_URL>/v1/webhooks/tap` or `/v1/webhooks/checkout`.
3. **Run every call once against the provider's sandbox.** The request shapes follow the providers' public API references, but they have not been exercised against a live sandbox yet. `src/payments/tap.gateway.ts` marks the fields to confirm.

### Deploying

| File | What it does |
| --- | --- |
| `.github/workflows/deploy.yml` | Pull request → typecheck, 72 unit tests, migrations, SQL schema checks, 43 integration tests, `shellcheck`, Docker build. Push to `main` → the same, then push the image to GHCR and deploy over SSH. |
| `docker-compose.prod.yml` | Production override: runs the published image instead of building on the host, stops publishing Postgres and Redis on any port, forces `SKIP_SEED=true`, caps container logs. |
| `nginx/conf.d/akaz.conf` | TLS termination, security headers, three rate-limit zones (reads, writes, provider webhooks), WebSocket upgrade for match timers. |
| `scripts/backup-postgres.sh` | Daily compressed `pg_dump -Fc`, verified with `pg_restore --list` before it is kept, 14-day retention. |

The deploy replaces only the `api` container (`--no-deps`), so Postgres and Redis keep running. Migrations are applied first and are idempotent. If the new container does not report healthy within 90 seconds the previous image is put back and the job fails.

**The deploy job is switched off** until there is a host to deploy to. To turn it on, add the secrets `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `DEPLOY_PATH` (and `SSH_PORT` if it is not 22), then set the repository variable `DEPLOY_ENABLED` to `true`. Test and publish run either way. The host needs `docker-compose.yml`, `docker-compose.prod.yml` and a filled-in `.env` in `DEPLOY_PATH`; nothing else, and no copy of the source.

Install the backup as a cron job on the host and **copy the snapshots off it** — a backup on the same disk as the database is not a backup:

```cron
0 2 * * * DATABASE_URL=postgres://... /opt/akaz/scripts/backup-postgres.sh >> /var/log/akaz-backup.log 2>&1
```

### Not built yet

These parts of the master guide are outside the backend core and still to do:

- **Sign-in.** The API verifies access tokens but does not issue them (no OTP login or refresh tokens). For development, `npm run dev:token` prints a token, and with `DEV_LOGIN=true` the app can sign in as any seeded user through `/v1/dev/auth` (refused in production).
- **Push notifications.** Ringer invitations are stored and served by `GET /ringer-invites/mine`; nothing is pushed through FCM yet.
- **Live match timers over WebSocket.** Sin-bin countdowns are served over HTTP with `server_time` for clock correction.
- **Venue payouts, academy ERP, gear e-commerce, QR passes, IoT floodlights/turnstiles, POS sync, tournament brackets.**
- **Flutter app:** a first version is in `mobile/` (see its README). Still to do there: OTP sign-in, split-pay with friends, GPS, push notifications, and the App Store / Play pipeline.
- **Ringers do not pay a share.** A player who accepts an invitation is listed, not charged.
