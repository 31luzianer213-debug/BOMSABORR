import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Clock3,
  Flame,
  MapPin,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PizzaDialog } from "@/components/menu/PizzaDialog";
import { CheckoutSheet } from "@/components/menu/CheckoutSheet";
import { getMenu, type Category, type Product } from "@/lib/menu.functions";
import { SIZES, brl, cartTotal, type CartItem } from "@/lib/cart";

const menuQueryOptions = queryOptions({
  queryKey: ["menu"],
  queryFn: () => getMenu(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bom Sabor — Cardápio Digital e Pedidos no WhatsApp" },
      {
        name: "description",
        content:
          "Cardápio digital da Bom Sabor: pizzas simples, especiais, gourmet, doces e sanduíches. Peça e receba no WhatsApp.",
      },
      { property: "og:title", content: "Bom Sabor — Cardápio Digital" },
      {
        property: "og:description",
        content: "Monte seu pedido de pizza ou sanduíche e envie direto no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQueryOptions),
  component: MenuPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center" role="alert">
      <p className="font-display text-2xl">Não foi possível carregar o cardápio</p>
      <p className="mt-2 text-sm opacity-80">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Cardápio não encontrado.</div>,
});

const CART_KEY = "bomsabor.cart.v1";

function MenuPage() {
  const { data } = useSuspenseQuery(menuQueryOptions);
  const { settings, categories, products, zones } = data;

  const [items, setItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const [pizzaTarget, setPizzaTarget] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [onlyPizza, setOnlyPizza] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CART_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored) as CartItem[]);
      } catch {
        setItems([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const normalizedQuery = query.trim().toLowerCase();

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of products) {
      if (normalizedQuery) {
        const hay = `${product.name} ${product.description ?? ""}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) continue;
      }
      map.set(product.category_id, [...(map.get(product.category_id) ?? []), product]);
    }
    return map;
  }, [products, normalizedQuery]);

  const visibleCategories = useMemo(() => {
    let list = categories;
    if (onlyPizza) list = list.filter((category) => category.kind === "pizza");
    if (normalizedQuery) {
      list = list.filter((category) => (productsByCategory.get(category.id)?.length ?? 0) > 0);
    }
    return list;
  }, [categories, onlyPizza, productsByCategory, normalizedQuery]);

  const pizzaCategory = pizzaTarget
    ? (categories.find((category) => category.id === pizzaTarget.category_id) ?? null)
    : null;

  const addItem = (item: Omit<CartItem, "id">) => {
    setItems((current) => [...current, { ...item, id: crypto.randomUUID() }]);
    setCartOpen(true);
  };

  const count = items.reduce((sum, item) => sum + item.qty, 0);

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="glass max-w-md rounded-3xl p-8 text-center shadow-soft">
          <p className="font-display text-2xl text-primary">Loja em configuração</p>
          <p className="mt-2 text-sm text-muted-foreground">As configurações da loja não foram encontradas.</p>
        </div>
      </div>
    );
  }

  const wa = settings.store_whatsapp.replace(/\D/g, "");
  const hero = products.slice(0, 3);

  return (
    <div className="min-h-screen pb-32 font-sans selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-gold text-primary-foreground shadow-glow">
              <UtensilsCrossed className="size-4" />
            </div>
            <div className="leading-none">
              <p className="font-display text-[19px] font-extrabold tracking-tight text-foreground">{settings.store_name}</p>
              <p className="hidden text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:block">Pizzaria & Lanchonete</p>
            </div>
            <span className={`ml-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex ${settings.is_open ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>
              <span className={`size-1.5 rounded-full ${settings.is_open ? "bg-emerald-400" : "bg-muted-foreground"}`} />
              {settings.is_open ? "Aberto" : "Fechado"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground lg:inline-flex">
              <Clock3 className="size-3.5" /> {settings.opening_hours}
            </span>
            <Button variant="secondary" className="hidden rounded-full border border-white/10 bg-white/5 font-bold backdrop-blur sm:inline-flex" onClick={() => window.open(`https://wa.me/${wa}`, "_blank")}>WhatsApp</Button>
            <button type="button" onClick={() => setCartOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-gold px-4 py-2 text-sm font-extrabold text-primary-foreground shadow-glow">
              <ShoppingBag className="size-4" />
              <span className="hidden sm:inline">Sacola</span>
              <span className="grid min-w-6 place-items-center rounded-full bg-primary-foreground px-1.5 py-0.5 text-xs font-black text-primary">{count}</span>
            </button>
          </div>
        </div>
      </header>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute -top-24 right-[-8%] h-[520px] w-[680px] rounded-full bg-gradient-pink opacity-[0.18] blur-[70px]" />
        <div className="pointer-events-none absolute -bottom-24 left-[-10%] h-[520px] w-[620px] rounded-full bg-primary/20 opacity-30 blur-[80px]" />
        <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-6 sm:py-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="size-3" /> {settings.tagline || "Sabor que marca • Forno premium"}
            </span>
            <h1 className="text-balance mt-3 font-display text-[2.05rem] font-extrabold leading-[1.02] tracking-[-0.02em] text-foreground sm:text-[3.2rem] sm:leading-[0.95] lg:text-[3.85rem]">
              O sabor que você <span className="text-primary">ama</span>, direto no WhatsApp.
            </h1>
            <p className="mt-3 max-w-[54ch] text-[14px] sm:text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Pizzas simples, especiais, gourmet e doces + sanduíches artesanais. Monte seu pedido em segundos e receba com entrega rápida ou retire na loja.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
              <Button className="h-11 rounded-full px-6 font-display text-base font-bold shadow-glow" onClick={() => document.getElementById(`cat-${categories[0]?.id}`)?.scrollIntoView({ behavior: "smooth" })}>Ver cardápio</Button>
              <Button variant="secondary" className="h-11 rounded-full border border-white/10 bg-white/5 font-bold backdrop-blur" onClick={() => window.open(`https://wa.me/${wa}`, "_blank")}>Falar no WhatsApp →</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 font-semibold text-foreground ring-1 ring-white/10"><Star className="size-3.5 fill-primary text-primary" /> 4,9 <span className="text-muted-foreground">• 850+ avaliações</span></span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-2 font-semibold ring-1 ring-white/10"><Truck className="size-3.5" /> Entrega 25–40 min</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-2 font-semibold ring-1 ring-white/10"><Flame className="size-3.5 text-primary" /> Forno à lenha</span>
            </div>
          </div>
          <div className="glass-strong hidden overflow-hidden rounded-[2rem] p-4 shadow-soft sm:p-5 lg:block">
            <div className="flex items-center justify-between"><p className="font-display text-sm font-extrabold uppercase tracking-widest text-primary">Destaques da casa</p><span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">Mais pedidos hoje</span></div>
            <div className="mt-4 grid gap-3">
              {hero.map((product) => {
                const cat = categories.find((c) => c.id === product.category_id);
                const isPizza = cat?.kind === "pizza";
                return (
                  <div key={product.id} className="premium-card flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="grid size-11 place-items-center rounded-xl bg-gradient-pink text-white"><UtensilsCrossed className="size-4" /></div>
                    <div className="min-w-0 flex-1"><p className="truncate font-display text-[15px] font-bold leading-none text-foreground">{product.name}</p><p className="truncate text-xs text-muted-foreground">{cat?.name} • {isPizza ? "4 tamanhos" : "pronto em minutos"}</p></div>
                    <div className="text-right"><p className="font-display text-sm font-extrabold text-primary">{isPizza ? brl(Number(cat?.price_p ?? 0)) : brl(Number(product.price ?? 0))}</p><button type="button" disabled={!settings.is_open} onClick={() => { if (isPizza) setPizzaTarget(product); else addItem({ name: product.name, size: "", qty: 1, unitPrice: Number(product.price ?? 0), notes: "" }); }} className="mt-1 inline-flex rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background disabled:opacity-50">{isPizza ? "Escolher" : "Adicionar"}</button></div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gradient-gold p-[1px]"><div className="rounded-[15px] bg-card px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Taxa de entrega</p><p className="font-display text-lg font-extrabold text-foreground">{settings.use_flat_fee ? brl(Number(settings.flat_delivery_fee)) : "por bairro"}</p></div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Retirada</p><p className="font-display text-lg font-extrabold text-foreground">{settings.allow_pickup ? "Disponível" : "Consulte"}</p></div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs ring-1 ring-white/10"><span className="font-semibold text-muted-foreground">WhatsApp</span><span className="font-bold text-foreground">{settings.store_whatsapp}</span></div>
          </div>
        </div>
      </section>

      <nav className="sticky top-[64px] z-30 border-b border-white/10 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="hidden shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground sm:inline-flex">
            <Sparkles className="size-3" /> Categorias
          </span>
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto scroll-smooth snap-x">
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setActiveCategory(category.id);
                document
                  .getElementById(`cat-${category.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`snap-start whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.98] ${
                activeCategory === category.id
                  ? "bg-gradient-gold text-primary-foreground shadow-glow"
                  : "border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {category.name}
            </button>
          ))}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pizza, sanduíche, ingrediente..." className="h-11 rounded-full border-white/10 bg-background/60 pl-9 pr-9 text-[15px]" />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-muted-foreground hover:bg-white/20" aria-label="Limpar busca">
                <X className="size-4" />
              </button>
            )}
          </div>
          <button type="button" onClick={() => setOnlyPizza((v) => !v)} className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition-all active:scale-[0.98] ${onlyPizza ? "bg-gradient-gold text-primary-foreground shadow-glow" : "border border-white/10 bg-white/5 text-foreground hover:bg-white/10"}`}>
            <Flame className="size-4" /> {onlyPizza ? "Só pizzas ✓" : "Só pizzas"}
          </button>
          {(query || onlyPizza) && (visibleCategories.length === 0) && (
            <span className="text-xs font-bold text-muted-foreground">Nenhum item encontrado</span>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:py-8">
        {visibleCategories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-28">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{category.name}</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {category.kind === "pizza" ? "Escolha o tamanho • meia a meia disponível" : `${(productsByCategory.get(category.id) ?? []).length} opções`}
                </p>
              </div>
              <span className="hidden h-px flex-1 bg-white/10 sm:block" />
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-muted-foreground sm:inline-flex">
                {category.kind === "pizza" ? "Forno à lenha" : "Preparo rápido"}
              </span>
            </div>

            {category.kind === "pizza" && (
              <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-2">
                {SIZES.map((size) => {
                  const price = category[`price_${size.key}` as const];
                  if (price === null) return null;
                  return (
                    <div key={size.key} className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center backdrop-blur">
                      <span className="block font-display text-base text-primary">{size.label}</span>
                      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{size.full}</span>
                      <span className="mt-0.5 block text-xs font-bold text-foreground">{brl(Number(price))}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(productsByCategory.get(category.id) ?? []).map((product) => (
                <li key={product.id} className="premium-card group flex flex-col rounded-2xl border border-white/10 bg-card p-4 shadow-soft hover:border-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-[15px] font-bold leading-tight text-foreground">{product.name}</h3>
                      {product.description && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{product.description}</p>}
                    </div>
                    <span className="shrink-0 whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-display text-sm font-extrabold text-primary">
                      {category.kind === "pizza" ? brl(Number(category.price_p ?? 0)) : brl(Number(product.price ?? 0))}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{category.kind === "pizza" ? "a partir de • 4 tamanhos" : "pronto em minutos"}</span>
                    <Button size="sm" className="h-10 min-h-10 rounded-full px-5 text-[13px] font-extrabold shadow-soft active:scale-[0.98] sm:h-9" disabled={!settings.is_open} onClick={() => { if (category.kind === "pizza") setPizzaTarget(product); else addItem({ name: product.name, size: "", qty: 1, unitPrice: Number(product.price ?? 0), notes: "" }); }}>
                      {category.kind === "pizza" ? "Escolher" : "Adicionar"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="mt-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur sm:p-8">
          <p className="font-display text-lg font-extrabold text-primary">{settings.store_name}</p>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1"><MapPin className="size-3.5" /> {settings.address || "Retirada e entrega"}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1"><Clock3 className="size-3.5" /> {settings.opening_hours}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-3 py-1 font-bold text-primary-foreground">WhatsApp {settings.store_whatsapp}</span>
          </p>
          <Link to="/auth" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground underline decoration-white/20 underline-offset-4 hover:text-foreground">Área do administrador →</Link>
          <p className="mt-3 text-[11px] text-muted-foreground/70">© {new Date().getFullYear()} Bom Sabor. Todos os sabores, um só lugar.</p>
        </footer>
      </main>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <Button className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between rounded-full px-5 font-display text-base font-bold shadow-glow" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2"><ShoppingBag className="size-5" /> {count} {count === 1 ? "item" : "itens"}</span>
            <span>{brl(cartTotal(items))} • Ver pedido</span>
          </Button>
        </div>
      )}

      <PizzaDialog
        product={pizzaTarget}
        category={pizzaCategory}
        siblings={pizzaTarget ? (productsByCategory.get(pizzaTarget.category_id) ?? []) : []}
        allowHalfHalf={settings.allow_half_half}
        onClose={() => setPizzaTarget(null)}
        onAdd={addItem}
      />

      <CheckoutSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={items}
        settings={settings}
        zones={zones}
        onChangeQty={(id, qty) =>
          setItems((current) =>
            qty <= 0
              ? current.filter((item) => item.id !== id)
              : current.map((item) => (item.id === id ? { ...item, qty } : item)),
          )
        }
        onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
        onSuccess={() => setItems([])}
      />
    </div>
  );
}

export type { Category };
