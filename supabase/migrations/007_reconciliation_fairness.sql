-- Rotate unresolved work so old cancellations cannot starve newer payments.
alter table public.orders add column reconciled_at timestamptz;
alter table public.refund_jobs add column reconciled_at timestamptz;
create index orders_reconciliation_queue on public.orders(reconciled_at nulls first) where status in ('pending_payment','expired','cancelled');
create index refund_reconciliation_queue on public.refund_jobs(reconciled_at nulls first) where status in ('queued','processing','submitted');
