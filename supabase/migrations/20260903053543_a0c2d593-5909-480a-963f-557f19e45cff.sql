-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.grant_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_grant_admin
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_first_admin();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- SETTINGS
CREATE TABLE public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'Bom Sabor',
  tagline text NOT NULL DEFAULT 'Pizzaria & Lanchonete',
  store_whatsapp text NOT NULL DEFAULT '5593991614242',
  pix_key text NOT NULL DEFAULT '',
  pix_name text NOT NULL DEFAULT '',
  is_open boolean NOT NULL DEFAULT true,
  opening_hours text NOT NULL DEFAULT 'Todos os dias, 18h às 23h',
  min_order numeric(10,2) NOT NULL DEFAULT 0,
  flat_delivery_fee numeric(10,2) NOT NULL DEFAULT 5,
  use_flat_fee boolean NOT NULL DEFAULT false,
  allow_delivery boolean NOT NULL DEFAULT true,
  allow_pickup boolean NOT NULL DEFAULT true,
  pay_pix boolean NOT NULL DEFAULT true,
  pay_cash boolean NOT NULL DEFAULT true,
  pay_card boolean NOT NULL DEFAULT true,
  allow_half_half boolean NOT NULL DEFAULT true,
  notify_customer boolean NOT NULL DEFAULT true,
  notify_store boolean NOT NULL DEFAULT true,
  address text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "settings admin write" ON public.store_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER t_settings_updated BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DELIVERY ZONES
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  fee numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones public read" ON public.delivery_zones FOR SELECT USING (true);
CREATE POLICY "zones admin write" ON public.delivery_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'simple',
  price_p numeric(10,2),
  price_m numeric(10,2),
  price_g numeric(10,2),
  price_f numeric(10,2),
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories admin write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(10,2),
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products admin write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT to_char(now(), 'YYMMDDHH24MISS'),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  order_type text NOT NULL DEFAULT 'delivery',
  address text NOT NULL DEFAULT '',
  neighborhood text NOT NULL DEFAULT '',
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'pix',
  change_for numeric(10,2),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  whatsapp_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders admin read" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders admin update" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders admin delete" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER t_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SEED
INSERT INTO public.store_settings (pix_name) VALUES ('Bom Sabor');

INSERT INTO public.delivery_zones (name, fee, sort_order) VALUES
  ('Centro', 5, 1), ('Bairro Novo', 7, 2), ('Zona Rural', 12, 3);

INSERT INTO public.categories (id, name, kind, price_p, price_m, price_g, price_f, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Sanduíches', 'simple', NULL, NULL, NULL, NULL, 1),
  ('22222222-2222-2222-2222-222222222222', 'Pizzas Simples', 'pizza', 48, 58, 68, 78, 2),
  ('33333333-3333-3333-3333-333333333333', 'Pizzas Especiais', 'pizza', 52, 65, 75, 85, 3),
  ('44444444-4444-4444-4444-444444444444', 'Pizzas Gourmet', 'pizza', 58, 72, 82, 92, 4),
  ('55555555-5555-5555-5555-555555555555', 'Pizzas Doces', 'pizza', 52, 65, 75, 85, 5);

INSERT INTO public.products (category_id, name, description, price, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'X-Tudão', 'Pão grande, bacon, calabresa, carne, presunto, filé, frango, ovo, queijo, batata palha e salada.', 52, 1),
  ('11111111-1111-1111-1111-111111111111', 'X-Big Bom', 'Pão de hamburguer, filé, bacon, ovo, queijo, presunto e salada.', 27, 2),
  ('11111111-1111-1111-1111-111111111111', 'X-Tudo', 'Pão, carne, frango, calabresa, presunto, ovo, queijo e salada.', 26, 3),
  ('11111111-1111-1111-1111-111111111111', 'X-Nordestino', 'Pão de hamburguer, carne de sol, banana, queijo, ovo e salada.', 23, 4),
  ('11111111-1111-1111-1111-111111111111', 'X-Filé', 'Pão, filé, queijo, ovo, presunto e salada.', 23, 5),
  ('11111111-1111-1111-1111-111111111111', 'X-Bacon', 'Pão, bacon, presunto, ovo, queijo e salada.', 23, 6),
  ('11111111-1111-1111-1111-111111111111', 'X-Calabresa', 'Pão, calabresa, presunto, ovo, queijo e salada.', 18, 7),
  ('11111111-1111-1111-1111-111111111111', 'X-Bom Sabor', 'Pão, catupiry, ovo, milho, batata palha e salada.', 15, 8),
  ('11111111-1111-1111-1111-111111111111', 'X-Salada', 'Pão, carne, presunto, ovo, queijo e salada.', 15, 9),
  ('11111111-1111-1111-1111-111111111111', 'X-Frango', 'Pão, frango, presunto, ovo, queijo e salada.', 15, 10),
  ('11111111-1111-1111-1111-111111111111', 'X-Egg', 'Pão, carne, ovo, queijo e presunto.', 15, 11),
  ('11111111-1111-1111-1111-111111111111', 'X-Burguer', 'Pão, carne, presunto, queijo e salada.', 14, 12),
  ('11111111-1111-1111-1111-111111111111', 'Hamburguer', 'Pão, carne, queijo e salada.', 12, 13),
  ('11111111-1111-1111-1111-111111111111', 'Misto Quente', 'Pão de forma, presunto e queijo.', 7, 14),
  ('11111111-1111-1111-1111-111111111111', 'Queijo Quente', 'Pão de forma e queijo.', 7, 15),

  ('22222222-2222-2222-2222-222222222222', 'Calabresa', 'Calabresa, mussarela, molho de tomate, orégano e azeitonas.', NULL, 1),
  ('22222222-2222-2222-2222-222222222222', 'Presunto', 'Presunto, mussarela, molho de tomate, orégano e azeitonas.', NULL, 2),
  ('22222222-2222-2222-2222-222222222222', 'Frango', 'Frango, milho, mussarela, molho de tomate, orégano e azeitonas.', NULL, 3),
  ('22222222-2222-2222-2222-222222222222', 'Mussarela', 'Mussarela, molho de tomate, orégano e azeitonas.', NULL, 4),
  ('22222222-2222-2222-2222-222222222222', 'Milho Verde', 'Milho, mussarela, molho de tomate, orégano e azeitonas.', NULL, 5),
  ('22222222-2222-2222-2222-222222222222', 'Marguerita', 'Mussarela, molho de tomate, manjericão e azeite.', NULL, 6),

  ('33333333-3333-3333-3333-333333333333', 'Alemã', 'Bacon, ovos, mussarela, molho de tomate, orégano e azeitonas.', NULL, 1),
  ('33333333-3333-3333-3333-333333333333', 'Creme de Milho', 'Creme de milho, frango, molho de tomate, mussarela, orégano e azeitonas.', NULL, 2),
  ('33333333-3333-3333-3333-333333333333', 'Bom Sabor', 'Linguiça toscana, cheiro verde, cebola, mussarela, molho de tomate, orégano e azeitonas.', NULL, 3),
  ('33333333-3333-3333-3333-333333333333', 'Foguinho', 'Calabresa picante, molho de pimenta, molho de tomate, mussarela, orégano e azeitonas.', NULL, 4),
  ('33333333-3333-3333-3333-333333333333', 'Calabresa Recheada', 'Calabresa, mussarela, milho, cebola, tomate, molho de tomate, orégano e azeitonas.', NULL, 5),
  ('33333333-3333-3333-3333-333333333333', 'Miscelânia', 'Calabresa, presunto, mussarela, tomates, molho de tomate, orégano e azeitonas.', NULL, 6),
  ('33333333-3333-3333-3333-333333333333', 'Camarão com Mussarela', 'Queijo mussarela, camarão, molho de tomate, orégano e azeitonas.', NULL, 7),
  ('33333333-3333-3333-3333-333333333333', 'Napolitana', 'Salame, ovos, mussarela, molho de tomate, orégano e azeitonas.', NULL, 8),
  ('33333333-3333-3333-3333-333333333333', 'Carne de Sol', 'Carne de sol, milho, cebola, orégano e azeitonas.', NULL, 9),
  ('33333333-3333-3333-3333-333333333333', 'Portuguesa', 'Presunto, mussarela, cebola, ervilhas, ovos, molho de tomate, orégano e azeitonas.', NULL, 10),
  ('33333333-3333-3333-3333-333333333333', 'Casa Nostra', 'Presunto, ovos, mussarela, palmito, batata palha, molho de tomate, orégano e azeitonas.', NULL, 11),
  ('33333333-3333-3333-3333-333333333333', 'Quatro Queijos', 'Mussarela, provolone, queijo prato, queijo parmesão, molho de tomate, orégano e azeitonas.', NULL, 12),

  ('44444444-4444-4444-4444-444444444444', 'Calabresa com Catupiry', 'Calabresa, catupiry, molho de tomate, orégano e azeitonas.', NULL, 1),
  ('44444444-4444-4444-4444-444444444444', 'Do Duque', 'Calabresa, salame, ovos, cebola, mussarela, quatro queijos, molho de tomate, orégano e azeitonas.', NULL, 2),
  ('44444444-4444-4444-4444-444444444444', 'Camarão com Catupiry', 'Camarão, catupiry, molho de tomate, orégano e azeitonas.', NULL, 3),
  ('44444444-4444-4444-4444-444444444444', 'Filé Mignon', 'Filé de carne ao creme, palmito, cebola, mussarela, orégano e azeitonas.', NULL, 4),
  ('44444444-4444-4444-4444-444444444444', 'Carne de Sol com Catupiry', 'Carne de sol, catupiry, cebola, milho, molho de tomate, orégano e azeitonas.', NULL, 5),
  ('44444444-4444-4444-4444-444444444444', 'Frango com Catupiry', 'Frango, catupiry, milho, cebola, molho de tomate, orégano e azeitonas.', NULL, 6),
  ('44444444-4444-4444-4444-444444444444', 'Carne Moída Picante', 'Carne moída apimentada, cebola, pimentão, mussarela, molho de tomate, orégano e azeitonas.', NULL, 7),
  ('44444444-4444-4444-4444-444444444444', 'Nordestina', 'Carne de sol desfiada temperada, milho, cebola, banana, pimentão, mussarela, molho de tomate, orégano e azeitonas.', NULL, 8),
  ('44444444-4444-4444-4444-444444444444', 'Coração de Galinha', 'Coração fatiado, cebola, pimentão, mussarela, molho de tomate, orégano e azeitonas.', NULL, 9),
  ('44444444-4444-4444-4444-444444444444', 'Pirarucu Seco', 'Pirarucu desfiado, cebola, pimentão, banana, mussarela, molho de tomate, orégano e azeitonas.', NULL, 10),

  ('55555555-5555-5555-5555-555555555555', 'Banana', 'Mussarela, banana, açúcar, canela e leite condensado.', NULL, 1),
  ('55555555-5555-5555-5555-555555555555', 'Chocolate', 'Queijo, mussarela, chocolate ao leite e granulado.', NULL, 2),
  ('55555555-5555-5555-5555-555555555555', 'Romeu e Julieta', 'Mussarela, goiabada, creme de leite e leite condensado.', NULL, 3);