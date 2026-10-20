import { z } from "zod";
import { one, all, run, id, transaction, changed, config } from "./db.mjs";
import { fail } from "./auth.mjs";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(150).default(""),
  area: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/),
});
export const productSchema = z
  .object({
    id: z.string().optional(),
    version: z.number().int().optional(),
    sku: z.string().trim().min(3).max(60),
    name: z.string().trim().min(2).max(120),
    brand: z.string().trim().min(1).max(60),
    category: z.string().trim().min(2).max(60),
    weight: z.string().trim().min(1).max(40),
    description: z.string().trim().min(10).max(2000),
    ingredients: z.string().trim().min(2).max(2000),
    allergens: z.string().trim().min(2).max(1000),
    image: z
      .string()
      .regex(/^\/images\/[a-zA-Z0-9_.-]+$/, "Choose a local product image."),
    price: z.number().int().min(1).max(10000000),
    mrp: z.number().int().min(1).max(10000000),
    cost: z.number().int().min(0).max(10000000),
    reorder_level: z.number().int().min(0).max(100000),
    active: z.boolean(),
    featured: z.boolean(),
    color: z.enum(["lavender", "pink", "sand", "green"]),
    tax_bps: z.number().int().min(0).max(10000),
  })
  .refine((p) => p.mrp >= p.price, {
    message: "MRP must be at least the selling price.",
  });
export async function catalogue(includeInactive = false) {
  const rows = await all(
    `SELECT p.*,COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id=p.id AND b.expires_on>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),0) AS available_stock,(SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id) AS rating,(SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id) AS review_count FROM products p ${includeInactive ? "" : "WHERE p.active=1"} ORDER BY p.featured DESC,p.display_order,p.id`,
  );
  return includeInactive ? rows : rows.map(({ cost, ...p }) => p);
}
export async function cartItems(cartId) {
  return (
    await all(
      "SELECT p.*,ci.quantity,COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id=p.id AND b.expires_on>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),0) AS available_stock FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1",
      cartId,
    )
  ).map(({ cost, ...p }) => p);
}
export async function quote(cartId, userId, code = "", pincode = "") {
  const items = await cartItems(cartId);
  if (!items.length) fail(400, "Your bag is empty.");
  for (const p of items) {
    if (!p.active)
      fail(409, `${p.name} is no longer available. Remove it from your bag.`);
    if (p.quantity > p.available_stock)
      fail(
        409,
        `Only ${p.available_stock} of ${p.name} are available. Please update your bag.`,
      );
  }
  const cfg = await config();
  if (pincode && !cfg.pincodes.includes(pincode))
    fail(
      400,
      "We do not deliver to that pincode yet. Please choose a supported Mumbai address.",
    );
  const subtotal = items.reduce((s, p) => s + p.quantity * p.price, 0);
  let discount = 0;
  const couponCode = code.trim().toUpperCase();
  if (couponCode) {
    const coupon = await one(
      "SELECT * FROM coupons WHERE code=$1 AND active=1 AND expires_on>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date",
      couponCode,
    );
    if (!coupon) fail(400, "That offer code is invalid or has expired.");
    if (subtotal < coupon.min_total)
      fail(
        400,
        `This offer needs a bag of at least ₹${coupon.min_total / 100}.`,
      );
    if (
      (
        await one(
          "SELECT COUNT(*) AS n FROM orders WHERE coupon=$1 AND status NOT IN ('cancelled','refunded')",
          couponCode,
        )
      ).n >= coupon.usage_limit
    )
      fail(400, "This offer has reached its usage limit.");
    if (
      userId &&
      (await one(
        "SELECT id FROM orders WHERE user_id=$1 AND coupon=$2 AND status NOT IN ('cancelled','refunded')",
        userId,
        couponCode,
      ))
    )
      fail(400, "You have already used this offer.");
    discount = Math.min(
      coupon.max_discount,
      Math.floor((subtotal * coupon.percent) / 100),
    );
  }
  const shipping = subtotal - discount >= cfg.freeShipping ? 0 : cfg.shipping;
  let assignedDiscount = 0;
  const tax = items.reduce((sum, p, i) => {
    const amount = p.price * p.quantity;
    const part =
      i === items.length - 1
        ? discount - assignedDiscount
        : Math.floor((discount * amount) / subtotal);
    assignedDiscount += part;
    return (
      sum + Math.round(((amount - part) * p.tax_bps) / (10000 + p.tax_bps))
    );
  }, 0);
  return {
    items,
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotal - discount + shipping,
    coupon: couponCode,
    currency: "INR",
  };
}
export const checkoutSchema = z.object({
  addressId: z.string().min(1),
  coupon: z.string().max(30).default(""),
  giftNote: z.string().trim().max(250).default(""),
  paymentMethod: z.enum([
    "credit_card",
    "debit_card",
    "gpay",
    "upi",
    "netbanking",
    "paypal",
  ]),
  outcome: z.enum(["success", "decline"]).default("success"),
  idempotencyKey: z.string().uuid(),
  expectedTotal: z.number().int().positive(),
});
export async function orderDetail(orderId, userId, admin = false) {
  const order = await one("SELECT * FROM orders WHERE id=$1", orderId);
  if (!order || (!admin && order.user_id !== userId))
    fail(404, "Order not found.");
  return {
    ...order,
    shipping_address: JSON.parse(order.shipping_address),
    items: await all("SELECT * FROM order_items WHERE order_id=$1", order.id),
    return_request:
      (await one("SELECT * FROM returns WHERE order_id=$1", order.id)) || null,
  };
}
export async function hydrateOrders(rows) {
  if (!rows.length) return [];
  const ids = rows.map((o) => o.id);
  const items = await all(
    "SELECT * FROM order_items WHERE order_id=ANY($1::text[]) ORDER BY id",
    ids,
  );
  const returns = await all(
    "SELECT * FROM returns WHERE order_id=ANY($1::text[])",
    ids,
  );
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.order_id)) grouped.set(item.order_id, []);
    grouped.get(item.order_id).push(item);
  }
  const requests = new Map(returns.map((r) => [r.order_id, r]));
  return rows.map((o) => ({
    ...o,
    shipping_address: JSON.parse(o.shipping_address),
    items: grouped.get(o.id) || [],
    return_request: requests.get(o.id) || null,
  }));
}
export async function userOrders(userId) {
  return hydrateOrders(
    await all(
      "SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC,id DESC",
      userId,
    ),
  );
}
export async function placeOrder(user, cartId, input, requestHash) {
  const data = checkoutSchema.parse(input);
  return await transaction(async () => {
    // Serialize duplicate requests before checking their persisted result.
    await one(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      "checkout:" + data.idempotencyKey,
    );
    await one("SELECT id FROM carts WHERE id=$1 FOR UPDATE", cartId);
    const old = await one(
      "SELECT * FROM orders WHERE idempotency_key=$1",
      data.idempotencyKey,
    );
    if (old) {
      if (old.user_id !== user.id || old.request_hash !== requestHash)
        fail(
          409,
          "This checkout key was already used for a different request.",
        );
      return await orderDetail(old.id, user.id);
    }
    const address = await one(
      "SELECT * FROM addresses WHERE id=$1 AND user_id=$2",
      data.addressId,
      user.id,
    );
    if (!address) fail(400, "Choose a saved delivery address.");
    // All inventory writers lock products first, in stable order. Different products remain concurrent.
    await all(
      "SELECT p.id FROM products p JOIN cart_items ci ON ci.product_id=p.id WHERE ci.cart_id=$1 ORDER BY p.id FOR UPDATE OF p",
      cartId,
    );
    if (data.coupon.trim())
      await one(
        "SELECT code FROM coupons WHERE code=$1 FOR UPDATE",
        data.coupon.trim().toUpperCase(),
      );
    await all("SELECT key FROM settings ORDER BY key FOR SHARE");
    const totals = await quote(cartId, user.id, data.coupon, address.pincode);
    if (totals.total !== data.expectedTotal)
      fail(409, "Your total changed. Review the updated total before paying.");
    if (data.outcome === "decline")
      fail(
        402,
        "Test payment declined. Your bag is safe; no stock was deducted.",
      );
    const orderId =
      "CL-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      id().replaceAll("-", "").slice(0, 16).toUpperCase();
    await run(
      "INSERT INTO orders(id,user_id,status,payment_method,subtotal,discount,shipping,tax,total,coupon,shipping_address,gift_note,idempotency_key,request_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      orderId,
      user.id,
      "confirmed",
      data.paymentMethod,
      totals.subtotal,
      totals.discount,
      totals.shipping,
      totals.tax,
      totals.total,
      totals.coupon || null,
      JSON.stringify(address),
      data.giftNote,
      data.idempotencyKey,
      requestHash,
    );
    for (const p of totals.items) {
      const updated = await run(
        "UPDATE products SET stock=stock-$1,version=version+1 WHERE id=$2 AND stock>=$3",
        p.quantity,
        p.id,
        p.quantity,
      );
      if (updated.changes !== 1)
        fail(409, "Stock changed. Please review your bag.");
      let remaining = p.quantity;
      for (const batch of await all(
        "SELECT * FROM batches WHERE product_id=$1 AND quantity>0 AND expires_on>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date ORDER BY expires_on,created_at",
        p.id,
      )) {
        const n = Math.min(remaining, batch.quantity);
        if (n) {
          await run(
            "UPDATE batches SET quantity=quantity-$1 WHERE id=$2",
            n,
            batch.id,
          );
          await run(
            "INSERT INTO order_allocations(order_id,batch_id,quantity) VALUES ($1,$2,$3)",
            orderId,
            batch.id,
            n,
          );
          remaining -= n;
        }
      }
      if (remaining)
        fail(409, "Available batch stock changed. Please try again.");
      await run(
        "INSERT INTO order_items(order_id,product_id,name,sku,weight,image,quantity,price,tax_bps) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        orderId,
        p.id,
        p.name,
        p.sku,
        p.weight,
        p.image,
        p.quantity,
        p.price,
        p.tax_bps,
      );
      await run(
        "INSERT INTO stock_movements(product_id,delta,reason,actor) VALUES ($1,$2,$3,$4)",
        p.id,
        -p.quantity,
        "Order " + orderId,
        user.id,
      );
    }
    await run("DELETE FROM cart_items WHERE cart_id=$1", cartId);
    await run(
      "INSERT INTO outbox(email,subject,body) VALUES ($1,$2,$3)",
      user.email,
      "Your Cocoa Local order " + orderId,
      `Thank you, ${user.name}. Your test order ${orderId} is confirmed. Total: ₹${(totals.total / 100).toFixed(2)}. No real payment was made. Follow its progress in your account.`,
    );
    await changed(user.id, "order.created", { orderId, total: totals.total });
    return await orderDetail(orderId, user.id);
  });
}
export async function restoreOrderStock(order) {
  await all(
    "SELECT p.id FROM products p WHERE p.id IN (SELECT b.product_id FROM batches b JOIN order_allocations a ON a.batch_id=b.id WHERE a.order_id=$1) ORDER BY p.id FOR UPDATE",
    order.id,
  );
  for (const allocation of await all(
    "SELECT a.*,b.product_id FROM order_allocations a JOIN batches b ON b.id=a.batch_id WHERE a.order_id=$1 ORDER BY b.product_id,b.id",
    order.id,
  )) {
    await run(
      "UPDATE batches SET quantity=quantity+$1 WHERE id=$2",
      allocation.quantity,
      allocation.batch_id,
    );
    await run(
      "UPDATE products SET stock=stock+$1,version=version+1 WHERE id=$2",
      allocation.quantity,
      allocation.product_id,
    );
    await run(
      "INSERT INTO stock_movements(product_id,delta,reason,actor) VALUES ($1,$2,$3,$4)",
      allocation.product_id,
      allocation.quantity,
      "Cancelled " + order.id,
      "system",
    );
  }
}
export async function transitionOrder(actor, orderId, status, tracking = "") {
  return await transaction(async () => {
    const order = await one(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      orderId,
    );
    if (!order) fail(404, "Order not found.");
    const isAdmin = actor.role === "admin";
    if (!isAdmin && order.user_id !== actor.id) fail(404, "Order not found.");
    const transitions = {
      confirmed: ["packing", "cancelled"],
      packing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: ["refunded"],
      cancelled: [],
      refunded: [],
    };
    if (!transitions[order.status].includes(status))
      fail(409, `Cannot change ${order.status} to ${status}.`);
    if (!isAdmin && (status !== "cancelled" || order.status !== "confirmed"))
      fail(403, "Only unprocessed orders can be cancelled by the customer.");
    if (status === "shipped" && !tracking.trim())
      fail(400, "Add a carrier and tracking reference before shipping.");
    if (
      status === "refunded" &&
      !(await one(
        "SELECT id FROM returns WHERE order_id=$1 AND status='approved'",
        orderId,
      ))
    )
      fail(409, "Approve a return request before refunding this order.");
    if (status === "cancelled") await restoreOrderStock(order);
    await run(
      "UPDATE orders SET status=$1,payment_status=$2,tracking=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4",
      status,
      ["cancelled", "refunded"].includes(status)
        ? "test_refunded"
        : order.payment_status,
      tracking || order.tracking,
      orderId,
    );
    await changed(actor.id, "order." + status, { orderId });
    return await orderDetail(orderId, actor.id, isAdmin);
  });
}
export async function adjustStock(actor, input) {
  const data = z
    .object({
      productId: z.string(),
      delta: z
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(4).max(300),
      lot: z.string().trim().max(80).default(""),
      supplier: z.string().trim().max(120).default(""),
      expiresOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      batchId: z.string().optional(),
    })
    .parse(input);
  return await transaction(async () => {
    const p = await one(
      "SELECT * FROM products WHERE id=$1 FOR UPDATE",
      data.productId,
    );
    if (!p) fail(404, "Product not found.");
    if (data.delta > 0) {
      if (
        !data.expiresOn ||
        data.expiresOn < new Date().toISOString().slice(0, 10) ||
        !data.lot ||
        !data.supplier
      )
        fail(400, "New stock needs a lot, supplier and a future expiry date.");
      await run(
        "INSERT INTO batches(id,product_id,lot,supplier,quantity,expires_on) VALUES ($1,$2,$3,$4,$5,$6)",
        id(),
        p.id,
        data.lot,
        data.supplier,
        data.delta,
        data.expiresOn,
      );
    } else {
      if (!data.batchId) fail(400, "Choose the batch to adjust.");
      const batch = await one(
        "SELECT * FROM batches WHERE id=$1 AND product_id=$2",
        data.batchId,
        p.id,
      );
      if (!batch || batch.quantity + data.delta < 0)
        fail(400, "The selected batch does not have enough stock.");
      await run(
        "UPDATE batches SET quantity=quantity+$1 WHERE id=$2",
        data.delta,
        batch.id,
      );
    }
    await run(
      "UPDATE products SET stock=stock+$1,version=version+1 WHERE id=$2",
      data.delta,
      p.id,
    );
    await run(
      "INSERT INTO stock_movements(product_id,delta,reason,actor) VALUES ($1,$2,$3,$4)",
      p.id,
      data.delta,
      data.reason,
      actor.id,
    );
    await changed(actor.id, "inventory.adjusted", data);
    return { ok: true };
  });
}
export async function saveProduct(actor, input) {
  const p = productSchema.parse(input);
  return await transaction(async () => {
    const values = [
      p.sku,
      p.name,
      p.brand,
      p.category,
      p.weight,
      p.description,
      p.ingredients,
      p.allergens,
      p.image,
      p.price,
      p.mrp,
      p.cost,
      p.reorder_level,
      Number(p.active),
      Number(p.featured),
      p.color,
      p.tax_bps,
    ];
    let productId = p.id;
    if (productId) {
      const result = await run(
        "UPDATE products SET sku=$1,name=$2,brand=$3,category=$4,weight=$5,description=$6,ingredients=$7,allergens=$8,image=$9,price=$10,mrp=$11,cost=$12,reorder_level=$13,active=$14,featured=$15,color=$16,tax_bps=$17,version=version+1 WHERE id=$18 AND version=$19",
        ...values,
        productId,
        p.version || 0,
      );
      if (!result.changes)
        fail(
          409,
          "This product changed in another window. Refresh and edit again.",
        );
    } else {
      productId = id();
      await run(
        "INSERT INTO products(sku,name,brand,category,weight,description,ingredients,allergens,image,price,mrp,cost,reorder_level,active,featured,color,tax_bps,id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
        ...values,
        productId,
      );
    }
    await changed(actor.id, "product.saved", { productId, name: p.name });
    return { id: productId };
  });
}
