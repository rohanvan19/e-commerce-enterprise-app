"use client";
import { Header, Footer } from "@/components/shared";
import { useStore } from "@/components/store-provider";
import { money } from "@/lib/client";
export default function Help() {
  const { state } = useStore();
  return (
    <>
      <Header />
      <main id="main" className="help-page">
        <span className="eyebrow">GOOD TO KNOW</span>
        <h1>A little help.</h1>
        <p className="muted">The details behind your happy delivery.</p>
        <section className="panel">
          <h2>Delivery in Mumbai</h2>
          <p>
            We currently serve selected Mumbai pincodes. Delivery is estimated
            at {state?.config.deliveryWindow || "1–2 business days"}. The sample
            delivery fee is {money(state?.config.shipping ?? 4900)}, with free
            delivery from {money(state?.config.freeShipping ?? 49900)} after
            offers.
          </p>
          <details>
            <summary>See supported pincodes</summary>
            <p>{state?.config.pincodes.join(", ")}</p>
          </details>
        </section>
        <section className="panel">
          <h2>Something not quite right?</h2>
          <p>
            In this demo, you can cancel an order from your account before
            packing begins. After delivery, report an issue within 7 days using
            “Request a return” in your order details. The store owner can review
            the request and issue a simulated refund.
          </p>
          <p>
            Food returns need individual review. Return approval does not
            automatically put returned items back into sellable stock.
          </p>
        </section>
        <section className="panel">
          <h2>Chocolate care & product information</h2>
          <p>
            Store chocolates in a cool, dry place and follow the manufacturer’s
            instructions on the pack. Check ingredients and allergens on the
            actual packaging before consumption. Images may show different
            packaging or promotions.
          </p>
        </section>
        <section className="panel">
          <h2>About this local test store</h2>
          <p>
            Cocoa Local is a working local demonstration. Products, prices,
            discounts, stock, batch expiry dates, taxes, and delivery policies
            are sample data. Familiar brand names and images are used to
            demonstrate the catalogue; no affiliation is implied.
          </p>
          <p>
            Credit and debit cards, Google Pay, UPI, net banking, and PayPal are
            simulated. No real payment details are collected, no real purchases
            are made, and no messages are sent externally. Email verification
            codes and order messages are available in the local test inbox.
          </p>
          <p>
            Account details, addresses and orders are stored in the local
            database. This application is restricted to localhost. Production
            privacy terms, business contact information and final operating
            policies must be supplied before a public launch.
          </p>
        </section>
        <a className="button" href="/account">
          My account & orders
        </a>
      </main>
      <Footer />
    </>
  );
}
