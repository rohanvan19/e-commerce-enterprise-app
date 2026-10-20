"use client";
import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  CreditCard,
  Smartphone,
  Landmark,
  Plus,
  CheckCircle2,
  MapPin,
  Gift,
} from "lucide-react";
import { useStore } from "@/components/store-provider";
import {
  Header,
  Footer,
  Field,
  Empty,
  Loading,
  PageError,
  AddressForm,
  Choice,
} from "@/components/shared";
import { AuthCard } from "@/components/auth-card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, money, methodNames } from "@/lib/client";
import type { Quote, Order, Address } from "@/lib/types";
export default function Checkout() {
  const { state, refresh, setCartOpen } = useStore();
  const [addressId, setAddressId] = useState(""),
    [addressOpen, setAddressOpen] = useState(false),
    [method, setMethod] = useState("gpay"),
    [couponDraft, setCouponDraft] = useState(""),
    [coupon, setCoupon] = useState(""),
    [giftNote, setGiftNote] = useState(""),
    [outcome, setOutcome] = useState("success"),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [couponError, setCouponError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState<Order | null>(null);
  const [editingAddress, setEditingAddress] = useState<Address | undefined>();
  const idempotency = useRef("");
  const quoteSequence = useRef(0);
  useEffect(() => {
    if (
      state?.addresses.length &&
      !state.addresses.some((a) => a.id === addressId)
    )
      setAddressId(state.addresses[0].id);
  }, [state?.addresses, addressId]);
  const address = state?.addresses.find((a) => a.id === addressId);
  const addressSignature = JSON.stringify(address);
  const signature = JSON.stringify(
    state?.cart.map((p) => [
      p.id,
      p.quantity,
      p.price,
      p.available_stock,
      p.active,
    ]),
  );
  useEffect(() => {
    idempotency.current = crypto.randomUUID();
  }, [
    addressId,
    addressSignature,
    method,
    coupon,
    giftNote,
    outcome,
    signature,
  ]);
  useEffect(() => {
    const seq = ++quoteSequence.current;
    setQuote(null);
    if (!state?.cart.length) return;
    api<Quote>("quote", { coupon, pincode: address?.pincode || "" })
      .then((q) => {
        if (seq === quoteSequence.current) {
          setQuote(q);
          setError("");
        }
      })
      .catch((e) => {
        if (seq === quoteSequence.current) setError(e.message);
      });
  }, [
    signature,
    coupon,
    address?.pincode,
    state?.config.shipping,
    state?.config.freeShipping,
    state?.revision,
  ]);
  async function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    setCouponError("");
    try {
      const q = await api<Quote>("quote", {
        coupon: couponDraft,
        pincode: address?.pincode || "",
      });
      setCoupon(couponDraft.trim().toUpperCase());
      setQuote(q);
    } catch (e) {
      setCouponError((e as Error).message);
    }
  }
  async function pay() {
    if (!quote || !addressId || busy) return;
    setBusy(true);
    setError("");
    try {
      const order = await api<Order>("checkout", {
        addressId,
        coupon,
        giftNote,
        paymentMethod: method,
        outcome,
        idempotencyKey: idempotency.current,
        expectedTotal: quote.total,
      });
      setSuccess(order);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header />
      <main id="main" className="checkout-page">
        <PageError />
        {!state ? (
          <Loading />
        ) : success ? (
          <div className="checkout-success">
            <CheckCircle2 size={56} />
            <span className="eyebrow">HAPPINESS IS ON ITS WAY</span>
            <h1>That’s a sweet choice.</h1>
            <p>
              Your test order <strong>{success.id}</strong> is confirmed.
            </p>
            <p className="muted">
              {money(success.total)} · No real payment was made.
            </p>
            <div className="flex-actions">
              <a className="button" href="/account">
                Track your order
              </a>
              <a className="button outline" href="/">
                Keep exploring
              </a>
            </div>
          </div>
        ) : !state.cart.length ? (
          <Empty title="Your bag is waiting for something good.">
            <a className="button" href="/#shop">
              Explore chocolates
            </a>
          </Empty>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">JUST A LITTLE CLOSER TO HAPPY</span>
                <h1>Make it yours.</h1>
              </div>
              <div className="secure-note">
                <LockKeyhole size={17} /> Local test checkout
              </div>
            </div>
            <div className="checkout-layout">
              <div className="checkout-steps">
                {!state.user ? (
                  <AuthCard />
                ) : (
                  <>
                    <section className="panel">
                      <div className="panel-title">
                        <h2>
                          <span className="step-number">1</span> A happy place
                          to deliver
                        </h2>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingAddress(undefined);
                            setAddressOpen(true);
                          }}
                        >
                          <Plus size={16} /> Add another address
                        </button>
                      </div>
                      {state.addresses.length ? (
                        <RadioGroup
                          value={addressId}
                          onValueChange={setAddressId}
                          className="address-options"
                        >
                          {state.addresses.map((a) => (
                            <div
                              className={
                                "address-option " +
                                (addressId === a.id ? "selected" : "")
                              }
                              key={a.id}
                            >
                              <label
                                className="address-choice"
                                htmlFor={"delivery-" + a.id}
                              >
                                <RadioGroupItem
                                  id={"delivery-" + a.id}
                                  value={a.id}
                                />
                                <div>
                                  <strong>{a.name}</strong>
                                  <p>
                                    {a.line1}
                                    {a.line2 ? ", " + a.line2 : ""}
                                    <br />
                                    {a.area}, Mumbai · {a.pincode}
                                    <br />
                                    {a.phone}
                                  </p>
                                  {!state.config.pincodes.includes(
                                    a.pincode,
                                  ) && (
                                    <small className="error-text">
                                      Outside our delivery area
                                    </small>
                                  )}
                                </div>
                              </label>
                              <button
                                type="button"
                                className="text-button address-edit"
                                aria-label={"Edit address for " + a.name}
                                onClick={() => {
                                  setEditingAddress(a);
                                  setAddressOpen(true);
                                }}
                              >
                                Edit address
                              </button>
                            </div>
                          ))}
                        </RadioGroup>
                      ) : (
                        <AddressForm onDone={setAddressId} />
                      )}
                      <p className="delivery-note">
                        <MapPin size={15} /> {state.config.deliveryWindow} to
                        supported Mumbai pincodes.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>
                        <span className="step-number">2</span> A little personal
                        touch
                      </h2>
                      <Field label="Gift note (optional)">
                        <textarea
                          value={giftNote}
                          onChange={(e) => setGiftNote(e.target.value)}
                          maxLength={250}
                          placeholder="For the sweetest person I know…"
                        />
                      </Field>
                      <small className="muted">
                        {giftNote.length}/250 characters
                      </small>
                    </section>
                    <section className="panel">
                      <h2>
                        <span className="step-number">3</span> Your way to pay
                      </h2>
                      <p className="test-notice">
                        <ShieldCheck size={18} /> Payment simulator. No real
                        card, bank or wallet details needed.
                      </p>
                      <RadioGroup
                        value={method}
                        onValueChange={setMethod}
                        className="payment-grid"
                      >
                        {Object.entries(methodNames).map(([value, label]) => (
                          <label
                            className={
                              "payment-option " +
                              (method === value ? "selected" : "")
                            }
                            key={value}
                          >
                            <RadioGroupItem value={value} />
                            {value.includes("card") ? (
                              <CreditCard />
                            ) : value === "netbanking" ? (
                              <Landmark />
                            ) : (
                              <Smartphone />
                            )}
                            <span>
                              {label}
                              <small>Simulated test payment</small>
                            </span>
                          </label>
                        ))}
                      </RadioGroup>
                      <div className="test-outcome">
                        <Field label="Test payment result">
                          <Choice
                            label="Test payment result"
                            value={outcome}
                            onChange={setOutcome}
                            options={[
                              { value: "success", label: "Successful payment" },
                              { value: "decline", label: "Declined payment" },
                            ]}
                          />
                        </Field>
                        <small>
                          Use a decline to verify that no order is placed and
                          stock stays unchanged.
                        </small>
                      </div>
                    </section>
                  </>
                )}
              </div>
              <aside className="checkout-summary panel">
                <div className="panel-title">
                  <h2>Your good things</h2>
                  <button
                    className="text-button"
                    onClick={() => setCartOpen(true)}
                  >
                    Edit bag
                  </button>
                </div>
                <div className="summary-items">
                  {state.cart.map((p) => (
                    <div key={p.id}>
                      <img src={p.image} alt={p.name} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.weight} · Qty {p.quantity}
                        </small>
                      </span>
                      <b>{money(p.price * p.quantity)}</b>
                    </div>
                  ))}
                </div>
                <form className="coupon-form" onSubmit={applyCoupon}>
                  <input
                    aria-label="Offer code"
                    value={couponDraft}
                    onChange={(e) => setCouponDraft(e.target.value)}
                    placeholder="Have an offer code?"
                    maxLength={30}
                  />
                  <button type="submit">Apply</button>
                </form>
                {couponError && (
                  <p className="error-text" role="alert">
                    {couponError}
                  </p>
                )}
                {coupon && (
                  <div className="offer-applied">
                    <CheckCircle2 size={15} />
                    {coupon} applied{" "}
                    <button
                      onClick={() => {
                        setCoupon("");
                        setCouponDraft("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <p className="muted text-small">
                  Try SWEET10: 10% off ₹199+, up to ₹100. Once per account.
                </p>
                {quote && (
                  <div className="order-totals">
                    <div>
                      <span>Subtotal</span>
                      <span>{money(quote.subtotal)}</span>
                    </div>
                    {quote.discount > 0 && (
                      <div className="saving">
                        <span>Little savings</span>
                        <span>−{money(quote.discount)}</span>
                      </div>
                    )}
                    <div>
                      <span>Delivery</span>
                      <span>
                        {quote.shipping ? money(quote.shipping) : "On us"}
                      </span>
                    </div>
                    <div className="grand-total">
                      <strong>Total</strong>
                      <strong>{money(quote.total)}</strong>
                    </div>
                    <small>Includes {money(quote.tax)} sample tax.</small>
                  </div>
                )}
                {error && (
                  <div className="error-box" role="alert">
                    {error}
                  </div>
                )}
                <button
                  className="button full"
                  disabled={
                    busy ||
                    !state.user ||
                    !quote ||
                    !addressId ||
                    !state.config.pincodes.includes(address?.pincode || "")
                  }
                  onClick={() => void pay()}
                >
                  <LockKeyhole size={16} />
                  {busy
                    ? "Placing your test order…"
                    : quote
                      ? "Pay " + money(quote.total) + " · Test"
                      : "Review your bag"}
                </button>
                <p className="text-small muted checkout-disclaimer">
                  {!state.user
                    ? "Sign in and verify your email to continue."
                    : "This is a local demo. Payment options are simulations; no provider connection or real charge occurs."}
                </p>
              </aside>
            </div>
          </>
        )}
      </main>
      <Footer />
      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent className="address-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingAddress
                ? "Edit delivery address"
                : "Add a delivery address"}
            </DialogTitle>
            <DialogDescription>
              {editingAddress
                ? "Update this saved address for your delivery."
                : "Save another place for your little treats."}
            </DialogDescription>
          </DialogHeader>
          <AddressForm
            key={editingAddress?.id ?? "new"}
            address={editingAddress}
            onDone={(id) => {
              setAddressId(id);
              setAddressOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
