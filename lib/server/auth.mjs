import {
  randomBytes,
  randomInt,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { one, run, id, transaction } from "./db.mjs";
const scryptAsync = promisify(scrypt);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return salt + ":" + hash.toString("hex");
}
export async function checkPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  const hash = await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const target = Buffer.from(expected, "hex");
  return target.length === hash.length && timingSafeEqual(hash, target);
}
export async function rateLimit(key, limit = 10, window = 15 * 60 * 1000) {
  const now = Date.now();
  const row = await one(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES ($1,1,$2)
 ON CONFLICT(key) DO UPDATE SET
 count=CASE WHEN rate_limits.expires_at<$3 THEN 1 ELSE rate_limits.count+1 END,
 expires_at=CASE WHEN rate_limits.expires_at<$3 THEN excluded.expires_at ELSE rate_limits.expires_at END
 RETURNING count`,
    key,
    now + window,
    now,
  );
  if (row.count > limit)
    fail(429, "Too many attempts. Please try again in a few minutes.");
}
export const publicUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        verified: !!u.verified,
        created_at: u.created_at,
      }
    : null;
export function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim().split("="))
      .filter((x) => x.length === 2),
  );
}
export async function currentUser(request) {
  const token = parseCookies(request).cocoa_session;
  if (!token) return null;
  return (
    (await one(
      "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=$1 AND sessions.expires_at>$2",
      digest(token),
      Date.now(),
    )) || null
  );
}
export async function requireUser(request, admin = false) {
  const u = await currentUser(request);
  if (!u) fail(401, "Please sign in to continue.");
  if (!u.verified) fail(403, "Verify your email before continuing.");
  if (admin && u.role !== "admin") fail(403, "Store owner access is required.");
  return u;
}
export async function sessionCookie(userId) {
  const token = randomBytes(32).toString("hex");
  await run(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
    digest(token),
    userId,
    Date.now() + 7 * 86400000,
  );
  return `cocoa_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}
export async function challenge(email, purpose) {
  await rateLimit("send:" + email + ":" + purpose, 4, 10 * 60 * 1000);
  const code = String(randomInt(100000, 1000000));
  await run(
    "INSERT INTO challenges(email,purpose,token_hash,expires_at,attempts) VALUES ($1,$2,$3,$4,0) ON CONFLICT(email,purpose) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,attempts=0",
    email,
    purpose,
    digest(email + ":" + purpose + ":" + code),
    Date.now() + 10 * 60 * 1000,
  );
  await run(
    "INSERT INTO outbox(email,subject,body) VALUES ($1,$2,$3)",
    email,
    purpose === "verify"
      ? "Verify your Cocoa Local email"
      : "Reset your Cocoa Local password",
    `Your ${purpose === "verify" ? "verification" : "password reset"} code is ${code}. It expires in 10 minutes. This message is delivered to the local test inbox only.`,
  );
}
export async function consumeChallenge(email, purpose, code) {
  const error = await transaction(async () => {
    const record = await one(
      "SELECT * FROM challenges WHERE email=$1 AND purpose=$2 FOR UPDATE",
      email,
      purpose,
    );
    if (!record || record.expires_at < Date.now() || record.attempts >= 5)
      return "This code has expired or reached its attempt limit. Request a new one.";
    await run(
      "UPDATE challenges SET attempts=attempts+1 WHERE email=$1 AND purpose=$2",
      email,
      purpose,
    );
    const candidate = digest(email + ":" + purpose + ":" + code);
    if (
      !timingSafeEqual(Buffer.from(candidate), Buffer.from(record.token_hash))
    )
      return "That code is not correct. Please try again.";
    await run(
      "DELETE FROM challenges WHERE email=$1 AND purpose=$2",
      email,
      purpose,
    );
  });
  // Commit failed attempts before surfacing the validation error.
  if (error) fail(400, error);
}
export async function cartFor(request, user) {
  if (user) {
    let cart = await one("SELECT * FROM carts WHERE user_id=$1", user.id);
    if (!cart) {
      cart = { id: id() };
      await run(
        "INSERT INTO carts(id,user_id) VALUES ($1,$2) ON CONFLICT(user_id) DO NOTHING",
        cart.id,
        user.id,
      );
      cart = await one("SELECT id FROM carts WHERE user_id=$1", user.id);
    }
    return { id: cart.id };
  }
  const token = parseCookies(request).cocoa_cart;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const existing = await one(
      "SELECT * FROM carts WHERE id=$1 AND user_id IS NULL",
      digest(token),
    );
    if (existing) return { id: existing.id };
  }
  const raw = randomBytes(32).toString("hex");
  const cartId = digest(raw);
  await run("INSERT INTO carts(id) VALUES ($1)", cartId);
  return {
    id: cartId,
    cookie: `cocoa_cart=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  };
}
export async function mergeCart(request, user) {
  const guest = parseCookies(request).cocoa_cart;
  if (!guest) return;
  const guestId = digest(guest);
  const cart = await cartFor(request, user);
  await transaction(async () => {
    await all(
      "SELECT id FROM carts WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
      [cart.id, guestId],
    );
    const items = await one(
      "SELECT id FROM carts WHERE id=$1 AND user_id IS NULL",
      guestId,
    );
    if (!items) return;
    for (const row of await guestCartItems(guestId))
      await run(
        "INSERT INTO cart_items(cart_id,product_id,quantity) VALUES ($1,$2,$3) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=LEAST(99,cart_items.quantity+excluded.quantity)",
        cart.id,
        row.product_id,
        row.quantity,
      );
    await run("DELETE FROM carts WHERE id=$1", guestId);
  });
}
import { all } from "./db.mjs";
const guestCartItems = async (cartId) =>
  await all("SELECT * FROM cart_items WHERE cart_id=$1", cartId);
