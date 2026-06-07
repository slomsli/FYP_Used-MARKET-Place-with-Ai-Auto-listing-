-- Adds buyer delivery confirmation to purchase receipts.
-- Run this in Supabase SQL editor before deploying the matching API changes.

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivery_marked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivery_report_id uuid;

DO $$
BEGIN
  ALTER TABLE public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_delivery_status_check
    CHECK (delivery_status = ANY (ARRAY['pending'::text, 'received'::text, 'not_received'::text]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_delivery_report_id_fkey
    FOREIGN KEY (delivery_report_id)
    REFERENCES public.reports(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS purchase_receipts_delivery_status_idx
  ON public.purchase_receipts (delivery_status);

CREATE INDEX IF NOT EXISTS purchase_receipts_delivery_report_id_idx
  ON public.purchase_receipts (delivery_report_id);
