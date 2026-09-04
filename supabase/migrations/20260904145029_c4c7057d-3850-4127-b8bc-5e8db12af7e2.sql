CREATE TABLE public.couriers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  fee_per_delivery numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  share_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couriers admin all" ON public.couriers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER couriers_touch BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.courier_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX courier_locations_courier_created_idx
  ON public.courier_locations (courier_id, created_at DESC);

GRANT SELECT ON public.courier_locations TO authenticated;
GRANT ALL ON public.courier_locations TO service_role;
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courier locations admin read" ON public.courier_locations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.orders
  ADD COLUMN courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  ADD COLUMN dispatched_at timestamp with time zone,
  ADD COLUMN delivered_at timestamp with time zone,
  ADD COLUMN courier_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN track_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX orders_track_token_idx ON public.orders (track_token);
CREATE INDEX orders_courier_idx ON public.orders (courier_id, created_at DESC);