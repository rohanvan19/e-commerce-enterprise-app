"use client";
import { useState } from "react";
import { Upload, CheckCircle2, ShieldCheck } from "lucide-react";
import { api, money, date, methodNames } from "@/lib/client";
import { Choice, Field, Check, Status } from "./shared";
import type { Product, Batch, Coupon, Order, Config } from "@/lib/types";
import { toast } from "sonner";
type Done = { onDone: () => Promise<void> };
const rupees = (f: FormData, key: string) =>
  Math.round(Number(f.get(key)) * 100);
export function ProductEditor({
  product: p,
  onDone,
}: { product: Product | null } & Done) {
  const [category, setCategory] = useState(p?.category || "Milk chocolate"),
    [active, setActive] = useState(p ? !!p.active : true),
    [featured, setFeatured] = useState(p ? !!p.featured : false),
    [color, setColor] = useState(p?.color || "sand"),
    [image, setImage] = useState(p?.image || "/images/silk.png"),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fields = Object.fromEntries(f);
    setBusy(true);
    setError("");
    try {
      await api("admin/products", {
        ...fields,
        id: p?.id,
        version: p?.version,
        category,
        active,
        featured,
        color,
        image,
        price: rupees(f, "price"),
        mrp: rupees(f, "mrp"),
        cost: rupees(f, "cost"),
        reorder_level: Number(f.get("reorder_level")),
        tax_bps: Math.round(Number(f.get("tax_bps")) * 100),
      });
      await onDone();
      toast.success("Product saved. The shop has been updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const r = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      const data = (await r.json()) as { error?: string; image: string };
      if (!r.ok) throw new Error(data.error);
      setImage(data.image);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="product-edit-image">
        <img src={image} alt="Product preview" />
        <div>
          <label className="button outline small">
            <Upload size={16} />
            {uploading ? "Uploading…" : "Upload product photo"}
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <p className="muted text-small">PNG, JPEG or WebP. Up to 5 MB.</p>
        </div>
      </div>
      <div className="form-two">
        <Field label="Product name">
          <input
            name="name"
            defaultValue={p?.name}
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Brand">
          <input name="brand" defaultValue={p?.brand} maxLength={60} required />
        </Field>
      </div>
      <div className="form-two">
        <Field label="SKU">
          <input
            name="sku"
            defaultValue={p?.sku}
            minLength={3}
            maxLength={60}
            required
          />
        </Field>
        <Field label="Weight / variant">
          <input
            name="weight"
            defaultValue={p?.weight}
            placeholder="e.g. 60 g, Medium, 1 kg"
            maxLength={40}
            required
          />
        </Field>
      </div>
      <div className="form-two">
        <Field label="Category">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="categories"
            minLength={2}
            maxLength={60}
            required
          />
          <datalist id="categories">
            {[
              "Milk chocolate",
              "Dark chocolate",
              "Wafers & bites",
              "Gift boxes",
              "Food",
              "Clothing",
            ].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Card colour">
          <Choice
            value={color}
            onChange={setColor}
            label="Card colour"
            options={["lavender", "pink", "sand", "green"]}
          />
        </Field>
      </div>
      <div className="form-three">
        <Field label="Selling price (₹)">
          <input
            type="number"
            name="price"
            min="0.01"
            max="100000"
            step="0.01"
            defaultValue={p ? p.price / 100 : ""}
            required
          />
        </Field>
        <Field label="MRP (₹)">
          <input
            type="number"
            name="mrp"
            min="0.01"
            max="100000"
            step="0.01"
            defaultValue={p ? p.mrp / 100 : ""}
            required
          />
        </Field>
        <Field label="Unit cost (₹)">
          <input
            type="number"
            name="cost"
            min="0"
            max="100000"
            step="0.01"
            defaultValue={p ? p.cost / 100 : 0}
            required
          />
        </Field>
      </div>
      <div className="form-two">
        <Field label="Reorder threshold">
          <input
            type="number"
            name="reorder_level"
            min="0"
            max="100000"
            step="1"
            defaultValue={p?.reorder_level ?? 10}
            required
          />
        </Field>
        <Field label="Included sample tax (%)">
          <input
            type="number"
            name="tax_bps"
            min="0"
            max="100"
            step="0.01"
            defaultValue={p ? p.tax_bps / 100 : 18}
            required
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          name="description"
          minLength={10}
          maxLength={2000}
          defaultValue={p?.description}
          required
        />
      </Field>
      <Field label="Ingredients / material details">
        <textarea
          name="ingredients"
          minLength={2}
          maxLength={2000}
          defaultValue={p?.ingredients}
          required
        />
      </Field>
      <Field label="Allergens / care information">
        <textarea
          name="allergens"
          minLength={2}
          maxLength={1000}
          defaultValue={p?.allergens}
          required
        />
      </Field>
      <div className="flex-actions">
        <Check checked={active} onChange={setActive}>
          Visible in the shop
        </Check>
        <Check checked={featured} onChange={setFeatured}>
          Featured product
        </Check>
      </div>
      <p className="text-small muted">
        Each SKU is one sellable variant. Add another SKU for a different size
        or weight. Receive stock in Inventory after saving.
      </p>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <button className="button" disabled={busy || uploading}>
        {busy ? "Saving…" : "Save product"}
      </button>
    </form>
  );
}
export function StockEditor({
  product: p,
  batches,
  onDone,
}: { product: Product; batches: Batch[] } & Done) {
  const [type, setType] = useState("receive"),
    [batchId, setBatchId] = useState(
      batches.find((b) => b.quantity > 0)?.id || "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("admin/stock", {
        productId: p.id,
        delta: Number(f.get("quantity")) * (type === "receive" ? 1 : -1),
        reason: String(f.get("reason")),
        lot: String(f.get("lot") || ""),
        supplier: String(f.get("supplier") || ""),
        expiresOn: type === "receive" ? String(f.get("expiresOn")) : undefined,
        batchId: type === "remove" ? batchId : undefined,
      });
      await onDone();
      toast.success("Stock updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="notice">
        {p.stock} units on hand · {p.available_stock} sellable
      </div>
      <Field label="Adjustment type">
        <Choice
          label="Adjustment type"
          value={type}
          onChange={setType}
          options={[
            { value: "receive", label: "Receive new stock" },
            {
              value: "remove",
              label: "Remove damaged, expired or missing stock",
            },
          ]}
        />
      </Field>
      <Field label="Quantity">
        <input
          name="quantity"
          type="number"
          min="1"
          max="100000"
          step="1"
          required
        />
      </Field>
      {type === "receive" ? (
        <>
          <div className="form-two">
            <Field label="Batch / lot number">
              <input name="lot" maxLength={80} required />
            </Field>
            <Field label="Expiry date">
              <input
                name="expiresOn"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
          </div>
          <Field label="Supplier">
            <input name="supplier" maxLength={120} required />
          </Field>
        </>
      ) : (
        <Field label="Batch to remove from">
          <Choice
            value={batchId}
            onChange={setBatchId}
            label="Batch to remove from"
            options={batches
              .filter((b) => b.quantity > 0)
              .map((b) => ({
                value: b.id,
                label: b.lot + " · " + b.quantity + " units · " + b.expires_on,
              }))}
          />
        </Field>
      )}
      <Field label="Reason for adjustment">
        <textarea
          name="reason"
          placeholder="e.g. Received supplier invoice INV-1042"
          minLength={4}
          maxLength={300}
          required
        />
      </Field>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <button
        className="button"
        disabled={busy || (type === "remove" && !batchId)}
      >
        {busy ? "Updating…" : "Record stock adjustment"}
      </button>
    </form>
  );
}
export function CouponEditor({
  coupon: c,
  onDone,
}: { coupon: Coupon | null } & Done) {
  const [active, setActive] = useState(c ? !!c.active : true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("admin/coupons", {
        code: String(f.get("code")).toUpperCase(),
        percent: Number(f.get("percent")),
        min_total: rupees(f, "min_total"),
        max_discount: rupees(f, "max_discount"),
        usage_limit: Number(f.get("usage_limit")),
        expires_on: String(f.get("expires_on")),
        active,
      });
      await onDone();
      toast.success("Offer saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Offer code">
        <input
          name="code"
          defaultValue={c?.code}
          readOnly={!!c}
          pattern="[A-Za-z0-9]{3,20}"
          maxLength={20}
          required
        />
      </Field>
      <div className="form-two">
        <Field label="Discount (%)">
          <input
            name="percent"
            type="number"
            min="1"
            max="80"
            step="1"
            defaultValue={c?.percent ?? 10}
            required
          />
        </Field>
        <Field label="Minimum spend (₹)">
          <input
            name="min_total"
            type="number"
            min="0"
            step="0.01"
            defaultValue={c ? c.min_total / 100 : 199}
            required
          />
        </Field>
      </div>
      <div className="form-two">
        <Field label="Maximum savings (₹)">
          <input
            name="max_discount"
            type="number"
            min="1"
            step="0.01"
            defaultValue={c ? c.max_discount / 100 : 100}
            required
          />
        </Field>
        <Field label="Total usage limit">
          <input
            name="usage_limit"
            type="number"
            min="1"
            max="100000"
            step="1"
            defaultValue={c?.usage_limit ?? 100}
            required
          />
        </Field>
      </div>
      <Field label="Valid through">
        <input
          name="expires_on"
          type="date"
          defaultValue={c?.expires_on}
          required
        />
      </Field>
      <Check checked={active} onChange={setActive}>
        Offer is active
      </Check>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save offer"}
      </button>
    </form>
  );
}
export function OrderEditor({ order: o, onDone }: { order: Order } & Done) {
  const [status, setStatus] = useState(""),
    [tracking, setTracking] = useState(o.tracking),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const transitions: Record<string, string[]> = {
    confirmed: ["packing", "cancelled"],
    packing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: o.return_request?.status === "approved" ? ["refunded"] : [],
    cancelled: [],
    refunded: [],
  };
  async function action(path: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, data);
      await onDone();
      setStatus("");
      toast.success("Order updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <div className="flex-actions">
        <Status value={o.status} />
        <Status value={o.payment_status} />
      </div>
      <div className="form-two">
        <div>
          <h3>{o.customer_name}</h3>
          <p className="muted text-small">
            {o.customer_email}
            <br />
            {o.shipping_address.phone}
          </p>
        </div>
        <div>
          <strong>{money(o.total)}</strong>
          <p className="text-small muted">
            {methodNames[o.payment_method]} · {date(o.created_at)}
          </p>
        </div>
      </div>
      <div className="notice">
        <strong>Delivery address</strong>
        <p>
          {o.shipping_address.name}
          <br />
          {o.shipping_address.line1}, {o.shipping_address.line2}
          <br />
          {o.shipping_address.area}, Mumbai {o.shipping_address.pincode}
        </p>
      </div>
      <div className="order-detail-items">
        {o.items.map((i) => (
          <div key={i.product_id}>
            <img src={i.image} alt={i.name} />
            <span>
              <strong>{i.name}</strong>
              <small>
                {i.sku} · Qty {i.quantity}
              </small>
            </span>
            <strong>{money(i.quantity * i.price)}</strong>
          </div>
        ))}
      </div>
      {o.gift_note && <div className="notice">Gift note: {o.gift_note}</div>}
      {o.return_request && (
        <section className="return-panel">
          <h3>Return {o.return_request.status}</h3>
          <p>{o.return_request.reason}</p>
          {o.return_request.status === "requested" && (
            <div className="flex-actions">
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void action("admin/returns", {
                    id: o.return_request!.id,
                    status: "approved",
                  })
                }
              >
                Approve return
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void action("admin/returns", {
                    id: o.return_request!.id,
                    status: "declined",
                  })
                }
              >
                Decline return
              </button>
            </div>
          )}
        </section>
      )}
      {transitions[o.status]?.length > 0 && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action("admin/orders", { orderId: o.id, status, tracking });
          }}
        >
          <Field label="Move order to">
            <Choice
              value={status}
              onChange={setStatus}
              label="Choose next status"
              options={transitions[o.status].map((s) => ({
                value: s,
                label: (
                  {
                    packing: "Packing",
                    shipped: "Shipped",
                    delivered: "Delivered",
                    cancelled: "Cancel & refund test payment",
                    refunded: "Refund test payment",
                  } as Record<string, string>
                )[s],
              }))}
            />
          </Field>
          {status === "shipped" && (
            <Field label="Carrier & tracking reference">
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                maxLength={200}
                placeholder="e.g. Local courier · MUM-1204"
                required
              />
            </Field>
          )}
          {status === "cancelled" && (
            <p className="notice">
              Cancellation restores the original stock batches and records a
              simulated refund.
            </p>
          )}
          {status === "refunded" && (
            <p className="notice">
              A simulated full refund is recorded. Returned food is not
              restocked automatically; inspect it before any manual stock
              adjustment.
            </p>
          )}
          <button className="button" disabled={busy || !status}>
            {busy ? "Updating…" : "Update order"}
          </button>
        </form>
      )}
      {o.tracking && <p className="muted text-small">Tracking: {o.tracking}</p>}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <a
        className="text-button"
        target="_blank"
        rel="noreferrer"
        href={"/receipt/" + o.id}
      >
        Open printable receipt
      </a>
    </div>
  );
}
export function SettingsEditor({
  config: c,
  onDone,
}: { config: Config } & Done) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("admin/settings", {
        shipping: rupees(f, "shipping"),
        freeShipping: rupees(f, "freeShipping"),
        deliveryWindow: String(f.get("deliveryWindow")),
        pincodes: Array.from(
          new Set(
            String(f.get("pincodes"))
              .split(/[\s,]+/)
              .filter(Boolean),
          ),
        ),
      });
      await onDone();
      toast.success("Delivery settings updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <form className="panel form-stack" onSubmit={submit}>
        <h2>Delivery across the neighbourhood</h2>
        <div className="form-two">
          <Field label="Delivery fee (₹)">
            <input
              name="shipping"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              defaultValue={c.shipping / 100}
              required
            />
          </Field>
          <Field label="Free delivery from (₹)">
            <input
              name="freeShipping"
              type="number"
              min="0"
              max="100000"
              step="0.01"
              defaultValue={c.freeShipping / 100}
              required
            />
          </Field>
        </div>
        <Field label="Delivery estimate">
          <input
            name="deliveryWindow"
            defaultValue={c.deliveryWindow}
            minLength={3}
            maxLength={100}
            required
          />
        </Field>
        <Field
          label="Supported pincodes"
          hint="Separate exact six-digit pincodes with commas or new lines."
        >
          <textarea
            className="pincodes-input"
            name="pincodes"
            defaultValue={c.pincodes.join(", ")}
            required
          />
        </Field>
        <p className="muted text-small">
          The server checks every shipping address against this list. Free
          shipping is based on the subtotal after discounts.
        </p>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save delivery settings"}
        </button>
      </form>
      <section className="panel">
        <ShieldCheck size={25} />
        <h2 className="space-top">Local, by design.</h2>
        <p className="muted">
          Your store is running in test mode. These services are simulated
          locally:
        </p>
        <ul className="service-list">
          <li>
            <CheckCircle2 size={17} /> Credit & debit card payments
          </li>
          <li>
            <CheckCircle2 size={17} /> Google Pay, UPI & net banking
          </li>
          <li>
            <CheckCircle2 size={17} /> PayPal payments
          </li>
          <li>
            <CheckCircle2 size={17} /> Verification & order emails
          </li>
        </ul>
        <p className="notice">
          No credentials for a payment or email provider are configured. Live
          payments and public deployment are disabled.
        </p>
        <p className="muted text-small space-top">
          Sample tax rates, prices, expiry dates, stock and delivery policies
          are editable demonstration data.
        </p>
      </section>
    </div>
  );
}
