import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sendCourierLink } from "@/lib/couriers.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { MapView, type MapPoint } from "@/components/MapView";
import { brl } from "@/lib/cart";

type PayType = "fee" | "daily" | "monthly";

const PAY_LABEL: Record<PayType, string> = {
  fee: "Valor por entrega",
  daily: "Valor da diária",
  monthly: "Valor da mensalidade",
};

const PAY_NAME: Record<PayType, string> = {
  fee: "Taxa por entrega",
  daily: "Diária",
  monthly: "Mensalidade",
};

export function CouriersPanel() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries();
  const sendLink = useServerFn(sendCourierLink);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fee, setFee] = useState("5");
  const [payType, setPayType] = useState<PayType>("fee");

  const couriers = useQuery({
    queryKey: ["admin", "couriers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const locations = useQuery({
    queryKey: ["admin", "courier-locations"],
    queryFn: async () => {
      const since = new Date(Date.now() - 1000 * 60 * 60).toISOString();
      const { data, error } = await supabase
        .from("courier_locations")
        .select("courier_id, lat, lng, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const orders = useQuery({
    queryKey: ["admin", "courier-orders"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("orders")
        .select("id, code, courier_id, courier_fee, status, created_at, delivered_at")
        .gte("created_at", start.toISOString())
        .not("courier_id", "is", null);
      if (error) throw error;
      return data;
    },
    refetchInterval: 20000,
  });

  const latest = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; created_at: string }>();
    for (const row of locations.data ?? []) {
      if (!map.has(row.courier_id)) {
        map.set(row.courier_id, { lat: row.lat, lng: row.lng, created_at: row.created_at });
      }
    }
    return map;
  }, [locations.data]);

  const points: MapPoint[] = useMemo(
    () =>
      (couriers.data ?? [])
        .filter((courier) => courier.active && latest.has(courier.id))
        .map((courier) => {
          const position = latest.get(courier.id)!;
          return {
            id: courier.id,
            lat: position.lat,
            lng: position.lng,
            label: `🛵 ${courier.name}`,
            tone: "courier" as const,
          };
        }),
    [couriers.data, latest],
  );

  const report = useMemo(() => {
    const rows = orders.data ?? [];
    return (couriers.data ?? []).map((courier) => {
      const mine = rows.filter((order) => order.courier_id === courier.id);
      const done = mine.filter((order) => order.status === "done");
      return {
        courier,
        inRoute: mine.filter((order) => order.status === "delivering").length,
        done: done.length,
        payout: done.reduce((sum, order) => sum + Number(order.courier_fee), 0),
      };
    });
  }, [couriers.data, orders.data]);

  async function addCourier() {
    if (name.trim().length < 2) {
      toast.error("Informe o nome do motoboy.");
      return;
    }
    const { error } = await supabase.from("couriers").insert({
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      pay_type: payType,
      pay_amount: Number(fee) || 0,
      fee_per_delivery: payType === "fee" ? Number(fee) || 0 : 0,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setPhone("");
    toast.success("Motoboy cadastrado!");
    invalidate();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/entregador/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link do motoboy copiado! Envie no WhatsApp dele.");
  }

  const totalPayout = report.reduce((sum, row) => sum + row.payout, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-extrabold">Mapa dos motoboys</h3>
            <p className="text-xs text-muted-foreground">
              {points.length > 0
                ? `${points.length} motoboy(s) enviando localização agora`
                : "Nenhum motoboy compartilhando localização — envie o link para eles ligarem no celular."}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">
            atualiza a cada 10s
          </Badge>
        </div>
        <div className="mt-3">
          <MapView points={points} height={360} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Em rota agora
          </p>
          <p className="font-display text-2xl font-extrabold">
            {report.reduce((sum, row) => sum + row.inRoute, 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Entregas hoje
          </p>
          <p className="font-display text-2xl font-extrabold">
            {report.reduce((sum, row) => sum + row.done, 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            A pagar hoje
          </p>
          <p className="font-display text-2xl font-extrabold">{brl(totalPayout)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
        <h3 className="font-display text-lg font-extrabold">Novo motoboy</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_150px_140px_auto] sm:items-end">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João" />
          </div>
          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="93 99999-9999"
            />
          </div>
          <div>
            <Label className="text-xs">Forma de pagamento</Label>
            <select
              value={payType}
              onChange={(e) => setPayType(e.target.value as PayType)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="fee">Taxa por entrega</option>
              <option value="daily">Diária</option>
              <option value="monthly">Mensalidade</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">{PAY_LABEL[payType]}</Label>
            <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" />
          </div>
          <Button className="rounded-full font-bold" onClick={addCourier}>
            <Plus className="size-4" /> Cadastrar
          </Button>
        </div>
      </section>


      <section className="space-y-3">
        {report.map(({ courier, inRoute, done, payout }) => (
          <article key={courier.id} className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`size-2.5 rounded-full ${latest.has(courier.id) ? "bg-emerald-400" : "bg-muted-foreground"}`}
              />
              <p className="font-display text-lg font-extrabold">{courier.name}</p>
              <Badge variant="outline" className="text-[10px] uppercase">
                {latest.has(courier.id) ? "online" : "offline"}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {PAY_NAME[courier.pay_type as PayType]}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">{courier.phone}</span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[150px_1fr_1fr_auto] sm:items-end">
              <div>
                <Label className="text-xs">Forma de pagamento</Label>
                <select
                  value={courier.pay_type}
                  onChange={async (e) => {
                    const next = e.target.value as PayType;
                    const { error } = await supabase
                      .from("couriers")
                      .update({
                        pay_type: next,
                        fee_per_delivery: next === "fee" ? Number(courier.pay_amount) || 0 : 0,
                      })
                      .eq("id", courier.id);
                    if (error) toast.error(error.message);
                    else invalidate();
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="fee">Taxa por entrega</option>
                  <option value="daily">Diária</option>
                  <option value="monthly">Mensalidade</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">{PAY_LABEL[courier.pay_type as PayType]}</Label>
                <Input
                  defaultValue={String(courier.pay_amount)}
                  inputMode="decimal"
                  onBlur={async (e) => {
                    const value = Number(e.target.value) || 0;
                    const { error } = await supabase
                      .from("couriers")
                      .update({
                        pay_amount: value,
                        fee_per_delivery: courier.pay_type === "fee" ? value : 0,
                      })
                      .eq("id", courier.id);
                    if (error) toast.error(error.message);
                    else invalidate();
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  defaultValue={courier.phone}
                  onBlur={async (e) => {
                    const { error } = await supabase
                      .from("couriers")
                      .update({ phone: e.target.value.replace(/\D/g, "") })
                      .eq("id", courier.id);
                    if (error) toast.error(error.message);
                    else invalidate();
                  }}
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  checked={courier.active}
                  onCheckedChange={async (value) => {
                    const { error } = await supabase
                      .from("couriers")
                      .update({ active: value })
                      .eq("id", courier.id);
                    if (error) toast.error(error.message);
                    else invalidate();
                  }}
                />
                <span className="text-xs font-semibold">Ativo</span>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Hoje: {done} entrega(s) concluída(s) • {inRoute} em rota •{" "}
              <strong className="text-foreground">
                {courier.pay_type === "fee"
                  ? `a pagar ${brl(payout)}`
                  : `${PAY_NAME[courier.pay_type as PayType]} de ${brl(Number(courier.pay_amount))}`}
              </strong>
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full font-bold"
                onClick={() => copyLink(courier.share_token)}
              >
                <Copy className="size-4" /> Copiar link do motoboy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full font-bold"
                onClick={() =>
                  window.open(`/entregador/${courier.share_token}`, "_blank", "noopener,noreferrer")
                }
              >
                <Link2 className="size-4" /> Abrir painel dele
              </Button>
              {courier.phone && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sendingId === courier.id}
                  className="rounded-full font-bold"
                  onClick={async () => {
                    setSendingId(courier.id);
                    try {
                      await sendLink({
                        data: { courierId: courier.id, baseUrl: window.location.origin },
                      });
                      toast.success(`Link enviado no WhatsApp de ${courier.name}`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
                    } finally {
                      setSendingId(null);
                    }
                  }}
                >
                  {sendingId === courier.id ? "Enviando..." : "Enviar link no WhatsApp"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto rounded-full font-bold text-destructive"
                onClick={async () => {
                  if (!window.confirm(`Remover ${courier.name}?`)) return;
                  const { error } = await supabase.from("couriers").delete().eq("id", courier.id);
                  if (error) toast.error(error.message);
                  else {
                    toast.success("Motoboy removido.");
                    invalidate();
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
