"use client";
import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Heart,
  Plus,
  Search,
  Star,
  SlidersHorizontal,
  Check,
  ShoppingBag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useStore } from "./store-provider";
import {
  Header,
  Footer,
  Promises,
  Choice,
  Empty,
  Loading,
  PageError,
  Field,
} from "./shared";
import { money, api, date } from "@/lib/client";
import type { Product } from "@/lib/types";
import { toast } from "sonner";
export default function Storefront() {
  const { state, add, save, busy, setCartOpen } = useStore();
  const [category, setCategory] = useState("All chocolates"),
    [search, setSearch] = useState(""),
    [brand, setBrand] = useState("All brands"),
    [sort, setSort] = useState("Featured"),
    [savedOnly, setSavedOnly] = useState(false),
    [detail, setDetail] = useState<Product | null>(null),
    [pin, setPin] = useState(""),
    [pinResult, setPinResult] = useState(""),
    [pinOpen, setPinOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("category")) setCategory(q.get("category")!);
    if (q.has("search")) {
      setSearch(q.get("search") || "");
      document.getElementById("shop")?.scrollIntoView();
    }
  }, []);
  const products = (state?.products || [])
    .filter(
      (p) =>
        (category === "All chocolates" || p.category === category) &&
        (brand === "All brands" || p.brand === brand) &&
        (!savedOnly || state?.wishlist.includes(p.id)) &&
        (p.name + " " + p.brand + " " + p.description)
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Price: low to high"
        ? a.price - b.price
        : sort === "Price: high to low"
          ? b.price - a.price
          : sort === "Name: A to Z"
            ? a.name.localeCompare(b.name)
            : 0,
    );
  const categories = [
    "All chocolates",
    ...Array.from(
      new Set(
        state?.products.map((p) => p.category) || [
          "Milk chocolate",
          "Dark chocolate",
          "Wafers & bites",
          "Gift boxes",
        ],
      ),
    ),
  ];
  const find = () => {
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
    searchRef.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <Header onSearch={find} />
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-star">✳</span> YOUR NEIGHBOURHOOD CHOCOLATE
              SHOP
            </div>
            <h1>
              Good days.
              <br />
              Great <em>chocolate.</em>
            </h1>
            <p>
              The favourites you grew up with. The treats you’ll fall for next.
              A little joy, just around the corner.
            </p>
            <a className="button lime" href="#shop">
              Find your happy
            </a>
            <button className="hero-note" onClick={() => setPinOpen(true)}>
              <MapPin size={17} /> Made for Mumbai’s sweet side.{" "}
              <span className="underlined">Check pincode</span>
            </button>
          </div>
          <div className="hero-art">
            <img
              src="/images/hero.jpg"
              alt="Sharing golden-wrapped Ferrero Rocher chocolates"
              fetchPriority="high"
            />
            <div className="roundel">
              A LITTLE
              <br />
              <strong>sweet</strong>
              <br />
              GOES A LONG WAY
            </div>
            <div className="photo-caption">
              <span>THE EVERYDAY JOY COLLECTION</span>
              <span>MUMBAI, WITH LOVE</span>
            </div>
          </div>
        </section>
        <div className="brand-strip">
          <span>GOOD COMPANY, GREAT CHOCOLATE</span>
          <b className="cadbury">Cadbury</b>
          <b className="nestle">Nestlé</b>
          <b className="amul">Amul</b>
          <b className="ferrero">FERRERO ROCHER</b>
          <span>All your favourites. One happy place.</span>
        </div>
        <section className="shop-section" id="shop">
          <div className="section-heading">
            <div>
              <div className="eyebrow">UNWRAP SOMETHING GOOD</div>
              <h2>Small treats. Big feelings.</h2>
            </div>
            <p>
              For your coffee break, your favourite person,
              <br />
              or absolutely no reason at all.
            </p>
          </div>
          <div className="catalog-toolbar">
            <div className="category-tabs" aria-label="Chocolate categories">
              {categories.map((c) => (
                <button
                  key={c}
                  className={category === c ? "selected" : ""}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              className={"saved-filter " + (savedOnly ? "selected" : "")}
              onClick={() => setSavedOnly(!savedOnly)}
              aria-pressed={savedOnly}
            >
              <Heart size={16} />
              {savedOnly ? "Your favourites" : "Favourites"}
            </button>
          </div>
          <div className="filter-row">
            <div className="search-field">
              <Search size={17} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search chocolates"
                placeholder="Find your favourite chocolate…"
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  ×
                </button>
              )}
            </div>
            <Choice
              label="Filter by brand"
              value={brand}
              onChange={setBrand}
              options={[
                "All brands",
                ...Array.from(
                  new Set(state?.products.map((p) => p.brand) || []),
                ),
              ]}
            />
            <Choice
              label="Sort products"
              value={sort}
              onChange={setSort}
              options={[
                "Featured",
                "Price: low to high",
                "Price: high to low",
                "Name: A to Z",
              ]}
            />
            <span className="result-count">{products.length} good things</span>
          </div>
          <PageError />
          {!state ? (
            <Loading />
          ) : products.length ? (
            <div className="product-grid">
              {products.map((p) => {
                const inBag =
                  state.cart.find((c) => c.id === p.id)?.quantity || 0;
                return (
                  <article className="product-card" key={p.id}>
                    <div className={"product-image " + p.color}>
                      <span className="tag">
                        {p.available_stock === 0
                          ? "Back soon"
                          : p.category === "Gift boxes"
                            ? "A little celebration"
                            : p.available_stock <= 10
                              ? "Last few treats"
                              : p.id === "silk"
                                ? "An everyday favourite"
                                : "The good stuff"}
                      </span>
                      <button
                        className={
                          "heart " +
                          (state.wishlist.includes(p.id) ? "is-saved" : "")
                        }
                        aria-label={
                          (state.wishlist.includes(p.id)
                            ? "Unsave "
                            : "Save ") + p.name
                        }
                        aria-pressed={state.wishlist.includes(p.id)}
                        onClick={() => void save(p.id)}
                      >
                        <Heart size={19} />
                      </button>
                      <button
                        className="product-photo-button"
                        aria-label={"View " + p.name}
                        onClick={() => setDetail(p)}
                      >
                        <img
                          src={p.image}
                          alt={p.name + " — " + p.weight}
                          loading="lazy"
                        />
                      </button>
                    </div>
                    <div className="product-meta">
                      {p.brand.toUpperCase()} <span>{p.weight}</span>
                    </div>
                    <button
                      className="product-title"
                      onClick={() => setDetail(p)}
                    >
                      <h3>{p.name}</h3>
                    </button>
                    {p.rating && (
                      <div className="product-rating">
                        <Star size={12} fill="currentColor" />
                        {p.rating} <span>({p.review_count})</span>
                      </div>
                    )}
                    <div className="product-bottom">
                      <div>
                        <strong>{money(p.price)}</strong>
                        {p.mrp > p.price && <del>{money(p.mrp)}</del>}
                      </div>
                      <button
                        className="add-button"
                        disabled={busy || inBag >= p.available_stock}
                        onClick={() => void add(p.id)}
                      >
                        {inBag ? <Check size={16} /> : <Plus size={16} />}{" "}
                        {p.available_stock === 0
                          ? "Sold out"
                          : inBag
                            ? `${inBag} in bag · Add`
                            : "Add to bag"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty title="No chocolates match just yet.">
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setCategory("All chocolates");
                  setBrand("All brands");
                  setSavedOnly(false);
                }}
              >
                Clear your filters
              </button>
            </Empty>
          )}
          <div className="catalog-footnote">
            <span>
              All prices include sample taxes. Catalogue, stock and offers are
              for local testing.
            </span>
            <a href="/help">Delivery details</a>
          </div>
        </section>
        <section className="gift-banner">
          <div>
            <span className="eyebrow">
              JUST BECAUSE IS A GOOD ENOUGH REASON
            </span>
            <h2>
              A little gift.
              <br />A whole lot of <em>happy.</em>
            </h2>
            <p>Make someone’s ordinary day a little more special.</p>
            <button
              className="button"
              onClick={() => {
                setCategory("Gift boxes");
                document
                  .getElementById("shop")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Discover little gifts
            </button>
          </div>
          <img
            src="/images/ferrero.png"
            alt="Ferrero Rocher gift box"
            loading="lazy"
          />
        </section>
        <Promises />
      </main>
      <Footer />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="product-dialog">
          {detail && (
            <ProductDetail
              product={
                state?.products.find((p) => p.id === detail.id) || detail
              }
              onClose={() => setDetail(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A little joy, in your neighbourhood?</DialogTitle>
            <DialogDescription>
              Check your Mumbai delivery pincode.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setPinResult(
                state?.config.pincodes.includes(pin)
                  ? `Yes! Delivery in ${state.config.deliveryWindow}. Free over ${money(state.config.freeShipping)}.`
                  : "We are not delivering to that pincode yet. Try a supported Mumbai pincode, such as 400050.",
              );
            }}
          >
            <Field label="Delivery pincode">
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setPinResult("");
                }}
                placeholder="e.g. 400050"
              />
            </Field>
            <button className="button">Check delivery</button>
            {pinResult && (
              <p role="status" className="notice">
                {pinResult}
              </p>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
function ProductDetail({
  product: p,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { add, busy, state } = useStore();
  const [reviews, setReviews] = useState<
    {
      id: string;
      name: string;
      rating: number;
      body: string;
      created_at: string;
    }[]
  >([]);
  useEffect(() => {
    api("reviews?productId=" + encodeURIComponent(p.id))
      .then((r) => setReviews(r.reviews))
      .catch(() => {});
  }, [p.id]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{p.name}</DialogTitle>
        <DialogDescription>
          {p.brand} · {p.weight}
        </DialogDescription>
      </DialogHeader>
      <div className="detail-layout">
        <div className={"detail-image " + p.color}>
          <img src={p.image} alt={p.name} />
        </div>
        <div>
          <p className="detail-description">{p.description}</p>
          <div className="detail-price">
            <strong>{money(p.price)}</strong> <del>{money(p.mrp)}</del>
            <span>Inclusive of sample taxes</span>
          </div>
          <p className="stock-note">
            {p.available_stock
              ? `${p.available_stock} available`
              : "Temporarily out of stock"}
          </p>
          <button
            className="button full"
            disabled={
              busy ||
              !p.available_stock ||
              (state?.cart.find((c) => c.id === p.id)?.quantity || 0) >=
                p.available_stock
            }
            onClick={async () => {
              await add(p.id);
            }}
          >
            Add to bag
          </button>
          <details>
            <summary>Ingredients & allergens</summary>
            <p>{p.ingredients}</p>
            <p>
              <strong>Allergens:</strong> {p.allergens}
            </p>
          </details>
          <details>
            <summary>Delivery & storage</summary>
            <p>
              Delivery to selected Mumbai pincodes in{" "}
              {state?.config.deliveryWindow}. Store in a cool, dry place away
              from direct sunlight; follow the pack’s storage instructions.
            </p>
          </details>
          <p className="muted text-small">
            SKU {p.sku} · Sample listing. Packaging may vary.
          </p>
        </div>
      </div>
      <div className="reviews">
        <h3>From the neighbourhood</h3>
        {reviews.length ? (
          reviews.map((r) => (
            <article key={r.id}>
              <strong>{r.name}</strong>
              <span>{"★".repeat(r.rating)} · Verified purchase</span>
              <p>{r.body}</p>
              <small>{date(r.created_at)}</small>
            </article>
          ))
        ) : (
          <p className="muted text-small">
            No reviews yet. Be the first after your order is delivered.
          </p>
        )}
      </div>
    </>
  );
}
