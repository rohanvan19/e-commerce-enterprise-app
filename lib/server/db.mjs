import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const LOCAL = (process.env.APP_MODE || "local") === "local";
if (!LOCAL)
  throw new Error(
    "Live mode is disabled until real authentication and payment adapters are configured.",
  );
const key = Symbol.for("cocoa-local.postgres.v1");
const state = (globalThis[key] ||= {
  context: new AsyncLocalStorage(),
  pool: null,
});
const integer = (text) => {
  const value = Number(text);
  if (!Number.isSafeInteger(value))
    throw new RangeError("Database integer exceeds safe JavaScript precision.");
  return value;
};
const typeOverrides = new pg.TypeOverrides();
typeOverrides.setTypeParser(20, integer);
typeOverrides.setTypeParser(1700, Number);
typeOverrides.setTypeParser(1082, (value) => value);
typeOverrides.setTypeParser(1184, (value) => new Date(value).toISOString());
export function connectionOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString)
    throw new Error(
      "DATABASE_URL is required. Run npm run db:local or configure PostgreSQL first.",
    );
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const schema = process.env.DATABASE_SCHEMA || "public";
  if (!/^[a-z][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid database schema.");
  if (
    ["disable", "allow", "prefer", "no-verify"].includes(
      url.searchParams.get("sslmode"),
    ) &&
    !local
  )
    throw new Error("Remote PostgreSQL requires verified TLS.");
  // Let pg parse the URI without allowing sslmode to replace our verified TLS settings.
  for (const field of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
    url.searchParams.delete(field);
  return {
    connectionString: url.toString(),
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_SSL_CA
            ? { ca: readFileSync(process.env.DATABASE_SSL_CA, "utf8") }
            : {}),
        },
    application_name: "cocoa-local",
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    options: `-c search_path=${schema},public -c timezone=UTC`,
    types: typeOverrides,
  };
}
export function pool() {
  if (!state.pool) {
    const max = Number(process.env.DATABASE_POOL_MAX || 10);
    if (!Number.isInteger(max) || max < 2 || max > 100)
      throw new Error("DATABASE_POOL_MAX must be between 2 and 100.");
    state.pool = new pg.Pool({
      ...connectionOptions(),
      max,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: true,
    });
    state.pool.on("error", (error) =>
      console.error("[PostgreSQL pool]", error.code || error.name),
    );
  }
  return state.pool;
}
export const id = () => randomUUID();
function availablePool() {
  const databasePool = pool();
  if (
    databasePool.waitingCount >=
    Number(process.env.DATABASE_POOL_MAX || 10) * 10
  )
    throw Object.assign(new Error("Database queue is full."), { status: 503 });
  return databasePool;
}
export const query = (sql, args = []) =>
  (state.context.getStore() || availablePool()).query(sql, args);
export const all = async (sql, ...args) => (await query(sql, args)).rows;
export const one = async (sql, ...args) => (await all(sql, ...args))[0];
export const run = async (sql, ...args) => ({
  changes: (await query(sql, args)).rowCount,
});
export async function transaction(
  fn,
  { isolation = "READ COMMITTED", retries = 4 } = {},
) {
  if (state.context.getStore()) return fn();
  if (
    !["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"].includes(isolation)
  )
    throw new Error("Invalid transaction isolation.");
  for (let attempt = 0; ; attempt++) {
    const client = await availablePool().connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      await client.query("SET LOCAL lock_timeout = '5s'");
      const result = await state.context.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (!["40001", "40P01"].includes(error.code) || attempt >= retries)
        throw error;
    } finally {
      client.release();
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 10 + Math.random() * 40),
    );
  }
}
export async function notifyChange(audience = "all") {
  // NOTIFY is delivered only after the surrounding transaction commits.
  await query(
    "SELECT pg_notify($1, json_build_object('audience',$2::text,'revision',nextval('events_id_seq'))::text)",
    ["cocoa_changes_" + (process.env.DATABASE_SCHEMA || "public"), audience],
  );
}
export async function changed(actor, action, detail) {
  await run(
    "INSERT INTO audit_log(actor,action,detail) VALUES ($1,$2,$3)",
    actor,
    action,
    JSON.stringify(detail),
  );
  await notifyChange(action === "profile.updated" ? "user:" + actor : "all");
}
export async function config() {
  return Object.fromEntries(
    (await all("SELECT * FROM settings")).map((r) => [
      r.key,
      JSON.parse(r.value),
    ]),
  );
}
export async function closeDatabase() {
  if (state.pool) {
    await state.pool.end();
    state.pool = null;
  }
}
