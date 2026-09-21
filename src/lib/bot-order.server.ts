import { z } from "zod";
import { isStoreOpenNow } from "./store-hours";
import { validateAndPriceItems } from "./order-validation.server";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const botOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(80).default("Cliente WhatsApp"),
  orderType: z.enum(["delivery", "pickup"]).default("delivery"),
  address: z.string().trim().max(400).default(""),
  neighborhood: z.string().trim().max(80).default(""),
  reference: z.string().trim().max(200).default(""),
  paymentMethod: z.enum(["pix", "cash", "card"]).default("pix"),
  changeFor: z.number().min(0).max(100000).nullable().default(null),
  notes: z.string().trim().max(300).default(""),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        size: z.string().trim().max(40).default(""),
        qty: z.number().int().min(1).max(50),
        unitPrice: z.number().min(0).max(10000),
        notes: z.string().trim().max(200).default(""),
      }),
    )
    .min(1)
    .max(60),
});

export type BotOrder = z.infer<typeof botOrderSchema>;

export const ORDER_MARKER = "###PEDIDO###";

/** Separa o texto normal da resposta do bloco JSON do pedido, quando existir. */
export function parseBotOrder(answer: string): { text: string; order: BotOrder | null } {
  const index = answer.indexOf(ORDER_MARKER);
  if (index === -1) return { text: answer, order: null };

  const text = answer.slice(0, index).trim();
  const rest = answer.slice(index + ORDER_MARKER.length);
  const start = rest.indexOf("{");
  const end = rest.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return { text, order: null };

  try {
    const parsed = botOrderSchema.parse(JSON.parse(rest.slice(start, end + 1)));
    return { text, order: parsed };
  } catch (error) {
    console.error("JSON de pedido inválido do bot", error);
    return { text, order: null };
  }
}

/**
 * Rede de segurança: se o robô confirmou o pedido em texto mas esqueceu o bloco JSON,
 * relemos a conversa e extraímos o pedido mesmo assim.
 */
export async function extractOrderFromConversation(
  turns: Array<{ role: "user" | "assistant"; content: string }>,
  menu: string,
): Promise<BotOrder | null> {
  try {
    const { generateAiText } = await import("@/lib/ai.server");
    const system = [
      "Você lê uma conversa de atendimento de uma lanchonete/pizzaria e extrai o pedido JÁ CONFIRMADO pelo cliente.",
      "Responda APENAS com JSON puro, sem texto extra e sem markdown.",
      'Se o cliente ainda NÃO confirmou o pedido fechado, responda exatamente: {"confirmado":false}',
      'Se confirmou, responda: {"confirmado":true,"pedido":{"customerName":"Nome","orderType":"delivery","address":"link da localização ou Rua X, 123","neighborhood":"Área identificada automaticamente","reference":"","paymentMethod":"pix","changeFor":null,"notes":"","items":[{"name":"Item","size":"","qty":1,"unitPrice":10,"notes":""}]}}',
      "Se o cliente enviou localização, use o link dela como address e a Área de entrega identificada automaticamente como neighborhood. Bairro, rua, número e referência não são obrigatórios nesse caso.",
      'orderType: "delivery" ou "pickup". paymentMethod: "pix", "cash" ou "card". changeFor só para dinheiro.',
      "Use os preços exatos do cardápio abaixo. Não invente itens.",
      `Cardápio:\n${menu}`,
    ].join("\n");

    const answer = await generateAiText({
      system,
      turns: [
        {
          role: "user",
          content: `Conversa:\n${turns
            .map((t) => `${t.role === "user" ? "Cliente" : "Atendente"}: ${t.content}`)
            .join("\n")}`,
        },
      ],
    });

    const raw = String(answer ?? "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!parsed?.confirmado || !parsed?.pedido) return null;
    return botOrderSchema.parse(parsed.pedido);
  } catch (error) {
    console.error("Falha ao extrair pedido da conversa", error);
    return null;
  }
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** Registra o pedido fechado pelo robô, para ele aparecer (e ser impresso) no painel. */
export async function createBotOrder(order: BotOrder, phone: string, sourceExternalId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!settings || !isStoreOpenNow(settings.is_open, settings.opening_hours)) {
    return { ok: false as const, error: "loja_fechada" };
  }

  if (order.orderType === "delivery" && !settings.allow_delivery) return { ok: false as const, error: "entrega_indisponivel" };
  if (order.orderType === "pickup" && !settings.allow_pickup) return { ok: false as const, error: "retirada_indisponivel" };
  const paymentAllowed = { pix: settings.pay_pix, cash: settings.pay_cash, card: settings.pay_card }[order.paymentMethod];
  if (!paymentAllowed) return { ok: false as const, error: "pagamento_indisponivel" };

  let deliveryFee = 0;
  if (order.orderType === "delivery") {
    if (settings.use_flat_fee) {
      deliveryFee = Number(settings.flat_delivery_fee ?? 0);
    } else if (order.neighborhood) {
      const { data: zone } = await supabaseAdmin
        .from("delivery_zones")
        .select("fee")
        .ilike("name", order.neighborhood)
        .eq("active", true)
        .maybeSingle();
      if (!zone) return { ok: false as const, error: "area_invalida" };
      deliveryFee = Number(zone.fee);
    } else {
      return { ok: false as const, error: "area_invalida" };
    }
  }

  let pricedOrder: Awaited<ReturnType<typeof validateAndPriceItems>>;
  try {
    pricedOrder = await validateAndPriceItems(supabaseAdmin, order.items);
  } catch (error) {
    console.error("Pedido do bot não corresponde ao cardápio", error);
    return { ok: false as const, error: "cardapio_invalido" };
  }
  const subtotal = pricedOrder.subtotal;
  if (Number(settings.min_order) > 0 && subtotal < Number(settings.min_order)) {
    return { ok: false as const, error: "pedido_minimo" };
  }
  const total = subtotal + deliveryFee;

  const noteParts = [
    "Pedido feito pelo atendente de IA no WhatsApp",
    order.reference ? `Referência: ${order.reference}` : "",
    order.notes,
  ].filter(Boolean);

  const { data: created, error } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name: order.customerName,
      customer_phone: normalizePhone(phone),
      order_type: order.orderType,
      address: order.orderType === "delivery" ? order.address : "",
      neighborhood: order.orderType === "delivery" ? order.neighborhood : "",
      delivery_fee: deliveryFee,
      payment_method: order.paymentMethod,
      change_for: order.paymentMethod === "cash" ? order.changeFor : null,
      items: pricedOrder.itemsJson,
      subtotal,
      total,
      notes: noteParts.join(" | ").slice(0, 300),
      source_external_id: sourceExternalId || null,
    })
    .select("code, total")
    .single();

  if (error || !created) {
    if (error?.code === "23505" && sourceExternalId) {
      const { data: existing } = await supabaseAdmin
        .from("orders")
        .select("code, total")
        .eq("source_external_id", sourceExternalId)
        .maybeSingle();
      if (existing) return { ok: true as const, code: existing.code, total: Number(existing.total), summary: "" };
    }
    console.error("Não foi possível registrar o pedido do bot", error?.code);
    return { ok: false as const, error: "falha" };
  }

  const summary = [
    `Pedido *#${created.code}* confirmado! ✅`,
    "",
    ...pricedOrder.items.map(
      (item) => `• ${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ""} — ${brl(item.qty * item.unitPrice)}`,
    ),
    ...(deliveryFee > 0 ? [`Entrega: ${brl(deliveryFee)}`] : []),
    `*Total: ${brl(total)}*`,
    "",
    "Já enviamos para a cozinha. Depois de confirmado não dá mais para alterar — se precisar de algo a mais, é só fazer um novo pedido. 🍕",
  ].join("\n");

  // avisa a loja
  if (settings.notify_store && settings.store_whatsapp) {
    try {
      const { sendWhatsapp } = await import("@/lib/whatsapp.server");
      await sendWhatsapp(settings.store_whatsapp, `🔔 *NOVO PEDIDO (WhatsApp IA)*\n\n${summary}`);
    } catch (error) {
      console.error("Falha ao avisar a loja", error);
    }
  }

  return { ok: true as const, code: created.code, total, summary };
}
