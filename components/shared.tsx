"use client";
import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import type { Address } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useStore } from "./store-provider";
import {
  ShoppingBag,
  House,
  Search,
  UserRound,
  Heart,
  Minus,
  Plus,
  Trash2,
  MapPin,
  Truck,
  PackageCheck,
  Mail,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { money, api } from "@/lib/client";
import { toast } from "sonner";
export function Brand() {
  return (
    <a className="wordmark" href="/" aria-label="Cocoa Local home">
      cocoa<span>local</span>
      <i>✳</i>
    </a>
  );
}
export function Header({ onSearch }: { onSearch?: () => void }) {
  const { state, setCartOpen } = useStore();
  const count = state?.cart.reduce((s, p) => s + p.quantity, 0) || 0;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        A little happiness, delivered across Mumbai.{" "}
        <span>
          Free delivery on orders {money(state?.config.freeShipping ?? 49900)}+
        </span>
      </div>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="/#shop" className="active">
            The chocolate shop
          </a>
          <a href="/?category=Gift%20boxes#shop">Little gifts</a>
          <a href="/#about">Our neighbourhood</a>
        </nav>
        <div className="header-actions">
          {onSearch ? (
            <button onClick={onSearch} aria-label="Search chocolates">
              <Search />
            </button>
          ) : (
            <a href="/#shop" aria-label="Shop chocolates">
              <Search />
            </a>
          )}
          <a href="/account" aria-label="Your account">
            <UserRound />
          </a>
          <button
            className="bag"
            onClick={() => setCartOpen(true)}
            aria-label={`Shopping bag, ${count} items`}
          >
            <ShoppingBag />
            <span>{count}</span>
          </button>
        </div>
      </header>
      <CartDrawer />
      <MobileNavigation />
    </>
  );
}
export function MobileNavigation() {
  const { state, cartOpen, setCartOpen } = useStore();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const count = state?.cart.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const results = (state?.products || [])
    .filter((product) =>
      (product.name + " " + product.brand)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice(0, 6);
  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <a
          href="/"
          aria-current={
            pathname === "/" && !cartOpen && !searchOpen ? "page" : undefined
          }
        >
          <House aria-hidden="true" />
          <span>Home</span>
        </a>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
        >
          <Search aria-hidden="true" />
          <span>Search</span>
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={cartOpen}
          aria-label={"Cart, " + count + " items"}
          className={pathname === "/checkout" || cartOpen ? "selected" : ""}
        >
          <span className="mobile-cart-icon">
            <ShoppingBag aria-hidden="true" />
            {count > 0 && (
              <span className="mobile-cart-count" aria-hidden="true">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </span>
          <span>Cart</span>
        </button>
        <a
          href="/account"
          aria-current={
            pathname === "/account" && !cartOpen && !searchOpen
              ? "page"
              : undefined
          }
        >
          <UserRound aria-hidden="true" />
          <span>Account</span>
        </a>
      </nav>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="mobile-search-dialog">
          <DialogHeader>
            <DialogTitle>Find your next favourite</DialogTitle>
            <DialogDescription>
              Search chocolates, brands and little treats.
            </DialogDescription>
          </DialogHeader>
          <form action="/" method="get" className="mobile-search-form">
            <label className="field">
              <span>Search chocolates</span>
              <input
                type="search"
                name="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try KitKat or dark chocolate"
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            <button className="button" type="submit">
              Search
            </button>
          </form>
          <div className="mobile-search-results">
            {!state ? (
              <p>Loading chocolates…</p>
            ) : results.length ? (
              results.map((product) => (
                <a
                  href={
                    "/?search=" + encodeURIComponent(product.name) + "#shop"
                  }
                  key={product.id}
                >
                  <img src={product.image} alt="" />
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.brand} · {product.weight}
                    </small>
                  </span>
                  <b>{money(product.price)}</b>
                </a>
              ))
            ) : (
              <p role="status">
                No chocolates match that search. Try another name or brand.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <div>
        <Brand />
        <p>Your neighbourhood. A little sweeter.</p>
      </div>
      <div className="footer-links">
        <a href="/account">My account</a>
        <a href="/help">Delivery & help</a>
        <a href="/admin">Store workspace</a>
      </div>
      <div>
        <span className="test-pill">LOCAL TEST STORE</span>
        <p>Sample catalogue & prices. No real charges.</p>
      </div>
    </footer>
  );
}
export function Promises() {
  return (
    <section className="promise-strip" id="about">
      <div>
        <Truck />
        <h3>Local love. Delivered.</h3>
        <p>Serving selected Mumbai pincodes.</p>
      </div>
      <div>
        <PackageCheck />
        <h3>Goodness in every order.</h3>
        <p>Sealed packs, packed with care.</p>
      </div>
      <div>
        <Heart />
        <h3>For the everyday celebrations.</h3>
        <p>A thank you. A pick-me-up. A just-because.</p>
      </div>
    </section>
  );
}
export function Choice({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className="choice">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? o : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="check-field">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{children}</span>
    </label>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <ShoppingBag size={30} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" /> Getting everything ready…
    </div>
  );
}
export function PageError() {
  const { error, refresh } = useStore();
  return error ? (
    <div role="alert" className="error-box">
      {error}{" "}
      <button className="text-button" onClick={() => void refresh()}>
        Try again
      </button>
    </div>
  ) : null;
}
export function Status({ value }: { value: string }) {
  return (
    <span className={"status " + value}>{value.replaceAll("_", " ")}</span>
  );
}
export function CartDrawer() {
  const { state, cartOpen, setCartOpen, setQuantity, busy } = useStore();
  const cart = state?.cart || [];
  const subtotal = cart.reduce((s, p) => s + p.price * p.quantity, 0);
  const left = Math.max(0, (state?.config.freeShipping || 49900) - subtotal);
  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="cart-sheet">
        <SheetHeader>
          <SheetTitle>
            Your happy little bag{" "}
            <span>({cart.reduce((s, p) => s + p.quantity, 0)})</span>
          </SheetTitle>
          <SheetDescription>A few good things, just for you.</SheetDescription>
        </SheetHeader>
        {cart.length ? (
          <>
            <div className="free-shipping">
              <Truck size={18} />
              {left
                ? `${money(left)} away from free delivery`
                : "Your bag qualifies for free delivery"}
              <div className="shipping-meter">
                <i
                  style={{
                    width:
                      Math.min(
                        100,
                        (subtotal / (state?.config.freeShipping || 49900)) *
                          100,
                      ) + "%",
                  }}
                />
              </div>
            </div>
            <div className="cart-lines">
              {cart.map((p) => (
                <div className="cart-line" key={p.id}>
                  <img src={p.image} alt={p.name} />
                  <div>
                    <span className="muted text-small">
                      {p.brand} · {p.weight}
                    </span>
                    <h3>{p.name}</h3>
                    <strong>{money(p.price * p.quantity)}</strong>
                    <div className="quantity">
                      <button
                        disabled={busy}
                        aria-label={"Decrease " + p.name}
                        onClick={() => void setQuantity(p.id, p.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{p.quantity}</span>
                      <button
                        disabled={busy || p.quantity >= p.available_stock}
                        aria-label={"Increase " + p.name}
                        onClick={() => void setQuantity(p.id, p.quantity + 1)}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        disabled={busy}
                        className="remove"
                        aria-label={"Remove " + p.name}
                        onClick={() => void setQuantity(p.id, 0)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {p.quantity > p.available_stock && (
                      <small className="error-text">
                        Only {p.available_stock} available. Update quantity.
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <div className="total-row">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <p className="muted text-small">
                Delivery and offers calculated at checkout.
              </p>
              <a
                href="/checkout"
                onClick={() => setCartOpen(false)}
                className="button full"
              >
                Continue to checkout
              </a>
              <button
                className="text-button"
                onClick={() => setCartOpen(false)}
              >
                Keep exploring
              </button>
            </div>
          </>
        ) : (
          <Empty title="A little room for happiness.">
            Your bag is empty. Find a favourite in the shop.
            <button className="button" onClick={() => setCartOpen(false)}>
              Explore chocolates
            </button>
          </Empty>
        )}
      </SheetContent>
    </Sheet>
  );
}
export function AddressForm({
  address,
  onDone,
}: {
  address?: Address;
  onDone: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { refresh, state } = useStore();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const r = await api<{ id: string }>(
        "addresses",
        address ? { ...data, id: address.id } : data,
        address ? "PATCH" : "POST",
      );
      await refresh();
      onDone(r.id);
      toast.success("Address saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <div className="form-two">
        <Field label="Full name">
          <input
            name="name"
            autoComplete="name"
            defaultValue={address?.name ?? state?.user?.name}
            minLength={2}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Mobile number">
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            pattern="[6-9][0-9]{9}"
            maxLength={10}
            defaultValue={address?.phone ?? state?.user?.phone}
            autoComplete="tel-national"
            required
          />
        </Field>
      </div>
      <Field label="Flat, building & street">
        <input
          name="line1"
          defaultValue={address?.line1}
          minLength={5}
          maxLength={200}
          autoComplete="address-line1"
          required
        />
      </Field>
      <Field label="Landmark (optional)">
        <input
          name="line2"
          defaultValue={address?.line2}
          maxLength={150}
          autoComplete="address-line2"
        />
      </Field>
      <div className="form-two">
        <Field label="Area in Mumbai">
          <input
            name="area"
            defaultValue={address?.area}
            minLength={2}
            maxLength={100}
            autoComplete="address-level3"
            required
          />
        </Field>
        <Field label="Pincode">
          <input
            name="pincode"
            defaultValue={address?.pincode}
            pattern="[0-9]{6}"
            maxLength={6}
            inputMode="numeric"
            autoComplete="postal-code"
            required
          />
        </Field>
      </div>
      <p className="text-small muted">
        Mumbai, Maharashtra, India. Check delivery availability at checkout.
      </p>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : address ? "Save changes" : "Save address"}
      </button>
    </form>
  );
}
export function TestInbox({ email }: { email: string }) {
  const [messages, setMessages] = useState<
      { id: number; subject: string; body: string; created_at: string }[]
    >([]),
    [opened, setOpened] = useState(false),
    [busy, setBusy] = useState(false);
  async function load() {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setBusy(true);
    try {
      const r = await api("inbox?email=" + encodeURIComponent(email));
      setMessages(r.messages);
      setOpened(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="test-inbox">
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={() => void load()}
      >
        <Mail size={16} />
        {busy
          ? "Opening…"
          : opened
            ? "Refresh test inbox"
            : "Open local test inbox"}
      </button>
      <small>Local testing only. Emails are saved here; nothing is sent.</small>
      {opened && (
        <div className="inbox-messages">
          {messages.length ? (
            messages.slice(0, 4).map((m) => (
              <article key={m.id}>
                <strong>{m.subject}</strong>
                <p>{m.body}</p>
              </article>
            ))
          ) : (
            <p>No messages for this email yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
