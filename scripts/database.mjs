try {
  process.loadEnvFile(".env.local");
} catch {}
if (process.env.DATABASE_MIGRATION_URL)
  process.env.DATABASE_URL = process.env.DATABASE_MIGRATION_URL;
const { closeDatabase } = await import("../lib/server/db.mjs");
try {
  const { migrate } = await import("../lib/server/migrate.mjs");
  await migrate();
  if (process.argv.includes("--seed")) {
    const { seed } = await import("../lib/server/seed.mjs");
    await seed();
  }
  console.log("PostgreSQL migrations complete.");
} finally {
  await closeDatabase();
}
