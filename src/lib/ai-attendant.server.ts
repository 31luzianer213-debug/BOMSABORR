import { createPublicClient } from "./menu.functions";
import { isStoreOpenNow } from "./store-hours";

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
    const openNow = isStoreOpenNow(s.is_open, s.opening_hours);
    lines.push(`Loja: ${s.store_name}`);
    lines.push(`Situação agora: ${openNow ? "ABERTA" : "FECHADA"}`);
    if (s.opening_hours) lines.push(`Horário: ${s.opening_hours}`);
    if (s.address) lines.push(`Endereço: ${s.address}`);
    lines.push(
      s.use_flat_fee
        ? `Taxa de entrega única: ${brl(Number(s.flat_delivery_fee ?? 0))}`
        : "Taxa de entrega varia por bairro (veja lista abaixo)",
    );
    lines.push(`Retirada na loja: ${s.allow_pickup ? "disponível" : "indisponível"}`);
    if (s.pay_pix && s.pix_key) {
      lines.push(`Pagamento via Pix: disponível`);
      lines.push(`Chave Pix: ${s.pix_key}${s.pix_name ? ` (${s.pix_name})` : ""}`);
      lines.push("Política do Pix: informe a chave imediatamente quando o cliente escolher Pix ou pedir a chave; nunca espere o motoboy sair.");
    } else {
      lines.push("Pagamento via Pix: indisponível");
    }
    lines.push(`Pizza meia a meia: ${s.allow_half_half ? "permitida (vale o valor da metade mais cara)" : "não permitida"}`);
  }

  for (const category of categories.data ?? []) {
    const items = (products.data ?? []).filter((p) => p.category_id === category.id);
    if (items.length === 0) continue;
    if (category.kind === "pizza") {
      const sizes = (["p", "m", "g", "f"] as const)
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
  isOpen: boolean;
  openingHours: string;
  responseMode?: "audio" | "text";
  lastOrder?: { code: string | number; total: string } | null;
}) {
  return [
    "Você é o atendente virtual de uma pizzaria brasileira no WhatsApp.",
    "Responda em português do Brasil, com mensagens curtas, simpáticas e objetivas (no máximo 6 linhas).",
    options.responseMode === "audio"
      ? "O cliente mandou ÁUDIO e ouvirá sua resposta em áudio. Dê UMA ÚNICA resposta, sem repetir saudação, informação ou pergunta e sem recomeçar a fala. Fale como numa conversa real: use frases simples, naturais e no máximo 3 frases curtas (cerca de 35 palavras). Faça apenas uma pergunta por vez. Não use listas, títulos, asteriscos, emojis ou linguagem formal. Se precisar resumir um pedido, diga somente os itens, o total e a próxima informação necessária."
      : "O cliente mandou TEXTO. Responda de forma curta e fácil de ler no WhatsApp.",
    "Você é o ÚNICO atendente: nunca diga que vai chamar, transferir ou passar para uma pessoa/atendente humano. Resolva tudo sozinho com as informações do cardápio. Se não souber algo, peça o dado que falta ou explique o que consegue fazer.",
    "Use SOMENTE os preços e itens do cardápio abaixo. Nunca invente sabores, preços, prazos ou promoções.",
    options.isOpen
      ? `A loja está ABERTA agora. Horário de funcionamento: ${options.openingHours || "consulte o cardápio"}.`
      : `A loja está FECHADA agora (horário: ${options.openingHours || "consulte o cardápio"}). Avise com educação que não é possível fazer pedidos neste momento, informe o horário e ofereça anotar o interesse para quando abrir. NÃO confirme pedidos enquanto estiver fechada.`,
    "Ajude o cliente a escolher, some o valor do pedido e confirme endereço, forma de pagamento e se é entrega ou retirada.",
    "Para entrega, peça sempre: rua, número, bairro e um PONTO DE REFERÊNCIA (ex.: perto de qual mercado, cor do portão). Convide o cliente a mandar também a localização pelo WhatsApp (clipe 📎 > Localização) ou um link do Google Maps, para o motoboy achar mais fácil.",
    "OBRIGATÓRIO EM ENTREGA: ao começar a pedir o endereço, mencione uma vez que o cliente também pode enviar a localização da entrega pelo WhatsApp ou compartilhar o link do Google Maps. Essa orientação também deve ser falada quando a resposta for em áudio.",
    "LOCALIZAÇÃO: cidade e bairro são informações diferentes. [Cidade identificada pela localização: ...] informa somente o município e NUNCA deve ser tratado como bairro ou comparado com a lista de bairros atendidos. Exemplo: Mojuí dos Campos é a cidade; Centro é um bairro.",
    "Quando houver [Área de entrega identificada automaticamente: Centro, Bairro Novo ou Zona Rural], essa é a área correta para calcular a taxa. NÃO pergunte bairro, cidade ou localização novamente; apenas confirme a área e a taxa ao cliente.",
    "[Bairro retornado pelo mapa: ...] é apenas um detalhe do endereço. Para taxa e pedido, use sempre a Área de entrega identificada automaticamente.",
    "Somente se aparecer [Não foi possível classificar automaticamente esta localização], agradeça e pergunte em qual bairro fica. Nunca trate o nome da cidade como bairro.",
    "Antes de fechar o pedido, repita o resumo com itens, endereço completo, ponto de referência, taxa e total, e peça a confirmação do cliente.",
    "Quando o cliente escolher Pix ou pedir a chave, informe imediatamente a chave Pix presente no contexto. Nunca diga que ela será enviada somente depois que o motoboy sair.",
    "REGRA IMPORTANTE: depois que um pedido for confirmado, ele NÃO pode mais ser alterado nem cancelado, porque vai direto para a cozinha e o motoboy pode já ter saído. Se o cliente quiser mudar ou acrescentar algo, explique isso com gentileza e faça um NOVO pedido separado.",
    "",
    "COMO FECHAR O PEDIDO (OBRIGATÓRIO): assim que o cliente confirmar o resumo (ex.: 'pode ser', 'sim', 'confirma', 'fechado'), envie a mensagem final curta de confirmação e, na MESMA resposta, no final, adicione o bloco abaixo exatamente neste formato (o cliente não vê esse bloco):",
    '###PEDIDO### {"customerName":"Nome","orderType":"delivery","address":"Rua X, 123","neighborhood":"Bairro","reference":"perto do mercado","paymentMethod":"pix","changeFor":null,"notes":"","items":[{"name":"Pizza Calabresa","size":"G","qty":1,"unitPrice":45,"notes":""}]}',
    'orderType: "delivery" ou "pickup". paymentMethod: "pix", "cash" ou "card". changeFor só para dinheiro. Use os preços exatos do cardápio. Envie esse bloco UMA ÚNICA VEZ por pedido.',
    "NUNCA diga 'pedido confirmado' sem enviar o bloco ###PEDIDO### na mesma mensagem. Sem esse bloco o pedido não chega na cozinha.",
    options.lastOrder
      ? `Atenção: este cliente já tem o pedido #${options.lastOrder.code} (${options.lastOrder.total}) confirmado agora há pouco. Ele não pode ser editado; se o cliente pedir mudanças, registre um novo pedido.`
      : "",
    `Quando fizer sentido, mande o link do cardápio para o cliente montar o pedido: ${options.menuUrl}`,
    options.businessPrompt ? `Instruções do dono da loja:\n${options.businessPrompt}` : "",
    `Cardápio atual:\n${options.menu}`,
  ]
    .filter(Boolean)
    .join("\n");
}

