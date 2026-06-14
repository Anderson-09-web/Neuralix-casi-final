import { useState, useEffect } from "react";
import { Bot, X, Send, Sparkles, AlertTriangle, CheckCircle, Info, ExternalLink, Crown, Zap, Settings, Lock } from "lucide-react";
import { useAnalyzeGuild, useAiChat, useGetGuildPremium, getGetGuildPremiumQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props { guildId: string; }

const DISCORD_LINK = "https://discord.gg/wukr8apdQq";

function getPlanLabel(plan: string | null): string {
  if (!plan) return "Free";
  const labels: Record<string, string> = { plus: "Plus", pro: "Pro", ultra: "Ultra" };
  return labels[plan] || plan;
}

function getInitialMessage(plan: string | null): string {
  if (plan === "ultra") return "Hola! Soy Neuralix AI Ultra. Puedo configurar automaticamente todos los sistemas de tu servidor. Simplemente dime: 'activa el antiraid', 'configura la verificacion' o 'activa los logs' y lo hago por ti.";
  return "Hola! Soy Neuralix AI. Puedo ayudarte a configurar cualquier sistema de tu servidor sin limites. Pregunta sobre AntiRaid, Verificacion, Tickets, Logs, Backups y mucho mas.";
}

export default function AiAssistant({ guildId }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "analysis">("chat");

  const { data: premium, isLoading: premiumLoading } = useGetGuildPremium(guildId, { query: { enabled: !!guildId, queryKey: getGetGuildPremiumQueryKey(guildId) } });
  const plan: string | null = (premium as any)?.plan || null;
  const isFree = !plan;
  const isUltra = plan === "ultra";
  const chatReady = !premiumLoading || premium !== undefined;

  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string; action?: string }[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isFree && premium !== undefined && !initialized) {
      setMessages([{ role: "ai", content: getInitialMessage(plan) }]);
      setInitialized(true);
    }
  }, [premium, initialized, plan, isFree]);

  const [input, setInput] = useState("");
  const analyze = useAnalyzeGuild();
  const aiChat = useAiChat();

  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isFree || sending) return;
    const userMsg = input.trim();
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setInput("");
    setSending(true);
    // Add a typing indicator
    setMessages((m) => [...m, { role: "ai", content: "__typing__" }]);
    try {
      await new Promise<void>((resolve, reject) => {
        aiChat.mutate({ guildId, data: { message: userMsg, context: plan ? `plan:${plan}` : "plan:free" } }, {
          onSuccess: (res: any) => {
            setMessages((m) => {
              const without = m.filter((msg) => msg.content !== "__typing__");
              return [...without, { role: "ai", content: res.response, action: res.action }];
            });
            resolve();
          },
          onError: () => {
            setMessages((m) => {
              const without = m.filter((msg) => msg.content !== "__typing__");
              return [...without, { role: "ai", content: "No pude procesar tu mensaje. Intentalo de nuevo." }];
            });
            resolve();
          }
        });
      });
    } finally {
      setSending(false);
    }
  };

  const handleAnalyze = () => {
    setTab("analysis");
    analyze.mutate({ guildId });
  };

  const handleQuickConfig = (type: string) => {
    const msgs: Record<string, string> = {
      antiraid: "activa y configura el antiraid",
      verification: "activa y configura la verificacion",
      logs: "activa y configura los logs",
    };
    const msg = msgs[type];
    if (!msg) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    aiChat.mutate({ guildId, data: { message: msg, context: "plan:ultra" } }, {
      onSuccess: (res: any) => {
        setMessages((m) => [...m, { role: "ai", content: res.response, action: res.action }]);
      },
      onError: () => {
        setMessages((m) => [...m, { role: "ai", content: "No pude aplicar la configuracion. Intentalo de nuevo." }]);
      }
    });
  };

  const severityIcon = (s: string) => {
    if (s === "high") return <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />;
    if (s === "medium") return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
    if (s === "info") return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
    return <Info className="w-4 h-4 text-primary flex-shrink-0" />;
  };

  const planBadge = (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
      isUltra ? "bg-purple-500/20 text-purple-300" :
      plan ? "bg-primary/20 text-primary" :
      "bg-muted text-muted-foreground"
    }`}>
      {getPlanLabel(plan)}
    </span>
  );

  /* ── NEVER conditionally unmount the dialog panel.
     Use display:none so React never reconciles DOM nodes during open/close.
     This eliminates the insertBefore error entirely. ── */
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Panel — always in DOM, hidden via display:none */}
      <div
        role="dialog"
        aria-modal={open}
        aria-label="Asistente IA de Neuralix"
        aria-hidden={!open}
        className="mb-4 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        style={{ display: open ? "block" : "none" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Neuralix AI</span>
            {planBadge}
          </div>
          <button onClick={() => setOpen(false)} aria-label="Cerrar asistente IA"
            className="text-muted-foreground hover:text-foreground focus:outline-none rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["chat", "analysis"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors focus:outline-none ${
                tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t === "chat" ? "Chat" : "Analisis"}
            </button>
          ))}
        </div>

        {/* Chat Tab */}
        <div style={{ display: tab === "chat" ? "flex" : "none", height: isUltra ? 320 : 288 }} className="flex-col">
          {isFree ? (
            /* Free plan — Quick FAQ cards */
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium pb-1">Respuestas rapidas</p>
              {[
                { q: "¿Como activo AntiRaid?", a: "Ve al panel AntiRaid en el menu lateral. Activa el modulo principal y configura los sub-modulos. Activa el modo de emergencia si hay un raid en curso." },
                { q: "¿Como configuro tickets?", a: "Ve a Tickets en el menu. Activa el sistema, configura el canal del panel y los roles de soporte. Luego usa 'Enviar Panel' para publicarlo en Discord." },
                { q: "¿Como activo verificacion?", a: "Ve a Verificacion. Activa el sistema, elige el tipo (Captcha/Boton/Email), configura el rol que se asigna al verificarse y envia el panel." },
                { q: "¿Como uso los logs?", a: "Ve a Logs en el menu. Activa el sistema y selecciona que eventos registrar y en que canal de Discord." },
                { q: "¿Como activo Premium?", a: "Ve a la seccion Premium del dashboard de tu servidor e ingresa tu codigo de licencia. Si no tienes uno, obtenlo en nuestro Discord." },
              ].map((item, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-secondary border border-border">
                  <p className="text-xs font-semibold text-foreground mb-1">{item.q}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.a}</p>
                </div>
              ))}
              <div className="pt-2 space-y-1.5">
                <a href={DISCORD_LINK} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="w-full gap-2 text-xs">
                    <ExternalLink className="w-3 h-3" /> Soporte en Discord
                  </Button>
                </a>
                <p className="text-center text-xs text-muted-foreground">
                  <Crown className="w-3 h-3 inline mr-1 text-primary" />
                  <a href={`/servers/${guildId}/premium`} className="text-primary hover:underline">Activa Premium</a> para chat IA sin limites
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2" role="log" aria-live="polite">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}>
                      {m.content === "__typing__" ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="inline-flex gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                          Pensando...
                        </span>
                      ) : (
                        <>
                          {m.content}
                          {m.action && (
                            <div className="mt-1.5 text-xs font-semibold text-green-400 flex items-center gap-1 border-t border-green-500/20 pt-1">
                              <CheckCircle className="w-3 h-3 flex-shrink-0" /> {m.action}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Ultra quick config buttons */}
              {isUltra && (
                <div className="px-3 py-2 border-t border-border bg-purple-500/5 flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3 text-purple-400" /> Configuracion automatica
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { key: "antiraid", label: "AntiRaid" },
                      { key: "verification", label: "Verificacion" },
                      { key: "logs", label: "Logs" },
                    ].map(({ key, label }) => (
                      <button key={key} onClick={() => handleQuickConfig(key)} disabled={aiChat.isPending}
                        className="text-xs px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50 flex items-center gap-1">
                        <Settings className="w-2.5 h-2.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 border-t border-border flex gap-2">
                <Input
                  placeholder={!chatReady ? "Cargando..." : isUltra ? "Dime que configurar..." : "Pregunta algo..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !(!input.trim() || sending || !chatReady) && handleSend()}
                  className="text-xs h-8"
                  disabled={!chatReady || sending}
                  aria-label="Mensaje para el asistente IA"
                />
                <Button size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={handleSend}
                  disabled={!input.trim() || sending || !chatReady} aria-label="Enviar">
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Analysis Tab */}
        <div style={{ display: tab === "analysis" ? "block" : "none", height: 288 }} className="p-4 space-y-3 overflow-y-auto">
          {isFree ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1">Analisis — Solo Premium</p>
                <p className="text-xs text-muted-foreground">El analisis avanzado requiere plan Plus o superior.</p>
              </div>
              <a href="/servers" className="block">
                <Button size="sm" className="w-full gap-2 text-xs mt-1">
                  <Crown className="w-3.5 h-3.5" /> Activar Premium
                </Button>
              </a>
            </div>
          ) : (
            <>
              {!analyze.data && !analyze.isPending && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">Analiza la seguridad y configuracion de tu servidor</p>
                  <Button size="sm" onClick={handleAnalyze} className="gap-2">
                    <Sparkles className="w-4 h-4" /> Analizar Servidor
                  </Button>
                </div>
              )}
              {analyze.isPending && (
                <div className="text-center text-sm text-muted-foreground py-4">Analizando servidor...</div>
              )}
              {analyze.isError && (
                <div className="text-center text-sm text-destructive py-4">
                  Error al analizar.
                  <Button size="sm" variant="outline" className="mt-2 w-full text-xs" onClick={handleAnalyze}>Reintentar</Button>
                </div>
              )}
              {analyze.data && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Puntuacion de seguridad</span>
                    <span className={`text-2xl font-bold ${
                      analyze.data.score >= 80 ? "text-green-400" :
                      analyze.data.score >= 60 ? "text-yellow-400" : "text-destructive"
                    }`}>
                      {analyze.data.score}/100
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {analyze.data.recommendations.map((r: any, i: number) => (
                      <li key={i} className="flex gap-2 p-2 rounded-lg bg-secondary border border-border">
                        {severityIcon(r.severity)}
                        <div>
                          <div className="text-xs font-semibold">{r.title}</div>
                          <div className="text-xs text-muted-foreground">{r.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleAnalyze}>Re-analizar</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Cerrar asistente IA" : "Abrir asistente IA"}
        aria-expanded={open}
        className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white hover:opacity-90 active:scale-95 transition-all focus:outline-none ${
          isUltra ? "bg-gradient-to-br from-purple-600 to-indigo-600" : "bg-primary"
        }`}
        data-testid="ai-assistant-button"
      >
        <Bot className="w-6 h-6" />
      </button>
    </div>
  );
}
