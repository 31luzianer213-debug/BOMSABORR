import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, MessageSquare, Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  getAiConversation,
  getAiSettings,
  listAiConversations,
  saveAiSettings,
  setBotPaused,
} from "@/lib/ai.functions";

export function AiPanel() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["ai", "settings"], queryFn: () => getAiSettings() });
  const conversations = useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: () => listAiConversations(),
    refetchInterval: 15000,
  });

  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [greeting, setGreeting] = useState("");
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.isEnabled);
    setPrompt(settings.data.systemPrompt);
    setGreeting(settings.data.greeting);
    setKeywords((settings.data.handoffKeywords ?? []).join(", "));
  }, [settings.data]);

  const messages = useQuery({
    queryKey: ["ai", "conversation", openId],
    queryFn: () => getAiConversation({ data: { conversationId: openId! } }),
    enabled: !!openId,
    refetchInterval: 10000,
  });

  const save = async () => {
    setSaving(true);
    try {
      await saveAiSettings({
        data: {
          isEnabled: enabled,
          systemPrompt: prompt.trim(),
          greeting: greeting.trim(),
          handoffKeywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        },
      });
      toast.success("Atendente de IA atualizado");
      await qc.invalidateQueries({ queryKey: ["ai", "settings"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (id: string, paused: boolean) => {
    try {
      await setBotPaused({ data: { conversationId: id, paused } });
      await qc.invalidateQueries({ queryKey: ["ai", "conversations"] });
      toast.success(paused ? "Robô pausado nesta conversa" : "Robô reativado nesta conversa");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="font-display text-lg font-bold">Atendente de IA no WhatsApp</p>
              <p className="text-sm text-muted-foreground">
                Responde os clientes sozinho usando o cardápio, os preços e as taxas da sua loja.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm font-semibold">{enabled ? "Ligado" : "Desligado"}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <div>
            <label className="text-sm font-semibold">Mensagem de boas-vindas</label>
            <Textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              rows={2}
              placeholder="Oi! Sou o atendente virtual da pizzaria..."
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">Instruções para a IA</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Ex: sempre ofereça refrigerante, avise que a entrega leva de 30 a 50 minutos..."
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              O cardápio, os preços e as taxas por bairro já são enviados automaticamente para a IA.
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold">Palavras que chamam um atendente humano</label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="atendente, humano, pessoa"
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving} className="rounded-full font-bold">
              {saving ? "Salvando..." : "Salvar atendente"}
            </Button>
            <Button
              variant="secondary"
              className="rounded-full font-bold"
              disabled={connecting}
              onClick={async () => {
                setConnecting(true);
                try {
                  await configureAiWebhook({ data: { baseUrl: window.location.origin } });
                  toast.success("Pronto! O WhatsApp já envia as mensagens para o atendente de IA.");
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setConnecting(false);
                }
              }}
            >
              {connecting ? "Ativando..." : "Ativar no WhatsApp"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-display text-lg font-bold">
            <MessageSquare className="size-4" /> Conversas
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => conversations.refetch()}
          >
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>

        {(conversations.data ?? []).length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma conversa ainda. Assim que um cliente mandar mensagem no WhatsApp, ela aparece aqui.
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {(conversations.data ?? []).map((conversation) => (
            <li key={conversation.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setOpenId(openId === conversation.id ? null : conversation.id)}
                >
                  <p className="truncate text-sm font-bold">
                    {conversation.customer_name || conversation.phone}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {conversation.last_message_preview ?? ""}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  {conversation.bot_paused ? (
                    <Badge variant="secondary">Com atendente</Badge>
                  ) : (
                    <Badge>Robô ativo</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-full"
                    onClick={() => togglePause(conversation.id, !conversation.bot_paused)}
                  >
                    {conversation.bot_paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                  </Button>
                </div>
              </div>

              {openId === conversation.id && (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3">
                  {(messages.data ?? []).map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        message.direction === "inbound"
                          ? "bg-background"
                          : "ml-auto bg-primary text-primary-foreground"
                      }`}
                    >
                      {message.content}
                    </div>
                  ))}
                  {(messages.data ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Sem mensagens.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
