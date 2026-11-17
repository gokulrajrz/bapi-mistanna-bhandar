# Store operations

## Launch acceptance

Use a separate test Supabase project and Razorpay test account. Verify customer OTP/login/refresh/logout, owner versus manager permissions, image uploads, stock updates, delivery rules and publication changes. Complete test payments via callback and webhook, simulate a lost callback, replay a signed webhook, cancel paid/unpaid orders, and let a reservation expire. Verify captured amounts, inventory release, refund completion and customer visibility in both provider and database. Restart checkout after a network interruption and confirm it resumes the same order.

Review every seeded product and legal policy with the business. Confirm phone, opening hours, pickup instructions, safe delivery/transit rules, ingredients/allergens and actual stock. Replace illustrative generated imagery with approved product photography. Validate production domain, SMTP delivery, Turnstile domain, webhook secret and cron execution. Test backup restoration before launch; choose backup/PITR retention for the merchant's recovery requirements.

## Incident response

Disable Storefront & settings → operations → checkoutEnabled to pause new checkout, or set Cloudflare CHECKOUT_ENABLED=false. Existing payments/webhooks/reconciliation must continue. Maintenance mode controls storefront availability separately. Use Cloudflare logs and the response X-Request-Id to correlate BFF failures. Do not log secrets or customer request bodies.

Inspect Admin → Refunds for failed/needs_review jobs. Use Reconcile provider status after checking the corresponding payment/refund in Razorpay. A provider request whose outcome is uncertain is not automatically submitted a second time. Investigate manually with the provider before any refund is issued outside the app. Preserve order/payment IDs and audit records.

Monitor scheduled Worker failures, aged pending payments, refund_jobs statuses, webhook delivery failures and database saturation. The worker retries reconciliation every five minutes and rotates through small batches (three records per queue) to bound provider calls. Monitor queue age and increase capacity with measured Cloudflare limits as traffic grows. Review Cloudflare and Supabase metrics and configure alerts in the merchant's accounts; external alert destinations are not configured by this repository.

## Change management

Back up before migrations. Apply schema migrations before deploying dependent application code. Roll back application releases through Cloudflare; do not undo financial records or stock movements with a database rollback without reconciling provider activity. Seed SQL is for development only. Rotate server secrets in both Pages and maintenance Worker when applicable.

Admin stock edits set the available quantity, not total physical stock including reservations. Product, variant and inventory revisions reject stale stock edits, including changes caused by checkout. Reload after a conflict before repeating the edit. Audit records contain actor/action/resource, not a full before/after revision history. Customer personal data, order retention, deletion requests and bookkeeping obligations need a business-approved retention process.

## Health and alert setup

`/api/health` returns a minimal 200/503 status; it does not expose customer or queue details. Admin Overview shows the maintenance heartbeat and overdue payment/refund counts. The scheduled Worker writes success/failure heartbeats and checks aged queues. A missing heartbeat or one older than 15 minutes degrades health. Deploy migration 013 before updating this Worker.

Set the repository Actions variable `STORE_ORIGIN` to the HTTPS production origin to enable `.github/workflows/monitor.yml` every 15 minutes. Configure failure notifications in the merchant’s GitHub account and Cloudflare Worker error alerts. Run `STORE_ORIGIN=https://your-domain npm run monitor:check` for a manual probe. This repository does not configure external notification recipients or guarantee GitHub schedule timing.

## Restore verification

`npm test` includes a real embedded Postgres backup/restore with catalogue equality and restored access restrictions. This proves the local fixture can be restored; it does not prove the merchant’s Supabase backups are recoverable.

For an application-schema logical restore drill, provision an isolated local Supabase/Postgres database ending in `_restore_drill`, with matching Supabase roles, extensions and restored Auth dependencies already present, and an empty public application schema. Set `BACKUP_SOURCE_URL` and `RESTORE_DATABASE_URL` locally, then run `npm run db:restore-drill`. It refuses remote targets and nonempty public schemas, writes a mode-0600 archive in `/tmp/bapi-restore-drill`, and checks restored stock and order references. This requires PostgreSQL client tools compatible with the source server. Auth/Storage recovery and image objects require a separate provider-level backup/restore exercise. Keep and delete local customer-data backups according to the merchant’s approved retention rules.

## Verification boundaries

The non-demo browser suite uses isolated BFF and payment-widget fixtures. BFF integration tests execute real handlers against embedded PostgreSQL with auth/provider calls mocked. Before launch, repeat those workflows with actual Supabase, SMTP, Razorpay, Turnstile and Cloudflare Images credentials. Confirm customer-facing settings and record the provider-level restore result. Credentials, approved business details and account configuration remain external prerequisites.
