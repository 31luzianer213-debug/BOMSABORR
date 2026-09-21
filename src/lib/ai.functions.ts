import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error || data?.role !== "admin") throw new Error("Acesso restrito ao administrador.");
    return next();
  });

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_settings")
      .select("id, is_enabled, system_prompt, greeting, handoff_keywords")
      .limit(1)
      .maybeSingle();
    return {
      id: data?.id ?? null,
      isEnabled: data?.is_enabled ?? false,
      systemPrompt: data?.system_prompt ?? "",
      greeting: data?.greeting ?? "",
      handoffKeywords: data?.handoff_keywords ?? [],
    };
  });

const settingsSchema = z.object({
  isEnabled: z.boolean(),
  systemPrompt: z.string().trim().max(4000),
  greeting: z.string().trim().max(600),
  handoffKeywords: z.array(z.string().trim().min(1).max(40)).max(20),
});

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: z.input<typeof settingsSchema>) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase.from("ai_settings").select("id").limit(1).maybeSingle();
    const payload = {
      is_enabled: data.isEnabled,
      system_prompt: data.systemPrompt,
      greeting: data.greeting,
      handoff_keywords: data.handoffKeywords,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await context.supabase.from("ai_settings").update(payload).eq("id", existing.id)
      : await context.supabase.from("ai_settings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAiConversations = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_conversations")
      .select("id, phone, customer_name, bot_paused, status, last_message_at, last_message_preview")
      .order("last_message_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAiConversation = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: messages, error } = await context.supabase
      .from("wa_messages")
      .select("id, direction, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return messages ?? [];
  });

export const setBotPaused = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: { conversationId: string; paused: boolean }) =>
    z.object({ conversationId: z.string().uuid(), paused: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({ bot_paused: data.paused, status: data.paused ? "pending" : "open" })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
