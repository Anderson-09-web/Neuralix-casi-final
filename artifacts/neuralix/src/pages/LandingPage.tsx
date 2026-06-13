import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Bot, Shield, Ticket, ShieldAlert, Star, Database, ArrowRight, CheckCircle, Zap, AlertTriangle } from "lucide-react";
import { useGetMe, useGetDiscordAuthUrl, useGetAnnouncements, getGetMeQueryKey, getGetAnnouncementsQueryKey, getGetDiscordAuthUrlQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

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

      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        2026 Neuralix Enterprise. Todos los derechos reservados.
      </footer>
    </div>
  );
}
