import { createPublicClient } from "./menu.functions";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Monta o texto do cardápio real da loja para a IA usar como contexto. */
export async function buildMenuContext(): Promise<string> {
  const supabase = createPublicClient();
  const [settings, categories, products, zones] = await Promise.all([
    supabase.from("store_settings").select("*").limit(1).maybeSingle(),
    supabase.from("categories").select("*").eq("active", true).order("sort_order"),
    supabase.from("products").select("*").eq("active", true).order("sort_order"),
    supabase.from("delivery_zones").select("*").eq("active", true).order("sort_order"),
  ]);

  const s = settings.data;
  const lines: string[] = [];

  if (s) {
    lines.push(`Loja: ${s.store_name}`);
    lines.push(`Situação agora: ${s.is_open ? "ABERTA" : "FECHADA"}`);
    if (s.opening_hours) lines.push(`Horário: ${s.opening_hours}`);
    if (s.address) lines.push(`Endereço: ${s.address}`);
    lines.push(
      s.use_flat_fee
        ? `Taxa de entrega única: ${brl(Number(s.flat_delivery_fee ?? 0))}`
        : "Taxa de entrega varia por bairro (veja lista abaixo)",
    );
    lines.push(`Retirada na loja: ${s.allow_pickup ? "disponível" : "indisponível"}`);
    lines.push(`Pizza meia a meia: ${s.allow_half_half ? "permitida (vale o valor da metade mais cara)" : "não permitida"}`);
  }

  for (const category of categories.data ?? []) {
    const items = (products.data ?? []).filter((p) => p.category_id === category.id);
    if (items.length === 0) continue;
    if (category.kind === "pizza") {
      const sizes = (["p", "m", "g", "gg"] as const)
        .map((k) => {
          const price = category[`price_${k}` as const];
          return price === null || price === undefined ? null : `${k.toUpperCase()}: ${brl(Number(price))}`;
        })
        .filter(Boolean)
        .join(" | ");
      lines.push(`\n${category.name} (pizza — ${sizes})`);
      for (const item of items) {
        lines.push(`- ${item.name}${item.description ? `: ${item.description}` : ""}`);
      }
    } else {
      lines.push(`\n${category.name}`);
      for (const item of items) {
        lines.push(`- ${item.name} — ${brl(Number(item.price ?? 0))}${item.description ? ` (${item.description})` : ""}`);
      }
    }
  }

  const zoneList = zones.data ?? [];
  if (zoneList.length > 0 && !s?.use_flat_fee) {
    lines.push("\nBairros e taxas de entrega:");
    for (const zone of zoneList) {
      lines.push(`- ${zone.name}: ${brl(Number(zone.fee ?? 0))}`);
    }
  }

  return lines.join("\n");
}

export function buildSystemPrompt(options: {
  businessPrompt: string;
  menu: string;
  menuUrl: string;
}) {
  return [
    "Você é o atendente virtual de uma pizzaria brasileira no WhatsApp.",
    "Responda em português do Brasil, com mensagens curtas, simpáticas e objetivas (no máximo 6 linhas).",
    "Use SOMENTE os preços e itens do cardápio abaixo. Nunca invente sabores, preços, prazos ou promoções.",
    "Ajude o cliente a escolher, some o valor do pedido e confirme endereço, forma de pagamento e se é entrega ou retirada.",
    `Quando fizer sentido, mande o link do cardápio para o cliente montar o pedido: ${options.menuUrl}`,
    "Se o cliente pedir para falar com uma pessoa, ou se você não souber responder, responda SOMENTE com a palavra TRANSFERIR.",
    options.businessPrompt ? `Instruções do dono da loja:\n${options.businessPrompt}` : "",
    `Cardápio atual:\n${options.menu}`,
  ]
    .filter(Boolean)
    .join("\n");
}
