import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evolutionBaseUrl } from "./evolution-url";

const DEFAULT_EVOLUTION_INSTANCE = "zap_2ed5d8cccdb6";

function isPlaceholder(v: string | undefined) {
  if (!v) return true;
  const t = v.trim();
  if (!t) return true;
  if (t.includes("COLE_A")) return true;
  if (t === "COLE_A_AUTHENTICATION_API_KEY_AQUI") return true;
  if (t.length < 10) return true;
  return false;
}

function getEvolutionConfig() {
  const envBase = process.env["EVOLUTION_API_URL"];
  const envKey = process.env["EVOLUTION_API_KEY"];
  const envInst = process.env["EVOLUTION_INSTANCE"];
  const base = isPlaceholder(envBase) ? null : envBase?.trim() ?? null;
  const apiKey = isPlaceholder(envKey) ? null : envKey?.trim() ?? null;
  const defaultInstance = isPlaceholder(envInst) ? DEFAULT_EVOLUTION_INSTANCE : envInst?.trim() ?? DEFAULT_EVOLUTION_INSTANCE;
  return { base, apiKey, defaultInstance };
}

const requireEvolutionAdmin = createMiddleware({ type: "function" })
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

async function evolutionFetch(path: string, init: RequestInit = {}, apiKeyOverride?: string) {
  const { base, apiKey } = getEvolutionConfig();
  const requestKey = apiKeyOverride ?? apiKey;
  if (!base || !requestKey) {
    throw new Error(
      "Evolution API nao configurada no servidor. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.",
    );
  }
  const url = `${evolutionBaseUrl(base)}${path}`;
  const headers: Record<string, string> = { apikey: requestKey };
  if (init.body) headers["Content-Type"] = "application/json";
  const custom = (init.headers as Record<string, string> | undefined) ?? {};
  Object.assign(headers, custom);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  // Em produção (site publicado) o servidor não consegue chamar um IP direto:
  // a rede de borda devolve "error code: 1003 / Direct IP access not allowed".
  if (
    res.status === 403 &&
    (/error code:\s*1003/i.test(text) || /direct ip access not allowed/i.test(text))
  ) {
    throw new Error(
      "O site publicado não consegue falar com o servidor do WhatsApp porque ele está sendo acessado por número de IP. " +
        "Aponte um domínio (ex: api.seusite.com) para o servidor, com https, e atualize o endereço nas configurações. " +
        "No preview funciona, no site publicado não.",
    );
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // Evolution retorna erros em formatos variados: {message, error, response:{message}, status, exception:{message}}
    let msg: string | null = null;
    if (typeof data === "string") msg = data;
    else if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const resp = d['response'] as Record<string, unknown> | undefined;
      const exc = d['exception'] as Record<string, unknown> | undefined;
      msg =
        (typeof resp?.['message'] === "string" ? resp['message'] : null) ||
        (typeof d['message'] === "string" ? d['message'] : null) ||
        (typeof d['error'] === "string" ? d['error'] : null) ||
        (typeof exc?.['message'] === "string" ? exc['message'] : null) ||
        (typeof d['status'] === "string" ? d['status'] : null) ||
        null;
      // code 1003 / 400 costuma vir com campo status ou error numerico
      if (!msg && d['status'] !== undefined) msg = `Erro ${String(d['status'])}`;
      if (!msg) {
        try {
          const s = JSON.stringify(d);
          msg = s.length > 500 ? s.slice(0, 500) + "..." : s;
        } catch {
          msg = null;
        }
      }
    }
    msg = msg || `Evolution API falhou [${res.status}]`;
    // Anexa codigo HTTP para o painel decidir mensagem amigavel
    throw new Error(`${msg} (HTTP ${res.status})`);
  }
  return data;
}

async function getInstanceToken(instanceName: string) {
  const data = await evolutionFetch("/instance/fetchInstances", { method: "GET" });
  const instances = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as Record<string, unknown>)["instances"] ?? (data as Record<string, unknown>)["data"])
      : null;
  if (!Array.isArray(instances)) {
    throw new Error("A Evolution não retornou a lista de instâncias.");
  }
  const instance = instances.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>)["name"] === instanceName;
  }) as Record<string, unknown> | undefined;
  const token = instance?.["token"];
  if (typeof token !== "string" || !token.trim()) {
    throw new Error(`A chave da instância "${instanceName}" não foi encontrada na Evolution.`);
  }
  return token.trim();
}

export type EvolutionInstance = {
  id: string;
  name: string;
  connectionStatus: string;
  ownerJid: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  integration: string;
  token: string | null;
  disconnectionReasonCode: number | null;
  disconnectionAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { Message: number; Contact: number; Chat: number };
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const getEvolutionConfigStatus = createServerFn({ method: "GET" }).middleware([requireEvolutionAdmin]).handler(async () => {
  const { base, apiKey, defaultInstance } = getEvolutionConfig();
  return { configured: Boolean(base && apiKey), base: base ?? null, defaultInstance, hasApiKey: Boolean(apiKey) };
});

export const listEvolutionInstances = createServerFn({ method: "GET" }).middleware([requireEvolutionAdmin]).handler(async () => {
  const data = await evolutionFetch("/instance/fetchInstances", { method: "GET" });
  if (Array.isArray(data)) {
    return (data as EvolutionInstance[]).map((instance) => ({ ...instance, token: null }));
  }
  // algumas versoes retornam { instances: [...] } ou { data: [...] }
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d['instances'])) {
      return (d['instances'] as EvolutionInstance[]).map((instance) => ({ ...instance, token: null }));
    }
    if (Array.isArray(d['data'])) {
      return (d['data'] as EvolutionInstance[]).map((instance) => ({ ...instance, token: null }));
    }
  }
  return [];
});

export const getEvolutionConnectionState = createServerFn({ method: "GET" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const instanceToken = await getInstanceToken(data.instance);
    const json = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(data.instance)}`, {
      method: "GET",
    }, instanceToken);
    return json as Record<string, JsonValue>;
  });

export const connectEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const instanceToken = await getInstanceToken(data.instance);
    const json = (await evolutionFetch(`/instance/connect/${encodeURIComponent(data.instance)}`, {
      method: "GET",
    }, instanceToken)) as {
      base64?: string;
      code?: string;
      pairingCode?: string;
      qrcode?: { base64?: string; code?: string };
    } & Record<string, JsonValue>;
    const base64 = json.base64 ?? json.qrcode?.base64 ?? null;
    const code = json.code ?? json.pairingCode ?? json.qrcode?.code ?? null;
    return { base64, code, raw: json as Record<string, JsonValue> };
  });

export const logoutEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const instanceToken = await getInstanceToken(data.instance);
    return (await evolutionFetch(`/instance/logout/${encodeURIComponent(data.instance)}`, {
      method: "DELETE",
    }, instanceToken)) as JsonValue;
  });

export const restartEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const instanceToken = await getInstanceToken(data.instance);
    return (await evolutionFetch(`/instance/restart/${encodeURIComponent(data.instance)}`, {
      method: "POST",
    }, instanceToken)) as JsonValue;
  });

export const deleteEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    return (await evolutionFetch(`/instance/delete/${encodeURIComponent(data.instance)}`, {
      method: "DELETE",
    })) as JsonValue;
  });

export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        instance: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9_-]+$/, "Use apenas letras minusculas, numeros, _ e -"),
        qrcode: z.boolean().optional().default(true),
        integration: z.string().optional().default("WHATSAPP-BAILEYS"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Evolution v2 espera payload minimo. Enviar campos extras (token vazio) causa 400/code 1003 em algumas builds.
    const payload: Record<string, unknown> = {
      instanceName: data.instance,
      qrcode: data.qrcode ?? true,
      integration: data.integration ?? "WHATSAPP-BAILEYS",
    };
    try {
      return (await evolutionFetch("/instance/create", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as Record<string, JsonValue>;
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // retry com token — algumas builds exigem token (vazio causa 400/1003)
      if (/1003/i.test(raw) || /400/i.test(raw)) {
        try {
          const retryPayload = { ...payload, token: `${data.instance}_${Date.now().toString(36)}` };
          return (await evolutionFetch("/instance/create", {
            method: "POST",
            body: JSON.stringify(retryPayload),
          })) as Record<string, JsonValue>;
        } catch (e2) {
          const raw2 = e2 instanceof Error ? e2.message : String(e2);
          const detail = raw2 !== raw ? `${raw} | retry: ${raw2}` : raw;
          if (/1003|already exists|exists/i.test(detail)) {
            throw new Error(
              `Não deu para criar "${data.instance}" (code 1003): limite atingido ou nome já existe. Use a padrão "${DEFAULT_EVOLUTION_INSTANCE}" (Ana Clara • open) e clique em Gerar QR Code — não precisa criar nova. Para liberar vaga, exclua "cobrancas" ou "zap_3bf7df40b7fc" (403) antes. Detalhe: ${detail}`,
            );
          }
          if (/403|Forbidden/i.test(detail)) {
            throw new Error(
              `Evolution bloqueou a criação (403/code 1003). Use a padrão "${DEFAULT_EVOLUTION_INSTANCE}" já conectada. Detalhe: ${detail}`,
            );
          }
          throw new Error(detail);
        }
      }
      if (/1003/i.test(raw) || /already exists/i.test(raw) || /exists/i.test(raw)) {
        throw new Error(
          `Nome "${data.instance}" já existe ou criação bloqueada (code 1003). Use a instância padrão "${DEFAULT_EVOLUTION_INSTANCE}" e clique em Gerar QR Code — não precisa criar nova. Detalhe: ${raw}`,
        );
      }
      if (/403|Forbidden/i.test(raw)) {
        throw new Error(
          `Evolution bloqueou a criação (403/code 1003). Use a instância padrão "${DEFAULT_EVOLUTION_INSTANCE}" (Ana Clara) já conectada. Detalhe: ${raw}`,
        );
      }
      throw new Error(raw);
    }
  });

export const sendEvolutionTestMessage = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        instance: z.string().min(1),
        number: z.string().min(10).max(20),
        text: z.string().min(1).max(2000).default("Teste Bom Sabor \u2014 WhatsApp conectado com sucesso!"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { base, apiKey } = getEvolutionConfig();
    if (!base || !apiKey) throw new Error("Evolution API nao configurada");
    const url = `${base!.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(data.instance)}`;
    const digits = data.number.replace(/\D/g, "");
    const normalized = digits.startsWith("55") ? digits : `55${digits}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey! },
      body: JSON.stringify({ number: normalized, text: data.text }),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const msg =
        typeof json === "string" ? json : (json as { message?: string })?.message ?? `Falha ao enviar [${res.status}]`;
      throw new Error(msg);
    }
    return json as JsonValue;
  });

/**
 * Uma única instância no sistema: garante que a instância padrão exista
 * (cria se não existir) e devolve o QR Code para escanear.
 */
export const ensureAndConnectEvolution = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .handler(async () => {
    const { defaultInstance } = getEvolutionConfig();
    const name = defaultInstance;

    const list = await evolutionFetch("/instance/fetchInstances", { method: "GET" }).catch(() => null);
    const arr = Array.isArray(list)
      ? list
      : list && typeof list === "object"
        ? ((list as Record<string, unknown>)["instances"] ?? (list as Record<string, unknown>)["data"])
        : null;
    const found = Array.isArray(arr)
      ? (arr.find(
          (item) => item && typeof item === "object" && (item as Record<string, unknown>)["name"] === name,
        ) as Record<string, unknown> | undefined)
      : undefined;

    let created = false;
    let token: string | null =
      typeof found?.["token"] === "string" && (found["token"] as string).trim() ? (found["token"] as string).trim() : null;
    let createJson: Record<string, unknown> | null = null;

    if (!found) {
      createJson = (await evolutionFetch("/instance/create", {
        method: "POST",
        body: JSON.stringify({ instanceName: name, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      })) as Record<string, unknown>;
      created = true;
      const hash = createJson?.["hash"];
      if (typeof hash === "string" && hash.trim()) token = hash.trim();
      else if (hash && typeof hash === "object" && typeof (hash as Record<string, unknown>)["apikey"] === "string") {
        token = (hash as Record<string, unknown>)["apikey"] as string;
      }
      const qrObj = createJson?.["qrcode"] as Record<string, unknown> | undefined;
      const b64 = typeof qrObj?.["base64"] === "string" ? (qrObj["base64"] as string) : null;
      const code = typeof qrObj?.["code"] === "string" ? (qrObj["code"] as string) : null;
      if (b64 || code) {
        return { instance: name, created, status: "connecting", base64: b64, code };
      }
    }

    const status = typeof found?.["connectionStatus"] === "string" ? (found["connectionStatus"] as string) : "unknown";
    if (status === "open") {
      return { instance: name, created, status, base64: null, code: null };
    }

    const conn = (await evolutionFetch(
      `/instance/connect/${encodeURIComponent(name)}`,
      { method: "GET" },
      token ?? undefined,
    )) as { base64?: string; code?: string; pairingCode?: string; qrcode?: { base64?: string; code?: string } };
    return {
      instance: name,
      created,
      status: status === "unknown" ? "connecting" : status,
      base64: conn.base64 ?? conn.qrcode?.base64 ?? null,
      code: conn.code ?? conn.pairingCode ?? conn.qrcode?.code ?? null,
    };
  });

/** Aponta o WhatsApp (Evolution) para o endereço que ativa o atendente de IA. */
export const configureAiWebhook = createServerFn({ method: "POST" })
  .middleware([requireEvolutionAdmin])
  .inputValidator((input: { baseUrl: string }) => z.object({ baseUrl: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const token = process.env["WHATSAPP_WEBHOOK_TOKEN"];
    if (!token) throw new Error("O código de segurança do atendente de IA não está configurado.");
    const { defaultInstance } = getEvolutionConfig();
    const url = `${data.baseUrl.replace(/\/+$/, "")}/api/public/whatsapp?token=${token}`;
    await evolutionFetch(`/webhook/set/${encodeURIComponent(defaultInstance)}`, {
      method: "POST",
      body: JSON.stringify({
        webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
      }),
    });
    return { ok: true as const, instance: defaultInstance };
  });
