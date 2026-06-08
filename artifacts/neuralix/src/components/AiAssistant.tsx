import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Send, Sparkles, AlertTriangle, CheckCircle, Info, ExternalLink, Crown, Zap, Settings } from "lucide-react";
import { useAnalyzeGuild, useAiChat, useGetGuildPremium } from "@workspace/api-client-react";
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
  if (!plan) return "Hola! Soy el asistente de soporte de Neuralix (plan Free). Puedo responder preguntas basicas sobre el dashboard y los sistemas. Para soporte avanzado unete a nuestro servidor de Discord.";
  if (plan === "ultra") return "Hola! Soy Neuralix AI Ultra. Puedo configurar automaticamente todos los sistemas de tu servidor. Simplemente dime: 'activa el antiraid', 'configura la verificacion' o 'activa los logs' y lo hago por ti.";
  return "Hola! Soy Neuralix AI. Puedo ayudarte a configurar cualquier sistema de tu servidor sin limites. Pregunta sobre AntiRaid, Verificacion, Tickets, Logs, Backups y mucho mas.";
}

export default function AiAssistant({ guildId }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "analysis">("chat");

  const { data: premium, isLoading: premiumLoading } = useGetGuildPremium(guildId, { query: { enabled: !!guildId } });
  const plan: string | null = (premium as any)?.plan || null;
  const isFree = !plan;
  const isUltra = plan === "ultra";
  const isPlus = !!plan;
  const chatReady = !premiumLoading || premium !== undefined;

  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string; action?: string }[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (premium !== undefined && !initialized) {
      setMessages([{ role: "ai", content: getInitialMessage(plan) }]);
      setInitialized(true);
    }
  }, [premium, initialized, plan]);

  const [input, setInput] = useState("");
  const analyze = useAnalyzeGuild();
  const aiChat = useAiChat();

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setInput("");
    aiChat.mutate({ guildId, data: { message: userMsg, plan: plan || "free" } }, {
      onSuccess: (res: any) => {
        setMessages((m) => [...m, { role: "ai", content: res.response, action: res.action }]);
      },
      onError: () => {
        setMessages((m) => [...m, { role: "ai", content: "No pude procesar tu mensaje. Intentalo de nuevo." }]);
      }
    });
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
    aiChat.mutate({ guildId, data: { message: msg, plan: "ultra" } }, {
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
      isPlus ? "bg-primary/20 text-primary" :
      "bg-muted text-muted-foreground"
    }`}>
      {getPlanLabel(plan)}
    </span>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            key="ai-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Asistente IA de Neuralix"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Neuralix AI</span>
                {planBadge}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Cerrar asistente IA"
                className="text-muted-foreground hover:text-foreground focus:outline-none rounded">
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
            {tab === "chat" && (
              <div className="flex flex-col" style={{ height: isUltra ? 320 : 288 }}>
                <div className="flex-1 overflow-y-auto p-3 space-y-2" role="log" aria-live="polite">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}>
                        {m.content}
                        {m.action && (
                          <div className="mt-1.5 text-xs font-semibold text-green-400 flex items-center gap-1 border-t border-green-500/20 pt-1">
                            <CheckCircle className="w-3 h-3 flex-shrink-0" /> {m.action}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {aiChat.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-secondary px-3 py-2 rounded-lg text-xs text-muted-foreground">Pensando...</div>
                    </div>
                  )}
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

                {/* Free plan Discord CTA */}
                {isFree && (
                  <div className="px-3 py-2 border-t border-border bg-primary/5 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Soporte en Discord</span>
                    <a href={DISCORD_LINK} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline font-medium flex-shrink-0">
                      <ExternalLink className="w-3 h-3" /> discord.gg/wukr8apdQq
                    </a>
                  </div>
                )}

                <div className="p-3 border-t border-border flex gap-2">
                  <Input
                    placeholder={!chatReady ? "Cargando..." : isFree ? "Pregunta de soporte..." : isUltra ? "Dime que configurar..." : "Pregunta algo..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !(!input.trim() || aiChat.isPending || !chatReady) && handleSend()}
                    className="text-xs h-8"
                    disabled={!chatReady}
                    aria-label="Mensaje para el asistente IA"
                  />
                  <Button size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={handleSend}
                    disabled={!input.trim() || aiChat.isPending || !chatReady} aria-label="Enviar">
                    <Send className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}

            {/* Analysis Tab */}
            {tab === "analysis" && (
              <div className="p-4 space-y-3 overflow-y-auto" style={{ height: 288 }}>
                {isFree ? (
                  <div className="text-center py-6 space-y-3">
                    <Crown className="w-8 h-8 text-primary mx-auto opacity-50" />
                    <p className="text-sm text-muted-foreground">El analisis avanzado requiere plan Plus o superior.</p>
                    <a href={DISCORD_LINK} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-2 text-xs mt-1">
                        <ExternalLink className="w-3 h-3" /> Obtener Premium
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
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Cerrar asistente IA" : "Abrir asistente IA"}
        aria-expanded={open}
        className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white hover:opacity-90 transition-all focus:outline-none ${
          isUltra ? "bg-gradient-to-br from-purple-600 to-indigo-600" : "bg-primary"
        }`}
        data-testid="ai-assistant-button"
      >
        <Bot className="w-6 h-6" />
      </motion.button>
    </div>
  );
}
