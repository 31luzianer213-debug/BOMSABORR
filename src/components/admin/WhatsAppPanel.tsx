import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, QrCode, RefreshCw, Send, Smartphone } from "lucide-react";
import {
  ensureAndConnectEvolution,
  getEvolutionConfigStatus,
  getEvolutionConnectionState,
  logoutEvolutionInstance,
  restartEvolutionInstance,
  sendEvolutionTestMessage,
} from "@/lib/evolution.functions";

function statusInfo(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return { label: "Conectado", color: "bg-emerald-500", variant: "default" as const, desc: "Pronto para enviar pedidos" };
  if (s === "connecting") return { label: "Conectando", color: "bg-amber-500", variant: "secondary" as const, desc: "Escaneie o QR Code" };
  return { label: "Desconectado", color: "bg-red-500", variant: "destructive" as const, desc: "Gere o QR Code" };
}

function normalizeBase64(b64: string | null): string | null {
  if (!b64) return null;
  const s = b64.trim();
  if (!s) return null;
  return s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
}

export function WhatsAppPanel() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<{ base64: string | null; code: string | null } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState("");
  const [testText, setTestText] = useState("Teste Bom Sabor - WhatsApp conectado!");

  const config = useQuery({ queryKey: ["evolution", "config"], queryFn: () => getEvolutionConfigStatus() });
  const instance = config.data?.defaultInstance ?? "";

  const connState = useQuery({
    queryKey: ["evolution", "connState", instance],
    queryFn: () => getEvolutionConnectionState({ data: { instance } }),
    enabled: !!instance,
    refetchInterval: qr ? 2500 : 6000,
    retry: 0,
  });

  const raw = connState.data as
    | ({ state?: string; status?: string; instance?: { state?: string } } & Record<string, unknown>)
    | undefined;
  const status = raw?.state ?? raw?.status ?? raw?.instance?.state ?? "unknown";
  const info = statusInfo(status);
  const connected = String(status).toLowerCase() === "open";

  // fecha o QR automaticamente quando o WhatsApp conecta
  useEffect(() => {
    if (connected && qr) {
      setQr(null);
      setQrError(null);
      toast.success("WhatsApp conectado com sucesso!");
    }
  }, [connected, qr]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["evolution"] });
  }

  async function handleConnect() {
    setQrLoading(true);
    setQr(null);
    setQrError(null);
    try {
      const res = await ensureAndConnectEvolution();
      const b64 = normalizeBase64(res.base64 ?? null);
      if (b64 || res.code) {
        setQr({ base64: b64, code: res.code ?? null });
        toast.success(res.created ? "Conexão criada! Escaneie o QR Code." : "QR Code gerado! Escaneie em até 45s.");
      } else if (String(res.status).toLowerCase() === "open") {
        toast.message("Já está conectado — não precisa de QR Code.");
      } else {
        setQrError("A Evolution não devolveu QR Code. Clique em Reiniciar e tente de novo.");
        toast.message("Sem QR Code agora. Tente Reiniciar.");
      }
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar QR Code";
      setQrError(msg);
      toast.error(msg);
    } finally {
      setQrLoading(false);
    }
  }

  async function handleLogout() {
    if (!instance || !confirm("Desconectar o WhatsApp? Será preciso escanear o QR Code novamente.")) return;
    try {
      await logoutEvolutionInstance({ data: { instance } });
      setQr(null);
      setQrError(null);
      toast.success("Desconectado.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desconectar");
    }
  }

  async function handleRestart() {
    if (!instance) return;
    setQrError(null);
    try {
      await restartEvolutionInstance({ data: { instance } });
      toast.success("Reiniciando... aguarde 5s e clique em Gerar QR Code.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reiniciar");
    }
  }

  async function handleTest() {
    if (!instance) return;
    if (testNumber.replace(/\D/g, "").length < 10) {
      toast.error("Informe o número com DDD (ex: 55 93 99161-4242).");
      return;
    }
    try {
      await sendEvolutionTestMessage({ data: { instance, number: testNumber, text: testText } });
      toast.success("Teste enviado! Confira o WhatsApp.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    }
  }

  if (config.isPending) return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Smartphone className="size-3.5" /> WhatsApp do restaurante
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              Conexão única: <span className="font-mono">{instance}</span>
            </p>
            <p className="text-xs text-muted-foreground">Se ela ainda não existir, é criada automaticamente ao gerar o QR Code.</p>
          </div>
          <Button variant="secondary" size="sm" className="rounded-full font-bold" onClick={refresh}>
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-glow">
        <div className="flex items-center gap-3">
          <span className={`size-2.5 shrink-0 rounded-full ${info.color}`} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-extrabold">
              WhatsApp <Badge variant={info.variant}>{info.label}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">{info.desc}</p>
          </div>
          {connState.isFetching ? <span className="text-xs text-muted-foreground">atualizando...</span> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleConnect} disabled={qrLoading} className="rounded-full font-bold">
            <QrCode className="size-4" /> {qrLoading ? "Gerando..." : connected ? "Gerar novo QR Code" : "Gerar QR Code"}
          </Button>
          <Button variant="secondary" onClick={handleRestart} className="rounded-full font-bold">
            <RefreshCw className="size-4" /> Reiniciar
          </Button>
          <Button variant="outline" onClick={handleLogout} className="rounded-full font-bold">
            <LogOut className="size-4" /> Desconectar
          </Button>
        </div>

        {qrError && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs break-words">{qrError}</p>
        )}

        {(qr || qrLoading) && (
          <div className="mt-4 grid place-items-center rounded-2xl border bg-card p-4">
            {qrLoading ? (
              <p className="py-10 text-sm text-muted-foreground">Gerando QR Code...</p>
            ) : qr?.base64 ? (
              <div className="space-y-3 text-center">
                <img src={qr.base64} alt="QR Code do WhatsApp" className="mx-auto size-64 rounded-xl bg-white object-contain p-2" />
                <p className="text-xs text-muted-foreground">WhatsApp → Aparelhos conectados → Conectar (expira ~45s)</p>
                <Button variant="secondary" size="sm" className="rounded-full" onClick={handleConnect}>
                  <RefreshCw className="size-4" /> Novo QR Code
                </Button>
              </div>
            ) : qr?.code ? (
              <p className="font-mono font-bold">{qr.code}</p>
            ) : null}
          </div>
        )}

        <div className="mt-4 rounded-xl border bg-secondary/50 p-3">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Send className="size-4" /> Testar envio
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="55 + DDD + número" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} className="flex-1" />
            <Button onClick={handleTest} variant="secondary" className="rounded-full font-bold">
              Enviar
            </Button>
          </div>
          <Textarea className="mt-2" rows={2} value={testText} onChange={(e) => setTestText(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
