"use client";
import { useState } from "react";
import {
  LogOut,
  MapPin,
  Package,
  Heart,
  UserRound,
  Plus,
  Download,
  Star,
  Mail,
  CheckCircle2,
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
  TestInbox,
  Status,
  Choice,
} from "@/components/shared";
import { AuthCard } from "@/components/auth-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, money, date, methodNames } from "@/lib/client";
import type { Order } from "@/lib/types";
import { toast } from "sonner";
export default function Account() {
  const { state, refresh } = useStore();
  const [addressOpen, setAddressOpen] = useState(false),
    [selected, setSelected] = useState<Order | null>(null),
    [busy, setBusy] = useState(false);
  async function profile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("profile", Object.fromEntries(new FormData(e.currentTarget)));
      await refresh();
      toast.success("Details updated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header />
      <main id="main" className="account-page">
        <PageError />
        {!state ? (
          <Loading />
        ) : !state.user ? (
          <div className="auth-layout">
            <div className="auth-story">
              <span className="eyebrow">A LITTLE HAPPINESS STARTS HERE</span>
              <h1>
                Your favourites.
                <br />
                Your <em>happy place.</em>
              </h1>
              <p>
                Save the good stuff, follow every delivery, and make your next
                chocolate run a little easier.
              </p>
              <img
                src="/images/ferrero.png"
                alt="A gift of Ferrero Rocher chocolates"
              />
            </div>
            <AuthCard />
          </div>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR COCOA LOCAL</span>
                <h1>Hello, {state.user.name.split(" ")[0]}.</h1>
                <p className="muted">
                  A little space for all your good things.
                </p>
              </div>
              <button
                className="button outline"
                onClick={async () => {
                  await api("auth/logout", {});
                  await refresh();
                }}
              >
                <LogOut size={17} /> Sign out
              </button>
            </div>
            <Tabs defaultValue="orders" className="account-tabs">
              <TabsList>
                <TabsTrigger value="orders">
                  <Package size={16} /> My orders
                </TabsTrigger>
                <TabsTrigger value="addresses">
                  <MapPin size={16} /> Addresses
                </TabsTrigger>
                <TabsTrigger value="profile">
                  <UserRound size={16} /> My details
                </TabsTrigger>
                <TabsTrigger value="inbox">
                  <Mail size={16} /> Test inbox
                </TabsTrigger>
              </TabsList>
              <TabsContent value="orders">
                {state.orders.length ? (
                  <div className="orders-list">
                    {state.orders.map((o) => (
                      <article className="order-card" key={o.id}>
                        <div className="order-top">
                          <div>
                            <strong>{o.id}</strong>
                            <span>
                              {date(o.created_at)} ·{" "}
                              {o.items.reduce((s, i) => s + i.quantity, 0)}{" "}
                              items
                            </span>
                          </div>
                          <Status value={o.status} />
                        </div>
                        <div className="order-body">
                          <div className="order-products">
                            {o.items.map((i) => (
                              <img
                                src={i.image}
                                key={i.product_id}
                                alt={i.name}
                              />
                            ))}
                          </div>
                          <div>
                            <strong>{money(o.total)}</strong>
                            <p className="muted text-small">
                              {methodNames[o.payment_method]} · Test payment
                            </p>
                          </div>
                          <button
                            className="button outline"
                            onClick={() => setSelected(o)}
                          >
                            View order
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty title="Your first happy delivery awaits.">
                    Your orders will appear here.
                    <a className="button" href="/#shop">
                      Explore the chocolate shop
                    </a>
                  </Empty>
                )}
              </TabsContent>
              <TabsContent value="addresses">
                <div className="address-grid">
                  {state.addresses.map((a) => (
                    <article className="address-card" key={a.id}>
                      <MapPin size={20} />
                      <h3>{a.name}</h3>
                      <p>
                        {a.line1}
                        <br />
                        {a.line2 && (
                          <>
                            {a.line2}
                            <br />
                          </>
                        )}
                        {a.area}, Mumbai {a.pincode}
                        <br />
                        {a.phone}
                      </p>
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          try {
                            await api("addresses", { id: a.id }, "DELETE");
                            await refresh();
                            toast.success("Address removed.");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        Remove address
                      </button>
                    </article>
                  ))}
                  <button
                    className="address-card add-address"
                    onClick={() => setAddressOpen(true)}
                  >
                    <Plus />
                    Add an address
                  </button>
                </div>
              </TabsContent>
              <TabsContent value="profile">
                <form
                  onSubmit={profile}
                  className="panel form-stack profile-form"
                >
                  <h2>Your details</h2>
                  <Field label="Full name">
                    <input
                      name="name"
                      defaultValue={state.user.name}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </Field>
                  <Field label="Mobile number">
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={state.user.phone}
                      pattern="[6-9][0-9]{9}"
                      maxLength={10}
                      required
                    />
                  </Field>
                  <Field label="Verified email">
                    <input value={state.user.email} readOnly />
                  </Field>
                  <p className="verified-label">
                    <CheckCircle2 size={16} /> Email verified
                  </p>
                  <button className="button" disabled={busy}>
                    {busy ? "Saving…" : "Save details"}
                  </button>
                  {state.user.role === "admin" && (
                    <a className="text-button" href="/admin">
                      Open store workspace
                    </a>
                  )}
                </form>
              </TabsContent>
              <TabsContent value="inbox">
                <div className="panel">
                  <h2>Your local messages</h2>
                  <TestInbox email={state.user.email} />
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
      <Footer />
      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A new happy place.</DialogTitle>
            <DialogDescription>
              Save a Mumbai delivery address.
            </DialogDescription>
          </DialogHeader>
          <AddressForm onDone={() => setAddressOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="order-dialog">
          {selected && (
            <OrderView
              order={
                state?.orders.find((o) => o.id === selected.id) || selected
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function OrderView({ order: o }: { order: Order }) {
  const { refresh } = useStore();
  const [reason, setReason] = useState(""),
    [returnOpen, setReturnOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [reviewProduct, setReviewProduct] = useState(o.items[0]?.product_id || ""),
    [rating, setRating] = useState("5"),
    [review, setReview] = useState("");
  async function action(path: string, data: unknown) {
    setBusy(true);
    try {
      await api(path, data);
      await refresh();
      toast.success("Order updated.");
      setReturnOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const stages = ["confirmed", "packing", "shipped", "delivered"];
  return (
    <>
      <DialogHeader>
        <DialogTitle>{o.id}</DialogTitle>
        <DialogDescription>
          Placed {date(o.created_at)} · Local test order
        </DialogDescription>
      </DialogHeader>
      <Status value={o.status} />
      {stages.includes(o.status) && (
        <ol className="order-timeline">
          {stages.map((s, i) => (
            <li className={i <= stages.indexOf(o.status) ? "done" : ""} key={s}>
              <CheckCircle2 size={18} />
              {s}
            </li>
          ))}
        </ol>
      )}
      {o.tracking && (
        <div className="notice">Carrier & tracking: {o.tracking}</div>
      )}
      <div className="order-detail-items">
        {o.items.map((i) => (
          <div key={i.product_id}>
            <img src={i.image} alt={i.name} />
            <span>
              <strong>{i.name}</strong>
              <small>
                {i.weight} · Qty {i.quantity}
              </small>
            </span>
            <strong>{money(i.quantity * i.price)}</strong>
          </div>
        ))}
      </div>
      <div className="form-two">
        <div>
          <h3>Delivering a little joy to</h3>
          <p className="text-small muted">
            {o.shipping_address.name}
            <br />
            {o.shipping_address.line1}
            <br />
            {o.shipping_address.line2}
            <br />
            {o.shipping_address.area}, Mumbai {o.shipping_address.pincode}
          </p>
        </div>
        <div className="order-totals">
          <div>
            <span>Subtotal</span>
            <span>{money(o.subtotal)}</span>
          </div>
          {o.discount > 0 && (
            <div>
              <span>Offer savings</span>
              <span>−{money(o.discount)}</span>
            </div>
          )}
          <div>
            <span>Delivery</span>
            <span>{o.shipping ? money(o.shipping) : "Free"}</span>
          </div>
          <div>
            <strong>Total</strong>
            <strong>{money(o.total)}</strong>
          </div>
          <small>Includes {money(o.tax)} sample tax.</small>
        </div>
      </div>
      {o.gift_note && <div className="notice">Gift note: {o.gift_note}</div>}
      <div className="flex-actions">
        <a
          className="button outline"
          href={"/receipt/" + o.id}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={16} /> View receipt
        </a>
        {o.status === "confirmed" && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => void action("orders/cancel", { orderId: o.id })}
          >
            Cancel test order
          </button>
        )}
        {o.status === "delivered" && !o.return_request && (
          <button
            className="text-button"
            onClick={() => setReturnOpen(!returnOpen)}
          >
            Request a return
          </button>
        )}
      </div>
      {o.return_request && (
        <p className="notice">
          Return {o.return_request.status}: {o.return_request.reason}
        </p>
      )}
      {returnOpen && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action("returns", { orderId: o.id, reason });
          }}
        >
          <Field label="What went wrong?">
            <textarea
              minLength={10}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <p className="text-small muted">
            Demo policy: report an issue within 7 days of delivery.
          </p>
          <button className="button" disabled={busy}>
            Submit return request
          </button>
        </form>
      )}
      {o.status === "delivered" && (
        <form
          className="form-stack review-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action("reviews", {
              productId: reviewProduct,
              rating: Number(rating),
              body: review,
            });
          }}
        >
          <h3>How was your chocolate?</h3>
          <Choice
            label="Product to review"
            value={reviewProduct}
            onChange={setReviewProduct}
            options={o.items.map((i) => ({
              value: i.product_id,
              label: i.name,
            }))}
          />
          <Choice
            label="Star rating"
            value={rating}
            onChange={setRating}
            options={[5, 4, 3, 2, 1].map((n) => ({
              value: String(n),
              label: n + " stars",
            }))}
          />
          <Field label="Your review">
            <textarea
              minLength={5}
              maxLength={1000}
              required
              value={review}
              onChange={(e) => setReview(e.target.value)}
            />
          </Field>
          <button className="button outline" disabled={busy}>
            Save review
          </button>
        </form>
      )}
    </>
  );
}
