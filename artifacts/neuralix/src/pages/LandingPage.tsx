import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Bot, Shield, Ticket, ShieldAlert, Star, Database, ArrowRight, CheckCircle, Zap, AlertTriangle, X, Send, MessageSquare, ShieldOff } from "lucide-react";
import { useGetMe, useGetDiscordAuthUrl, useGetAnnouncements, getGetMeQueryKey, getGetAnnouncementsQueryKey, getGetDiscordAuthUrlQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const APPEAL_LS_KEY = "nrl_appeal";

function AppealModal({ onClose }: { onClose: () => void }) {
  const stored = (() => { try { const r = localStorage.getItem(APPEAL_LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } })();
  const [step, setStep] = useState<"form" | "chat">(stored ? "chat" : "form");
  const [discordId, setDiscordId] = useState("");
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appeal, setAppeal] = useState<{ id: number; token: string } | null>(stored);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatMsg, setChatMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async (id: number, token: string) => {
    try {
      const res = await fetch(`/api/support/appeals/${id}/messages?token=${token}`);
      if (res.ok) { const data = await res.json(); setMessages(data); }
    } catch {}
  };

  useEffect(() => {
    if (step === "chat" && appeal) {
      setLoadingMsgs(true);
      fetchMessages(appeal.id, appeal.token).finally(() => setLoadingMsgs(false));
      const iv = setInterval(() => fetchMessages(appeal.id, appeal.token), 4000);
      return () => clearInterval(iv);
    }
  }, [step, appeal]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSubmit = async () => {
    if (!discordId.trim() || !username.trim() || !reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/support/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, username, reason }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || "Error al enviar"); return; }
      const data = await res.json();
      const appealData = { id: data.id, token: data.token };
      localStorage.setItem(APPEAL_LS_KEY, JSON.stringify(appealData));
      setAppeal(appealData);
      setStep("chat");
    } catch { alert("Error de conexion"); }
    finally { setSubmitting(false); }
  };

  const handleSend = async () => {
    if (!chatMsg.trim() || !appeal || sending) return;
    const content = chatMsg.trim();
    setChatMsg("");
    setSending(true);
    try {
      await fetch(`/api/support/appeals/${appeal.id}/messages?token=${appeal.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await fetchMessages(appeal.id, appeal.token);
    } catch {}
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-card border border-card-border rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <ShieldOff className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Apelar Blacklist</h3>
              {appeal && <p className="text-xs text-muted-foreground">Ticket #{appeal.id}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "form" ? (
          <div className="p-6 space-y-4 overflow-y-auto">
            <p className="text-sm text-muted-foreground">Si crees que tu blacklist fue injusta, completa el formulario. Un administrador revisara tu caso.</p>
            <div className="space-y-2">
              <Label className="text-xs">Discord ID</Label>
              <Input placeholder="Ej: 123456789012345678" value={discordId} onChange={(e) => setDiscordId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Usuario de Discord</Label>
              <Input placeholder="Ej: usuario#0000 o usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Motivo de apelacion</Label>
              <Textarea placeholder="Explica por que crees que tu blacklist fue incorrecta y aporta evidencia si la tienes..." value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={submitting || !discordId.trim() || !username.trim() || !reason.trim()}>
              {submitting ? "Enviando..." : "Enviar apelacion"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">Tu apelacion sera revisada por el equipo de moderacion.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs && messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Cargando mensajes...</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${m.isStaff ? "bg-secondary text-foreground rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"}`}>
                      {m.isStaff && <p className="text-xs font-bold mb-1 text-primary">{m.username}</p>}
                      <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-border flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={sending}
                />
                <Button size="icon" onClick={handleSend} disabled={!chatMsg.trim() || sending}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">Tu apelacion esta siendo revisada. Guarda tu Ticket #{appeal?.id} para hacer seguimiento.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const features = [
  { icon: ShieldAlert, title: "AntiRaid Enterprise", desc: "20+ modulos de proteccion: AntiAlt, AntiBot, AntiSpam, AntiNuke y mucho mas.", color: "text-primary bg-primary/10" },
  { icon: Shield, title: "Verificacion Avanzada", desc: "Filtra alts, bots y VPNs automaticamente antes de que entren al servidor.", color: "text-accent bg-accent/10" },
  { icon: Ticket, title: "Sistema de Tickets", desc: "Panel de soporte completo con categorias, transcripciones y roles personalizados.", color: "text-green-400 bg-green-500/10" },
  { icon: Database, title: "Backups Automaticos", desc: "Guarda y restaura toda la configuracion de tu servidor con un clic.", color: "text-yellow-400 bg-yellow-500/10" },
  { icon: Zap, title: "IA Integrada", desc: "Asistente IA que analiza tu servidor y sugiere mejoras de seguridad.", color: "text-primary bg-primary/10" },
  { icon: Star, title: "Premium", desc: "Planes Plus, Pro y Ultra con funciones exclusivas y soporte dedicado.", color: "text-accent bg-accent/10" },
];

const ERROR_MESSAGES: Record<string, string> = {
  no_code: "Discord no devolvio el codigo de autorizacion.",
  access_denied: "Cancelaste el inicio de sesion en Discord.",
  oauth_failed: "Error al iniciar sesion con Discord. Verifica que el Redirect URI este configurado correctamente.",
  invalid_redirect_uri: "La URL de redireccion no esta configurada en Discord Developer Portal.",
  invalid_client_id: "El Client ID de Discord es incorrecto.",
};

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: authUrl } = useGetDiscordAuthUrl({ query: { queryKey: getGetDiscordAuthUrlQueryKey() } });
  const { data: announcements } = useGetAnnouncements({ query: { queryKey: getGetAnnouncementsQueryKey() } });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [showAppeal, setShowAppeal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setOauthError(ERROR_MESSAGES[err] || `Error: ${decodeURIComponent(err)}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleLogin = () => {
    if (user) { setLocation("/servers"); return; }
    if (authUrl?.url) window.location.href = authUrl.url;
  };

  const published = Array.isArray(announcements) ? announcements.filter((a) => a.published) : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* OAuth Error Banner */}
      {oauthError && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-red-500/90 backdrop-blur-sm text-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{oauthError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setOauthError(null); if (authUrl?.url) window.location.href = authUrl.url; }}
              className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md font-semibold transition-colors"
            >
              Reintentar
            </button>
            <button onClick={() => setOauthError(null)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>
      )}
      {/* Navbar */}
      <header className={`fixed left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm transition-all ${oauthError ? "top-12" : "top-0"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Neuralix</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">Enterprise</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all" data-testid="landing-theme-toggle">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Button onClick={handleLogin} data-testid="btn-login" className="gap-2">
              {user ? "Ir al panel" : "Iniciar sesion con Discord"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
              <Zap className="w-4 h-4" />
              La suite definitiva para servidores de Discord
            </div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-6 leading-[1.05]">
              Control total de tu{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                servidor Discord
              </span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Neuralix Enterprise te da el poder de proteger, gestionar y optimizar tu servidor con mas de 20 modulos de seguridad, IA integrada y analisis en tiempo real.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" onClick={handleLogin} className="gap-2 text-base px-8" data-testid="btn-login-hero">
                {user ? "Ir al panel ahora" : "Conectar con Discord"}
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2 text-base px-8" onClick={() => setLocation("/docs")}>
                Ver documentacion
              </Button>
            </div>
          </motion.div>

          {/* Features highlight */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {[["20+", "Modulos AntiRaid"], ["100%", "Codigo propio"], ["24/7", "Proteccion activa"]].map(([val, label]) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-black text-primary">{val}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-4">Todo lo que necesitas en un solo lugar</h2>
            <p className="text-muted-foreground">Una plataforma completa para servidores que se toman la seguridad en serio.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="p-6 rounded-xl bg-card border border-card-border hover:border-primary/30 transition-all">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Announcements */}
      {published.length > 0 && (
        <section className="py-16 px-6 border-t border-border">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Ultimas noticias</h2>
            <div className="space-y-4">
              {published.slice(0, 3).map((ann) => (
                <div key={ann.id} className="p-5 rounded-xl bg-card border border-card-border">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ann.type === "info" ? "bg-primary/20 text-primary" : ann.type === "warning" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
                          {ann.type}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(ann.createdAt).toLocaleDateString("es")}</span>
                      </div>
                      <h3 className="font-semibold mb-1">{ann.title}</h3>
                      <p className="text-sm text-muted-foreground">{ann.content}</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-black mb-6">Empieza hoy, gratis</h2>
          <p className="text-muted-foreground mb-8">Conecta tu servidor y activa la proteccion en menos de 2 minutos.</p>
          <Button size="lg" onClick={handleLogin} className="gap-2 text-base px-10" data-testid="btn-cta">
            Conectar Discord <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Blacklist Appeal */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center mx-auto mb-5">
            <ShieldOff className="w-6 h-6 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Apelar una Blacklist</h2>
          <p className="text-muted-foreground mb-6 text-sm">Si fuiste agregado a la blacklist global de Neuralix y crees que fue un error, puedes abrir una apelacion. Nuestro equipo la revisara.</p>
          <Button variant="outline" size="lg" onClick={() => setShowAppeal(true)} className="gap-2 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/60">
            <MessageSquare className="w-4 h-4" />
            Apelar Blacklist
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        2026 Neuralix Enterprise. Todos los derechos reservados.
      </footer>

      {showAppeal && <AppealModal onClose={() => setShowAppeal(false)} />}
    </div>
  );
}
