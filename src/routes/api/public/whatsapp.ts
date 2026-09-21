import { createFileRoute } from "@tanstack/react-router";

type EvolutionPayload = { event?: string; data?: Record<string, any> };

function extractText(message: Record<string, any> | undefined): string {
  if (!message) return "";
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
        const text = String(extractText(data["message"]) ?? "").trim();
        if (!phone || !text) return new Response("ok");
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

        await supabaseAdmin.from("wa_messages").insert({
          conversation_id: conversationId,
          direction: "inbound",
          content: text,
          external_id: key["id"] ?? null,
        });

        if (existing?.bot_paused) return new Response("ok");

        const { data: settings } = await supabaseAdmin
          .from("ai_settings")
          .select("is_enabled, system_prompt, greeting, handoff_keywords")
          .limit(1)
          .maybeSingle();
        if (!settings?.is_enabled) return new Response("ok");

        const { sendWhatsapp } = await import("@/lib/whatsapp.server");

        const reply = async (message: string) => {
          await sendWhatsapp(phone, message);
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

        const handoff = async () => {
          await supabaseAdmin
            .from("wa_conversations")
            .update({ bot_paused: true, status: "pending" })
            .eq("id", conversationId);
          await reply("Só um instante, já vou chamar alguém da nossa equipe para te atender! 🙂");
        };

        const normalized = text.toLowerCase();
        const asksForHuman = (settings.handoff_keywords ?? []).some(
          (keyword: string) => keyword && normalized.includes(keyword.toLowerCase()),
        );
        if (asksForHuman) {
          await handoff();
          return new Response("ok");
        }

        if (isNew && settings.greeting?.trim()) {
          await reply(settings.greeting.trim());
        }

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
          const { generateAiText } = await import("@/lib/ai.server");
          const menu = await buildMenuContext();
          const answer = await generateAiText({
            system: buildSystemPrompt({
              businessPrompt: settings.system_prompt ?? "",
              menu,
              menuUrl: new URL(request.url).origin,
            }),
            turns,
          });
          if (!answer || answer.trim().toUpperCase().startsWith("TRANSFERIR")) {
            await handoff();
          } else {
            await reply(answer);
          }
        } catch (error) {
          console.error("Atendente de IA falhou", error);
          await handoff();
        }

        return new Response("ok");
      },
    },
  },
});
