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
