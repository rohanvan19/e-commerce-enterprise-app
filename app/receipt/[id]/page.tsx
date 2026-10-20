"use client";
import { use } from "react";
import { useStore } from "@/components/store-provider";
import { Brand, Loading } from "@/components/shared";
import { api, money, date, methodNames } from "@/lib/client";
import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";
export default function Receipt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state } = useStore();
  const [adminOrder, setAdminOrder] = useState<Order | null>(null);
  useEffect(() => {
    if (state?.user?.role === "admin")
      api("admin")
        .then((d) =>
          setAdminOrder(d.orders.find((o: Order) => o.id === id) || null),
        )
        .catch(() => {});
  }, [state?.user?.role, id]);
  const o = state?.orders.find((o) => o.id === id) || adminOrder;
  if (!state) return <Loading />;
  if (!o)
    return (
      <main className="receipt">
        <Brand />
        <p className="space-top">
          Receipt not found, or sign in to the account that placed this order.
        </p>
        <a className="button space-top" href="/account">
          My account
        </a>
      </main>
    );
  return (
    <main className="receipt">
      <div className="receipt-head">
        <Brand />
        <span className="test-pill">TEST RECEIPT</span>
      </div>
      <h1>Thank you for your order.</h1>
      <p>
        {o.id} · {date(o.created_at)}
      </p>
      <p className="muted">
        Local demonstration receipt. Not a tax invoice or proof of a real
        payment.
      </p>
      <div className="receipt-address">
        <h3>Delivered to</h3>
        <p>
          {o.shipping_address.name}
          <br />
          {o.shipping_address.line1}
          <br />
          {o.shipping_address.line2}
          <br />
          {o.shipping_address.area}, Mumbai {o.shipping_address.pincode}
          <br />
          {o.shipping_address.phone}
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.product_id}>
              <td>
                {i.name}
                <small className="block muted">
                  {i.sku} · {i.weight}
                </small>
              </td>
              <td>{i.quantity}</td>
              <td>{money(i.price)}</td>
              <td>{money(i.price * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-totals order-totals">
        <div>
          <span>Subtotal</span>
          <span>{money(o.subtotal)}</span>
        </div>
        <div>
          <span>Discount</span>
          <span>−{money(o.discount)}</span>
        </div>
        <div>
          <span>Delivery</span>
          <span>{money(o.shipping)}</span>
        </div>
        <div>
          <strong>Total</strong>
          <strong>{money(o.total)}</strong>
        </div>
        <small>Includes {money(o.tax)} sample tax.</small>
      </div>
      <p>
        {methodNames[o.payment_method]} ·{" "}
        {o.payment_status.replaceAll("_", " ")}
      </p>
      <div className="flex-actions no-print">
        <button className="button" onClick={() => window.print()}>
          Print / save as PDF
        </button>
        <a className="button outline" href="/account">
          My orders
        </a>
      </div>
    </main>
  );
}
