# Cocoa Local

A working local ecommerce application for a Mumbai chocolate shop. Built with Next.js 16, React 19, TypeScript, Node.js, PostgreSQL, Zod, Tailwind CSS and accessible Radix/Shadcn controls. The storefront uses Manrope and DM Sans, with a cocoa, cream and lime palette.

## Open the application

- Storefront: http://127.0.0.1:3000
- Customer accounts: http://127.0.0.1:3000/account
- Owner workspace: http://127.0.0.1:3000/admin

Start the server from this folder with Node.js 24 or newer:

```powershell
npm install
npm run db:local
npm run db:migrate
npm run dev
```

PostgreSQL must also be available. This project has an isolated PostgreSQL 17 cluster and the existing store data has been imported. For another computer or Docker setup, see [DATABASE.md](DATABASE.md).

Or double-click `Start-Local.cmd` after dependencies are installed. Keep its terminal open while using the store. Press Ctrl+C to stop. If port 3000 is already in use by this app, use the existing server instead of starting another.

For an optimized local build, stop the development server and run:

```powershell
npm run build
npm start
```

Both commands bind to 127.0.0.1. This delivery is local-only and has not been deployed publicly.

## First login

The owner email and randomly generated password are in `.local-access.json`. The file is excluded from Git. It is created once when the first database is initialized. The same file also contains the fictional customer account used for browser testing, with one test order and a sample address.

To try registration yourself:

1. Add chocolate to the bag, then open checkout or My account.
2. Choose Create account and enter a name, email, Indian mobile contact number, and a password of at least 12 characters.
3. Click Open local test inbox. Copy the six-digit verification code into the form.
4. Save a fictional Mumbai address; 400050 is a supported test pincode.
5. Choose a payment method and a successful or declined test result.
6. Place a test order. It appears in My orders and the owner workspace.

Email ownership is simulated through the local inbox. Mobile numbers are validated for format, but are not OTP-verified. No real email, SMS, bank, card or wallet service is contacted. Use fictional contact details in this local demonstration.

## Included features

| Area               | Working features                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storefront         | Real product images, responsive layouts, search, category/brand filters, sorting, product details, ingredients/allergens, availability, wishlists and verified-purchase reviews |
| Accounts           | Registration, email verification, resend code, login/logout, password reset, profile editing and saved addresses                                                                |
| Bag and checkout   | Persistent guest/account bags, guest merge on login, quantity validation, pincode restrictions, gift notes, coupons, delivery fees and free-delivery thresholds                 |
| Payment testing    | Local simulations of credit card, debit card, Google Pay, UPI, net banking and PayPal; success and decline paths; no payment details collected                                  |
| Customer orders    | Order history, status timeline, tracking reference, printable receipt, cancellation before packing and return requests after delivery                                           |
| Product management | Create/edit/archive products, per-SKU variants, flexible categories, prices/MRP/costs, featured products, image upload and optimistic concurrency checks                        |
| Inventory          | Batch and supplier records, expiry dates, stock receipts/removals, stock movement history, reorder alerts, sellable quantities and expiry-first fulfillment                     |
| Fulfillment        | Confirmed → packing → shipped → delivered; tracking required for shipment; cancellation restores original batches; approved returns allow simulated refunds                     |
| Reporting          | Actual local test sales, weekly sales chart, order/customer totals, inventory valuation, product/order CSV exports and activity history                                         |
| Store settings     | Delivery fees, free-delivery threshold, delivery estimate and exact supported Mumbai pincodes                                                                                   |
| Synchronization    | PostgreSQL commit notifications refresh connected store/admin screens; one shared listener per app process, with focus refresh and a jittered 60–70 second fallback             |

The initial catalogue includes Cadbury Dairy Milk, Dairy Milk Silk and Silk Roast Almond, Nestlé KitKat variants, Amul dark chocolate, and Ferrero Rocher. Prices, taxes, stock quantities, lot numbers, expiry dates and policies are clearly marked sample data. Product variants are separate SKUs; additional food/clothing categories can be entered in the product editor.

## Data and security design

- PostgreSQL is the durable source of truth, configured with `DATABASE_URL`. The original `data/cocoa.sqlite` and a snapshot in `backups/` are preserved as pre-migration backups. No customer/order/inventory data is stored only in browser storage.
- Schema migrations: `db/postgres/*.sql`, executed explicitly by `npm run db:migrate` under an advisory lock with checksums. Runtime requests never create or seed tables.
- Passwords use salted scrypt (N=32768, r=8, p=1). Verification/reset codes expire after 10 minutes and have attempt limits. Authentication routes are rate limited.
- Opaque random session tokens are hashed in the database and carried in HttpOnly, SameSite=Lax cookies. Password reset revokes all sessions. Cookies are intentionally usable over local HTTP; public deployment requires HTTPS and Secure cookies.
- Every protected API authorizes on the server. Customer ownership checks protect addresses, orders and reviews; owner mutations require the admin role.
- State-changing requests require same-origin JSON or authorized image upload. Non-local Host headers are rejected. SQL parameters are bound rather than interpolated.
- Checkout reads prices, offers, shipping, tax and stock from the server. Monetary values are integer paise. Client totals are checked, never trusted as prices.
- Order creation, inventory deductions, lot allocations, offer usage and bag clearing commit atomically under a PostgreSQL transaction with cart, product and coupon row locks. Idempotency keys prevent duplicate orders. Expired batches cannot be sold.
- Cancellation restores the original allocations only once. Refunds do not automatically restock returned food.
- Product image uploads are limited to 5 MB with PNG/JPEG/WebP signature checks. CSV exports guard against spreadsheet-formula injection.
- Security headers include a content security policy, frame protection, content-type protection and restricted browser permissions. The local CSP permits inline framework scripts/styles; development additionally permits eval.
- The local test inbox is intentionally accessible without mailbox ownership to support testing. The server must remain bound to localhost. `APP_MODE=live` fails closed.

## Project map

- `app/`: storefront, account, checkout, admin, help, receipts and API route.
- `components/`: customer/owner screens and accessible UI primitives.
- `lib/server/db.mjs`: bounded PostgreSQL pool and transaction context; `migrate.mjs` and `seed.mjs`: explicit migration/seed operations.
- `lib/server/auth.mjs`: password/session/challenge handling and guest bags.
- `lib/server/commerce.mjs`: prices, checkout, inventory and order transitions.
- `lib/server/api.mjs`: validated API handlers, authorization, local mail and event stream.
- `lib/types.ts`: shared UI data contracts.
- `tests/commerce.test.mjs`: isolated integration tests; does not touch the app database.
- `ASSET-SOURCES.json`: original photo URLs and rights notes.

The bundled starter's unused Cloudflare/Sites helpers are retained, but this local app runs directly on Next.js and Node, not a Cloudflare Worker. The active migration workflow is `npm run db:migrate`; Drizzle/Sites starter helpers are unused.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

The integration suite covers authentication, code reuse, access restrictions, CSRF/origin checks, persistent bags, ownership, totals/coupons, manipulated totals, declined payments, duplicate requests, concurrent last-unit purchases, stock reconciliation, cancellations, fulfillment, returns, refunds, stale product edits and password reset/session revocation. Browser checks covered mobile registration, verification, address entry, checkout and the owner dashboard, alongside the desktop storefront. PostgreSQL concurrency tests also cover multi-customer inventory contention, duplicate checkouts, coupon limits, rate limits, one-time codes, rollback and commit notifications.

## Backup

Use PostgreSQL logical backups (`pg_dump` / `pg_restore`) or managed backups and point-in-time recovery. Back up product uploads separately. See [DATABASE.md](DATABASE.md) for cutover, restore, pool sizing, TLS, roles, Docker and testing. Keep credentials and backup files private.

## What remains before a real launch

This is a complete local workflow implementation, not a claim that every enterprise-commerce feature exists or that the system has passed an independent production security audit.

1. Replace the local payment simulator with a provider integration: server-created payment orders, signed and replay-protected webhooks, pending-payment stock reservations with expiry, settlement reconciliation and provider refunds. A browser callback must never mark an order paid by itself.
2. Replace the local inbox with a transactional email provider; disable its public development endpoint and plaintext test messages. Add owner MFA, production secret management, HTTPS/Secure cookies, a stricter nonce CSP, abuse controls and monitoring.
3. Supply approved products/prices/ingredients/pack sizes, image rights, actual tax configuration, serviceable pincodes, business identity/contact information and final operating/privacy policies. The sample receipt is not a tax invoice.
4. Choose hosting and a managed PostgreSQL/upload deployment. PostgreSQL supports a shared database across app replicas; configure the connection budget and use object storage for images. Add pagination and server-side reports for large catalogues and order histories. Add scheduled backups, restore drills, alerting, retention/deletion workflows and load tests for the expected traffic.

**PayPal and India:** PayPal's current India help page says Indian merchants cannot receive domestic payments. The PayPal option here is only a simulator and must not be enabled for a Mumbai-only live checkout. See [PayPal India domestic-payment support](https://www.paypal.com/in/cshelp/article/can-i-use-paypal-to-receive-payments-from-indian-customers-help1049). A live India checkout should use an eligible provider for cards and UPI/Google Pay.

Subscriptions, multiple warehouses, purchase-order procurement, split shipments, partial refunds, complex tax invoicing, advanced staff permissions, SMS OTP and courier integrations are not implemented in this first local version.

Brand photography and packaging remain owned by their rights holders. This local demo does not imply brand affiliation or grant commercial image rights. See `ASSET-SOURCES.json` before public use.

## iPhone app

The `ios/` folder contains a native iPhone app that preserves this shop interface.
Double-click `Start-IPhone.cmd` to run the PC shop and its paired HTTPS relay.
The phone and PC must be on the same reachable network, and the PC must stay on.
The backend and PostgreSQL remain on loopback; the relay requires the personal
app's pairing key and checks the request host/origin before forwarding.
See [iPhone setup and build instructions](ios/README.md).
