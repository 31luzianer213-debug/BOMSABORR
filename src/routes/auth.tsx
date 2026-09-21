import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel Bom Sabor" },
      {
        name: "description",
        content: "Acesso restrito ao painel administrativo do cardápio digital Bom Sabor.",
      },
      { property: "og:title", content: "Entrar — Painel Bom Sabor" },
      { property: "og:description", content: "Área administrativa do cardápio Bom Sabor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/admin" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na autenticação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 font-sans">
      <form
        onSubmit={handleSubmit}
        className="glass-strong w-full max-w-sm space-y-4 rounded-[2rem] p-7 shadow-soft"
      >
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-gold text-primary-foreground shadow-glow">◈</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary">Painel Bom Sabor</h1>
        <p className="text-sm text-muted-foreground">
          Entre com a conta autorizada para gerenciar o cardápio.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full font-display text-lg" disabled={loading}>
          {loading ? "Aguarde..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
