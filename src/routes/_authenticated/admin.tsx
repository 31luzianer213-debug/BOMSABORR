import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Bike,
  Copy,
  Download,
  Layers,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Package,
  Printer,
  Search,
  Settings2,
  ShoppingBag,
  Store,
} from "lucide-react";
import { WhatsAppPanel } from "@/components/admin/WhatsAppPanel";
import { CouriersPanel } from "@/components/admin/CouriersPanel";
import { useServerFn } from "@tanstack/react-start";
import { dispatchOrder } from "@/lib/couriers.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/cart";
import type { Database } from "@/integrations/supabase/types";

type SettingsUpdate = Database["public"]["Tables"]["store_settings"]["Update"];
type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center" role="alert">
      {error.message}
    </div>
  ),
});

const STATUS = [
  { value: "pending", label: "Novo" },
  { value: "preparing", label: "Em preparo" },
  { value: "delivering", label: "Saiu para entrega" },
  { value: "done", label: "Concluído" },
  { value: "canceled", label: "Cancelado" },
];

const NAV = [
  { value: "orders", label: "Pedidos", icon: ShoppingBag },
  { value: "couriers", label: "Motoboys", icon: Bike },
  { value: "products", label: "Produtos", icon: Package },
  { value: "categories", label: "Categorias", icon: Layers },
  { value: "zones", label: "Entrega", icon: MapPin },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "settings", label: "Loja", icon: Settings2 },
];


function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries();

  const orders = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 20000,
  });

  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const zones = useQuery({
    queryKey: ["admin", "zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_zones").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const couriers = useQuery({
    queryKey: ["admin", "couriers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("id, name, active")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const dispatch = useServerFn(dispatchOrder);
  const dispatchMutation = useMutation({
    mutationFn: (input: { orderId: string; courierId: string }) =>
      dispatch({ data: { ...input, baseUrl: window.location.origin } }),
    onSuccess: (result) => {
      toast.success(
        result.whatsappError
          ? `Pedido despachado, mas o WhatsApp falhou: ${result.whatsappError}`
          : "Pedido despachado! Cliente e motoboy avisados no WhatsApp.",
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [tab, setTab] = useState("orders");
  const [orderSearch, setOrderSearch] = useState("");

  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [zoneSearch, setZoneSearch] = useState("");

  const stats = useMemo(() => {
    const all = orders.data ?? [];
    const today = new Date().toDateString();
    const todayOrders = all.filter((order) => new Date(order.created_at).toDateString() === today);
    const pending = all.filter((order) => order.status === "pending").length;
    const preparing = all.filter((order) => order.status === "preparing").length;
    const totalRevenue = all
      .filter((order) => order.status !== "canceled")
      .reduce((sum, order) => sum + Number(order.total), 0);
    const todayRevenue = todayOrders
      .filter((order) => order.status !== "canceled")
      .reduce((sum, order) => sum + Number(order.total), 0);
    return {
      total: all.length,
      pending,
      preparing,
      today: todayOrders.length,
      totalRevenue,
      todayRevenue,
    };
  }, [orders.data]);

  const filteredOrders = useMemo(() => {
    const all = orders.data ?? [];
    return all.filter((order) => {
      if (orderStatusFilter !== "all" && order.status !== orderStatusFilter) return false;
      if (!orderSearch.trim()) return true;
      const query = orderSearch.toLowerCase();
      return (
        order.code.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.customer_phone.includes(query) ||
        order.neighborhood.toLowerCase().includes(query)
      );
    });
  }, [orders.data, orderSearch, orderStatusFilter]);

  const filteredProducts = useMemo(() => {
    const all = products.data ?? [];
    if (!productSearch.trim()) return all;
    const query = productSearch.toLowerCase();
    return all.filter(
      (product) => product.name.toLowerCase().includes(query) || product.description.toLowerCase().includes(query),
    );
  }, [products.data, productSearch]);

  const filteredCategories = useMemo(() => {
    const all = categories.data ?? [];
    if (!categorySearch.trim()) return all;
    const query = categorySearch.toLowerCase();
    return all.filter((category) => category.name.toLowerCase().includes(query));
  }, [categories.data, categorySearch]);

  const filteredZones = useMemo(() => {
    const all = zones.data ?? [];
    if (!zoneSearch.trim()) return all;
    const query = zoneSearch.toLowerCase();
    return all.filter((zone) => zone.name.toLowerCase().includes(query));
  }, [zones.data, zoneSearch]);

  function exportOrdersCsv() {
    const rows = filteredOrders.map((order) => ({
      codigo: order.code,
      cliente: order.customer_name,
      telefone: order.customer_phone,
      tipo: order.order_type,
      bairro: order.neighborhood,
      total: order.total,
      status: order.status,
      data: new Date(order.created_at).toLocaleString("pt-BR"),
    }));
    if (rows.length === 0) {
      toast.error("Nenhum pedido para exportar.");
      return;
    }
    const header = Object.keys(rows[0]!).join(";");
    const csv = [header, ...rows.map((row) => Object.values(row).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pedidos-bom-sabor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  }

  function printOrder(order: (typeof filteredOrders)[number]) {
    const items = (order.items as { name: string; qty: number; size: string; notes: string; unitPrice?: number }[]) ?? [];
    const store = settings.data?.store_name ?? "Bom Sabor";
    const win = window.open("", "_blank", "width=420,height=700");
    if (!win) {
      toast.error("Permita pop-ups para imprimir.");
      return;
    }
    const date = new Date(order.created_at).toLocaleString("pt-BR");
    const itemsRows = items
      .map((item) => `<tr><td style="padding:6px 0;border-bottom:1px dashed #ddd"><strong>${item.qty}x ${item.name}</strong>${item.size ? ` <span style="color:#666">(${item.size})</span>` : ""}${item.notes ? `<br><em style="font-size:11px;color:#666">Obs: ${item.notes}</em>` : ""}</td><td style="text-align:right;padding:6px 0;border-bottom:1px dashed #ddd;font-weight:700">${item.unitPrice ? brl(Number(item.unitPrice) * item.qty) : ""}</td></tr>`)
      .join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comprovante #${order.code}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:ui-monospace,Menlo,monospace;padding:20px;color:#111}
        .receipt{max-width:360px;margin:0 auto;border:1px solid #111;padding:16px}
        h1{font-size:18px;text-align:center}
        .center{text-align:center}
        .muted{color:#666;font-size:11px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        .totals{margin-top:10px;border-top:2px solid #111;padding-top:10px}
        .row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
        .row.total{font-weight:900;font-size:15px;border-top:1px solid #111;margin-top:6px;padding-top:6px}
        @media print{body{padding:0} .no-print{display:none} .receipt{border:none}}
      </style></head><body>
      <div class="receipt">
        <h1>${store}</h1>
        <p class="center muted">${settings.data?.address ?? ""} • ${settings.data?.store_whatsapp ?? ""}</p>
        <p class="center" style="margin-top:8px;font-weight:800">COMPROVANTE DE PEDIDO</p>
        <p class="center muted">#${order.code} • ${date}</p>
        <hr style="margin:10px 0;border:none;border-top:1px dashed #999">
        <p style="font-size:13px"><strong>Cliente:</strong> ${order.customer_name} — ${order.customer_phone}</p>
        <p style="font-size:13px"><strong>${order.order_type === "delivery" ? "Entrega" : "Retirada"}:</strong> ${order.order_type === "delivery" ? `${order.address} — ${order.neighborhood}` : "Retirada no local"}</p>
        <p style="font-size:13px"><strong>Pagamento:</strong> ${order.payment_method}${order.change_for ? ` (troco p/ ${brl(Number(order.change_for))})` : ""}</p>
        ${order.notes ? `<p style="font-size:12px;margin-top:6px"><em>Obs: ${order.notes}</em></p>` : ""}
        <table><tbody>${itemsRows}</tbody></table>
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${brl(Number(order.subtotal))}</span></div>
          ${Number(order.delivery_fee) > 0 ? `<div class="row"><span>Entrega</span><span>${brl(Number(order.delivery_fee))}</span></div>` : ""}
          <div class="row total"><span>TOTAL</span><span>${brl(Number(order.total))}</span></div>
        </div>
        <p class="center muted" style="margin-top:12px">Status: ${getStatusLabel(order.status)} • ${order.whatsapp_sent ? "WhatsApp enviado" : "WhatsApp pendente"}</p>
        <p class="center no-print" style="margin-top:14px"><button onclick="window.print()" style="padding:8px 16px;border-radius:999px;border:1px solid #111;background:#111;color:#fff;font-weight:700;cursor:pointer">Imprimir / Salvar PDF</button></p>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    win.document.close();
  }

  const saveSettings = useMutation({
    mutationFn: async (patch: SettingsUpdate) => {
      const { error } = await supabase
        .from("store_settings")
        .update(patch)
        .eq("id", settings.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const getStatusLabel = (value: string) => STATUS.find((s) => s.value === value)?.label ?? value;
  const getStatusVariant = (value: string): "default" | "secondary" | "outline" | "destructive" => {
    if (value === "pending") return "default";
    if (value === "preparing") return "secondary";
    if (value === "delivering") return "outline";
    if (value === "done") return "secondary";
    return "destructive";
  };

  return (
    <div className="min-h-screen bg-gradient-brand font-sans">
      <div className="mx-auto max-w-[1600px] px-3 pb-12 pt-3 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8 lg:gap-5"
        >
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-8 lg:w-64 lg:shrink-0 lg:self-start">
            <div className="sticky top-0 z-30 -mx-3 border-y border-white/10 bg-background/85 px-3 py-2.5 shadow-soft backdrop-blur-2xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-[1.75rem] lg:border lg:px-4 lg:py-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:block">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground shadow-glow lg:size-11">
                    <Store className="size-4 lg:size-5" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate font-display text-base font-extrabold leading-none tracking-tight text-foreground lg:text-lg">
                      Bom Sabor
                    </h1>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-bold text-muted-foreground">
                      <span
                        className={`size-2 shrink-0 rounded-full ${settings.data?.is_open ? "bg-emerald-400" : "bg-muted-foreground"}`}
                      />
                      {settings.data?.is_open ? "Loja aberta" : "Loja fechada"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold"
                    onClick={() => navigate({ to: "/" })}
                  >
                    Cardápio
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-xs" onClick={signOut}>
                    Sair
                  </Button>
                </div>
              </div>

              <TabsList className="no-scrollbar mt-2.5 flex h-auto w-full justify-start gap-1.5 overflow-x-auto bg-transparent p-0 lg:mt-4 lg:flex-col lg:gap-1 lg:overflow-visible">
                {NAV.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="shrink-0 gap-1.5 whitespace-nowrap rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-glow lg:w-full lg:justify-start lg:rounded-xl lg:border-0 lg:px-3 lg:py-2.5 lg:text-sm"
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-4 hidden gap-2 border-t border-white/10 pt-3 lg:flex lg:flex-col">
                <Button
                  variant="secondary"
                  className="w-full rounded-xl border border-white/10 bg-white/5 font-bold"
                  onClick={() => navigate({ to: "/" })}
                >
                  Ver cardápio
                </Button>
                <Button variant="ghost" className="w-full rounded-xl" onClick={signOut}>
                  Sair
                </Button>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 space-y-4 lg:space-y-5">
            <header className="hidden flex-wrap items-center justify-between gap-3 rounded-2xl lg:flex border border-white/10 bg-background/70 p-3.5 shadow-soft backdrop-blur-2xl lg:rounded-[1.5rem] lg:p-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                  {NAV.find((item) => item.value === tab)?.label}
                </p>
                <h2 className="truncate font-display text-lg font-extrabold tracking-tight text-foreground sm:text-2xl">
                  {settings.data?.store_name ?? "Gestão da loja"}
                </h2>
              </div>
            </header>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">

              <div className="group rounded-2xl border border-white/10 bg-card p-3 shadow-soft sm:p-4 transition hover:-translate-y-0.5 hover:border-primary/30">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Hoje</p>
                  <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <LayoutDashboard className="size-4" />
                  </span>
                </div>
                <p className="mt-2 font-display text-2xl font-extrabold leading-none sm:mt-3 sm:text-3xl text-foreground">{stats.today}</p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">pedidos • {brl(stats.todayRevenue)} faturado</p>
              </div>
              <div className="group rounded-2xl border border-white/10 bg-card p-3 shadow-soft sm:p-4 transition hover:-translate-y-0.5 hover:border-primary/30">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Pendentes</p>
                  <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <ShoppingBag className="size-4" />
                  </span>
                </div>
                <p className="mt-2 font-display text-2xl font-extrabold leading-none sm:mt-3 sm:text-3xl text-primary">{stats.pending}</p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{stats.preparing} em preparo</p>
              </div>
              <div className="group rounded-2xl border border-white/10 bg-card p-3 shadow-soft sm:p-4 transition hover:-translate-y-0.5 hover:border-primary/30">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Total</p>
                  <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BarChart3 className="size-4" />
                  </span>
                </div>
                <p className="mt-2 font-display text-2xl font-extrabold leading-none sm:mt-3 sm:text-3xl text-foreground">{stats.total}</p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">pedidos no histórico</p>
              </div>
              <div className="rounded-2xl bg-gradient-gold p-[1.5px] shadow-glow transition hover:-translate-y-0.5">
                <div className="h-full rounded-[15px] bg-card p-3 sm:p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Faturamento</p>
                  <p className="mt-2 font-display text-2xl font-extrabold leading-none sm:mt-3 sm:text-3xl text-primary">
                    {brl(stats.totalRevenue)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">exceto cancelados</p>
                </div>
              </div>
            </div>



          <TabsContent value="orders" className="space-y-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-card p-3 shadow-soft sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código, cliente, telefone ou bairro"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="h-9 rounded-full border-white/10 bg-white/[0.04] pl-9"
                />
              </div>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="w-full rounded-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" className="rounded-full font-bold" onClick={exportOrdersCsv}>
                <Download className="size-4" /> Exportar CSV
              </Button>
            </div>
            <p className="px-1 text-xs font-semibold text-muted-foreground">
              {filteredOrders.length} pedido{filteredOrders.length !== 1 ? "s" : ""} •{" "}
              {filteredOrders.length !== orders.data?.length ? `filtrado de ${orders.data?.length}` : "no total"}
            </p>
            {filteredOrders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                <p className="font-display text-lg text-foreground">Nenhum pedido encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">Tente ajustar a busca ou o filtro de status.</p>
              </div>
            )}
            {filteredOrders.map((order) => (
              <article
                key={order.id}
                className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:border-primary/30"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold text-primary">
                      #{order.code}
                      <span className="text-foreground">{order.customer_name}</span>
                      <Badge variant={getStatusVariant(order.status)} className="text-[10px] uppercase">
                        {getStatusLabel(order.status)}
                      </Badge>
                    </p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {order.customer_phone} •{" "}
                      {order.order_type === "delivery"
                        ? `${order.address} (${order.neighborhood})`
                        : "Retirada no local"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("pt-BR")}
                      <span className={`size-1.5 rounded-full ${order.whatsapp_sent ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {order.whatsapp_sent ? "WhatsApp enviado" : "WhatsApp pendente"}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-xl border border-white/10 bg-secondary/50 px-3 py-1.5 text-left sm:py-2 sm:text-right">
                    <p className="font-display text-lg font-extrabold text-foreground sm:text-xl">{brl(Number(order.total))}</p>
                    <p className="text-xs text-muted-foreground">{order.payment_method}</p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1 rounded-xl border border-white/5 bg-secondary/40 p-3 text-sm">
                  {(order.items as { name: string; qty: number; size: string; notes: string }[]).map(
                    (item, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="font-bold text-primary">{item.qty}x</span>
                        <span className="min-w-0">
                          {item.name} {item.size && <span className="text-muted-foreground">({item.size})</span>}
                          {item.notes && <em className="text-muted-foreground"> — {item.notes}</em>}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
                {order.notes && (
                  <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xs italic">
                    Obs: {order.notes}
                  </p>
                )}


                <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Select
                    value={order.status}
                    onValueChange={async (value) => {
                      const { error } = await supabase
                        .from("orders")
                        .update({ status: value })
                        .eq("id", order.id);
                      if (error) toast.error(error.message);
                      else invalidate();
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {order.order_type === "delivery" && (
                    <Select
                      value={order.courier_id ?? ""}
                      onValueChange={(value) =>
                        dispatchMutation.mutate({ orderId: order.id, courierId: value })
                      }
                    >
                      <SelectTrigger className="w-full sm:w-52">
                        <SelectValue placeholder="Enviar com motoboy" />
                      </SelectTrigger>
                      <SelectContent>
                        {(couriers.data ?? []).map((courier) => (
                          <SelectItem key={courier.id} value={courier.id}>
                            🛵 {courier.name}
                          </SelectItem>
                        ))}
                        {(couriers.data ?? []).length === 0 && (
                          <SelectItem value="none" disabled>
                            Cadastre um motoboy
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  {order.courier_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full font-bold"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/rastreio/${order.track_token}`,
                        );
                        toast.success("Link de rastreio copiado!");
                      }}
                    >
                      <MapPin className="size-4" /> Link de rastreio
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full font-bold"
                    onClick={() =>
                      window.open(
                        `https://wa.me/${order.customer_phone.replace(/\D/g, "")}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Falar no WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full font-bold"
                    onClick={() => printOrder(order)}
                  >
                    <Printer className="size-4" /> Imprimir comprovante
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full font-bold"
                    onClick={async () => {
                      const text = [
                        `Pedido #${order.code} — ${order.customer_name}`,
                        `${order.customer_phone} • ${order.order_type === "delivery" ? `${order.address} (${order.neighborhood})` : "Retirada"}`,
                        `Total: ${brl(Number(order.total))} • ${getStatusLabel(order.status)}`,
                        ...((order.items as { name: string; qty: number; size: string; notes: string }[]).map((item) => `• ${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ""}${item.notes ? ` — ${item.notes}` : ""}`)),
                        order.notes ? `Obs: ${order.notes}` : "",
                      ].filter(Boolean).join("\n");
                      await navigator.clipboard.writeText(text);
                      toast.success("Pedido copiado!");
                    }}
                  >
                    <Copy className="size-4" /> Copiar
                  </Button>
                </div>
              </article>
            ))}
          </TabsContent>

          <TabsContent value="couriers" className="space-y-3">
            <CouriersPanel />
          </TabsContent>



          <TabsContent value="products" className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar produto..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="h-9 rounded-full border-white/10 bg-card pl-9" />
            </div>
            <ProductForm categories={categories.data ?? []} onSaved={invalidate} />
            {filteredProducts.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft transition hover:border-primary/30 sm:flex-row sm:flex-wrap sm:items-center"
              >
                <Input
                  className="w-full sm:w-40"
                  defaultValue={product.name}
                  onBlur={async (event) => {
                    await supabase
                      .from("products")
                      .update({ name: event.target.value })
                      .eq("id", product.id);
                    invalidate();
                  }}
                />
                <Input
                  className="w-full sm:min-w-48 sm:flex-1"
                  defaultValue={product.description}
                  onBlur={async (event) => {
                    await supabase
                      .from("products")
                      .update({ description: event.target.value })
                      .eq("id", product.id);
                    invalidate();
                  }}
                />
                <Input
                  className="w-full sm:w-24"
                  inputMode="decimal"
                  placeholder="preço"
                  defaultValue={product.price ?? ""}
                  onBlur={async (event) => {
                    await supabase
                      .from("products")
                      .update({ price: event.target.value ? Number(event.target.value) : null })
                      .eq("id", product.id);
                    invalidate();
                  }}
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={product.active}
                    onCheckedChange={async (checked) => {
                      await supabase
                        .from("products")
                        .update({ active: checked })
                        .eq("id", product.id);
                      invalidate();
                    }}
                  />
                  <span className="text-xs">Ativo</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-end rounded-full text-xs font-bold text-destructive hover:text-destructive sm:self-auto"
                  onClick={async () => {
                    await supabase.from("products").delete().eq("id", product.id);
                    invalidate();
                  }}
                >
                  Excluir
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="categories" className="space-y-3">
            {categories.data?.map((category) => (
              <div
                key={category.id}
                className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft transition hover:border-primary/30"
              >
                <div className="grid gap-1">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    className="w-full sm:w-44"
                    defaultValue={category.name}
                    onBlur={async (event) => {
                      await supabase
                        .from("categories")
                        .update({ name: event.target.value })
                        .eq("id", category.id);
                      invalidate();
                    }}
                  />
                </div>
                {(["p", "m", "g", "f"] as const).map((size) => (
                  <div key={size} className="grid gap-1">
                    <Label className="text-xs uppercase">{size}</Label>
                    <Input
                      className="w-16 sm:w-20"
                      inputMode="decimal"
                      defaultValue={category[`price_${size}` as const] ?? ""}
                      onBlur={async (event) => {
                        await supabase
                          .from("categories")
                          .update({
                            [`price_${size}`]: event.target.value
                              ? Number(event.target.value)
                              : null,
                          } as CategoryUpdate)
                          .eq("id", category.id);
                        invalidate();
                      }}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    checked={category.active}
                    onCheckedChange={async (checked) => {
                      await supabase
                        .from("categories")
                        .update({ active: checked })
                        .eq("id", category.id);
                      invalidate();
                    }}
                  />
                  <span className="text-xs">Ativa</span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="zones" className="space-y-3">
            <ZoneForm onSaved={invalidate} />
            {zones.data?.map((zone) => (
              <div
                key={zone.id}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft transition hover:border-primary/30 sm:flex-row sm:flex-wrap sm:items-center"
              >
                <Input
                  className="w-full sm:w-44"
                  defaultValue={zone.name}
                  onBlur={async (event) => {
                    await supabase
                      .from("delivery_zones")
                      .update({ name: event.target.value })
                      .eq("id", zone.id);
                    invalidate();
                  }}
                />
                <Input
                  className="w-full sm:w-24"
                  inputMode="decimal"
                  defaultValue={zone.fee}
                  onBlur={async (event) => {
                    await supabase
                      .from("delivery_zones")
                      .update({ fee: Number(event.target.value || 0) })
                      .eq("id", zone.id);
                    invalidate();
                  }}
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={zone.active}
                    onCheckedChange={async (checked) => {
                      await supabase
                        .from("delivery_zones")
                        .update({ active: checked })
                        .eq("id", zone.id);
                      invalidate();
                    }}
                  />
                  <span className="text-xs">Ativo</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-end rounded-full text-xs font-bold text-destructive hover:text-destructive sm:self-auto"
                  onClick={async () => {
                    await supabase.from("delivery_zones").delete().eq("id", zone.id);
                    invalidate();
                  }}
                >
                  Excluir
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-3">
            <WhatsAppPanel />
          </TabsContent>

          <TabsContent value="settings">
            {settings.data && (
              <form
                className="space-y-4 rounded-2xl border border-border bg-card shadow-soft p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  saveSettings.mutate({
                    store_name: String(form.get("store_name")),
                    tagline: String(form.get("tagline")),
                    store_whatsapp: String(form.get("store_whatsapp")).replace(/\D/g, ""),
                    pix_key: String(form.get("pix_key")),
                    pix_name: String(form.get("pix_name")),
                    opening_hours: String(form.get("opening_hours")),
                    address: String(form.get("address")),
                    min_order: Number(form.get("min_order") || 0),
                    flat_delivery_fee: Number(form.get("flat_delivery_fee") || 0),
                  });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field name="store_name" label="Nome da loja" defaultValue={settings.data.store_name} />
                  <Field name="tagline" label="Slogan" defaultValue={settings.data.tagline} />
                  <Field
                    name="store_whatsapp"
                    label="WhatsApp da loja (com 55 e DDD)"
                    defaultValue={settings.data.store_whatsapp}
                  />
                  <Field
                    name="opening_hours"
                    label="Horário"
                    defaultValue={settings.data.opening_hours}
                  />
                  <Field name="pix_key" label="Chave Pix" defaultValue={settings.data.pix_key} />
                  <Field name="pix_name" label="Nome no Pix" defaultValue={settings.data.pix_name} />
                  <Field
                    name="min_order"
                    label="Pedido mínimo (R$)"
                    defaultValue={String(settings.data.min_order)}
                  />
                  <Field
                    name="flat_delivery_fee"
                    label="Taxa fixa de entrega (R$)"
                    defaultValue={String(settings.data.flat_delivery_fee)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Endereço da loja</Label>
                  <Textarea id="address" name="address" defaultValue={settings.data.address} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["is_open", "Loja aberta"],
                      ["use_flat_fee", "Usar taxa fixa (ignora bairros)"],
                      ["allow_delivery", "Aceitar entrega"],
                      ["allow_pickup", "Aceitar retirada"],
                      ["pay_pix", "Pagamento Pix"],
                      ["pay_cash", "Pagamento dinheiro"],
                      ["pay_card", "Cartão na entrega"],
                      ["allow_half_half", "Permitir meia a meia"],
                      ["notify_store", "Avisar a loja no WhatsApp"],
                      ["notify_customer", "Confirmar para o cliente no WhatsApp"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        checked={Boolean(settings.data[key])}
                        onCheckedChange={(checked) => saveSettings.mutate({ [key]: checked })}
                      />
                      <span className="text-sm">{label}</span>
                    </div>
                  ))}
                </div>

                <Button type="submit" className="font-display" disabled={saveSettings.isPending}>
                  Salvar configurações
                </Button>
              </form>
            )}
          </TabsContent>
          </main>
        </Tabs>
      </div>
    </div>

  );
}

function Field({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} />
    </div>
  );
}

function ProductForm({
  categories,
  onSaved,
}: {
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-primary/40 bg-secondary shadow-glow p-3">
      <div className="grid gap-1">
        <Label className="text-xs">Categoria</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Escolha" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        className="w-full sm:w-40"
        placeholder="Nome"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        className="w-full sm:min-w-48 sm:flex-1"
        placeholder="Descrição"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Input
        className="w-full sm:w-24"
        placeholder="Preço"
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
      />
      <Button
        onClick={async () => {
          if (!categoryId || name.trim().length < 2) {
            toast.error("Informe categoria e nome.");
            return;
          }
          const { error } = await supabase.from("products").insert({
            category_id: categoryId,
            name: name.trim(),
            description: description.trim(),
            price: price ? Number(price) : null,
          });
          if (error) {
            toast.error(error.message);
            return;
          }
          setName("");
          setDescription("");
          setPrice("");
          toast.success("Produto adicionado.");
          onSaved();
        }}
      >
        Adicionar
      </Button>
    </div>
  );
}

function ZoneForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-secondary shadow-glow p-3">
      <Input
        className="w-full sm:w-44"
        placeholder="Bairro"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        className="w-full sm:w-24"
        placeholder="Taxa"
        inputMode="decimal"
        value={fee}
        onChange={(event) => setFee(event.target.value)}
      />
      <Button
        onClick={async () => {
          if (name.trim().length < 2) {
            toast.error("Informe o bairro.");
            return;
          }
          const { error } = await supabase
            .from("delivery_zones")
            .insert({ name: name.trim(), fee: Number(fee || 0) });
          if (error) {
            toast.error(error.message);
            return;
          }
          setName("");
          setFee("");
          toast.success("Bairro adicionado.");
          onSaved();
        }}
      >
        Adicionar bairro
      </Button>
    </div>
  );
}
