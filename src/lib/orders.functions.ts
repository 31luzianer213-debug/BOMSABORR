import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evolutionBaseUrl } from "./evolution-url";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  size: z.string().trim().max(40).default(""),
  qty: z.number().int().min(1).max(50),
  unitPrice: z.number().min(0).max(10000),
  notes: z.string().trim().max(200).default(""),
});

const orderSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(10).max(20),
  orderType: z.enum(["delivery", "pickup"]),
  address: z.string().trim().max(400).default(""),
  reference: z.string().trim().max(160).default(""),
  locationUrl: z.string().url().max(500).or(z.literal("")).default(""),
  neighborhood: z.string().trim().max(80).default(""),
  paymentMethod: z.enum(["pix", "cash", "card"]),
  changeFor: z.number().min(0).max(100000).nullable().default(null),
  notes: z.string().trim().max(300).default(""),
  items: z.array(itemSchema).min(1).max(60),
});

export type OrderInput = z.infer<typeof orderSchema>;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

const FALLBACK_EVOLUTION_INSTANCE = "zap_2ed5d8cccdb6";

function isPlaceholderEnv(v: string | undefined) {
  if (!v) return true;
  const t = v.trim();
  if (!t) return true;
  if (t.includes("COLE_A")) return true;
  if (t.length < 10) return true;
  return false;
}
function pickEnv(name: string, fallback = "") {
  const v = process.env[name];
  return isPlaceholderEnv(v) ? fallback : v?.trim() ?? fallback;
}

async function sendWhatsapp(to: string, text: string) {
  const base = pickEnv("EVOLUTION_API_URL");
  const instance = pickEnv("EVOLUTION_INSTANCE", FALLBACK_EVOLUTION_INSTANCE);
  const apiKey = pickEnv("EVOLUTION_API_KEY");
  if (!base || !instance || !apiKey) {
    console.error("Evolution não configurada", {
      hasUrl: Boolean(base),
      hasInstance: Boolean(instance),
      hasKey: Boolean(apiKey),
    });
    return { ok: false, error: "Evolution API não configurada" };
  }

  const url = `${evolutionBaseUrl(base)}/message/sendText/${instance}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: normalizePhone(to), text }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Evolution API falhou [${response.status}]: ${body}`);
      return { ok: false, error: `Evolution API [${response.status}]` };
    }
    return { ok: true as const };
  } catch (error) {
    console.error("Evolution API erro de rede", error);
    return { ok: false, error: "Falha de rede ao chamar a Evolution API" };
  }
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings?.is_open) {
      throw new Error("A loja está fechada no momento.");
    }

    let deliveryFee = 0;
    const hasGeoLocation = Boolean(data.locationUrl);

    if (data.orderType === "delivery") {
      if (settings.use_flat_fee) {
        deliveryFee = Number(settings.flat_delivery_fee);
      } else if (data.neighborhood) {
        const { data: zone } = await supabaseAdmin
          .from("delivery_zones")
          .select("fee")
          .eq("name", data.neighborhood)
          .eq("active", true)
          .maybeSingle();
        if (!zone) throw new Error("Selecione um bairro de entrega válido.");
        deliveryFee = Number(zone.fee);
      } else if (!hasGeoLocation) {
        throw new Error("Selecione um bairro de entrega válido.");
      }

      if (!hasGeoLocation && data.address.trim().length < 5) {
        throw new Error("Informe o endereço de entrega ou envie sua localização.");
      }
    }

    const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
    const total = subtotal + deliveryFee;

    if (Number(settings.min_order) > 0 && subtotal < Number(settings.min_order)) {
      throw new Error(`Pedido mínimo de ${brl(Number(settings.min_order))}.`);
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: data.customerName,
        customer_phone: normalizePhone(data.customerPhone),
        order_type: data.orderType,
        address:
          data.orderType === "delivery"
            ? [data.address, data.reference ? `Referência: ${data.reference}` : "", data.locationUrl ? `Localização: ${data.locationUrl}` : ""]
                .filter(Boolean)
                .join(" | ")
            : "",
        neighborhood: data.orderType === "delivery" ? data.neighborhood : "",
        delivery_fee: deliveryFee,
        payment_method: data.paymentMethod,
        change_for: data.paymentMethod === "cash" ? data.changeFor : null,
        items: data.items,
        subtotal,
        total,
        notes: data.notes,
      })
      .select("*")
      .single();

    if (error || !order) throw new Error(error?.message ?? "Não foi possível registrar o pedido.");

    const paymentLabel =
      data.paymentMethod === "pix"
        ? "Pix"
        : data.paymentMethod === "cash"
          ? `Dinheiro${data.changeFor ? ` (troco para ${brl(data.changeFor)})` : ""}`
          : "Cartão na entrega";

    const orderLines = [
      `*${settings.store_name} — Pedido #${order.code}*`,
      "",
      ...data.items.map(
        (item) =>
          `• ${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ""} — ${brl(item.qty * item.unitPrice)}${item.notes ? `\n   _${item.notes}_` : ""}`,
      ),
      "",
      `Subtotal: ${brl(subtotal)}`,
      ...(deliveryFee > 0 ? [`Entrega: ${brl(deliveryFee)}`] : []),
      `*Total: ${brl(total)}*`,
      "",
      `Pagamento: ${paymentLabel}`,
      ...(data.paymentMethod === "pix" && settings.pix_key
        ? [`Chave Pix: ${settings.pix_key}${settings.pix_name ? ` (${settings.pix_name})` : ""}`]
        : []),
      data.orderType === "delivery"
        ? `Entrega: ${[data.address, data.neighborhood].filter(Boolean).join(" — ")}`
        : "Retirada no local",
      ...(data.orderType === "delivery" && data.reference ? [`Ponto de referência: ${data.reference}`] : []),
      ...(data.orderType === "delivery" && data.locationUrl
        ? [`Localização de entrega enviada pelo cliente: ${data.locationUrl}`]
        : []),
      `Cliente: ${data.customerName} — ${data.customerPhone}`,
      ...(data.notes ? ["", `Obs: ${data.notes}`] : []),
    ];

    const message = orderLines.join("\n");
    const customerLines = orderLines.filter(
      (line) => !line.startsWith("Localização de entrega enviada pelo cliente:"),
    );
    if (data.orderType === "delivery" && data.locationUrl) {
      customerLines.splice(customerLines.length - (data.notes ? 3 : 1), 0, "Localização de entrega recebida ✓");
    }
    const customerMessage = customerLines.join("\n");
    const results: string[] = [];

    if (settings.notify_store && settings.store_whatsapp) {
      const sent = await sendWhatsapp(settings.store_whatsapp, `🔔 *NOVO PEDIDO*\n\n${message}`);
      if (!sent.ok && sent.error) results.push(sent.error);
    }
    if (settings.notify_customer) {
      const sent = await sendWhatsapp(
        data.customerPhone,
        `${customerMessage}\n\nRecebemos seu pedido! 🍕 Em breve confirmamos por aqui.`,
      );
      if (!sent.ok && sent.error) results.push(sent.error);
    }

    if (results.length === 0) {
      await supabaseAdmin.from("orders").update({ whatsapp_sent: true }).eq("id", order.id);
    }

    return {
      code: order.code,
      total,
      deliveryFee,
      whatsappOk: results.length === 0,
      whatsappError: results[0] ?? null,
      storeWhatsapp: settings.store_whatsapp,
      message,
    };
  });

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Apenas administradores.");
}

export const markOrderDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .update({ status: "done", delivered_at: new Date().toISOString() })
      .eq("id", data.orderId)
      .select("code, customer_phone")
      .single();
    if (error || !order) throw new Error(error?.message ?? "Pedido não encontrado.");

    const sent = await sendWhatsapp(
      order.customer_phone,
      `✅ Pedido #${order.code} entregue! Obrigado pela preferência. Bom apetite! 🍕`,
    );
    return { whatsappError: sent.ok ? null : (sent.error ?? "Falha no WhatsApp") };
  });

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
