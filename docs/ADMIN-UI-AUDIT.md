# Admin portal UI audit — 29 September 2026

**30 September follow-up:** A20–A24 have now been fixed and covered by targeted regressions. The original reproductions are retained below, followed by the verified resolution.

The original audit identified **19 implementation or usability findings**, including four high-priority problems. The findings below preserve the pre-fix evidence. Remediation is recorded at the end of this document. Passing layout and accessibility tests alone did not establish that admin workflows were complete.

## Scope and evidence

Inspected all 15 navigation sections and the shared editor, upload, dialog, order, refund, customer-history and health components. Browser inspection covered 320, 390, 768 and 1440px in demo mode, plus populated owner/manager scenarios on the non-demo frontend with isolated API fixtures. Six additional resource-creation dialogs were inspected. No live customer data or production records were changed.

The 58 scanned page/dialog states returned no violations for the selected axe WCAG A/AA rules. No document-level horizontal overflow was observed at the tested widths. Nevertheless, mobile controls can be unusably narrow and workflow errors can remain invisible. Those are separate from automated rule compliance.

Evidence: [demo experiments](admin-ui-audit/demo.json), [populated screens](admin-ui-audit/live.json), [creation dialogs and validation](admin-ui-audit/more.json), [pending/error states](admin-ui-audit/states.json), [upload race](admin-ui-audit/upload.json). Screenshots below use illustrative fixtures. The temporary reproduction scripts remain in `/tmp/bapi-admin-audit`.

“Browser” means reproduced in Chromium. “Source” means traced through the relevant UI/API/schema; those findings are not claims of a completed live-provider test. Safari, Firefox, physical devices and assistive-technology testing remain outside this audit.

## High priority

### A01 — Adding configurable array entries can make the form impossible to save

**Browser + source.** Settings → commerce → Add boxSizes creates a **text** input. Entering a number leaves a string in state, producing `boxSizes.4: Invalid input: expected number, received string`. Storefront → Experience → Add prices fails identically. Add footerColumns creates `links` as a text input instead of an array. Removing every gifting card and adding one back creates a string rather than a card object.

Cause: the generic factory infers new values from the first item and replaces nested structures with empty strings; empty and numeric arrays also fall back to strings. [Admin.tsx](../src/pages/Admin.tsx#L98).

Fix: schema-aware factories for every array path, recursively preserve object/array types, enforce allowed cardinality, and test empty-array recovery. Staff must be able to add valid entries without editing JSON or the database.

### A02 — Custom gift-box orders omit the contents needed for packing

**Browser + source.** The order fixture contains six coconut laru and six Kaju Katli. Order details show only “Your signature mithai box / 12 handpicked pieces”; neither the sweet names nor their piece quantities appears. The snapshot already contains `boxItems`, but the renderer ignores it. [Admin.tsx](../src/pages/Admin.tsx#L885), [screenshot](admin-ui-audit/live-order-details.png).

Fix: render each constituent and quantity, distinguish pieces per box from the number of boxes ordered, and keep gift-wrap/recipient instructions together with the packing list.

### A03 — Team access cannot revoke access

**Source + inspected screen.** Team access offers Add and Edit with only `owner` or `manager`. There is no revoke/remove/disable action. Changing an employee to manager still grants admin access. The exposed schema/API supports upsert, not revocation. [Admin.tsx](../src/pages/Admin.tsx#L593), [admin-schema.ts](../shared/admin-schema.ts#L334).

Fix: add an explicitly labelled revoke-access workflow, backed by owner-authorized server handling and last-owner protection. Display an identifiable person rather than only a UUID.

### A04 — Saving while an image upload is pending publishes stale content and reopens the editor

**Browser + source.** With the upload response held, Save remains enabled. The captured PUT contains the old, empty image URL and the dialog closes. When upload finishes, its callback reopens the editor with `/api/media/catalogue/audit-1280.webp`, which has not been saved. [Upload implementation](../src/pages/Admin.tsx#L213), [save form](../src/pages/Admin.tsx#L655), [captured requests](admin-ui-audit/upload.json).

Fix: coordinate upload and save state; prevent publishing until uploads settle, cancel/ignore callbacks for closed or superseded editors, and clearly distinguish uploaded from published assets.

## Medium priority

### A05 — Dialog dismissal and editing during a save can discard work

**Browser + source.** Changing a product name and pressing Escape discards the change without a dirty-state warning. During a held customer save, Name remains editable. A later edit differs from the captured request and would be discarded when the earlier save succeeds. Escape closes the native dialog even while React keeps it mounted (`open: false`), despite the admin callback trying to block closure during saving. [Admin.tsx](../src/pages/Admin.tsx#L355), [close handler](../src/pages/Admin.tsx#L655), [Dialog](../src/components/ui.tsx#L90).

Fix: disable editing or track revisions during submission; explicitly prevent native `cancel` while busy; provide an intentional discard path for dirty forms. Do not silently close over later edits.

### A06 — Validation errors can be tens of screens away from the Save button

**Browser + source.** After an invalid storefront save, the error’s top was **18,142px** while the viewport was 900px. Focus remained on the sticky Save button; zero inputs had `aria-invalid`. The visible screen gave no indication of what needed correction. Error copy exposes paths such as `experience.prices.3`. [Admin.tsx](../src/pages/Admin.tsx#L390), [error output](../src/pages/Admin.tsx#L685), [screenshot](admin-ui-audit/storefront-validation.png).

Fix: show a visible error summary beside the action area, map errors to fields with descriptive labels, mark invalid inputs, and focus/scroll to the first error. Clear obsolete errors when corrected or on resubmission.

### A07 — Store controls conflict with the settings that actually govern the storefront

**Source + inspected editor.** Store exposes `pickup_enabled`, but public content and checkout use `settings.commerce.pickupEnabled`. Editing the former does not control checkout pickup. Store hours/phone and public settings also coexist, with Store values taking precedence without an explanation in the UI. The Store editor exposes both an empty hours object and a separate hours string. [Store schema](../shared/admin-schema.ts#L325), [content selection](../functions/api/content.ts#L48), [pickup source](../functions/api/content.ts#L62).

Fix: present one authoritative business setting per function or explicitly explain scope and precedence. Remove controls that do not affect the advertised operation.

### A08 — Internal identifiers are editable as ordinary content

**Browser + source.** Existing product ID and all variant IDs are writable. Collections, staff and other records similarly expose identity fields without explaining consequences. `readonlyId` exists but is never enabled at the editor call site and is not propagated through arrays. Backend upserts and variant replacement make these fields materially different from display names. [Admin.tsx](../src/pages/Admin.tsx#L63), [ID input](../src/pages/Admin.tsx#L197).

Fix: keep existing identities read-only, generate new ones, and provide a separate deliberate workflow for changes that affect URLs or identity. Do not present primary keys as routine text fields.

### A09 — The storefront editor is an unstructured, very long form

**Browser.** The default storefront editor contains **172 controls** and is **18,811px** tall within a roughly 618px-wide dialog. The product editor has 45 controls and is 4,642px tall on desktop, 5,783px at 320px. There are no tabs, section search, collapsible groups or persistent section headings. Close/title scroll away while Save stays visible. [Editor](../src/pages/Admin.tsx#L59), [desktop](admin-ui-audit/product-editor.png), [mobile](admin-ui-audit/mobile-product-editor.png).

Fix: task-oriented sections for branding, homepage, navigation, merchandising and policies; separate inventory from editorial product data; retain a visible title, dirty state and actions. Keep logical groups independently navigable.

### A10 — Mobile data tables fit the viewport by crushing useful controls

**Browser.** At 320px, full order UUIDs wrap across multiple lines and the status select clips its label to “Chang”. The three desktop columns remain in place; available controls are difficult to read and associate with the order. Activity-log UUIDs and timestamps are similarly fragmented. This is not document overflow, so the earlier overflow tests passed. [CSS](../src/styles.css#L2934), [orders](admin-ui-audit/live-320-orders.png), [activity log](admin-ui-audit/live-320-admin_audit.png).

Fix: mobile record cards or a purposeful minimum-width table with a clear scroll affordance; concise references with copy/full-ID access; full-width labelled action controls.

### A11 — Mobile navigation can hide the active section

**Browser + source.** Open `?section=admin_audit` at 320px: the nav’s visible width is 290px, scrollLeft is 0, and the active button begins at x=1,139px. The active section is offscreen, with no automatic scroll-to-current or compact section selector. Active buttons also lack `aria-current` or equivalent selected-state semantics. [Navigation](../src/pages/Admin.tsx#L421).

Fix: bring the active item into view, expose current-section semantics, and provide a clear way to discover all sections on narrow screens.

### A12 — Generic table columns omit the context needed to operate each resource

**Browser + source.** The same Name/reference, Status/details, Action layout is reused everywhere. [Table renderer](../src/pages/Admin.tsx#L530).

| Section              | Information missing from the operational view                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Products & inventory | Current prices, variant quantities, individual-piece stock and low-stock indicators. Every item requires opening a long editor.               |
| Orders               | Order time, fulfilment method, requested delivery date and usable priority/filter cues.                                                       |
| Reviews              | The product being reviewed and purchase context; staff see a reviewer and text but cannot identify the product in the list or publish dialog. |
| Refunds              | Human-readable order/customer association, amount and direct order drill-down.                                                                |
| Activity log         | Actor and affected resource/record. The visible row shows an audit UUID, an action and a raw timestamp.                                       |
| Team access          | Person name/email; only a Supabase UUID and role are shown.                                                                                   |

Fix: dedicated columns/cards and drill-downs for each resource. Preserve full technical IDs behind copy/detail affordances rather than making them the primary label.

### A13 — Search only searches the current page, with no operational filters

**Source + inspected UI.** The label correctly says “Search this page”, but the implementation filters JSON for at most the current 50 records. Staff cannot reliably find an older order/customer or a product on another page. There are no status/date/fulfilment filters or selectable sort order. [Admin.tsx](../src/pages/Admin.tsx#L380), [pagination](../src/pages/Admin.tsx#L632).

Fix: BFF-backed search/filter/sort with URL state, bounded pagination, result counts and a distinct no-match state. Do not describe this existing page filter as store-wide search.

### A14 — Order actions ignore fulfilment method and retain stale selection state

**Browser + source.** A pickup order in `preparing` offers both “shipped” and “ready for pickup”. Choice generation uses status only. After updates, local `next`, carrier and tracking fields are not reset or reconciled with new row state. Tracking values returned by order details are not displayed there. [OrderActions](../src/pages/Admin.tsx#L724), [OrderDetails](../src/pages/Admin.tsx#L837).

Fix: method-aware transitions, corresponding server enforcement, reset selection after success, visible confirmation, and a tracking summary/link in order details.

### A15 — Relationship and date fields expose raw database conventions

**Browser + source.** Collections ask for product IDs, campaigns for a collection ID, and Team access for a user UUID. There are no lookup selectors. Campaign and coupon dates are text fields requiring ISO timestamps; no calendar or timezone presentation. Numeric fields all use step 0.01 even where only integers are valid. [Editor widgets](../src/pages/Admin.tsx#L159), [campaign dialog](admin-ui-audit/add-festival_campaigns.png), [collection dialog](admin-ui-audit/add-collections.png).

Fix: searchable relationship selectors with readable labels, explicit India-time scheduling controls converted server-side, and schema-specific min/max/step and helper text. Preserve advanced identifiers as optional detail.

### A16 — Media editing has no preview and inconsistent upload coverage

**Browser + source.** Product/gallery fields show URLs and native file inputs, but not the current image or gallery thumbnail order. Scalar array labels are 0, 1, 2, etc. `introductionImage` is editable but does not match the upload-control detection regex. [Media detection](../src/pages/Admin.tsx#L163), [product screenshot](admin-ui-audit/product-editor.png).

Fix: consistent media-field definitions, current-image previews, labelled gallery items/reordering and upload status. Reordering should not require deleting and reconstructing entries.

### A17 — Health UI misrepresents unknown and failed states

**Browser + source.** A 503 from `/api/admin/status` makes all cards say “Not configured”, even when configuration is merely unknown. A maintenance heartbeat with `status: failed` and a recent successful timestamp displays “Last successful run…” without identifying the latest failure. [Configuration cards](../src/pages/Admin.tsx#L483), [heartbeat](../src/pages/Admin.tsx#L997), [error screenshot](admin-ui-audit/live-status-error.png).

Fix: distinguish loading, configured, unconfigured and unavailable; show last attempt status separately from last success; provide a retry and actionable detail without exposing secrets.

### A18 — Permission/session errors and account controls need admin-specific treatment

**Source + inspected role-specific screen.** A manager’s direct link to settings triggers an owner-only API request but the page uses the generic “check your connection” error component instead of an access-denied explanation. Session errors fall through to the sign-in view rather than explaining that the session check failed. The workspace displays a role but no signed-in email/account control or direct sign-out. [Admin entry](../src/pages/Admin.tsx#L304), [resource query](../src/pages/Admin.tsx#L337), [generic error](../src/components/ui.tsx#L129).

Fix: role-gate routes before fetching, distinguish 401/403/network failures, identify the current operator and expose sign-out. Backend authorization was not bypassed by this finding. The fixture screenshot captured the initial retry/loading state; the eventual generic error is established by the source path.

### A19 — Customer history is a read-only dead end with ambiguous empty states

**Source + inspected component.** Customer history shows only the latest 50 orders as plain text, without dates, links to order details or access to older orders. Empty addresses/orders leave headings with no explanation. Staff must close the dialog and manually locate the order again. [CustomerHistory](../src/pages/Admin.tsx#L922), [API limit](../functions/api/admin/customers/[id].ts#L21).

Fix: linked order references with dates/status, pagination, explicit empty states and useful customer identity in the dialog heading.

## Suggested fix order

1. Repair typed editor factories and visible validation; protect identity fields.
2. Fix packing details, upload/save coordination and dirty/pending dialog behaviour.
3. Add staff revocation and consolidate authoritative Store settings.
4. Replace generic operational tables/actions with resource-specific views and BFF search.
5. Restructure long editors, mobile navigation/tables, media fields and scheduling inputs.
6. Add regression coverage for each reproduced issue, including slow requests and populated mobile states.

The earlier clean axe and overflow results remain valid for their narrow checks; they should not be used as evidence that these workflows are correct. The original evidence above is retained for comparison; the remediation below does not guarantee that no additional issues exist.

## Remediation — 29 September 2026

All 19 findings have corresponding code changes. The original screenshots are **before-fix evidence**. Migration [016_admin_workflows.sql](../supabase/migrations/016_admin_workflows.sql) must be applied before deploying this frontend/BFF release; it has not been applied to the configured live project.

| Finding | Implemented correction                                                                                                                                                                                   | Regression evidence                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A01     | Explicit typed factories preserve numeric arrays, nested links and empty object arrays; cardinality controls follow the schemas.                                                                         | Factory/schema tests and browser save of box sizes, prices, footer links and rebuilt gifting cards. |
| A02     | Order details display each sweet's quantity per box and total packing quantity, alongside gift instructions.                                                                                             | Populated mobile order-details test.                                                                |
| A03     | Confirmed owner-only revocation, audited in SQL, with the same lock as grants/demotions and last-owner protection. Team rows show available name/email.                                                  | Database and BFF authorization/origin tests; browser revocation confirmation.                       |
| A04     | Upload/save share a busy state. Uploads have cancellation/unmount protection; publishing waits for the returned image URL.                                                                               | Browser test holds upload and save responses and inspects the published URL.                        |
| A05     | Pending forms are locked; native Escape obeys dismissal guards; dirty dismissal opens a focused confirmation dialog.                                                                                     | Held-save and dirty-discard browser tests.                                                          |
| A06     | Error summary, field messages, invalid semantics, and automatic section/focus selection; persistent action-area error link.                                                                              | Browser invalid-name focus test and accessibility scans.                                            |
| A07     | Store/public contact and commerce pickup values synchronize in one transaction; existing values are reconciled using previous public precedence. Hidden legacy hours object; shared-setting explanation. | Database synchronization test; demo synchronization follows the same behavior.                      |
| A08     | Existing IDs, slugs, coupon codes and staff identities are protected; generated IDs remain fixed.                                                                                                        | Browser readonly identity assertion.                                                                |
| A09     | Bounded editor with section navigation, separate variants/inventory, scrollable body and persistent title/actions.                                                                                       | Desktop/tablet/mobile viewport and accessibility checks.                                            |
| A10     | Narrow screens render records as labelled cards with full-width controls and collapsed full references.                                                                                                  | 320px populated order/action test.                                                                  |
| A11     | Compact current-section selector on narrow screens; desktop links expose current-page semantics.                                                                                                         | Mobile active-section assertion.                                                                    |
| A12     | Context includes variant prices/stock, low-stock hints, piece inventory, dates/methods, review product/purchase status, refund amount/customer/order link, and audit actor/target.                       | Database enrichment and populated browser fixtures.                                                 |
| A13     | BFF-backed search/filter/sort before pagination; URL filters, result counts, clear/no-match states and deterministic ordering.                                                                           | Database search beyond 50 records, filtering/pagination and BFF/browser query tests.                |
| A14     | Method-aware choices and SQL enforcement, selection reset, success feedback, and tracking details/link.                                                                                                  | Database transition/tracking preservation and browser pickup-flow tests.                            |
| A15     | Readable BFF choices for products/collections/accounts, India-time calendar fields converted to UTC, and numeric step/range controls.                                                                    | Lookup authorization, date conversion, and browser relationship/scheduling tests.                   |
| A16     | Explicit media fields include introduction image; image previews, labelled items and reorder controls.                                                                                                   | Media-field test and editor browser inspection.                                                     |
| A17     | Loading/unconfigured/unavailable states are distinct; latest failure and last success are shown separately with retry support.                                                                           | Browser failed endpoint and failed-heartbeat fixtures.                                              |
| A18     | Session failures have their own state; owner sections are gated before requests; authorization errors, operator email and sign-out are visible.                                                          | Session/manager deep-link browser tests and BFF authorization tests.                                |
| A19     | Customer identity, address/order empty states, dated order links and paginated history.                                                                                                                  | BFF history pagination and nested order-details browser test.                                       |

Implementation: [editor](../src/components/admin/AdminEditor.tsx), [typed controls](../src/components/admin/FieldEditor.tsx), [admin workspace](../src/pages/Admin.tsx), [BFF list boundary](../server/admin-list.ts). Tests: [database workflows](../tests/admin-workflows.test.ts), [actual BFF handlers](../tests/bff-integration.test.ts), [non-demo browser workflows](../tests/live-browser/admin.spec.ts).

Browser checks use isolated BFF fixtures, not live customer records or provider services. Live migration/deployment, real-device/assistive-technology testing and live-provider acceptance remain separate requirements.

Verification: **71 unit/database/BFF tests**, **21 demo browser tests**, and **15 non-demo browser tests** (including 11 admin workflow regressions). Frontend/BFF type checks and production/Pages Functions builds passed. The populated editor passed the selected axe WCAG A/AA rules at 320, 768 and 1440px, with its title and actions fully in view. A footer-style contrast regression found during this pass was corrected by scoping the storefront footer styles.

After-fix editor screenshots: [320px](admin-ui-audit/fixed-editor-320.png), [768px](admin-ui-audit/fixed-editor-768.png), [1440px](admin-ui-audit/fixed-editor-1440.png).

## Follow-up findings — 30 September 2026

### A20 — Browser Back discards dirty edits (high; reproduced)

Navigate from Customers to Products, change a product name, then use browser Back. The editor disappears without confirmation. `beforeunload` does not guard React Router history navigation, and the workspace effect clears editing on resource/search changes. A05 remains partially unresolved.

Locations: [AdminEditor.tsx](../src/components/admin/AdminEditor.tsx#L32), [Admin.tsx](../src/pages/Admin.tsx#L207). Fix: route-level dirty/pending navigation blocking, including Back/Forward and query-string changes, with an explicit stay/discard decision.

### A21 — Variant moves do not persist display order (medium; reproduced)

Moving the second pack above the first submits `500 g / sort_order: 1` before `250 g / sort_order: 0`. The database saves unchanged sort numbers and reads packs in sort-number order, undoing the move on reload. Gallery reorder tests did not cover this separate variant representation.

Locations: [FieldEditor.tsx](../src/components/admin/FieldEditor.tsx#L104), [admin write](../supabase/migrations/003_admin.sql#L18), [admin list](../supabase/migrations/016_admin_workflows.sql#L23). Fix: normalize variant sort numbers after moving/adding/removing items and verify the order after a BFF reload.

### A22 — Stale settings can reverse another operator's changes (high; reproduced)

Open commerce settings, enable pickup through Store, then save only a wrap-fee change from the older commerce snapshot. Embedded PostgreSQL reproduction changed Store pickup from `true` back to `false` without a conflict. The synchronization lock serializes writes but does not detect stale documents; product/customer revision protection does not cover these shared settings.

Location: [016_admin_workflows.sql](../supabase/migrations/016_admin_workflows.sql#L57). Fix: shared revision/conflict checks across Store/public/commerce records, or field-scoped updates with explicit conflict handling; retain the operator's draft after a conflict.

### A23 — Customer-history pages lack deterministic tie ordering (medium; source)

The endpoint sorts only by `created_at` before offset pagination. Equal timestamps have no guaranteed order, leaving page boundaries unstable. The main admin list has a tie-breaker, but this endpoint does not.

Location: [history endpoint](../functions/api/admin/customers/[id].ts#L30). Fix: add a unique ID tie-breaker and test equal-timestamp orders across pages; cursor pagination would also improve stability while new orders arrive. Duplicate rows were not reproduced against a live database in this pass.

### A24 — An empty history page is mislabeled as no orders (low; source)

The UI says “No orders yet” whenever the current page is empty, even when `ordersTotal` is positive. The existing browser fixture exercises this contradictory state and asserts that text.

Location: [Admin.tsx](../src/pages/Admin.tsx#L1029). Fix: distinguish an empty customer account from an empty/out-of-range page and offer navigation back to available results.

Evidence: [follow-up results](admin-ui-audit/followup-2026-09-30.json). The additional browser run produced two regression failures (A20/A21) and one passing negative check: closing the discard-confirmation dialog did **not** cause an accidental save. A22 was reproduced in embedded PostgreSQL; A23/A24 are source findings. Temporary scripts are retained under `/tmp`, outside the normal test suite. That investigation changed documentation only. The subsequent implementation and verification are recorded below.

## Follow-up resolution — 30 September 2026

| Finding | Implemented fix                                                                                                                                                                                                                                                                                                               | Verification                                                                                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A20     | React Router data-router navigation blocking guards dirty and pending forms. Back/Forward navigation presents Stay/Discard; leaving is disabled during an upload/save. Browser unload protection remains active.                                                                                                              | Browser regression preserves a dirty product draft after Back/Stay, allows deliberate discard, and blocks Forward while a save is held.                                                                                                                    |
| A21     | Moving, adding and removing variants assigns contiguous persisted sort numbers.                                                                                                                                                                                                                                               | Browser test saves and reopens reordered packs through a BFF fixture that sorts by persisted position; embedded PostgreSQL verifies the actual write/read order.                                                                                           |
| A22     | Settings and Store have revision counters. The BFF forwards the snapshot revision, and SQL checks it under the existing synchronization lock before any write. Synchronized updates also bump the affected records. Helper RPC execution is restricted. Conflicts retain the draft and refresh the list for review/reopening. | Database tests reject old commerce snapshots after Store changes and old Store snapshots after public-setting changes; repeated/missing versions are rejected. Actual BFF returns 409, and browser test verifies the original revision and retained draft. |
| A23     | Customer-history ordering is `(created_at DESC, id DESC)` with a matching index.                                                                                                                                                                                                                                              | Actual BFF/database test traverses 105 orders with identical timestamps across three pages, asserting exact descending order and no duplicates.                                                                                                            |
| A24     | Zero total displays “No orders yet”; an empty page with a positive total displays “No orders on this page” and offers Return to first page.                                                                                                                                                                                   | Browser regression navigates back to populated history; BFF test confirms an out-of-range page preserves the positive total.                                                                                                                               |

**Verification:** 75 unit/database/BFF tests and 39 browser tests passed (21 demo, 18 non-demo). Frontend and BFF TypeScript checks, production build, Cloudflare Functions build and whitespace checks passed. These are isolated fixture/embedded-database checks, not live-provider acceptance.

**Deployment prerequisite:** apply [017_admin_conflict_protection.sql](../supabase/migrations/017_admin_conflict_protection.sql), after all preceding migrations, before deploying this frontend/BFF release. No live database migration or deployment was performed. Old admin clients without current revision values will receive a conflict instead of overwriting settings.
