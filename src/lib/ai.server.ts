export type AiTurn = { role: "user" | "assistant"; content: string };

export async function generateAiText(options: { system: string; turns: AiTurn[] }): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("A inteligência artificial não está configurada nesta conta.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: options.system }, ...options.turns],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`IA falhou [${response.status}]: ${body}`);
    if (response.status === 402) throw new Error("Os créditos de inteligência artificial acabaram.");
    if (response.status === 429) throw new Error("Muitos pedidos de IA ao mesmo tempo. Tente de novo em instantes.");
    throw new Error(`Não consegui gerar a resposta da IA agora [${response.status}].`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

export async function transcribeAiAudio(base64: string, mimetype = "audio/ogg"): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("A inteligência artificial não está configurada nesta conta.");

  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Uint8Array.from(atob(cleanBase64), (character) => character.charCodeAt(0));
  const extension = mimetype.includes("mpeg") ? "mp3" : mimetype.includes("wav") ? "wav" : "ogg";
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("file", new Blob([bytes], { type: mimetype }), `audio.${extension}`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Não consegui entender o áudio agora [${response.status}].`);

  const json = (await response.json()) as { text?: string };
  return (json.text ?? "").trim();
}

export async function generateAiSpeech(text: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("A inteligência artificial não está configurada nesta conta.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      voice: "shimmer",
      input: text,
      instructions:
        "Fale em português do Brasil como uma atendente real e acolhedora de pizzaria. Use ritmo de conversa levemente mais lento, pausas naturais, respiração discreta e entonação variada. Não soe como locução, anúncio, leitura de roteiro ou robô. Seja espontânea e simpática, sem exagerar na animação. Leia valores e endereços de forma natural.",
    }),
  });
  if (!response.ok) throw new Error(`Não consegui gerar o áudio agora [${response.status}].`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
