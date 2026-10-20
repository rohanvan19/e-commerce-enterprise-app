import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  one,
  all,
  run,
  id,
  transaction,
  changed,
  config,
  LOCAL,
  notifyChange,
} from "./db.mjs";
import {
  currentUser,
  publicUser,
  requireUser,
  parseCookies,
  hashPassword,
  checkPassword,
  sessionCookie,
  challenge,
  consumeChallenge,
  rateLimit,
  fail,
  digest,
  cartFor,
  mergeCart,
} from "./auth.mjs";
import {
  catalogue,
  hydrateOrders,
  cartItems,
  quote,
  checkoutSchema,
  placeOrder,
  userOrders,
  orderDetail,
  addressSchema,
  productSchema,
  adjustStock,
  saveProduct,
  transitionOrder,
} from "./commerce.mjs";
import { eventStream } from "./events.mjs";
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
const reply = (data, status = 200, cookie) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
function localGuard(request) {
  const host = request.headers.get("host") || "";
  if (
    !LOCAL ||
    !/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(host)
  )
    fail(403, "This test application is only available on localhost.");
}
function originGuard(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && new URL(origin).host !== host)
    fail(403, "Cross-origin request rejected.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    fail(403, "Cross-site request rejected.");
}
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "Use application/json.");
  if (Number(request.headers.get("content-length") || 0) > 32768)
    fail(413, "Request is too large.");
  const text = await request.text();
  if (text.length > 32768) fail(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    fail(400, "Invalid JSON.");
  }
}
export async function handle(request, path) {
  try {
    localGuard(request);
    const method = request.method;
    const route = path.join("/");
    const url = new URL(request.url);
    if (method === "GET" && route === "events")
      return await eventStream(request);
    if (method !== "GET") originGuard(request);
    if (method === "POST" && route === "admin/upload")
      return await upload(request);
    const b = method === "GET" ? {} : await body(request);
    if (route.startsWith("auth/") && method === "POST")
      return await auth(request, route, b);
    const user = await currentUser(request);
    if (method === "GET" && route === "state") {
      const cart = await cartFor(request, user);
      const cfg = await config();
      return reply(
        {
          products: await catalogue(),
          user: publicUser(user),
          cart: await cartItems(cart.id),
          wishlist: user
            ? (
                await all(
                  "SELECT product_id FROM wishlist WHERE user_id=$1",
                  user.id,
                )
              ).map((r) => r.product_id)
            : [],
          addresses: user
            ? await all(
                "SELECT * FROM addresses WHERE user_id=$1 ORDER BY created_at DESC",
                user.id,
              )
            : [],
          orders: user ? await userOrders(user.id) : [],
          config: cfg,
          mode: "local",
          revision:
            (await one("SELECT last_value AS n FROM events_id_seq")).n || 0,
        },
        200,
        cart.cookie,
      );
    }
    if (method === "GET" && route === "inbox") {
      const email = emailSchema.parse(url.searchParams.get("email"));
      return reply({
        messages: await all(
          "SELECT id,subject,body,created_at FROM outbox WHERE email=$1 ORDER BY id DESC LIMIT 15",
          email,
        ),
      });
    }
    if (method === "GET" && route === "reviews") {
      const productId = z
        .string()
        .min(1)
        .parse(url.searchParams.get("productId"));
      return reply({
        reviews: await all(
          "SELECT r.id,r.rating,r.body,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=$1 ORDER BY r.created_at DESC",
          productId,
        ),
      });
    }
    if (method === "POST" && route === "cart") {
      const data = z
        .object({
          productId: z.string(),
          quantity: z.number().int().min(0).max(99),
        })
        .parse(b);
      const cart = await cartFor(request, user);
      await transaction(async () => {
        await one("SELECT id FROM carts WHERE id=$1 FOR UPDATE", cart.id);
        const product = (await catalogue()).find(
          (p) => p.id === data.productId,
        );
        if (
          data.quantity > 0 &&
          (!product || data.quantity > product.available_stock)
        )
          fail(409, "That quantity is not available.");
        if (data.quantity === 0)
          await run(
            "DELETE FROM cart_items WHERE cart_id=$1 AND product_id=$2",
            cart.id,
            data.productId,
          );
        else
          await run(
            "INSERT INTO cart_items(cart_id,product_id,quantity) VALUES ($1,$2,$3) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=excluded.quantity",
            cart.id,
            data.productId,
            data.quantity,
          );
        await notifyChange(user ? "user:" + user.id : "cart:" + cart.id);
      });
      return reply({ cart: await cartItems(cart.id) }, 200, cart.cookie);
    }
    if (method === "POST" && route === "quote") {
      const data = z
        .object({
          coupon: z.string().max(30).default(""),
          pincode: z.string().max(6).default(""),
        })
        .parse(b);
      return reply(
        await quote(
          (await cartFor(request, user)).id,
          user?.id,
          data.coupon,
          data.pincode,
        ),
      );
    }
    if (route === "admin" && method === "GET") return await adminState(request);
    if (route.startsWith("admin/") && method === "POST")
      return await adminMutation(request, route, b);
    const u = await requireUser(request);
    if (method === "POST" && route === "profile") {
      const data = z
        .object({
          name: z.string().trim().min(2).max(100),
          phone: z.string().regex(/^[6-9]\d{9}$/),
        })
        .parse(b);
      await run(
        "UPDATE users SET name=$1,phone=$2 WHERE id=$3",
        data.name,
        data.phone,
        u.id,
      );
      await changed(u.id, "profile.updated", { userId: u.id });
      return reply({ ok: true });
    }
    if (method === "POST" && route === "addresses") {
      const data = addressSchema.parse(b);
      if (
        (await all("SELECT id FROM addresses WHERE user_id=$1", u.id)).length >=
        10
      )
        fail(400, "You can save up to 10 addresses.");
      const aid = id();
      await run(
        "INSERT INTO addresses(id,user_id,name,phone,line1,line2,area,pincode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        aid,
        u.id,
        data.name,
        data.phone,
        data.line1,
        data.line2,
        data.area,
        data.pincode,
      );
      await notifyChange("user:" + u.id);
      return reply({ id: aid }, 201);
    }
    if (method === "PATCH" && route === "addresses") {
      const aid = z.string().min(1).parse(b.id);
      const data = addressSchema.parse(b);
      const updated = await one(
        "UPDATE addresses SET name=$1,phone=$2,line1=$3,line2=$4,area=$5,pincode=$6 WHERE id=$7 AND user_id=$8 RETURNING id",
        data.name,
        data.phone,
        data.line1,
        data.line2,
        data.area,
        data.pincode,
        aid,
        u.id,
      );
      if (!updated) fail(404, "Address not found.");
      await notifyChange("user:" + u.id);
      return reply({ id: updated.id });
    }
    if (method === "DELETE" && route === "addresses") {
      const aid = z.string().parse(b.id);
      await run("DELETE FROM addresses WHERE id=$1 AND user_id=$2", aid, u.id);
      await notifyChange("user:" + u.id);
      return reply({ ok: true });
    }
    if (method === "POST" && route === "wishlist") {
      const data = z
        .object({ productId: z.string(), saved: z.boolean() })
        .parse(b);
      if (!(await one("SELECT id FROM products WHERE id=$1", data.productId)))
        fail(404, "Product not found.");
      if (data.saved)
        await run(
          "INSERT INTO wishlist(user_id,product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          u.id,
          data.productId,
        );
      else
        await run(
          "DELETE FROM wishlist WHERE user_id=$1 AND product_id=$2",
          u.id,
          data.productId,
        );
      await notifyChange("user:" + u.id);
      return reply({ ok: true });
    }
    if (method === "POST" && route === "checkout") {
      await rateLimit("checkout:" + u.id, 30);
      const data = checkoutSchema.parse(b);
      return reply(
        await placeOrder(
          u,
          (await cartFor(request, u)).id,
          data,
          digest(JSON.stringify(data)),
        ),
        201,
      );
    }
    if (method === "POST" && route === "orders/cancel") {
      return reply(
        await transitionOrder(u, z.string().parse(b.orderId), "cancelled"),
      );
    }
    if (method === "POST" && route === "returns") {
      const data = z
        .object({
          orderId: z.string(),
          reason: z.string().trim().min(10).max(1000),
        })
        .parse(b);
      const order = await orderDetail(data.orderId, u.id);
      if (order.status !== "delivered")
        fail(400, "Return requests are available after delivery.");
      if (Date.now() - Date.parse(order.updated_at) > 7 * 86400000)
        fail(400, "The demo seven-day return window has ended.");
      await run(
        "INSERT INTO returns(id,order_id,reason) VALUES ($1,$2,$3)",
        id(),
        order.id,
        data.reason,
      );
      await changed(u.id, "return.requested", { orderId: order.id });
      return reply({ ok: true }, 201);
    }
    if (method === "POST" && route === "reviews") {
      const data = z
        .object({
          productId: z.string(),
          rating: z.number().int().min(1).max(5),
          body: z.string().trim().min(5).max(1000),
        })
        .parse(b);
      if (
        !(await one(
          "SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=$1 AND oi.product_id=$2 AND o.status='delivered'",
          u.id,
          data.productId,
        ))
      )
        fail(403, "Reviews are available after you receive this product.");
      await run(
        "INSERT INTO reviews(id,user_id,product_id,rating,body) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(user_id,product_id) DO UPDATE SET rating=excluded.rating,body=excluded.body",
        id(),
        u.id,
        data.productId,
        data.rating,
        data.body,
      );
      await changed(u.id, "review.saved", { productId: data.productId });
      return reply({ ok: true });
    }
    return reply({ error: "Endpoint not found." }, 404);
  } catch (e) {
    if (e instanceof z.ZodError)
      return reply({ error: e.issues.map((i) => i.message).join(" ") }, 400);
    if (e.status) return reply({ error: e.message }, e.status);
    if (e.code === "23505")
      return reply(
        { error: "That record already exists. Refresh and try again." },
        409,
      );
    if (
      ["53300", "57P01", "08006", "ECONNREFUSED", "55P03", "57014"].includes(
        e.code,
      )
    )
      return reply(
        { error: "The store is busy. Please try again shortly." },
        503,
      );
    console.error("[Cocoa API]", e.code || e.name, e.status || "");
    return reply({ error: "Something went wrong. Please try again." }, 500);
  }
}
async function auth(request, route, b) {
  if (route === "auth/logout") {
    const leaving = await currentUser(request);
    const token = parseCookies(request).cocoa_session;
    if (token)
      await run("DELETE FROM sessions WHERE token_hash=$1", digest(token));
    if (leaving) await notifyChange("user:" + leaving.id);

    return reply(
      { ok: true },
      200,
      "cocoa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  }
  const email = emailSchema.parse(b.email);
  await rateLimit(route + ":" + email, 10);
  if (route === "auth/register") {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z
          .string()
          .regex(/^[6-9]\d{9}$/, "Use a valid Indian mobile number."),
        password: passwordSchema,
      })
      .parse(b);
    if (await one("SELECT id FROM users WHERE email=$1", email))
      fail(
        409,
        "An account already uses that email. Sign in or reset your password.",
      );
    const hash = await hashPassword(data.password);
    await run(
      "INSERT INTO users(id,name,email,phone,password_hash) VALUES ($1,$2,$3,$4,$5)",
      id(),
      data.name,
      email,
      data.phone,
      hash,
    );
    await challenge(email, "verify");
    return reply(
      {
        ok: true,
        message: "Check your local test inbox for a verification code.",
      },
      201,
    );
  }
  if (route === "auth/login") {
    const password = z.string().min(1).max(128).parse(b.password);
    const user = await one("SELECT * FROM users WHERE email=$1", email);
    const dummy = "00000000000000000000000000000000:" + "0".repeat(128);
    const valid = await checkPassword(password, user?.password_hash || dummy);
    if (!user || !valid) fail(401, "Email or password is incorrect.");
    if (!user.verified)
      fail(403, "Please verify your email first. Use “Verify email” below.");
    await mergeCart(request, user);
    await notifyChange("user:" + user.id);
    return reply({ user: publicUser(user) }, 200, await sessionCookie(user.id));
  }
  if (route === "auth/verify") {
    const code = z
      .string()
      .regex(/^\d{6}$/)
      .parse(b.code);
    await consumeChallenge(email, "verify", code);
    await run("UPDATE users SET verified=1 WHERE email=$1", email);
    const user = await one("SELECT * FROM users WHERE email=$1", email);
    await mergeCart(request, user);
    await notifyChange("user:" + user.id);
    return reply({ user: publicUser(user) }, 200, await sessionCookie(user.id));
  }
  if (route === "auth/resend") {
    const user = await one("SELECT * FROM users WHERE email=$1", email);
    if (user && !user.verified) await challenge(email, "verify");
    return reply({ ok: true });
  }
  if (route === "auth/forgot") {
    if (await one("SELECT id FROM users WHERE email=$1", email))
      await challenge(email, "reset");
    return reply({
      ok: true,
      message:
        "If that account exists, a reset code is in the local test inbox.",
    });
  }
  if (route === "auth/reset") {
    const code = z
      .string()
      .regex(/^\d{6}$/)
      .parse(b.code);
    const password = passwordSchema.parse(b.password);
    const hash = await hashPassword(password);
    await consumeChallenge(email, "reset", code);
    await transaction(async () => {
      const user = await one("SELECT id FROM users WHERE email=$1", email);
      await run("UPDATE users SET password_hash=$1 WHERE id=$2", hash, user.id);
      await run("DELETE FROM sessions WHERE user_id=$1", user.id);
    });
    return reply({ ok: true });
  }
  fail(404, "Authentication endpoint not found.");
}
async function adminState(request) {
  await requireUser(request, true);
  const products = await catalogue(true);
  const orders = await hydrateOrders(
    await all(
      "SELECT o.*,u.name AS customer_name,u.email AS customer_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC,o.id DESC",
    ),
  );
  return reply({
    products,
    orders,
    customers: await all(
      "SELECT u.id,u.name,u.email,u.phone,u.verified,u.created_at,COUNT(o.id) AS order_count,COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','refunded') THEN o.total ELSE 0 END),0) AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY u.created_at DESC",
    ),
    batches: await all(
      "SELECT b.*,p.name AS product_name FROM batches b JOIN products p ON p.id=b.product_id ORDER BY b.expires_on",
    ),
    movements: await all(
      "SELECT s.*,p.name AS product_name FROM stock_movements s JOIN products p ON p.id=s.product_id ORDER BY s.id DESC LIMIT 100",
    ),
    coupons: await all(
      "SELECT c.*,(SELECT COUNT(*) FROM orders o WHERE o.coupon=c.code AND o.status NOT IN ('cancelled','refunded')) AS used FROM coupons c ORDER BY c.code",
    ),
    audit: await all(
      "SELECT a.*,u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 100",
    ),
    config: await config(),
  });
}
async function adminMutation(request, route, b) {
  const actor = await requireUser(request, true);
  if (route === "admin/products") return reply(await saveProduct(actor, b));
  if (route === "admin/stock") return reply(await adjustStock(actor, b));
  if (route === "admin/orders") {
    const data = z
      .object({
        orderId: z.string(),
        status: z.enum([
          "packing",
          "shipped",
          "delivered",
          "cancelled",
          "refunded",
        ]),
        tracking: z.string().trim().max(200).default(""),
      })
      .parse(b);
    return reply(
      await transitionOrder(actor, data.orderId, data.status, data.tracking),
    );
  }
  if (route === "admin/returns") {
    const data = z
      .object({ id: z.string(), status: z.enum(["approved", "declined"]) })
      .parse(b);
    const r = await run(
      "UPDATE returns SET status=$1 WHERE id=$2 AND status='requested'",
      data.status,
      data.id,
    );
    if (!r.changes) fail(409, "This request has already been processed.");
    await changed(actor.id, "return." + data.status, data);
    return reply({ ok: true });
  }
  if (route === "admin/coupons") {
    const data = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{3,20}$/),
        percent: z.number().int().min(1).max(80),
        min_total: z.number().int().min(0),
        max_discount: z.number().int().positive(),
        usage_limit: z.number().int().positive().max(100000),
        active: z.boolean(),
        expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(b);
    await run(
      "INSERT INTO coupons(code,percent,min_total,max_discount,usage_limit,active,expires_on) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET percent=excluded.percent,min_total=excluded.min_total,max_discount=excluded.max_discount,usage_limit=excluded.usage_limit,active=excluded.active,expires_on=excluded.expires_on",
      data.code,
      data.percent,
      data.min_total,
      data.max_discount,
      data.usage_limit,
      Number(data.active),
      data.expires_on,
    );
    await changed(actor.id, "coupon.saved", { code: data.code });
    return reply({ ok: true });
  }
  if (route === "admin/settings") {
    const data = z
      .object({
        shipping: z.number().int().min(0).max(100000),
        freeShipping: z.number().int().min(0).max(10000000),
        pincodes: z
          .array(z.string().regex(/^\d{6}$/))
          .min(1)
          .max(300),
        deliveryWindow: z.string().trim().min(3).max(100),
      })
      .parse(b);
    await transaction(async () => {
      for (const [key, value] of Object.entries(data))
        await run(
          "UPDATE settings SET value=$1 WHERE key=$2",
          JSON.stringify(value),
          key,
        );
      await changed(actor.id, "settings.updated", data);
    });
    return reply({ ok: true });
  }
  fail(404, "Admin endpoint not found.");
}
async function upload(request) {
  await requireUser(request, true);
  if (Number(request.headers.get("content-length") || 0) > 6 * 1024 * 1024)
    fail(413, "Choose an image smaller than 5 MB.");
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
    fail(400, "Choose a PNG, JPEG or WebP under 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  let ext = "";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    ext = "png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    ext = "jpg";
  else if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    ext = "webp";
  else fail(400, "Only PNG, JPEG and WebP images are supported.");
  const name = "upload-" + id() + "." + ext;
  const dir = join(process.cwd(), "public", "images");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), bytes);
  return reply({ image: "/images/" + name }, 201);
}
