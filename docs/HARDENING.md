# Implementation and verification

The app uses React and TanStack Query with Cloudflare Pages Functions as the exclusive application boundary for Supabase database, authentication and Storage access. Credentials and session tokens stay server-side.

## Completed fixes

- Product, variant and inventory revision checks reject stale admin stock edits after sales or another staff edit.
- Cart conflict resolution fetches the latest revision before keeping local changes; network failures preserve unsaved items.
- Admin customer profiles, staff notes, addresses and order history; configurable logo/favicon, page copy, gifting cards and box sizes.
- Product-specific storage, freshness and cross-contact information; illustrative-product disclosures confined to demo mode.
- Complete metadata replacement during client navigation, including canonical, Open Graph, robots and structured data.
- Pages Functions uses bundled WebAssembly to decode JPEG/PNG/WebP and generate responsive WebP uploads, with pre-decode size/dimension checks and cleanup after partial storage failures. No image-processing service binding is required.
- Self-hosted fonts, compressed catalogue images, early product-image loading, reduced initial JavaScript and stable loading layouts.
- Fixed a PostgreSQL rate-limit parameter/column ambiguity exposed by real BFF integration tests.
- Maintenance heartbeat, admin queue-health indicators, minimal public health endpoint and an optional scheduled health-check workflow.
- Database setup bundle and guarded application-schema restore-drill tooling; updated deployment and operations instructions.

Additional requirement-gap fixes:

- Footer columns/links/signature, catalogue headings, price/dietary/occasion options, product badges, cart recommendations and story motion are editable under Storefront → Experience in admin.
- Quick-add chooses the first in-stock variant rather than incorrectly labelling the whole product sold out.
- The cart supports pincode/date/pickup/coupon estimates through a read-only BFF calculation; tests prove it ignores browser prices and does not create quotes or reserve stock. Suggestions exclude products already in the bag.
- Published-review averages/counts are aggregated in PostgreSQL and displayed on cards and product pages, without a per-card request or invented reviews. Apply migration 014 before deploying this code.
- Story sections reveal on scroll with a reduced-motion fallback, box additions animate subtly, and card buttons acknowledge additions.
- Responsive checks cover 320, 375, 390, 430, 768, 1440 and 1920px, including account, checkout and admin. The open cart has an additional 320px accessibility check.
- Approved public metadata and unknown-route noindex/404 behavior are tested. This does not replace live-domain SEO verification.

Latest audit corrections:

- Cart pincode, fulfilment method, preferred date and coupon share a tab-scoped delivery draft with checkout. Closing the drawer and reloading preserve it; clearing the cart resets it. Full contact/address information is not stored in this draft.
- Every explicit repeat estimate submission refetches the BFF even when inputs are unchanged.
- Disabling recommendations now suppresses cached suggestions as well as network requests.
- Published reviews use indexed cursor pagination (20 per page), ordered by timestamp and UUID. Migration 015 is required. Regression coverage traverses 105 same-timestamp reviews with no duplicates and verifies unpublished reviews remain hidden. The UI appends subsequent pages and preserves existing reviews on a load-more failure.

Admin UI audit remediation:

- Typed array factories, sectioned editors, fixed identifiers, visible field validation, dirty-discard confirmation, and coordinated upload/save state.
- Image previews/reordering, searchable relationship choices, India-time scheduling, mobile cards and accessible section selection.
- BFF search/filter/sort before pagination, enriched operational rows, gift-box packing quantities, tracking and paginated linked customer history.
- Owner-only audited staff revocation, synchronized contact/pickup settings, and method-aware database fulfilment transitions. Migration 016 is required before deployment.
- Explicit session/access/health failure states, operator identity/sign-out, and scoped storefront footer styling to prevent editor contrast regressions.

**30 September follow-up fixes:** all five recorded gaps now have targeted regression coverage. Dirty/pending forms block React Router navigation; variant moves normalize persisted sort numbers; Store/settings revisions reject stale synchronized writes; customer-history pages use a unique tie-breaker and distinguish empty accounts from empty pages. Apply migration 017 before this release. See the [audit resolution](ADMIN-UI-AUDIT.md#follow-up-resolution--30-september-2026).

## Pages image processing — 17 November 2026

Image uploads now decode and resize with Photon WebAssembly and encode WebP at quality 82 with libwebp WebAssembly, all inside Pages Functions. The separate image Worker, service binding, deployment script and configuration card have been removed. The scheduled commerce maintenance Worker remains independent.

JPEG/PNG/WebP uploads are limited to 5 MB, 2 megapixels and 4096 px per side before decoding. JPEG orientation is applied before encoding fresh metadata-free derivatives. AVIF and animated WebP uploads are rejected. A per-isolate processing guard prevents overlapping decode allocations; partial Storage writes are cleaned up. This implementation needs Workers Paid CPU allowance for uploads, rather than a Cloudflare Images subscription.

Real-codec and upload-handler tests cover all three input formats, output decoding/dimensions, orientation, malformed files, oversized headers, WebP canvas/frame mismatch, authorization/origin/rate limits, concurrent processing and Storage rollback. The current unit/database/BFF suite has 87 passing tests. Local workerd processed repeated 2-megapixel photographs, including rotated JPEGs; Photon's linear memory stayed at approximately 56 MiB in those runs. This is a local measurement, not a guarantee of total production memory or CPU use. The Functions bundle plus both WASM binaries measured approximately 1.06 MB gzip. Both Wrangler 4 and the Pages build service's Wrangler 3.114.17 bundled the WASM successfully. Live uploads against the deployed Supabase bucket remain an acceptance check.

## Verification performed on 30 September 2026

- **75 tests passed**, including embedded PostgreSQL migrations/transactions, actual BFF handlers, stock conflicts, cart resolution, metadata, image transformation and an embedded database backup/restore.
- **39 browser tests passed**: 21 storefront/admin/responsive/accessibility checks and 18 non-demo tests, including 14 admin workflow regressions, using isolated BFF and payment-widget fixtures.
- Frontend and BFF TypeScript passed; production build and Pages Functions build passed.
- Image-processing and maintenance Worker deployment dry runs passed. These did not deploy resources.
- Dependency installation audit reported zero known vulnerabilities after updating the transitive Undici dependency.

Mobile Lighthouse measurements from the preceding performance pass against the local production preview (not rerun for the subsequent audit corrections):

| Route      | Performance | Accessibility | Best practices |    LCP | CLS |
| ---------- | ----------: | ------------: | -------------: | -----: | --: |
| Homepage   |          98 |           100 |            100 | 2.25 s |   0 |
| Catalogue  |          96 |           100 |            100 | 2.72 s |   0 |
| Kaju Katli |          92 |           100 |            100 | 3.30 s |   0 |

The first performance recheck had a homepage blocking-time spike (71 performance, 1.04 s total blocking time); the repeat measured 98 and 15 ms. Both runs retained zero layout shift. The table records the latest run, not a guarantee across runs. The earlier summary is retained at `/tmp/bapi-performance-first/summary.json`.

Run `npm run preview` and `npm run audit:performance` to reproduce. Reports are written to `/tmp/bapi-performance`; results vary by machine and run. Demo pages intentionally block indexing, yielding SEO scores of 66–69. Production-domain indexing and field performance remain unmeasured. These scores do not establish WCAG certification or a production service-level guarantee.

## External setup still required

The configured Supabase project returned a missing-table response for the product catalogue. Migrations 001–017 have been validated locally, but have **not** been applied to that project. `npm run db:bundle` prepares the SQL for a fresh project; it does not execute it. Existing projects must apply only their unapplied migrations.

Live acceptance still needs database setup, initial-owner bootstrap, merchant credentials, SMTP/Turnstile configuration and maintenance Worker deployment. Image uploads need sufficient Pages Functions CPU allowance, not Cloudflare Images enablement. Real gateway payments/refunds, email delivery, external alert delivery and provider-level backup restoration have not been verified. The embedded restore test is separate from the unexecuted provider/database restore drill.

The business must confirm opening hours, phone, delivery/pickup rules, actual stock, catalogue claims, imagery and policies before enabling checkout. The address is confirmed. Infrastructure secrets remain in Cloudflare; the admin panel controls business settings. Transactional order email/SMS, tax invoices, courier/accounting integrations and partial refunds remain outside the implemented feature set. See the operations runbook for launch acceptance and recovery procedures.

Order notification, tax-invoice and courier integrations remain unimplemented pending the merchant’s provider choices and confirmed tax/business details. A clarification was requested; no credentials or tax treatment have been assumed. Live setup remains pending as described above. This pass is not a claim that every launch prerequisite has been completed.
