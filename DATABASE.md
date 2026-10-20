# PostgreSQL deployment and capacity

The application now uses PostgreSQL through `pg`; SQLite is only read by the optional one-time importer. The running local database is a separate PostgreSQL 17 cluster on `127.0.0.1:55432`. It does not change installed PostgreSQL services. Existing business data is in the `store` schema selected in `.env.local`. Existing owner and customer credentials still work.

## Local commands

```powershell
npm run db:local       # start the isolated cluster using your installed PostgreSQL binaries
npm run db:migrate     # apply checksummed, transactionally locked migrations
npm run dev
```

`Start-Local.cmd` starts the project cluster, migrates, and starts Next.js. Stop Next.js before `npm run db:stop`. The cluster is not installed as a Windows service. `PG_BIN` can specify another installed PostgreSQL bin directory. On a new computer install PostgreSQL 17+ first, or use Docker below. Do not copy an initialized data directory between incompatible OS/major PostgreSQL versions.

For a new store, run `npm run db:seed` after migration. Seed is explicit and serialized; application requests never migrate or seed the database. Do not seed before importing an existing store.

## Docker alternative

Use either the project cluster or Docker on port 55432, not both. Copy `.env.postgres.example` to `.env.postgres` and replace the placeholder with a strong password. Then:

```powershell
docker compose --env-file .env.postgres up -d db
```

Set `.env.local` to the matching `DATABASE_URL`, `DATABASE_SCHEMA=public`, and `APP_MODE=local`. Run migrations and seed. Docker keeps its database in a named volume; do not run `docker compose down -v` unless you intend to erase it.

## Migration and rollback

`db/postgres/*.sql` is the active migration directory. The old SQLite schema remains as import reference. Migrations run under an advisory lock, record SHA-256 checksums, and fail if an already-applied file changes. Add a new numbered migration for changes. Run migrations once as a deployment step, with `DATABASE_MIGRATION_URL` when the runtime role cannot perform DDL.

`npm run db:import-sqlite -- path/to/cocoa.sqlite` makes a consistent SQLite snapshot under `backups/` and imports into an empty PostgreSQL schema in one transaction. It preserves IDs, password hashes, sessions, addresses, stock, orders, and audit records. It validates table row counts, checks product/batch balances, and advances identity sequences. It refuses a nonempty target rather than overwriting records. Stop writes to the source during cutover. The source SQLite file is never modified or deleted.

Before this migration, a local snapshot was saved in `backups/`. That SQLite file is a point-in-time backup, not a live replica; new PostgreSQL orders will not appear there. A database restore must be paired with the application version and migration state it supports.

## Concurrency protections

- Asynchronous queries and one bounded pool per application process: default 10 connections, with a 5-second acquisition timeout and 15-second statement/idle-transaction limits.
- Transactions keep all queries on one client through AsyncLocalStorage. Commit, rollback and connection release are explicit. Deadlocks and serialization failures have bounded retries.
- Checkout locks its cart and product rows in stable order, locks the coupon, validates server totals, then allocates expiry-first batches atomically. Separate products can be purchased concurrently.
- An advisory transaction lock serializes an idempotency key before looking up an existing order. Cancellation locks the order and affected inventory, so duplicate requests cannot restore stock twice.
- Concurrent cart creation uses a unique constraint/upsert. Rate limits increment atomically. Verification-code consumption locks the challenge row; failed attempts commit even when validation fails.
- Foreign keys, uniqueness/check constraints, and indexes cover account sessions, product batches, order history, coupons, reviews and stock movements. Expiry checks use the Mumbai business date.
- Order details are fetched in batches instead of one query per order. Private cart/account notifications target their audience.
- PostgreSQL LISTEN/NOTIFY uses one dedicated connection per app process, shared by all browser event streams. Notifications are delivered after commit, reconnects trigger refresh, and bursts are coalesced. There is no SQL polling loop per browser. Browser focus and a jittered 60–70 second refresh cover missed updates.

## Production database configuration

Use managed PostgreSQL with automated backups, point-in-time recovery, failover, private networking and monitoring for a public store. The database change alone does not make the current local/test-payment app production-ready.

1. Put the pooled database endpoint in `DATABASE_URL`. Remote connections require certificate-verified TLS; use `DATABASE_SSL_CA` for a private CA. Credentials belong in the deployment secret manager.
2. If using PgBouncer transaction pooling, set `DATABASE_LISTEN_URL` to a direct or session-pooled endpoint; LISTEN requires a persistent session. Reserve one notification connection per application process.
3. Budget the pool across replicas: `replicas × DATABASE_POOL_MAX + replicas` notification connections, plus migrations, jobs and operational headroom, must fit the provider's connection limit. Do not increase each replica's pool without a database-wide budget. The default 10 is a local starting point, not a measured production recommendation.
4. Run migrations with a DDL-capable deployment role. Give the runtime role only CONNECT, schema USAGE, table SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT. Apply default grants under the migration owner for future tables. Keep schema CREATE, role administration and superuser privileges out of the runtime credential. The isolated local cluster uses a development owner role for convenience.
5. Monitor connection waits, p95/p99 query and checkout latency, deadlocks, failed transactions, replication lag, disk growth and slow query plans. Keep autovacuum enabled. Add a scheduled retention job for expired sessions/challenges/rate-limit keys and abandoned carts based on the final retention policy.

The current catalogue and admin screens still load full lists; large catalogues/customer histories need paginated API/UI queries and server-side reporting before a high-volume launch. Product images also need shared object storage/CDN across replicas. These are application scaling tasks, separate from choosing a concurrent database.

## Backup and restore

Use the provider's automated backups and point-in-time recovery in production. For local logical backups use PostgreSQL `pg_dump --format=custom` with your connection details and a protected `.pgpass` file (or temporary process environment), not passwords pasted into shell history. Restore with `pg_restore` into a fresh database, migrate only if needed, verify row counts and stock balances, and switch the application connection after validation. Never copy live PostgreSQL data files as a backup method. Back up `public/images` separately until object storage is configured.

## Verification and limits

`npm test` runs real PostgreSQL integration tests in unique disposable schemas. It does not reset the store schema. `TEST_DATABASE_URL` can select a dedicated test database. The test role must be allowed to create schemas.

Tests include 20 parallel customers competing for five units, 12 simultaneous retries for one checkout, concurrent cancellations, coupon limits across distinct products, atomic rate limiting, OTP replay, rollback and cross-connection commit notifications. These verify correctness; they are not a capacity benchmark. No claim of a particular simultaneous-client count or throughput is made. A production load test must use the expected request mix, data sizes, host/database sizes and payment integration.
