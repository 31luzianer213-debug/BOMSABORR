import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, cartTotal, type CartItem } from "@/lib/cart";
import { createOrder } from "@/lib/orders.functions";
import type { DeliveryZone, StoreSettings } from "@/lib/menu.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  settings: StoreSettings;
  zones: DeliveryZone[];
  onChangeQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onSuccess: () => void;
};

export function CheckoutSheet({
  open,
  onOpenChange,
  items,
  settings,
  zones,
  onChangeQty,
  onRemove,
  onSuccess,
}: Props) {
  const submit = useServerFn(createOrder);
  const [sending, setSending] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<"delivery" | "pickup">(
    settings.allow_delivery ? "delivery" : "pickup",
  );
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [locating, setLocating] = useState(false);

  const [neighborhood, setNeighborhood] = useState("");
  const [payment, setPayment] = useState<"pix" | "cash" | "card">(
    settings.pay_pix ? "pix" : settings.pay_cash ? "cash" : "card",
  );
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");

  const subtotal = cartTotal(items);
  const deliveryFee = useMemo(() => {
    if (orderType !== "delivery") return 0;
    if (settings.use_flat_fee) return Number(settings.flat_delivery_fee);
    const zone = zones.find((item) => item.name === neighborhood);
    return zone ? Number(zone.fee) : 0;
  }, [orderType, neighborhood, settings, zones]);

  const total = subtotal + deliveryFee;

  const paymentOptions = [
    ...(settings.pay_pix ? [{ value: "pix", label: "Pix" }] : []),
    ...(settings.pay_cash ? [{ value: "cash", label: "Dinheiro" }] : []),
    ...(settings.pay_card ? [{ value: "card", label: "Cartão na entrega" }] : []),
  ];

  function handleLocate() {
    if (!("geolocation" in navigator)) {
      toast.error("Seu navegador não suporta localização.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMapsLink(`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`);
        setLocating(false);
        toast.success("Localização capturada! Ela vai junto com o pedido.");
      },
      () => {
        setLocating(false);
        toast.error("Não conseguimos pegar sua localização. Permita o acesso e tente novamente.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function handleSubmit() {
    if (items.length === 0) return;
    if (name.trim().length < 2) {
      toast.error("Informe seu nome.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (orderType === "delivery" && address.trim().length < 5) {
      toast.error("Informe o endereço de entrega.");
      return;
    }
    if (orderType === "delivery" && !mapsLink && !settings.use_flat_fee && !neighborhood) {
      toast.error("Selecione o bairro ou envie sua localização.");
      return;
    }

    setSending(true);
    try {
      const result = await submit({
        data: {
          customerName: name.trim(),
          customerPhone: phone.trim(),
          orderType,
          address: address.trim(),
          reference: reference.trim(),
          locationUrl: mapsLink,
          neighborhood,
          paymentMethod: payment,
          changeFor: payment === "cash" && changeFor ? Number(changeFor) : null,
          notes: notes.trim(),
          items: items.map((item) => ({
            name: item.name,
            size: item.size,
            qty: item.qty,
            unitPrice: item.unitPrice,
            notes: item.notes,
          })),
        },
      });

      if (result.whatsappOk) {
        toast.success(`Pedido #${result.code} confirmado!`, {
          description: "Você vai receber a confirmação no seu WhatsApp em instantes.",
        });
      } else {
        toast.success(`Pedido #${result.code} registrado!`, {
          description: "A loja já recebeu no painel e confirma com você em seguida.",
        });
      }
      onSuccess();
      onOpenChange(false);

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o pedido.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto bg-popover sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl text-primary">Seu pedido</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-primary">{item.name}</p>
                    {item.size && <p className="text-xs opacity-80">{item.size}</p>}
                    {item.notes && <p className="text-xs italic opacity-70">{item.notes}</p>}
                  </div>
                  <span className="whitespace-nowrap font-display">
                    {brl(item.unitPrice * item.qty)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => onChangeQty(item.id, item.qty - 1)}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center">{item.qty}</span>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => onChangeQty(item.id, item.qty + 1)}
                  >
                    +
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-xs"
                    onClick={() => onRemove(item.id)}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <div className="grid gap-2">
            <Label htmlFor="co-name">Nome</Label>
            <Input
              id="co-name"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="co-phone">WhatsApp (com DDD)</Label>
            <Input
              id="co-phone"
              inputMode="tel"
              maxLength={20}
              placeholder="93 99999-9999"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Como receber</Label>
            <div className="flex gap-2">
              {settings.allow_delivery && (
                <Button
                  type="button"
                  variant={orderType === "delivery" ? "default" : "secondary"}
                  className="flex-1"
                  onClick={() => setOrderType("delivery")}
                >
                  Entrega
                </Button>
              )}
              {settings.allow_pickup && (
                <Button
                  type="button"
                  variant={orderType === "pickup" ? "default" : "secondary"}
                  className="flex-1"
                  onClick={() => setOrderType("pickup")}
                >
                  Retirada
                </Button>
              )}
            </div>
          </div>

          {orderType === "delivery" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="co-address">
                  Endereço de entrega
                </Label>
                <Input
                  id="co-address"
                  maxLength={200}
                  placeholder="Rua e número"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
                <Label htmlFor="co-reference">Ponto de referência</Label>
                <Input
                  id="co-reference"
                  maxLength={160}
                  placeholder="Ex.: próximo à praça"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="justify-start gap-2 text-sm"
                  disabled={locating}
                  onClick={handleLocate}
                >
                  <MapPin className="size-4" />
                  {locating
                    ? "Obtendo localização..."
                    : mapsLink
                      ? "Localização anexada ✓"
                      : "Anexar localização da entrega (opcional)"}
                </Button>
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline opacity-80"
                  >
                    Ver no Google Maps
                  </a>
                )}
              </div>

              {!settings.use_flat_fee && (
                <div className="grid gap-2">
                  <Label>Bairro {mapsLink && <span className="opacity-70">(opcional)</span>}</Label>
                  <Select value={neighborhood} onValueChange={setNeighborhood}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o bairro" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.name}>
                          {zone.name} — {brl(Number(zone.fee))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="grid gap-2">
            <Label>Pagamento</Label>
            <div className="flex flex-wrap gap-2">
              {paymentOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={payment === option.value ? "default" : "secondary"}
                  onClick={() => setPayment(option.value as "pix" | "cash" | "card")}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {payment === "cash" && (
            <div className="grid gap-2">
              <Label htmlFor="co-change">Troco para</Label>
              <Input
                id="co-change"
                inputMode="decimal"
                placeholder="50"
                value={changeFor}
                onChange={(event) => setChangeFor(event.target.value)}
              />
            </div>
          )}

          {payment === "pix" && settings.pix_key && (
            <p className="rounded-lg bg-card p-3 text-xs">
              Chave Pix: <strong className="text-primary">{settings.pix_key}</strong>
              {settings.pix_name ? ` (${settings.pix_name})` : ""}
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="co-notes">Observações do pedido</Label>
            <Textarea
              id="co-notes"
              maxLength={300}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-auto space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Entrega</span>
            <span>{brl(deliveryFee)}</span>
          </div>
          <div className="flex justify-between font-display text-xl text-primary">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
          <Button
            className="mt-3 w-full font-display text-lg"
            disabled={sending || items.length === 0}
            onClick={handleSubmit}
          >
            {sending ? "Enviando..." : "Enviar pedido no WhatsApp"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
