import { createFileRoute } from "@tanstack/react-router";

type EvolutionPayload = { event?: string; data?: Record<string, any> };

type Coordinates = { latitude: number; longitude: number };
type LocationAddress = {
  neighborhood: string | null;
  city: string | null;
  deliveryArea: string | null;
};

const MOJUI_URBAN_CENTER: Coordinates = { latitude: -2.682167, longitude: -54.642717 };

function distanceInKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractCoordinates(message: Record<string, any> | undefined): Coordinates | null {
  const loc = message?.["locationMessage"] ?? message?.["liveLocationMessage"];
  const latitude = Number(loc?.["degreesLatitude"]);
  const longitude = Number(loc?.["degreesLongitude"]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function identifyLocationAddress(coordinates: Coordinates): Promise<LocationAddress> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(coordinates.latitude));
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/json",
      "User-Agent": "BomSabor-Pedidos/1.0",
    },
  });
  if (!response.ok) return { neighborhood: null, city: null, deliveryArea: null };

  const result = (await response.json()) as {
    address?: Record<string, string | undefined>;
    type?: string;
  };
  const address = result.address;
  if (!address) return { neighborhood: null, city: null, deliveryArea: null };

  const city =
    address["city"] ??
    address["town"] ??
    address["municipality"] ??
    address["village"] ??
    null;
  const neighborhood =
    address["suburb"] ??
    address["neighbourhood"] ??
    address["quarter"] ??
    null;

  const normalizedNeighborhood = neighborhood?.toLocaleLowerCase("pt-BR") ?? "";
  const knownNeighborhood = normalizedNeighborhood.includes("bairro novo")
    ? "Bairro Novo"
    : normalizedNeighborhood.includes("centro")
      ? "Centro"
      : null;
  const isMojui = city?.toLocaleLowerCase("pt-BR").includes("mojuí dos campos") ?? false;
  const isUrban =
    isMojui &&
    (result.type === "residential" || distanceInKm(coordinates, MOJUI_URBAN_CENTER) <= 4.5);
  const deliveryArea = knownNeighborhood ?? (isUrban ? "Centro" : isMojui ? "Zona Rural" : null);

  return { neighborhood, city, deliveryArea };
}

function extractText(message: Record<string, any> | undefined): string {
  if (!message) return "";
  const loc = message["locationMessage"] ?? message["liveLocationMessage"];
  if (loc?.["degreesLatitude"] != null && loc?.["degreesLongitude"] != null) {
    const lat = loc["degreesLatitude"];
    const lng = loc["degreesLongitude"];
    const extra = [loc["name"], loc["address"], loc["comment"]].filter(Boolean).join(" - ");
    return `[Localização enviada pelo cliente] https://www.google.com/maps?q=${lat},${lng}${extra ? ` (${extra})` : ""}`;
  }
  return (
    message["conversation"] ??
    message["extendedTextMessage"]?.["text"] ??
    message["imageMessage"]?.["caption"] ??
    message["videoMessage"]?.["caption"] ??
    message["buttonsResponseMessage"]?.["selectedDisplayText"] ??
    message["listResponseMessage"]?.["title"] ??
    ""
  );
}

export const Route = createFileRoute("/api/public/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["WHATSAPP_WEBHOOK_TOKEN"];
        const token = new URL(request.url).searchParams.get("token");
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });

        let payload: EvolutionPayload;
        try {
          payload = (await request.json()) as EvolutionPayload;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event = (payload.event ?? "").toUpperCase().replace(/[.\-]/g, "_");
        if (event !== "MESSAGES_UPSERT") return new Response("ok");

        const data = payload.data ?? {};
        const key = data["key"] ?? {};
        const remoteJid: string = key["remoteJid"] ?? "";
        if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
          return new Response("ok");
        }
        if (key["fromMe"]) return new Response("ok");

        const phone = (remoteJid.split("@")[0] ?? "").replace(/\D/g, "");
        if (!phone) return new Response("ok");
        const message = (data["message"] ?? {}) as Record<string, any>;
        const isAudio = Boolean(message["audioMessage"]);
        const { getWhatsappMediaBase64, markWhatsappRead, sendWhatsappAudio, sendWhatsappReply, showWhatsappPresence } =
          await import("@/lib/whatsapp.server");
        await Promise.all([
          markWhatsappRead(key).catch(() => null),
          showWhatsappPresence(phone, isAudio ? "recording" : "composing").catch(() => null),
        ]);

        let text = String(extractText(message) ?? "").trim();
        const coordinates = extractCoordinates(message);
        if (coordinates) {
          const locationAddress = await identifyLocationAddress(coordinates).catch(() => ({
            neighborhood: null,
            city: null,
            deliveryArea: null,
          }));
          if (locationAddress.city) text += ` [Cidade identificada pela localização: ${locationAddress.city}]`;
          if (locationAddress.deliveryArea) {
            text += ` [Área de entrega identificada automaticamente: ${locationAddress.deliveryArea}]`;
            if (locationAddress.neighborhood) {
              text += ` [Bairro retornado pelo mapa: ${locationAddress.neighborhood}]`;
            }
          } else {
            text += " [Não foi possível classificar automaticamente esta localização]";
          }
        }
        if (isAudio) {
          const media = await getWhatsappMediaBase64(data);
          if (!media.ok) return new Response("ok");
          const { transcribeAiAudio } = await import("@/lib/ai.server");
          text = await transcribeAiAudio(media.base64, media.mimetype).catch(() => "");
        }
        if (!text) return new Response("ok");
        const pushName: string | null = data["pushName"] ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // conversa
        const { data: existing } = await supabaseAdmin
          .from("wa_conversations")
          .select("id, bot_paused")
          .eq("phone", phone)
          .maybeSingle();

        let conversationId = existing?.id ?? null;
        const isNew = !conversationId;
        if (!conversationId) {
          const { data: created } = await supabaseAdmin
            .from("wa_conversations")
            .insert({
              phone,
              customer_name: pushName,
              last_message_at: new Date().toISOString(),
              last_message_preview: text.slice(0, 120),
            })
            .select("id")
            .single();
          conversationId = created?.id ?? null;
        } else {
          await supabaseAdmin
            .from("wa_conversations")
            .update({
              customer_name: pushName,
              last_message_at: new Date().toISOString(),
              last_message_preview: text.slice(0, 120),
            })
            .eq("id", conversationId);
        }
        if (!conversationId) return new Response("ok");

        const externalId = String(key["id"] ?? "").trim();
        if (externalId) {
          const { data: alreadyHandled } = await supabaseAdmin
            .from("wa_messages")
            .select("id")
            .eq("external_id", externalId)
            .maybeSingle();
          if (alreadyHandled) return new Response("ok");
        }

        const { data: claimed } = await supabaseAdmin.rpc("claim_wa_conversation", {
          _conversation_id: conversationId,
        });
        if (!claimed) return new Response("ok");
        const releaseConversation = async () => {
          await supabaseAdmin.rpc("release_wa_conversation", { _conversation_id: conversationId as string });
        };

        const { error: inboundError } = await supabaseAdmin.from("wa_messages").insert({
          conversation_id: conversationId,
          direction: "inbound",
          content: text,
          external_id: externalId || null,
          webhook_status: "processing",
        });
        if (inboundError?.code === "23505") {
          await releaseConversation();
          return new Response("ok");
        }
        if (inboundError) {
          await releaseConversation();
          throw inboundError;
        }

        if (existing?.bot_paused) {
          await releaseConversation();
          return new Response("ok");
        }

        const { data: settings } = await supabaseAdmin
          .from("ai_settings")
          .select("is_enabled, system_prompt, greeting, handoff_keywords")
          .limit(1)
          .maybeSingle();
        if (!settings?.is_enabled) {
          await releaseConversation();
          return new Response("ok");
        }

        const reply = async (message: string) => {
          if (isAudio) {
            const { generateAiSpeech } = await import("@/lib/ai.server");
            const audio = await generateAiSpeech(message);
            await sendWhatsappAudio(phone, audio, key["id"] ?? undefined);
          } else {
            await sendWhatsappReply(phone, message, key["id"] ?? undefined);
          }
          await supabaseAdmin.from("wa_messages").insert({
            conversation_id: conversationId,
            direction: "outbound",
            content: message,
          });
          await supabaseAdmin
            .from("wa_conversations")
            .update({ last_message_at: new Date().toISOString(), last_message_preview: message.slice(0, 120) })
            .eq("id", conversationId);
        };

        const { data: history } = await supabaseAdmin
          .from("wa_messages")
          .select("direction, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(20);

        const turns = ((history ?? []) as Array<{ direction: string; content: string | null }>)
          .reverse()
          .filter((m) => (m.content ?? "").trim().length > 0)
          .map((m) => ({
            role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
            content: m.content as string,
          }));

        try {
          const { buildMenuContext, buildSystemPrompt } = await import("@/lib/ai-attendant.server");
          const { isStoreOpenNow } = await import("@/lib/store-hours");
          const { generateAiText } = await import("@/lib/ai.server");
          const { parseBotOrder, createBotOrder, extractOrderFromConversation } = await import(
            "@/lib/bot-order.server"
          );

          const [{ data: store }, { data: recentOrders }] = await Promise.all([
            supabaseAdmin.from("store_settings").select("is_open, opening_hours").limit(1).maybeSingle(),
            supabaseAdmin
              .from("orders")
              .select("code, total, created_at")
              .ilike("customer_phone", `%${phone.slice(-8)}`)
              .order("created_at", { ascending: false })
              .limit(1),
          ]);

          const last = (recentOrders ?? [])[0];
          const lastOrder =
            last && Date.now() - new Date(last.created_at).getTime() < 3 * 60 * 60 * 1000
              ? {
                  code: last.code,
                  total: Number(last.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                }
              : null;

          const menu = await buildMenuContext();
          const hasSharedLocation = turns.some(
            (turn) =>
              turn.role === "user" &&
              (/\[Localização enviada pelo cliente\]/i.test(turn.content) ||
                /(?:google\.(?:com|[a-z.]+)\/maps|maps\.app\.goo\.gl)/i.test(turn.content)),
          );
          const answer = await generateAiText({
            system: buildSystemPrompt({
              businessPrompt: settings.system_prompt ?? "",
              menu,
              menuUrl: new URL(request.url).origin,
              isOpen: Boolean(store && isStoreOpenNow(store.is_open, store.opening_hours)),
              openingHours: store?.opening_hours ?? "",
              responseMode: isAudio ? "audio" : "text",
              hasSharedLocation,
              lastOrder,
            }),
            turns,
          });

          const { text: visible, order: parsedOrder } = parseBotOrder(answer ?? "");
          if (visible) await reply(visible);

          let order = parsedOrder;

          // Rede de segurança: o robô confirmou em texto mas esqueceu o bloco do pedido
          const confirmedInText = /pedido\s+(foi\s+)?(confirmado|registrado|anotado|fechado)|confirmado!?\s*(🚀|✅)/i.test(
            visible ?? "",
          );
          const orderedRecently =
            last && Date.now() - new Date(last.created_at).getTime() < 20 * 60 * 1000;
          if (!order && confirmedInText && !orderedRecently) {
            order = await extractOrderFromConversation(turns, menu);
          }

          if (order) {
            const result = await createBotOrder(order, phone, externalId || undefined);
            if (result.ok) {
              if (result.summary) await reply(result.summary);
            } else if (result.error === "loja_fechada") {
              await reply("Poxa, a loja acabou de fechar e não consigo registrar o pedido agora. 😕");
            } else {
              await reply("Tive um probleminha para registrar o pedido. Pode confirmar novamente, por favor?");
            }
          }

          if (!visible && !order) {
            await reply("Pode repetir, por favor? Não consegui entender. 🙂");
          }
        } catch (error) {
          console.error("Atendente de IA falhou", error instanceof Error ? error.message : "erro desconhecido");
          await reply("Tive uma instabilidade aqui. Pode mandar sua mensagem de novo, por favor? 🙏");
        }

        await supabaseAdmin
          .from("wa_messages")
          .update({ webhook_status: "done" })
          .eq("external_id", externalId || "");
        await releaseConversation();
        return new Response("ok");
      },
    },
  },
});
