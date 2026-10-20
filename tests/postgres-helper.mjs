import { randomUUID } from "node:crypto";
try {
  process.loadEnvFile(".env.local");
} catch {}
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.DATABASE_URL)
  throw new Error("Configure TEST_DATABASE_URL or run npm run db:local first.");
// Each test process owns a fresh schema; the storefront tables are never reset.
const schema = "test_" + randomUUID().replaceAll("-", "");
process.env.DATABASE_SCHEMA = schema;
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
process.env.ADMIN_PASSWORD = "OnlyForIsolatedTests!2026";
process.env.ADMIN_EMAIL = "owner@example.test";
const db = await import("../lib/server/db.mjs");
const { migrate } = await import("../lib/server/migrate.mjs");
const { seed } = await import("../lib/server/seed.mjs");
export async function setup() {
  await db.query(`CREATE SCHEMA "${schema}"`);
  try {
    await migrate();
    await seed();
  } catch (error) {
    await cleanup();
    throw error;
  }
}
export async function cleanup() {
  // schema is generated above, never from an environment-supplied target.
  await db.query(`DROP SCHEMA "${schema}" CASCADE`);
  await db.closeDatabase();
}
