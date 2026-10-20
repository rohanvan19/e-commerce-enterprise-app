"use client";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingBag,
  Users,
  Tag,
  Settings,
  ClipboardList,
  ExternalLink,
  Plus,
  Search,
  Download,
  IndianRupee,
  TriangleAlert,
  TrendingUp,
  RefreshCw,
  LogOut,
  Leaf,
  ArrowUpRight,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useStore } from "@/components/store-provider";
import { AuthCard } from "@/components/auth-card";
import {
  Brand,
  Choice,
  Check,
  Field,
  Status,
  Empty,
  Loading,
} from "@/components/shared";
import { api, money, date, csvDownload } from "@/lib/client";
import type { AdminState, Product, Order, Batch, Coupon } from "@/lib/types";
import {
  ProductEditor,
  StockEditor,
  CouponEditor,
  OrderEditor,
  SettingsEditor,
} from "@/components/admin-editors";
import { toast } from "sonner";
const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Package },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "customers", label: "Customers", icon: Users },
  { id: "offers", label: "Offers", icon: Tag },
  { id: "activity", label: "Activity log", icon: ClipboardList },
  { id: "settings", label: "Store settings", icon: Settings },
];
export default function Admin() {
  const { state, refresh, connected } = useStore();
  const [data, setData] = useState<AdminState | null>(null),
    [error, setError] = useState(""),
    [section, setSection] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [product, setProduct] = useState<Product | null | undefined>(undefined),
    [stock, setStock] = useState<Product | null>(null),
    [coupon, setCoupon] = useState<Coupon | null | undefined>(undefined),
    [order, setOrder] = useState<Order | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<AdminState>("admin"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (state?.user?.role === "admin") void load();
  }, [state?.user?.role, state?.revision, load]);
  const done = async () => {
    await load();
    await refresh();
  };
  const navigate = (s: string) => {
    setSection(s);
    setSearch("");
    setFilter("All");
  };
  if (!state) return <Loading />;
  if (!state.user)
    return (
      <main className="admin-login">
        <Brand />
        <AuthCard admin />
        <a href="/" className="text-button">
          Back to the chocolate shop
        </a>
      </main>
    );
  if (state.user.role !== "admin")
    return (
      <main className="admin-login">
        <Brand />
        <div className="panel">
          <h1>Owner access only.</h1>
          <p>Your account is a customer account.</p>
          <a className="button" href="/account">
            Go to my account
          </a>
          <button
            className="text-button"
            onClick={async () => {
              await api("auth/logout", {});
              await refresh();
            }}
          >
            Sign out to use an owner account
          </button>
        </div>
      </main>
    );
  const activeOrders =
    data?.orders.filter((o) => !["cancelled", "refunded"].includes(o.status)) ||
    [];
  const revenue = activeOrders.reduce((s, o) => s + o.total, 0);
  const low =
    data?.products.filter(
      (p) => p.active && p.available_stock <= p.reorder_level,
    ) || [];
  const pending =
    data?.orders.filter((o) => ["confirmed", "packing"].includes(o.status)) ||
    [];
  const productRows = (data?.products || []).filter(
    (p) =>
      (p.name + " " + p.sku + " " + p.brand)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All" ||
        (filter === "Active" && p.active) ||
        (filter === "Archived" && !p.active) ||
        (filter === "Low stock" && p.available_stock <= p.reorder_level)),
  );
  const orderRows = (data?.orders || []).filter(
    (o) =>
      (o.id + " " + o.customer_name + " " + o.customer_email)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All" || o.status === filter.toLowerCase()),
  );
  const title = sections.find((s) => s.id === section)?.label;
  return (
    <SidebarProvider className="admin-shell">
      <Sidebar className="owner-sidebar">
        <SidebarHeader>
          <Brand />
          <span className="workspace-label">THE STORE WORKSPACE</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {sections.map((s) => (
              <SidebarMenuItem key={s.id}>
                <AdminNav
                  label={s.label}
                  active={section === s.id}
                  onClick={() => navigate(s.id)}
                  icon={<s.icon size={19} />}
                  count={
                    s.id === "orders"
                      ? pending.length
                      : s.id === "inventory"
                        ? low.length
                        : 0
                  }
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <a className="storefront-link" href="/">
            <ExternalLink size={17} /> Open storefront
          </a>
          <div className="owner-info">
            <div className="avatar">{state.user.name[0]}</div>
            <span>
              <strong>{state.user.name}</strong>
              <small>Store owner</small>
            </span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await api("auth/logout", {});
                await refresh();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <SidebarTrigger />
            <span>
              Workspace <span className="muted">/ {title}</span>
            </span>
          </div>
          <div>
            <span className="test-pill">TEST MODE</span>
            <span className="live-label">
              <i className={connected ? "online" : ""} />
              {connected ? "Connected" : "Reconnecting"}
            </span>
          </div>
        </header>
        <main id="main" className="admin-content">
          <div className="admin-heading">
            <div>
              <span className="eyebrow">COCOA LOCAL · MUMBAI</span>
              <h1>{section === "overview" ? "A good day to grow." : title}</h1>
              <p className="muted">
                {section === "overview"
                  ? "A little clarity on everything happening in your store."
                  : (
                      {
                        products:
                          "Your catalogue, prices and product details, all in one place.",
                        inventory:
                          "Track every batch. Keep the good things in stock.",
                        orders: "From a happy choice to a happy doorstep.",
                        customers: "Meet your growing neighbourhood.",
                        offers: "A little extra reason to make someone’s day.",
                        activity:
                          "A clear record of changes across your store.",
                        settings:
                          "The details that keep your neighbourhood shop running.",
                      } as Record<string, string>
                    )[section]}
              </p>
            </div>
            {section === "products" ? (
              <button className="button" onClick={() => setProduct(null)}>
                <Plus size={17} /> Add product
              </button>
            ) : section === "offers" ? (
              <button className="button" onClick={() => setCoupon(null)}>
                <Plus size={17} /> Create offer
              </button>
            ) : (
              <button
                className="icon-button"
                onClick={() => void load()}
                aria-label="Refresh workspace"
              >
                <RefreshCw size={18} />
              </button>
            )}
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button className="text-button" onClick={() => void load()}>
                Retry
              </button>
            </div>
          )}
          {!data ? (
            <Loading />
          ) : (
            <>
              {section === "overview" && (
                <>
                  <div className="metric-grid">
                    <Metric
                      label="Test sales"
                      value={money(revenue)}
                      note="Excludes cancelled & refunded orders"
                      icon={<IndianRupee />}
                    />
                    <Metric
                      label="Orders"
                      value={String(data.orders.length)}
                      note={`${pending.length} waiting to be fulfilled`}
                      icon={<ShoppingBag />}
                    />
                    <Metric
                      label="Customers"
                      value={String(data.customers.length)}
                      note={`${data.customers.filter((c) => c.verified).length} verified accounts`}
                      icon={<Users />}
                    />
                    <Metric
                      label="Available units"
                      value={String(
                        data.products.reduce(
                          (s, p) => s + p.available_stock,
                          0,
                        ),
                      )}
                      note={`${low.length} products need attention`}
                      icon={<Boxes />}
                    />
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel sales-panel">
                      <div className="panel-title">
                        <div>
                          <span className="eyebrow">A LITTLE EVERY DAY</span>
                          <h2>Sales this week</h2>
                        </div>
                        <span className="muted text-small">
                          Test orders · INR
                        </span>
                      </div>
                      <SalesChart orders={activeOrders} />
                    </section>
                    <section className="panel attention-panel">
                      <TriangleAlert size={23} />
                      <h2>A little attention.</h2>
                      <p className="muted text-small">
                        Keep your customers’ favourites close.
                      </p>
                      {low.length ? (
                        low.slice(0, 3).map((p) => (
                          <button
                            key={p.id}
                            className="low-stock-row"
                            onClick={() => setStock(p)}
                          >
                            <img src={p.image} alt="" />
                            <span>
                              <strong>{p.name}</strong>
                              <small>
                                {p.available_stock} left · target{" "}
                                {p.reorder_level}
                              </small>
                            </span>
                            <Plus size={17} />
                          </button>
                        ))
                      ) : (
                        <p className="notice">
                          All products are above their reorder levels.
                        </p>
                      )}
                      <button
                        className="text-button"
                        onClick={() => navigate("inventory")}
                      >
                        View all inventory
                      </button>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Fresh from the neighbourhood</h2>
                      <button
                        className="text-button"
                        onClick={() => navigate("orders")}
                      >
                        All orders
                      </button>
                    </div>
                    {data.orders.length ? (
                      <OrderTable
                        orders={data.orders.slice(0, 5)}
                        onSelect={setOrder}
                      />
                    ) : (
                      <Empty title="Your first order starts the story.">
                        Place a test order in the storefront to see it here.
                      </Empty>
                    )}
                  </section>
                  <div className="admin-demo-note">
                    <Leaf size={18} />
                    <p>
                      You’re in a local test workspace. Sales, payments and
                      sample inventory are for trying the complete store flow.
                    </p>
                  </div>
                </>
              )}
              {section === "products" && (
                <>
                  <div className="admin-toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Search name, brand or SKU…"
                    />
                    <Choice
                      label="Product status"
                      value={filter}
                      onChange={setFilter}
                      options={["All", "Active", "Archived", "Low stock"]}
                    />
                    <button
                      className="button outline"
                      onClick={() =>
                        csvDownload("cocoa-products.csv", [
                          [
                            "SKU",
                            "Name",
                            "Category",
                            "Price INR",
                            "MRP INR",
                            "Stock",
                            "Available",
                            "Status",
                          ],
                          ...productRows.map((p) => [
                            p.sku,
                            p.name,
                            p.category,
                            p.price / 100,
                            p.mrp / 100,
                            p.stock,
                            p.available_stock,
                            p.active ? "Active" : "Archived",
                          ]),
                        ])
                      }
                    >
                      <Download size={16} /> Export
                    </button>
                  </div>
                  <div className="table-panel">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            "Product",
                            "Category",
                            "Price / MRP",
                            "Available",
                            "Status",
                            "",
                          ].map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productRows.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="table-product">
                                <img src={p.image} alt="" />
                                <span>
                                  <strong>{p.name}</strong>
                                  <small>
                                    {p.sku} · {p.weight}
                                  </small>
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{p.category}</TableCell>
                            <TableCell>
                              <strong>{money(p.price)}</strong>
                              <small className="block muted">
                                {money(p.mrp)}
                              </small>
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  p.available_stock <= p.reorder_level
                                    ? "low-number"
                                    : ""
                                }
                              >
                                {p.available_stock} units
                              </span>
                            </TableCell>
                            <TableCell>
                              <Status
                                value={p.active ? "active" : "archived"}
                              />
                            </TableCell>
                            <TableCell>
                              <button
                                className="text-button"
                                onClick={() => setProduct(p)}
                              >
                                Edit
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!productRows.length && (
                      <Empty title="No matching products." />
                    )}
                  </div>
                </>
              )}
              {section === "inventory" && (
                <>
                  <div className="metric-grid three">
                    <Metric
                      label="Available stock value"
                      value={money(
                        data.products.reduce(
                          (s, p) => s + p.available_stock * p.cost,
                          0,
                        ),
                      )}
                      note="At unit cost"
                      icon={<IndianRupee />}
                    />
                    <Metric
                      label="Low stock"
                      value={String(low.length)}
                      note="At or below reorder level"
                      icon={<TriangleAlert />}
                    />
                    <Metric
                      label="Expiring in 30 days"
                      value={String(
                        data.batches
                          .filter(
                            (b) =>
                              b.quantity > 0 &&
                              b.expires_on >=
                                new Date().toISOString().slice(0, 10) &&
                              Date.parse(b.expires_on) - Date.now() <
                                30 * 86400000,
                          )
                          .reduce((s, b) => s + b.quantity, 0),
                      )}
                      note="Units to review first"
                      icon={<Package />}
                    />
                  </div>
                  <Tabs defaultValue="stock">
                    <TabsList>
                      <TabsTrigger value="stock">Stock overview</TabsTrigger>
                      <TabsTrigger value="batches">
                        Batches & expiry
                      </TabsTrigger>
                      <TabsTrigger value="movements">Stock history</TabsTrigger>
                    </TabsList>
                    <TabsContent value="stock">
                      <div className="table-panel">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead>On hand</TableHead>
                              <TableHead>Sellable</TableHead>
                              <TableHead>Reorder at</TableHead>
                              <TableHead>Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.products.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell>
                                  <div className="table-product">
                                    <img src={p.image} alt="" />
                                    <span>
                                      <strong>{p.name}</strong>
                                      <small>{p.sku}</small>
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>{p.stock}</TableCell>
                                <TableCell>
                                  <span
                                    className={
                                      p.available_stock <= p.reorder_level
                                        ? "low-number"
                                        : ""
                                    }
                                  >
                                    {p.available_stock}
                                  </span>
                                </TableCell>
                                <TableCell>{p.reorder_level}</TableCell>
                                <TableCell>
                                  <button
                                    className="button outline small"
                                    onClick={() => setStock(p)}
                                  >
                                    Adjust stock
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                    <TabsContent value="batches">
                      <div className="table-panel">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {[
                                "Product / lot",
                                "Supplier",
                                "Remaining",
                                "Expiry",
                                "Status",
                              ].map((h) => (
                                <TableHead key={h}>{h}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.batches.map((b) => (
                              <TableRow key={b.id}>
                                <TableCell>
                                  <strong>{b.product_name}</strong>
                                  <small className="block muted">{b.lot}</small>
                                </TableCell>
                                <TableCell>{b.supplier}</TableCell>
                                <TableCell>{b.quantity}</TableCell>
                                <TableCell>{b.expires_on}</TableCell>
                                <TableCell>
                                  <Status
                                    value={
                                      !b.quantity
                                        ? "depleted"
                                        : b.expires_on <
                                            new Date()
                                              .toISOString()
                                              .slice(0, 10)
                                          ? "expired"
                                          : Date.parse(b.expires_on) -
                                                Date.now() <
                                              30 * 86400000
                                            ? "expiring"
                                            : "active"
                                    }
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="muted text-small space-top">
                        Expired batches are excluded from checkout. Orders
                        consume the earliest eligible expiry first.
                      </p>
                    </TabsContent>
                    <TabsContent value="movements">
                      <div className="table-panel">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {["When", "Product", "Change", "Reason"].map(
                                (h) => (
                                  <TableHead key={h}>{h}</TableHead>
                                ),
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.movements.map((m) => (
                              <TableRow key={m.id}>
                                <TableCell>{date(m.created_at)}</TableCell>
                                <TableCell>{m.product_name}</TableCell>
                                <TableCell
                                  className={
                                    m.delta > 0 ? "saving" : "low-number"
                                  }
                                >
                                  {m.delta > 0 ? "+" : ""}
                                  {m.delta}
                                </TableCell>
                                <TableCell className="wrap-cell">
                                  {m.reason}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </Tabs>
                </>
              )}
              {section === "orders" && (
                <>
                  <div className="admin-toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Find an order or customer…"
                    />
                    <Choice
                      label="Order status"
                      value={filter}
                      onChange={setFilter}
                      options={[
                        "All",
                        "Confirmed",
                        "Packing",
                        "Shipped",
                        "Delivered",
                        "Cancelled",
                        "Refunded",
                      ]}
                    />
                    <button
                      className="button outline"
                      onClick={() =>
                        csvDownload("cocoa-orders.csv", [
                          [
                            "Order",
                            "Date",
                            "Customer",
                            "Status",
                            "Total INR",
                            "Payment",
                          ],
                          ...orderRows.map((o) => [
                            o.id,
                            o.created_at,
                            o.customer_name,
                            o.status,
                            o.total / 100,
                            o.payment_status,
                          ]),
                        ])
                      }
                    >
                      <Download size={16} /> Export
                    </button>
                  </div>
                  <div className="table-panel">
                    {orderRows.length ? (
                      <OrderTable orders={orderRows} onSelect={setOrder} />
                    ) : (
                      <Empty title="No orders here yet.">
                        Test purchases will appear here automatically.
                      </Empty>
                    )}
                  </div>
                </>
              )}
              {section === "customers" && (
                <>
                  <div className="admin-toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Find a customer by name or email…"
                    />
                  </div>
                  <div className="table-panel">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            "Customer",
                            "Contact",
                            "Email verified",
                            "Orders",
                            "Test spend",
                            "Joined",
                          ].map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.customers
                          .filter((c) =>
                            (c.name + " " + c.email)
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>
                                <strong>{c.name}</strong>
                              </TableCell>
                              <TableCell>
                                {c.email}
                                <small className="block muted">{c.phone}</small>
                              </TableCell>
                              <TableCell>
                                <Status
                                  value={c.verified ? "verified" : "pending"}
                                />
                              </TableCell>
                              <TableCell>{c.order_count}</TableCell>
                              <TableCell>{money(c.spent)}</TableCell>
                              <TableCell>{date(c.created_at)}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    {!data.customers.length && (
                      <Empty title="Your neighbourhood starts here.">
                        Registered customers will appear here.
                      </Empty>
                    )}
                  </div>
                </>
              )}
              {section === "offers" && (
                <div className="offers-grid">
                  {data.coupons.map((c) => (
                    <article className="coupon-card" key={c.code}>
                      <div>
                        <Tag />
                        <Status value={c.active ? "active" : "paused"} />
                      </div>
                      <strong className="offer-percent">
                        {c.percent}% <span>off</span>
                      </strong>
                      <h2>{c.code}</h2>
                      <p>
                        On orders of {money(c.min_total)} or more.
                        <br />
                        Save up to {money(c.max_discount)}.
                      </p>
                      <div className="coupon-detail">
                        <span>
                          {c.used} / {c.usage_limit} used
                        </span>
                        <span>Ends {c.expires_on}</span>
                      </div>
                      <button
                        className="button outline full"
                        onClick={() => setCoupon(c)}
                      >
                        Edit offer
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {section === "activity" && (
                <div className="table-panel">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Date", "Team member", "Action", "Details"].map(
                          (h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ),
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.audit.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{date(a.created_at)}</TableCell>
                          <TableCell>{a.actor_name || "System"}</TableCell>
                          <TableCell>
                            {a.action.replaceAll(".", " · ")}
                          </TableCell>
                          <TableCell className="wrap-cell">
                            <code>{a.detail}</code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!data.audit.length && (
                    <Empty title="A fresh start.">
                      Changes to products, stock and orders will be recorded
                      here.
                    </Empty>
                  )}
                </div>
              )}
              {section === "settings" && (
                <SettingsEditor config={data.config} onDone={done} />
              )}
            </>
          )}
        </main>
      </div>
      <Dialog
        open={product !== undefined}
        onOpenChange={(o) => !o && setProduct(undefined)}
      >
        <DialogContent className="editor-dialog">
          <DialogHeader>
            <DialogTitle>
              {product ? "Edit product" : "Something new for the shop."}
            </DialogTitle>
            <DialogDescription>
              Keep your product details accurate and helpful.
            </DialogDescription>
          </DialogHeader>
          {product !== undefined && (
            <ProductEditor
              product={product}
              onDone={async () => {
                setProduct(undefined);
                await done();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!stock} onOpenChange={(o) => !o && setStock(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {stock?.name} · Every change is recorded in stock history.
            </DialogDescription>
          </DialogHeader>
          {stock && data && (
            <StockEditor
              product={stock}
              batches={data.batches.filter((b) => b.product_id === stock.id)}
              onDone={async () => {
                setStock(null);
                await done();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={coupon !== undefined}
        onOpenChange={(o) => !o && setCoupon(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {coupon ? "Edit offer" : "A little extra sweetness."}
            </DialogTitle>
            <DialogDescription>
              Offers apply once per customer and are validated at checkout.
            </DialogDescription>
          </DialogHeader>
          {coupon !== undefined && (
            <CouponEditor
              coupon={coupon}
              onDone={async () => {
                setCoupon(undefined);
                await done();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!order} onOpenChange={(o) => !o && setOrder(null)}>
        <DialogContent className="order-dialog">
          <DialogHeader>
            <DialogTitle>{order?.id}</DialogTitle>
            <DialogDescription>
              Manage fulfillment, returns and the simulated payment.
            </DialogDescription>
          </DialogHeader>
          {order && (
            <OrderEditor
              order={data?.orders.find((o) => o.id === order.id) || order}
              onDone={done}
            />
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function AdminNav({
  label,
  active,
  onClick,
  icon,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count: number;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      isActive={active}
      onClick={() => {
        onClick();
        setOpenMobile(false);
      }}
      className="admin-nav-button"
    >
      {icon}
      <span>{label}</span>
      {count > 0 && <b>{count}</b>}
    </SidebarMenuButton>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="metric-card">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function OrderTable({
  orders,
  onSelect,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {["Order", "Customer", "Date", "Total", "Status", ""].map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id}>
            <TableCell>
              <strong>{o.id}</strong>
              <small className="block muted">
                {o.items.reduce((s, i) => s + i.quantity, 0)} items
              </small>
            </TableCell>
            <TableCell>
              {o.customer_name}
              <small className="block muted">{o.customer_email}</small>
            </TableCell>
            <TableCell>{date(o.created_at)}</TableCell>
            <TableCell>{money(o.total)}</TableCell>
            <TableCell>
              <Status value={o.status} />
            </TableCell>
            <TableCell>
              <button className="text-button" onClick={() => onSelect(o)}>
                Manage
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function SalesChart({ orders }: { orders: Order[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
    };
  });
  const sums = days.map((d) =>
    orders
      .filter((o) => o.created_at.startsWith(d.date))
      .reduce((s, o) => s + o.total, 0),
  );
  const max = Math.max(...sums, 10000);
  return (
    <div
      className="sales-chart"
      role="img"
      aria-label={
        "Test sales for the past seven days: " +
        days.map((d, i) => d.label + " " + money(sums[i])).join(", ")
      }
    >
      <div className="chart-total">
        {money(sums.reduce((a, b) => a + b, 0))}
        <span>over the last 7 days</span>
      </div>
      <div className="chart-bars">
        {days.map((d, i) => (
          <div key={d.date}>
            <div className="bar-track">
              <span
                title={money(sums[i])}
                style={{ height: Math.max(2, (sums[i] / max) * 100) + "%" }}
              />
            </div>
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
