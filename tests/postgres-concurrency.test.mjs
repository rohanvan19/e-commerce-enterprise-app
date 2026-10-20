import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { setup, cleanup } from "./postgres-helper.mjs";
import {
  id,
  one,
  all,
  run,
  query,
  transaction,
  pool,
  notifyChange,
  connectionOptions,
} from "../lib/server/db.mjs";
import { placeOrder, transitionOrder } from "../lib/server/commerce.mjs";
import { rateLimit, consumeChallenge, digest } from "../lib/server/auth.mjs";
await setup();
async function buyer(product = "silk", quantity = 1) {
  const uid = id(),
    cart = id(),
    address = id();
  await run(
    "INSERT INTO users(id,name,email,phone,password_hash,verified) VALUES ($1,$2,$3,$4,$5,1)",
    uid,
    "Concurrent shopper",
    uid + "@example.test",
    "9876543210",
    "unused-test-hash",
  );
  await run("INSERT INTO carts(id,user_id) VALUES ($1,$2)", cart, uid);
  await run(
    "INSERT INTO cart_items(cart_id,product_id,quantity) VALUES ($1,$2,$3)",
    cart,
    product,
    quantity,
  );
  await run(
    "INSERT INTO addresses(id,user_id,name,phone,line1,area,pincode) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    address,
    uid,
    "Test shopper",
    "9876543210",
    "12 Sample Road",
    "Bandra",
    "400050",
  );
  const price = (await one("SELECT price FROM products WHERE id=$1", product))
    .price;
  const input = {
    addressId: address,
    paymentMethod: "upi",
    outcome: "success",
    idempotencyKey: id(),
    expectedTotal: price * quantity + (price * quantity >= 49900 ? 0 : 4900),
  };
  return {
    user: {
      id: uid,
      email: uid + "@example.test",
      name: "Test shopper",
      role: "customer",
    },
    cart,
    input,
  };
}
const buy = (b) =>
  placeOrder(b.user, b.cart, b.input, digest(JSON.stringify(b.input)));
await test("PostgreSQL concurrency and transaction guarantees", async (t) => {
  t.after(cleanup);
  await t.test(
    "20 concurrent customers cannot oversell five remaining units",
    async () => {
      await transaction(async () => {
        await run("UPDATE batches SET quantity=0 WHERE product_id=$1", "silk");
        await run(
          "UPDATE batches SET quantity=5 WHERE id=(SELECT id FROM batches WHERE product_id=$1 LIMIT 1)",
          "silk",
        );
        await run("UPDATE products SET stock=5 WHERE id=$1", "silk");
      });
      const buyers = await Promise.all(
        Array.from({ length: 20 }, () => buyer()),
      );
      const results = await Promise.allSettled(buyers.map(buy));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
      assert(
        results
          .filter((r) => r.status === "rejected")
          .every((r) => r.reason.status === 409),
      );
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "silk")).stock,
        0,
      );
      assert.equal(
        (
          await one(
            "SELECT sum(quantity) AS n FROM batches WHERE product_id=$1",
            "silk",
          )
        ).n,
        0,
      );
      assert.equal(
        (
          await one(
            "SELECT sum(quantity) AS n FROM order_items WHERE product_id=$1",
            "silk",
          )
        ).n,
        5,
      );
      assert(pool().totalCount <= Number(process.env.DATABASE_POOL_MAX || 10));
    },
  );
  await t.test(
    "12 identical requests produce one order and deduct stock once",
    async () => {
      const b = await buyer("kitkat");
      const before = (
        await one("SELECT stock FROM products WHERE id=$1", "kitkat")
      ).stock;
      const results = await Promise.all(
        Array.from({ length: 12 }, () => buy(b)),
      );
      assert.equal(new Set(results.map((o) => o.id)).size, 1);
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "kitkat")).stock,
        before - 1,
      );
      assert.equal(
        (
          await one(
            "SELECT count(*) AS n FROM orders WHERE user_id=$1",
            b.user.id,
          )
        ).n,
        1,
      );
      const cancelled = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          transitionOrder(b.user, results[0].id, "cancelled"),
        ),
      );
      assert.equal(cancelled.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "kitkat")).stock,
        before,
      );
    },
  );
  await t.test(
    "coupon usage limit is enforced across different products in parallel",
    async () => {
      await run(
        "INSERT INTO coupons(code,percent,min_total,max_discount,usage_limit,expires_on) VALUES ('ONLYONCE',10,0,100000,1,'2030-01-01')",
      );
      const buyers = await Promise.all(
        [
          "kitkat",
          "dairy-milk",
          "ferrero",
          "silk-almond",
          "amul",
          "kitkat-share",
        ].map((p) => buyer(p)),
      );
      for (const b of buyers) {
        const p = (
          await one(
            "SELECT price FROM products p JOIN cart_items c ON p.id=c.product_id WHERE c.cart_id=$1",
            b.cart,
          )
        ).price;
        b.input.coupon = "ONLYONCE";
        const total = p - Math.floor(p / 10);
        b.input.expectedTotal = total + (total >= 49900 ? 0 : 4900);
      }
      const results = await Promise.allSettled(buyers.map(buy));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert(
        results
          .filter((r) => r.status === "rejected")
          .every((r) => r.reason.status === 400),
      );
    },
  );
  await t.test("parallel rate limits do not lose increments", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => rateLimit("parallel-limit", 5)),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal(
      (await one("SELECT count FROM rate_limits WHERE key='parallel-limit'"))
        .count,
      25,
    );
  });
  await t.test(
    "verification codes can only be consumed once concurrently",
    async () => {
      const email = "race@example.test",
        code = "123456";
      await run(
        "INSERT INTO challenges(email,purpose,token_hash,expires_at) VALUES ($1,$2,$3,$4)",
        email,
        "verify",
        digest(email + ":verify:" + code),
        Date.now() + 60000,
      );
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          consumeChallenge(email, "verify", code),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    },
  );
  await t.test(
    "rollback undoes all writes and returns the pooled connection",
    async () => {
      const before = (
        await one("SELECT stock FROM products WHERE id=$1", "amul")
      ).stock;
      await assert.rejects(
        transaction(async () => {
          await run("UPDATE products SET stock=stock+1 WHERE id=$1", "amul");
          throw new Error("rollback-marker");
        }),
        /rollback-marker/,
      );
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "amul")).stock,
        before,
      );
      assert.equal(pool().waitingCount, 0);
    },
  );
  await t.test(
    "independent connections receive committed notifications, never rolled-back ones",
    async () => {
      const listener = new pg.Client(connectionOptions());
      const channel = "cocoa_changes_" + process.env.DATABASE_SCHEMA;
      const messages = [];
      listener.on("notification", (m) => messages.push(m.payload));
      await listener.connect();
      await listener.query(`LISTEN ${channel}`);
      try {
        const arrived = new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Missing committed notification")),
            2000,
          );
          listener.once("notification", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        await transaction(() => notifyChange());
        await arrived;
        const count = messages.length;
        await assert.rejects(
          transaction(async () => {
            await notifyChange();
            throw new Error("rollback");
          }),
          /rollback/,
        );
        await listener.query("SELECT 1");
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(messages.length, count);
      } finally {
        await listener.end();
      }
    },
  );
  await t.test(
    "40 event streams share one notification connection and refresh after a commit",
    async () => {
      const { eventStream } = await import("../lib/server/events.mjs");
      const readers = await Promise.all(
        Array.from({ length: 40 }, async () =>
          (
            await eventStream(new Request("http://localhost/api/events"))
          ).body.getReader(),
        ),
      );
      try {
        await Promise.all(readers.map((r) => r.read()));
        const active = await one(
          "SELECT count(*) AS n FROM pg_stat_activity WHERE application_name='cocoa-local-notifications' AND query LIKE $1",
          "%cocoa_changes_" + process.env.DATABASE_SCHEMA + "%",
        );
        assert.equal(active.n, 1);
        const next = Promise.all(readers.map((r) => r.read()));
        await transaction(() => notifyChange());
        const timeout = new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("Event streams missed commit")),
            3000,
          );
          t.unref();
        });
        const results = await Promise.race([next, timeout]);
        assert(
          results.every(
            (r) =>
              !r.done && new TextDecoder().decode(r.value).includes("changed"),
          ),
        );
      } finally {
        await Promise.all(readers.map((r) => r.cancel()));
      }
    },
  );
  await t.test(
    "all product stock balances reconcile after concurrent operations",
    async () => {
      const mismatches = await all(
        "SELECT p.id FROM products p LEFT JOIN batches b ON b.product_id=p.id GROUP BY p.id HAVING p.stock<>coalesce(sum(b.quantity),0)",
      );
      assert.deepEqual(mismatches, []);
    },
  );
});
