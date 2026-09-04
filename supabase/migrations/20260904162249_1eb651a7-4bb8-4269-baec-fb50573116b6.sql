ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'fee',
  ADD COLUMN IF NOT EXISTS pay_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.couriers
  ADD CONSTRAINT couriers_pay_type_check CHECK (pay_type IN ('fee','daily','monthly'));

UPDATE public.couriers SET pay_amount = fee_per_delivery WHERE pay_amount = 0;