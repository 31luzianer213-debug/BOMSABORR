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
  const base = pickEnv("EVOLUTION_API_URL");
  const instance = pickEnv("EVOLUTION_INSTANCE", FALLBACK_EVOLUTION_INSTANCE);
  const apiKey = pickEnv("EVOLUTION_API_KEY");
  if (!base || !instance || !apiKey) {
    return { ok: false as const, error: "Evolution API não configurada" };
  }

  if (!isValidBrPhone(to)) {
    return {
      ok: false as const,
      error: "Número do cliente incompleto ou inválido — confira o WhatsApp dele",
    };
  }

  try {
    const response = await fetch(`${evolutionBaseUrl(base)}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: normalizePhone(to), text }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Evolution API falhou [${response.status}]: ${body}`);
      if (response.status === 400) {
        return {
          ok: false as const,
          error: "Este número não tem WhatsApp ou está escrito errado",
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false as const, error: "WhatsApp desconectado — gere o QR Code novamente" };
      }
      return { ok: false as const, error: `Evolution API [${response.status}]` };
    }
    return { ok: true as const };
  } catch (error) {
    console.error("Evolution API erro de rede", error);
    return { ok: false as const, error: "Falha de rede ao chamar a Evolution API" };
  }
}
