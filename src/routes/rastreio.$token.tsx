import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapView } from "@/components/MapView";
import { trackOrder } from "@/lib/couriers.functions";
import { brl } from "@/lib/cart";

export const Route = createFileRoute("/rastreio/$token")({
  component: TrackPage,
  head: () => ({
    meta: [
      { title: "Acompanhe seu pedido | Bom Sabor" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real onde está o entregador do seu pedido na Bom Sabor Pizzaria & Lanchonete.",
      },
      { property: "og:title", content: "Acompanhe seu pedido | Bom Sabor" },
      {
        property: "og:description",
        content: "Veja o status do pedido e a posição do entregador no mapa.",
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
  notFoundComponent: () => <div className="p-8 text-center">Pedido não encontrado.</div>,
});

const STEPS = [
  { key: "pending", label: "Pedido recebido" },
  { key: "preparing", label: "Em preparo" },
  { key: "delivering", label: "Saiu para entrega" },
  { key: "done", label: "Entregue" },
];

function TrackPage() {
  const { token } = Route.useParams();
  const fetchTracking = useServerFn(trackOrder);

  const tracking = useQuery({
    queryKey: ["tracking", token],
    queryFn: () => fetchTracking({ data: { token } }),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  const data = tracking.data;
  const stepIndex = STEPS.findIndex((step) => step.key === data?.order.status);
  const courier = data?.courier;
  const hasPosition = Boolean(courier && courier.lat !== 0 && courier.lng !== 0);

  return (
    <main className="min-h-screen bg-gradient-brand px-4 py-6 font-sans">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-card p-5 text-center shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            {data?.store.name ?? "Bom Sabor"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground">
            Pedido #{data?.order.code ?? "…"}
          </h1>
          {data && (
            <p className="mt-1 text-sm text-muted-foreground">
              Olá, {data.order.customerName}! Total {brl(data.order.total)}
            </p>
          )}
          {data?.order.status === "canceled" && (
            <Badge variant="destructive" className="mt-3">
              Pedido cancelado
            </Badge>
          )}
        </header>

        <section className="rounded-3xl border border-white/10 bg-card p-5 shadow-soft">
          <ol className="space-y-3">
            {STEPS.map((step, index) => {
              const done = stepIndex >= index;
              return (
                <li key={step.key} className="flex items-center gap-3">
                  <span
                    className={`size-3 shrink-0 rounded-full ${done ? "bg-primary shadow-glow" : "bg-white/15"}`}
                  />
                  <span
                    className={`text-sm font-bold ${done ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {courier && (
          <section className="space-y-3 rounded-3xl border border-white/10 bg-card p-5 shadow-soft">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                Seu entregador
              </p>
              <h2 className="font-display text-xl font-extrabold">{courier.name}</h2>
              {hasPosition ? (
                <p className="text-xs text-muted-foreground">
                  Posição atualizada às {new Date(courier.updatedAt).toLocaleTimeString("pt-BR")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aguardando o entregador ligar a localização…
                </p>
              )}
            </div>
            {hasPosition && (
              <>
                <MapView
                  height={340}
                  follow
                  trail={data?.trail}
                  points={[
                    {
                      id: "courier",
                      lat: courier.lat,
                      lng: courier.lng,
                      label: `🛵 ${courier.name}`,
                      tone: "courier",
                      animate: true,
                    },
                    ...(data?.destination
                      ? [
                          {
                            id: "destino",
                            lat: data.destination.lat,
                            lng: data.destination.lng,
                            label: "📍 Seu endereço",
                            tone: "customer" as const,
                          },
                        ]
                      : []),
                  ]}
                />
                <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-primary">
                  ● Ao vivo
                </p>
              </>
            )}
          </section>
        )}

        {data?.store.whatsapp && (
          <Button
            variant="secondary"
            className="w-full rounded-full font-bold"
            onClick={() =>
              window.open(
                `https://wa.me/${data.store.whatsapp.replace(/\D/g, "")}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            Falar com a loja no WhatsApp
          </Button>
        )}
      </div>
    </main>
  );
}
