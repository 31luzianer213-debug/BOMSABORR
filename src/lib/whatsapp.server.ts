import { evolutionBaseUrl } from "./evolution-url";

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
  return isPlaceholderEnv(v) ? fallback : (v?.trim() ?? fallback);
}

export function normalizePhone(raw: string) {
  let digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  // remove DDI duplicado / prefixo de operadora
  if (digits.length > 13 && digits.startsWith("55")) digits = digits.slice(-13);
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}

export function isValidBrPhone(raw: string) {
  const digits = normalizePhone(raw);
  // 55 + DDD (2) + 8 ou 9 dígitos
  return digits.length === 12 || digits.length === 13;
}

export async function sendWhatsapp(to: string, text: string) {
  return sendWhatsappReply(to, text);
}

type IncomingMessageKey = { remoteJid?: string; fromMe?: boolean; id?: string };

async function evolutionRequest(path: string, body: unknown) {
  const base = pickEnv("EVOLUTION_API_URL");
  const instance = pickEnv("EVOLUTION_INSTANCE", FALLBACK_EVOLUTION_INSTANCE);
  const apiKey = pickEnv("EVOLUTION_API_KEY");
  if (!base || !instance || !apiKey) {
    return { ok: false as const, error: "Evolution API não configurada" };
  }

  try {
    const response = await fetch(`${evolutionBaseUrl(base)}${path.replace("{instance}", encodeURIComponent(instance))}`, {
      signal: AbortSignal.timeout(15_000),
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const responseBody = await response.text();
      console.error(`Evolution API falhou [${response.status}]: ${responseBody}`);
      return { ok: false as const, error: `Evolution API [${response.status}]` };
    }
    return { ok: true as const, data: (await response.json().catch(() => ({}))) as Record<string, any> };
  } catch (error) {
    console.error("Evolution API erro de rede", error);
    return { ok: false as const, error: "Falha de rede ao chamar a Evolution API" };
  }
}

export async function sendWhatsappReply(to: string, text: string, quotedId?: string) {

  if (!isValidBrPhone(to)) {
    return {
      ok: false as const,
      error: "Número do cliente incompleto ou inválido — confira o WhatsApp dele",
    };
  }

  return evolutionRequest("/message/sendText/{instance}", {
    number: normalizePhone(to),
    text,
    delay: 1200,
    ...(quotedId ? { quoted: { key: { id: quotedId } } } : {}),
  });
}

export async function sendWhatsappAudio(to: string, audioBase64: string, quotedId?: string) {
  if (!isValidBrPhone(to)) return { ok: false as const, error: "Número do cliente incompleto ou inválido" };
  return evolutionRequest("/message/sendWhatsAppAudio/{instance}", {
    number: normalizePhone(to),
    audio: audioBase64,
    delay: 1200,
    ...(quotedId ? { quoted: { key: { id: quotedId } } } : {}),
  });
}

export async function markWhatsappRead(key: IncomingMessageKey) {
  if (!key.remoteJid || !key.id) return { ok: false as const, error: "Mensagem sem identificação" };
  return evolutionRequest("/chat/markMessageAsRead/{instance}", {
    readMessages: [{ remoteJid: key.remoteJid, fromMe: Boolean(key.fromMe), id: key.id }],
  });
}

export async function showWhatsappPresence(to: string, presence: "composing" | "recording") {
  const number = normalizePhone(to);
  return evolutionRequest("/chat/sendPresence/{instance}", {
    number,
    options: { delay: 2500, presence, number },
  });
}

export async function getWhatsappMediaBase64(message: Record<string, any>) {
  const result = await evolutionRequest("/chat/getBase64FromMediaMessage/{instance}", {
    message,
    convertToMp4: false,
  });
  if (!result.ok) return result;
  const base64 = String(result.data?.["base64"] ?? result.data?.["data"]?.["base64"] ?? "");
  const mimetype = String(result.data?.["mimetype"] ?? result.data?.["data"]?.["mimetype"] ?? "audio/ogg");
  return base64 ? { ok: true as const, base64, mimetype } : { ok: false as const, error: "Áudio vazio" };
}
