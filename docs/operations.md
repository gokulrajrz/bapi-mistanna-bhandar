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

Admin stock edits set the available quantity, not total physical stock including reservations. Avoid overwriting quantities from stale browser tabs; refresh before stock takes. Audit records contain actor/action/resource, not a full before/after revision history. Customer personal data, order retention, deletion requests and bookkeeping obligations need a business-approved retention process.
