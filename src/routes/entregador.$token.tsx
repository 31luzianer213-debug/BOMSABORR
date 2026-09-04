import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bike, MapPin, Navigation, Power } from "lucide-react";
import {
  courierClaimOrder,
  courierFinishOrder,
  courierSession,
  pushCourierLocation,
} from "@/lib/couriers.functions";
import { brl } from "@/lib/cart";


export const Route = createFileRoute("/entregador/$token")({
  component: CourierPage,
  head: () => ({
    meta: [
      { title: "Painel do entregador | Bom Sabor" },
      {
        name: "description",
        content:
          "Painel do entregador Bom Sabor: veja suas entregas do dia, compartilhe sua localização e finalize pedidos.",
      },
      { property: "og:title", content: "Painel do entregador | Bom Sabor" },
      {
        property: "og:description",
        content: "Entregas do dia, localização em tempo real e ganhos do entregador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center p-6 text-center" role="alert">
      <p className="font-display text-lg">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Link não encontrado.</div>,
});

function CourierPage() {
  const { token } = Route.useParams();
  const getSession = useServerFn(courierSession);
  const sendLocation = useServerFn(pushCourierLocation);
  const finishOrder = useServerFn(courierFinishOrder);
  const claimOrder = useServerFn(courierClaimOrder);

  const [sharing, setSharing] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);


  function destinationFor(address: string, neighborhood: string) {
    const link = address.match(/https?:\/\/\S+/)?.[0];
    if (link) {
      const coords = decodeURIComponent(link).match(/(-?\d+\.\d+)[,\s/+]+(-?\d+\.\d+)/);
      if (coords) return `${coords[1]},${coords[2]}`;
    }
    const clean = address.replace(/https?:\/\/\S+/g, "").trim();
    return `${clean} ${neighborhood}`.trim();
  }

  function openRoute(address: string, neighborhood: string) {
    const destination = destinationFor(address, neighborhood);
    if (!destination) {
      toast.error("Este pedido não tem endereço para traçar a rota.");
      return;
    }
    window.open(
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }


  const session = useQuery({
    queryKey: ["courier", token],
    queryFn: () => getSession({ data: { token } }),
    refetchInterval: 15000,
  });

  const finish = useMutation({
    mutationFn: (orderId: string) => finishOrder({ data: { token, orderId } }),
    onSuccess: (result) => {
      toast.success("Entrega finalizada! Cliente avisado no WhatsApp.");
      if (result?.whatsappError) toast.error(`WhatsApp: ${result.whatsappError}`);
      session.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claim = useMutation({
    mutationFn: (orderId: string) =>
      claimOrder({ data: { token, orderId, baseUrl: window.location.origin } }),
    onSuccess: (result) => {
      toast.success("Entrega sua! O cliente recebeu o link de rastreio.");
      if (result?.whatsappError) toast.error(`WhatsApp: ${result.whatsappError}`);
      setOpenId(null);
      session.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });



  function startSharing(silent = false) {
    if (watchRef.current !== null) return;
    if (!("geolocation" in navigator)) {
      if (!silent) toast.error("Seu celular não permite localização neste navegador.");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          await sendLocation({
            data: {
              token,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy ?? null,
            },
          });
          setLastPing(new Date().toLocaleTimeString("pt-BR"));
        } catch {
          /* silencioso: tenta no próximo ping */
        }
      },
      () => {
        if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
        setSharing(false);
        toast.error("Ative a localização do celular para aparecer no mapa.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    setSharing(true);
    if (!silent) toast.success("Localização ligada. Mantenha esta página aberta.");
  }

  useEffect(() => {
    let cancelled = false;
    async function autoStart() {
      if (!("geolocation" in navigator)) return;
      try {
        const status = await navigator.permissions?.query({
          name: "geolocation" as PermissionName,
        });
        if (cancelled) return;
        if (status?.state === "granted") startSharing(true);
        else if (!status) startSharing(true);
      } catch {
        /* navegador sem Permissions API: usuário liga manualmente */
      }
    }
    void autoStart();
    return () => {
      cancelled = true;
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggleSharing() {
    if (sharing) {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      setSharing(false);
      return;
    }
    startSharing();
  }


  const data = session.data;

  return (
    <main className="min-h-screen bg-gradient-brand px-4 py-6 font-sans">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-card p-5 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Entregador</p>
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            {data?.courier.name ?? "Carregando…"}
          </h1>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/10 bg-secondary/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Entregas hoje
              </p>
              <p className="font-display text-xl font-extrabold">{data?.today.count ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-secondary/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {data?.courier.payType === "daily"
                  ? "Pagamento"
                  : data?.courier.payType === "monthly"
                    ? "Pagamento"
                    : "A receber"}
              </p>
              <p className="font-display text-xl font-extrabold">
                {data?.courier.payType === "daily"
                  ? "Diária"
                  : data?.courier.payType === "monthly"
                    ? "Mensal"
                    : brl(data?.today.earnings ?? 0)}
              </p>
            </div>
          </div>

          <Button
            className="mt-3 w-full rounded-full font-bold"
            variant={sharing ? "secondary" : "default"}
            onClick={toggleSharing}
          >
            <Power className="size-4" />
            {sharing ? "Parar de compartilhar localização" : "Ligar minha localização"}
          </Button>
          {sharing && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Última posição enviada: {lastPing ?? "aguardando…"}
            </p>
          )}
        </header>

        {!sharing && (
          <p className="rounded-3xl border border-dashed border-primary/40 bg-primary/10 p-6 text-center text-sm font-semibold">
            Ligue sua localização acima para ver e pegar os pedidos. Assim o cliente consegue
            acompanhar você no mapa.
          </p>
        )}

        <section className={`space-y-3 ${sharing ? "" : "pointer-events-none hidden"}`}>

          <h2 className="px-1 font-display text-lg font-extrabold">Minhas entregas</h2>
          {(data?.orders.length ?? 0) === 0 && (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
              Nenhuma entrega no momento.
            </p>
          )}
          {(data?.orders ?? []).map((order) => {
            const selected = selectedId === order.id;
            return (
              <article
                key={order.id}
                onClick={() => setSelectedId(order.id)}
                className={`cursor-pointer rounded-2xl border bg-card p-4 shadow-soft transition ${
                  selected ? "border-primary ring-2 ring-primary/40" : "border-white/10"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-extrabold text-primary">#{order.code}</p>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {order.status === "delivering" ? "Em rota" : "Preparo"}
                  </Badge>
                  <span className="ml-auto font-display text-lg font-extrabold">
                    {brl(Number(order.total))}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold">{order.customer_name}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {order.customer_phone} • {order.payment_method}
                  {order.change_for ? ` (troco p/ ${brl(Number(order.change_for))})` : ""}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {order.order_type === "delivery"
                    ? `${order.address}${order.neighborhood ? ` — ${order.neighborhood}` : ""}`
                    : "Retirada no local"}
                </p>
                {order.notes && (
                  <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xs italic">
                    Obs: {order.notes}
                  </p>
                )}
                {selected && (
                  <div className="mt-3 space-y-2">
                    {order.order_type === "delivery" && (
                      <Button
                        className="w-full rounded-full font-bold"
                        onClick={(event) => {
                          event.stopPropagation();
                          openRoute(order.address, order.neighborhood);
                        }}
                      >
                        <Navigation className="size-4" /> Navegar no Google Maps
                      </Button>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="rounded-full font-bold"
                        disabled={finish.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          finish.mutate(order.id);
                        }}
                      >
                        Entreguei
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full font-bold"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.open(
                            `https://wa.me/${order.customer_phone.replace(/\D/g, "")}`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }}
                      >
                        <MapPin className="size-4" /> WhatsApp
                      </Button>
                    </div>
                  </div>
                )}
                {!selected && (
                  <p className="mt-3 text-xs font-semibold text-primary">
                    Toque para abrir a rota e finalizar
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <section className={`space-y-3 ${sharing ? "" : "pointer-events-none hidden"}`}>
          <h2 className="px-1 font-display text-lg font-extrabold">Pedidos disponíveis</h2>
          {(data?.available.length ?? 0) === 0 && (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
              Nenhum pedido aguardando entregador.
            </p>
          )}
          {(data?.available ?? []).map((order) => {
            const open = openId === order.id;
            return (
              <article
                key={order.id}
                onClick={() => setOpenId(open ? null : order.id)}
                className={`cursor-pointer rounded-2xl border bg-card p-4 shadow-soft transition ${
                  open ? "border-primary ring-2 ring-primary/40" : "border-white/10"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-extrabold text-primary">#{order.code}</p>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    Aguardando
                  </Badge>
                  <span className="ml-auto font-display text-lg font-extrabold">
                    {brl(Number(order.total))}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold">{order.customer_name}</p>
                {open ? (
                  <div className="mt-2 space-y-2">
                    <p className="break-words text-xs text-muted-foreground">
                      {order.customer_phone} • {order.payment_method}
                      {order.change_for ? ` (troco p/ ${brl(Number(order.change_for))})` : ""}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {order.address}
                      {order.neighborhood ? ` — ${order.neighborhood}` : ""}
                    </p>
                    {order.notes && (
                      <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xs italic">
                        Obs: {order.notes}
                      </p>
                    )}
                    <Button
                      className="w-full rounded-full font-bold"
                      disabled={claim.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        claim.mutate(order.id);
                      }}
                    >
                      <Bike className="size-4" /> Pegar esta entrega
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full rounded-full font-bold"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRoute(order.address, order.neighborhood);
                      }}
                    >
                      <Navigation className="size-4" /> Ver no Google Maps
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-semibold text-primary">
                    Toque para ver os detalhes e pegar
                  </p>
                )}
              </article>
            );
          })}
        </section>

      </div>
    </main>
  );
}
