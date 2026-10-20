import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
try {
  process.loadEnvFile(".env.local");
} catch {}
const { all, one, query, run, transaction, closeDatabase } =
  await import("../lib/server/db.mjs");
const { migrate } = await import("../lib/server/migrate.mjs");
const sourcePath = resolve(process.argv[2] || "data/cocoa.sqlite");
if (!existsSync(sourcePath))
  throw new Error("SQLite source does not exist. Use db:seed for a new store.");
const tables = [
  "users",
  "sessions",
  "challenges",
  "outbox",
  "rate_limits",
  "products",
  "batches",
  "stock_movements",
  "carts",
  "cart_items",
  "wishlist",
  "addresses",
  "coupons",
  "orders",
  "order_items",
  "order_allocations",
  "returns",
  "reviews",
  "audit_log",
  "settings",
  "events",
];
mkdirSync("backups", { recursive: true });
const snapshot = resolve(
  "backups",
  `sqlite-before-postgres-${Date.now()}.sqlite`,
);
const original = new DatabaseSync(sourcePath, { readOnly: true });
try {
  await backup(original, snapshot);
} finally {
  original.close();
}
const source = new DatabaseSync(snapshot, { readOnly: true });
try {
  await migrate();
  const report = await transaction(async () => {
    await query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':import'))",
    );
    // Only an empty target is eligible. No merging or overwriting existing business records.
    await query(
      "LOCK TABLE " +
        tables.map((t) => '"' + t + '"').join(",") +
        " IN ACCESS EXCLUSIVE MODE",
    );
    for (const table of tables)
      if ((await one(`SELECT COUNT(*) AS n FROM "${table}"`)).n)
        throw new Error(
          `Target table ${table} is not empty; import aborted with no changes.`,
        );
    const counts = {};
    for (const table of tables) {
      const rows = source.prepare(`SELECT * FROM "${table}"`).all();
      const columns = source
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((c) => c.name);
      const sql = `INSERT INTO "${table}" (${columns.map((c) => '"' + c + '"').join(",")}) VALUES (${columns.map((_, i) => "$" + (i + 1)).join(",")})`;
      for (const row of rows) await run(sql, ...columns.map((c) => row[c]));
      const count = (await one(`SELECT COUNT(*) AS n FROM "${table}"`)).n;
      if (count !== rows.length)
        throw new Error(`Row count mismatch for ${table}.`);
      counts[table] = count;
    }
    for (const table of [
      "outbox",
      "stock_movements",
      "order_items",
      "audit_log",
      "events",
    ])
      await query(
        `SELECT setval(pg_get_serial_sequence('${table}','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM "${table}"`,
      );
    const invalid = await all(
      "SELECT p.id FROM products p LEFT JOIN batches b ON b.product_id=p.id GROUP BY p.id HAVING p.stock<>COALESCE(SUM(b.quantity),0)",
    );
    if (invalid.length)
      throw new Error(
        "Source stock does not reconcile with batch quantities. Import rolled back.",
      );
    return counts;
  });
  console.log(
    "Imported SQLite into PostgreSQL atomically. Rows per table:",
    report,
  );
  console.log("Original SQLite preserved. Snapshot:", snapshot);
} finally {
  source.close();
  await closeDatabase();
}
