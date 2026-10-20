import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { one, run, query, transaction } from "./db.mjs";
export async function migrate() {
  await transaction(async () => {
    await query(
      "SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema() || ':migrations'))",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    const directory = join(process.cwd(), "db", "postgres");
    for (const name of (await readdir(directory))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await one(
        "SELECT checksum FROM migrations WHERE name=$1",
        name,
      );
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(
            `Applied migration ${name} has changed. Add a new migration instead.`,
          );
        continue;
      }
      await query(sql);
      await run(
        "INSERT INTO migrations(name,checksum) VALUES ($1,$2)",
        name,
        checksum,
      );
    }
  });
}
