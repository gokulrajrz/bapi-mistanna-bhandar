# Bapi Mistanna Bhandar

React 19, Vite, TypeScript and TanStack Query storefront with a Cloudflare Pages Functions BFF, Supabase Postgres/Auth/Storage, and a Cloudflare scheduled maintenance Worker. No Next.js runtime is used.

```text
React → TanStack Query → same-origin /api/* → Cloudflare BFF → Supabase
                                             ↓
                                          Razorpay
Cloudflare scheduled Worker → reconciliation / expiry / refunds → Supabase
```

**All application database, authentication and storage communication goes through Cloudflare.** Supabase credentials and auth tokens never enter the browser bundle. Sessions use HttpOnly cookies; database tables have RLS and commerce RPCs are restricted to `service_role`. Razorpay Checkout and Turnstile communicate with their respective providers in the browser.

## Preview

```bash
npm ci
cp .env.example .env
npm run dev
```

Visit `/` for the storefront and `/admin` for the admin preview. Demo checkout takes no payment. Admin preview changes stay in memory in that tab and do not publish to the storefront. Live mode uses authenticated BFF writes. The confirmed address is Near Overbridge, Mancotta Road, Dibrugarh, Assam 786001.

## Admin panel

Owners manage branding, theme colours, homepage copy and imagery, navigation, section visibility, story/gifting content, metadata defaults, contact details, policies, fees, pickup, reservation windows, cancellation rules, maintenance and checkout switches, and staff roles. Managers manage products, variants, inventory, private image uploads, delivery zones, coupons, collections, scheduled festivals, journal entries, store details, review moderation, orders and refund reconciliation.

Order details include customer/fulfilment information, gift instructions and status history. Staff advance allowed fulfilment states and cancel eligible orders; captured payments queue a full refund. Writes validate on the BFF and critical operations are audited in the database. Last-owner removal is prevented. Inventory quantities represent available stock, excluding existing reservations. Deactivate records to remove them from sale without breaking order history.

Infrastructure credentials, cron scheduling, domain and deployment settings remain in Cloudflare. The admin panel reports configuration presence without disclosing secrets. Business configuration does not require rebuilding the app; public content may take up to 30 seconds to refresh.

## Database and authentication setup

1. Apply **all** files in `supabase/migrations` in numeric order (001–008) to a new Supabase project. Back up existing data before applying migrations to an existing store.
2. For development only, run `npm run seed:generate` and apply `supabase/seed.sql`. Prices, stock, ingredients, shelf life and images are illustrative. Do not reapply the seed over live inventory.
3. Create a **private** Storage bucket named `store-media`. BFF uploads allow JPEG/PNG/WebP/AVIF up to 5 MB and serve them through `/api/media/*`.
4. Enable email OTP in Supabase Auth; configure the email template to display `{{ .Token }}` and configure production SMTP. Sign-in and verification happen through BFF routes, not a browser Supabase client. See [Supabase email OTP configuration](https://supabase.com/docs/guides/auth/auth-email-passwordless).
5. Sign in once, then bootstrap the first owner using that user's UUID in trusted Supabase SQL administration:

```sql
insert into public.admin_users(user_id, role)
values ('REPLACE_WITH_AUTH_USER_UUID', 'owner');
```

Additional owners/managers are assigned in Team access. Customers can manage profiles, addresses, order history and versioned carts. Reviews require a completed authenticated purchase and remain unpublished until moderated.

## Cloudflare deployment

Create a Pages project with build command `npm run build`, output `dist`, and Node 22. The root `functions` directory supplies the BFF and live metadata middleware. Asset paths bypass Functions; public HTML receives database-backed metadata. Demo/private routes are noindexed. See [Pages Functions](https://developers.cloudflare.com/pages/functions/).

Build variables: set `VITE_DEMO_MODE=false` and `VITE_SITE_URL=https://your-domain.com`. The other `VITE_*` examples are demo defaults; live business settings come from the database. Never prefix a secret with `VITE_`.

Configure these Pages runtime variables/secrets:

| Variable                                     | Purpose                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| `DEMO_MODE=false`                            | Live metadata and sitemap                               |
| `SUPABASE_URL`                               | Supabase project URL                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                  | Private server credential                               |
| `SITE_URL`                                   | Canonical HTTPS domain                                  |
| `ALLOWED_ORIGIN`                             | Optional exact write origin; defaults to request origin |
| `CHECKOUT_ENABLED`                           | Infrastructure gate, initially `false`                  |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`     | Merchant gateway credentials                            |
| `RAZORPAY_WEBHOOK_SECRET`                    | Separate webhook signing secret                         |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Checkout bot protection                                 |

For local BFF development, copy `.dev.vars.example` to `.dev.vars`, fill in local secrets, then run `npm run dev:cloudflare`. Vite alone runs the frontend preview.

Deploy the app with `npm run deploy`. Separately deploy the scheduled Worker with `npm run deploy:maintenance`; configure its `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` secrets using the `wrangler.maintenance.toml` configuration. Its five-minute cron is required for expiry/refund reconciliation. No public maintenance endpoint exists. Both application runtimes deploy to Cloudflare.

## Checkout and payment lifecycle

The BFF creates a ten-minute authoritative quote, validating current prices, aggregated quantities, coupons, delivery pincode, India dates, cold-chain requirements and shelf life. Reserving a quote atomically reduces available stock and snapshots order lines. A quote creates at most one order; client request IDs survive reloads. Reservations expire after the configured window.

Razorpay orders are created server-side. Callback signatures and raw webhook signatures are verified, and captured amount/currency are checked against the stored order. Configure the merchant for automatic capture and route `payment.captured`, `order.paid`, `refund.processed` and `refund.failed` webhooks to `/api/payments/webhook`. Use separate test and live secrets. Follow [Razorpay's integration and test procedure](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).

Cancellation and expiry release stock once. Late captured payments queue refunds instead of reviving released reservations. Provider timeouts with uncertain creation outcomes are reconciled by receipt; the system avoids blindly creating another payment/refund. Admin Refunds surfaces cases requiring review. Full refunds are supported; partial refunds and exchanges are not implemented.

## Validation and operations

```bash
npm test                 # Embedded Postgres transactions and security checks
npm run check:bff        # Functions/Worker TypeScript
npm run build            # Frontend TypeScript and production assets
npm run build:bff        # Cloudflare Functions bundle
npm run test:e2e         # Auto-starts Vite; Chromium commerce/admin/axe checks
npm run test:cloudflare  # Running Wrangler at :8791 required, or set SMOKE_ORIGIN
```

CI runs types, database/security tests, builds, browser flows and automated WCAG checks. These checks do not certify accessibility or replace real gateway acceptance tests. See [operations runbook](docs/operations.md) for launch and incident handling.

Live launch requires merchant credentials, owner bootstrap, approved catalogue/photos/policies, confirmed opening hours/phone and actual delivery rules. Approve business details and enable checkout in admin only after test-mode acceptance, then enable the infrastructure gate. Keep demo and live mode consistent in build and runtime environments. Auth email delivery uses Supabase SMTP; transactional order emails/SMS, tax invoices, courier integrations, and accounting integrations are not implemented.
