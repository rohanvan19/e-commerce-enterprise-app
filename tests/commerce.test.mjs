import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setup, cleanup } from "./postgres-helper.mjs";
await setup();
const { handle } = await import("../lib/server/api.mjs");
const { one, run, all } = await import("../lib/server/db.mjs");
function client() {
  let cookies = {};
  return {
    async request(path, data, method, headers = {}) {
      const res = await handle(
        new Request("http://localhost:3000/api/" + path, {
          method: method || (data === undefined ? "GET" : "POST"),
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            cookie: Object.entries(cookies)
              .map(([k, v]) => k + "=" + v)
              .join("; "),
            ...(data === undefined
              ? {}
              : { "content-type": "application/json" }),
            ...headers,
          },
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
        path.split("?")[0].split("/"),
      );
      const cookie = res.headers.get("set-cookie");
      if (cookie) {
        const [name, value] = cookie.split(";")[0].split("=");
        cookies[name] = value;
      }
      return {
        status: res.status,
        body: await res.json(),
        headers: res.headers,
      };
    },
    cookies: () => cookies,
  };
}
const guest = client(),
  customer = client(),
  other = client(),
  owner = client();
const email = "shopper@example.test";
let addressId, orderId;
const password = "SomeLovelyChocolate!2026";
async function register(c, email, name = "Demo Shopper") {
  const r = await c.request("auth/register", {
    name,
    email,
    phone: "9876543210",
    password,
  });
  assert.equal(r.status, 201, r.body.error);
  const msg = await one(
    "SELECT body FROM outbox WHERE email=$1 ORDER BY id DESC",
    email,
  );
  const code = msg.body.match(/\b\d{6}\b/)[0];
  return code;
}
await test("Commerce lifecycle and security", async (t) => {
  t.after(cleanup);
  await t.test(
    "unauthenticated and customer requests cannot access owner data",
    async () => {
      assert.equal((await guest.request("admin")).status, 401);
      assert.equal(
        (
          await guest.request("admin/settings", {
            shipping: 0,
            freeShipping: 0,
            pincodes: ["400050"],
            deliveryWindow: "Soon",
          })
        ).status,
        401,
      );
    },
  );
  await t.test(
    "same-origin and localhost guards reject untrusted requests",
    async () => {
      assert.equal(
        (
          await guest.request(
            "cart",
            { productId: "silk", quantity: 1 },
            "POST",
            { origin: "https://evil.example" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await guest.request("state", undefined, "GET", {
            host: "example.com",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await guest.request(
            "cart",
            { productId: "silk", quantity: 1 },
            "POST",
            { "content-type": "text/plain" },
          )
        ).status,
        415,
      );
    },
  );
  await t.test("guest cart persists and quantities are validated", async () => {
    await customer.request("state");
    assert.equal(
      (await customer.request("cart", { productId: "silk", quantity: 3 }))
        .status,
      200,
    );
    assert.equal((await customer.request("state")).body.cart[0].quantity, 3);
    assert.equal(
      (await guest.request("cart", { productId: "silk", quantity: -1 })).status,
      400,
    );
    assert.equal(
      (await guest.request("cart", { productId: "silk", quantity: 99 })).status,
      409,
    );
  });
  await t.test(
    "registration hashes passwords, blocks unverified login, verifies one-time code and merges guest bag",
    async () => {
      const code = await register(customer, email);
      const user = await one("SELECT * FROM users WHERE email=$1", email);
      assert.notEqual(user.password_hash, password);
      assert.equal(
        (await customer.request("auth/login", { email, password })).status,
        403,
      );
      assert.equal(
        (await customer.request("auth/verify", { email, code: "000000" }))
          .status,
        400,
      );
      const verified = await customer.request("auth/verify", { email, code });
      assert.equal(verified.status, 200);
      assert.match(
        verified.headers.get("set-cookie"),
        /HttpOnly; SameSite=Lax/,
      );
      assert.equal(
        (await customer.request("auth/verify", { email, code })).status,
        400,
      );
      assert.equal((await customer.request("state")).body.cart[0].quantity, 3);
      assert.equal((await customer.request("admin")).status, 403);
    },
  );
  await t.test(
    "addresses and server totals enforce shipping and coupon rules",
    async () => {
      const saved = await customer.request("addresses", {
        name: "Demo Shopper",
        phone: "9876543210",
        line1: "12 Test Building, Demo Road",
        line2: "",
        area: "Bandra West",
        pincode: "400050",
      });
      assert.equal(saved.status, 201);
      addressId = saved.body.id;
      const q = await customer.request("quote", {
        coupon: "SWEET10",
        pincode: "400050",
      });
      assert.equal(q.status, 200);
      assert.equal(q.body.subtotal, 28500);
      assert.equal(q.body.discount, 2850);
      assert.equal(q.body.total, 30550);
      assert.equal(
        (await customer.request("quote", { coupon: "NOTREAL" })).status,
        400,
      );
      assert.equal(
        (await customer.request("quote", { pincode: "110001" })).status,
        400,
      );
    },
  );
  await t.test(
    "declined payments and manipulated totals never change stock or create orders",
    async () => {
      const before = (
        await one("SELECT stock FROM products WHERE id=$1", "silk")
      ).stock;
      const base = {
        addressId,
        paymentMethod: "gpay",
        coupon: "SWEET10",
        expectedTotal: 30550,
        idempotencyKey: randomUUID(),
      };
      assert.equal(
        (await customer.request("checkout", { ...base, expectedTotal: 1 }))
          .status,
        409,
      );
      assert.equal(
        (await customer.request("checkout", { ...base, outcome: "decline" }))
          .status,
        402,
      );
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "silk")).stock,
        before,
      );
      assert.equal((await one("SELECT COUNT(*) AS n FROM orders")).n, 0);
    },
  );
  await t.test(
    "successful checkout is atomic, uses snapshots and is idempotent",
    async () => {
      const before = (
        await one("SELECT stock FROM products WHERE id=$1", "silk")
      ).stock;
      const input = {
        addressId,
        paymentMethod: "gpay",
        coupon: "SWEET10",
        expectedTotal: 30550,
        idempotencyKey: randomUUID(),
      };
      const results = await Promise.all([
        customer.request("checkout", input),
        customer.request("checkout", input),
      ]);
      assert.equal(results[0].status, 201, results[0].body.error);
      assert.equal(results[1].body.id, results[0].body.id);
      orderId = results[0].body.id;
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "silk")).stock,
        before - 3,
      );
      assert.equal((await one("SELECT COUNT(*) AS n FROM orders")).n, 1);
      assert.equal((await customer.request("state")).body.cart.length, 0);
      assert.equal(
        (
          await customer.request("checkout", {
            ...input,
            giftNote: "Different intent",
          })
        ).status,
        409,
      );
    },
  );
  await t.test("order and address ownership is enforced", async () => {
    const code = await register(other, "other@example.test", "Other Demo");
    await other.request("auth/verify", { email: "other@example.test", code });
    await other.request("cart", { productId: "silk", quantity: 1 });
    assert.equal(
      (
        await other.request("checkout", {
          addressId,
          paymentMethod: "paypal",
          expectedTotal: 14400,
          idempotencyKey: randomUUID(),
        })
      ).status,
      400,
    );
    assert.equal(
      (await other.request("orders/cancel", { orderId })).status,
      404,
    );
    assert.equal((await other.request("state")).body.orders.length, 0);
  });
  await t.test(
    "saved address editing checks ownership, validation and order snapshots",
    async () => {
      const before = (await customer.request("state")).body;
      const original = before.addresses.find((a) => a.id === addressId);
      const snapshot = before.orders.find(
        (o) => o.id === orderId,
      ).shipping_address;
      const edited = {
        ...original,
        line1: "24 Updated Building, Test Road",
        line2: "Near test library",
      };
      const update = await customer.request("addresses", edited, "PATCH");
      assert.equal(update.status, 200, update.body.error);
      assert.equal(update.body.id, addressId);
      const after = (await customer.request("state")).body;
      assert.equal(after.addresses.length, before.addresses.length);
      assert.equal(
        after.addresses.find((a) => a.id === addressId).line1,
        edited.line1,
      );
      assert.deepEqual(
        after.orders.find((o) => o.id === orderId).shipping_address,
        snapshot,
      );
      assert.equal(
        (await other.request("addresses", edited, "PATCH")).status,
        404,
      );
      assert.equal(
        (await guest.request("addresses", edited, "PATCH")).status,
        401,
      );
      assert.equal(
        (
          await customer.request(
            "addresses",
            { ...edited, id: "missing" },
            "PATCH",
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await customer.request(
            "addresses",
            { ...edited, pincode: "bad" },
            "PATCH",
          )
        ).status,
        400,
      );
      assert.equal(
        (await customer.request("state")).body.addresses.find(
          (a) => a.id === addressId,
        ).pincode,
        original.pincode,
      );
      assert.equal(
        (
          await customer.request(
            "addresses",
            { ...edited, pincode: "110001" },
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal(
        (await customer.request("quote", { pincode: "110001" })).status,
        400,
      );
      assert.equal(
        (await customer.request("addresses", original, "PATCH")).status,
        200,
      );
      const extra = await customer.request("addresses", {
        ...original,
        line1: "36 Another Building, Sample Street",
      });
      assert.equal(extra.status, 201);
      assert.notEqual(extra.body.id, addressId);
      assert.equal(
        (await customer.request("state")).body.addresses.length,
        before.addresses.length + 1,
      );
    },
  );
  await t.test(
    "cancellation restores stock exactly once and releases offer usage",
    async () => {
      const before = (
        await one("SELECT stock FROM products WHERE id=$1", "silk")
      ).stock;
      assert.equal(
        (await customer.request("orders/cancel", { orderId })).status,
        200,
      );
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "silk")).stock,
        before + 3,
      );
      assert.equal(
        (await customer.request("orders/cancel", { orderId })).status,
        409,
      );
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "silk")).stock,
        before + 3,
      );
    },
  );
  await t.test(
    "owner can edit prices with stale-write protection; customers cannot",
    async () => {
      assert.equal(
        (
          await owner.request("auth/login", {
            email: "owner@example.test",
            password: process.env.ADMIN_PASSWORD,
          })
        ).status,
        200,
      );
      const admin = (await owner.request("admin")).body;
      const p = admin.products.find((p) => p.id === "silk");
      const update = {
        ...p,
        active: !!p.active,
        featured: !!p.featured,
        price: 9600,
      };
      assert.equal(
        (await customer.request("admin/products", update)).status,
        403,
      );
      assert.equal((await owner.request("admin/products", update)).status, 200);
      assert.equal((await owner.request("admin/products", update)).status, 409);
      assert.equal(
        (await guest.request("state")).body.products.find(
          (p) => p.id === "silk",
        ).price,
        9600,
      );
    },
  );
  await t.test(
    "expired stock is excluded from sale and batch changes are audited",
    async () => {
      const p = "amul";
      const before = (await one("SELECT stock FROM products WHERE id=$1", p))
        .stock;
      assert.equal(
        (
          await owner.request("admin/stock", {
            productId: p,
            delta: 4,
            reason: "Test receipt",
            lot: "TEST-BATCH",
            supplier: "Test Supplier",
            expiresOn: "2030-01-01",
          })
        ).status,
        200,
      );
      const expired = (
        await all("SELECT * FROM batches WHERE product_id=$1", p)
      )[0];
      await run(
        "UPDATE batches SET expires_on=$1 WHERE id=$2",
        "2020-01-01",
        expired.id,
      );
      const item = (await guest.request("state")).body.products.find(
        (p) => p.id === "amul",
      );
      assert.equal(item.stock, before + 4);
      assert.equal(item.available_stock, 4);
      assert.equal(
        (await other.request("cart", { productId: p, quantity: 5 })).status,
        409,
      );
      assert.equal(
        (
          await owner.request("admin/stock", {
            productId: p,
            delta: -99,
            reason: "Bad remove",
            batchId: expired.id,
          })
        ).status,
        400,
      );
      assert.ok(
        await one("SELECT id FROM audit_log WHERE action='inventory.adjusted'"),
      );
    },
  );
  await t.test("parallel buyers cannot oversell the final unit", async () => {
    const pid = "kitkat";
    await run("UPDATE products SET stock=1 WHERE id=$1", pid);
    await run("UPDATE batches SET quantity=1 WHERE product_id=$1", pid);
    await customer.request("cart", { productId: pid, quantity: 1 });
    await other.request("cart", { productId: "silk", quantity: 0 });
    await other.request("cart", { productId: pid, quantity: 1 });
    const a = await other.request("addresses", {
      name: "Other Demo",
      phone: "9876543211",
      line1: "15 Demo Road",
      line2: "",
      area: "Bandra",
      pincode: "400050",
    });
    const [a1, a2] = await Promise.all([
      customer.request("checkout", {
        addressId,
        paymentMethod: "credit_card",
        expectedTotal: 10900,
        idempotencyKey: randomUUID(),
      }),
      other.request("checkout", {
        addressId: a.body.id,
        paymentMethod: "debit_card",
        expectedTotal: 10900,
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.deepEqual([a1.status, a2.status].sort(), [201, 409]);
    assert.equal(
      (await one("SELECT stock FROM products WHERE id=$1", pid)).stock,
      0,
    );
    orderId = a1.status === 201 ? a1.body.id : a2.body.id;
  });
  await t.test(
    "fulfillment validates transitions and tracking; refunds require approved returns",
    async () => {
      assert.equal(
        (await owner.request("admin/orders", { orderId, status: "delivered" }))
          .status,
        409,
      );
      assert.equal(
        (await owner.request("admin/orders", { orderId, status: "packing" }))
          .status,
        200,
      );
      assert.equal(
        (await owner.request("admin/orders", { orderId, status: "shipped" }))
          .status,
        400,
      );
      assert.equal(
        (
          await owner.request("admin/orders", {
            orderId,
            status: "shipped",
            tracking: "Test Courier TEST-1",
          })
        ).status,
        200,
      );
      assert.equal(
        (await owner.request("admin/orders", { orderId, status: "delivered" }))
          .status,
        200,
      );
      assert.equal(
        (await owner.request("admin/orders", { orderId, status: "refunded" }))
          .status,
        409,
      );
      const request = await customer.request("returns", {
        orderId,
        reason: "The sample package arrived damaged.",
      });
      assert.equal(request.status, 201);
      const r = await one("SELECT * FROM returns WHERE order_id=$1", orderId);
      assert.equal(
        (await owner.request("admin/returns", { id: r.id, status: "approved" }))
          .status,
        200,
      );
      assert.equal(
        (await owner.request("admin/orders", { orderId, status: "refunded" }))
          .status,
        200,
      );
      assert.equal(
        (await one("SELECT stock FROM products WHERE id=$1", "kitkat")).stock,
        0,
      );
    },
  );
  await t.test(
    "password reset expires existing sessions and codes cannot be reused",
    async () => {
      await customer.request("auth/forgot", { email });
      const code = (
        await one(
          "SELECT body FROM outbox WHERE email=$1 ORDER BY id DESC",
          email,
        )
      ).body.match(/\b\d{6}\b/)[0];
      assert.equal(
        (
          await customer.request("auth/reset", {
            email,
            code,
            password: "NewChocolatePassword!2026",
          })
        ).status,
        200,
      );
      assert.equal((await customer.request("state")).body.user, null);
      assert.equal(
        (await customer.request("auth/login", { email, password })).status,
        401,
      );
      assert.equal(
        (
          await customer.request("auth/login", {
            email,
            password: "NewChocolatePassword!2026",
          })
        ).status,
        200,
      );
      assert.equal(
        (await customer.request("auth/reset", { email, code, password }))
          .status,
        400,
      );
    },
  );
  await t.test(
    "stock and batches reconcile after checkout and cancellation",
    async () => {
      for (const p of await all("SELECT id,stock FROM products"))
        assert.equal(
          p.stock,
          (
            await one(
              "SELECT COALESCE(SUM(quantity),0) AS n FROM batches WHERE product_id=$1",
              p.id,
            )
          ).n,
          p.id,
        );
    },
  );
});
