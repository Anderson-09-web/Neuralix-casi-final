import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Ticket, CheckCircle, Clock, X, RotateCcw, Layout as PanelIcon, Settings, List, Star } from "lucide-react";
import { useGetTicketConfig, useUpdateTicketConfig, useGetTickets, useCloseTicket, useReopenTicket, getGetTicketConfigQueryKey, getGetTicketsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { VariablesModal, TICKET_VARIABLES } from "@/components/VariablesModal";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "panel", label: "Panel", icon: PanelIcon },
  { id: "config", label: "Configuracion", icon: Settings },
  { id: "list", label: "Tickets activos", icon: List },
] as const;
type Tab = typeof TABS[number]["id"];

const BUTTON_COLORS = ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"] as const;

export default function TicketsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("panel");

  const { data: config, isLoading, isError } = useGetTicketConfig(guildId, { query: { queryKey: getGetTicketConfigQueryKey(guildId), enabled: !!guildId } });
  const { data: tickets } = useGetTickets(guildId, { query: { queryKey: getGetTicketsQueryKey(guildId), enabled: !!guildId && tab === "list" } });
  const update = useUpdateTicketConfig();
  const closeTicket = useCloseTicket();
  const reopenTicket = useReopenTicket();
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => { if (config) setCfg(config); }, [config]);

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Tickets guardado" }); qc.invalidateQueries({ queryKey: getGetTicketConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const handleClose = (ticketId: number) => {
    closeTicket.mutate({ guildId, ticketId }, {
      onSuccess: () => { toast({ title: "Ticket cerrado" }); qc.invalidateQueries({ queryKey: getGetTicketsQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al cerrar ticket", variant: "destructive" }),
    });
  };

  const handleReopen = (ticketId: number) => {
    reopenTicket.mutate({ guildId, ticketId }, {
      onSuccess: () => { toast({ title: "Ticket reabierto" }); qc.invalidateQueries({ queryKey: getGetTicketsQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al reabrir ticket", variant: "destructive" }),
    });
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Sistema de Tickets</h1>
          <p className="text-muted-foreground text-sm">Panel de soporte completo con transcripciones y roles personalizados.</p>
        </div>
        {tab !== "list" && cfg && (
          <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-tickets">Guardar</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} data-testid={`tab-${id}`}
            className={cn("flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {isLoading || (!cfg && !isError) ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : isError || !cfg ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <Ticket className="w-10 h-10 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">No se pudo cargar el sistema de tickets.<br />Asegurate de que el bot esta en el servidor.</p>
        </div>
      ) : (
        <>
          {/* ── Panel Tab ── */}
          {tab === "panel" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Sistema de Tickets</h3>
                  <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-tickets-enabled" />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Canal del panel (ID)</Label>
                  <Input placeholder="ID del canal donde aparecera el panel" value={cfg.panelChannelId || ""} onChange={(e) => set("panelChannelId")(e.target.value)} />
                </div>
              </div>

              {/* Embed del panel */}
              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Embed del panel</h3>
                <div>
                  <Label className="text-sm mb-1.5 block">Titulo</Label>
                  <Input placeholder="Centro de Soporte" value={cfg.panelTitle || ""} onChange={(e) => set("panelTitle")(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm">Descripcion</Label>
                    <VariablesModal variables={TICKET_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, panelDescription: (c.panelDescription || "") + v }))} />
                  </div>
                  <Textarea
                    placeholder="Abre un ticket para recibir asistencia del equipo de soporte."
                    value={cfg.panelDescription || ""}
                    onChange={(e) => set("panelDescription")(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Color (hex)</Label>
                    <div className="flex gap-2">
                      <Input placeholder="#5865F2" value={cfg.panelColor || ""} onChange={(e) => set("panelColor")(e.target.value)} />
                      {cfg.panelColor && <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.panelColor }} />}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Footer</Label>
                    <Input placeholder="Neuralix Support" value={cfg.panelFooter || ""} onChange={(e) => set("panelFooter")(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Imagen del panel (URL)</Label>
                  <Input placeholder="https://..." value={cfg.panelImage || ""} onChange={(e) => set("panelImage")(e.target.value)} />
                </div>
              </div>

              {/* Boton */}
              <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-sm">Boton de apertura</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Texto del boton</Label>
                    <Input placeholder="Abrir Ticket" value={cfg.buttonLabel || ""} onChange={(e) => set("buttonLabel")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Emoji</Label>
                    <Input placeholder="🎫" value={cfg.buttonEmoji || ""} onChange={(e) => set("buttonEmoji")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Color del boton</Label>
                    <select
                      value={cfg.buttonColor || "PRIMARY"}
                      onChange={(e) => set("buttonColor")(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {BUTTON_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Premium notice */}
              <div className="border border-primary/20 bg-primary/5 rounded-xl p-4 flex items-start gap-3">
                <Star className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-primary mb-1">Funciones Premium</p>
                  <p className="text-xs text-muted-foreground">Formularios personalizados, multiples paneles, IA para respuestas rapidas, exportacion de transcripciones y estadisticas detalladas disponibles en planes Pro y Ultra.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Config Tab ── */}
          {tab === "config" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Canales y roles</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Categoria (ID)</Label>
                    <Input placeholder="Categoria de tickets" value={cfg.categoryId || ""} onChange={(e) => set("categoryId")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Rol de soporte (ID)</Label>
                    <Input placeholder="Rol que ve los tickets" value={cfg.supportRoleId || ""} onChange={(e) => set("supportRoleId")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de transcripciones (ID)</Label>
                    <Input placeholder="Donde se guardan los logs" value={cfg.transcriptChannelId || ""} onChange={(e) => set("transcriptChannelId")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de logs de tickets (ID)</Label>
                    <Input placeholder="Canal de auditoria" value={cfg.logsChannelId || ""} onChange={(e) => set("logsChannelId")(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Configuracion del ticket</h3>
                <div>
                  <Label className="text-sm mb-1.5 block">Nombre del canal del ticket</Label>
                  <Input placeholder="ticket-{username}" value={cfg.ticketNameFormat || ""} onChange={(e) => set("ticketNameFormat")(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Variables: {"{username}"}, {"{userid}"}, {"{ticketid}"}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm">Mensaje al abrir ticket</Label>
                    <VariablesModal variables={TICKET_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, openMessage: (c.openMessage || "") + v }))} />
                  </div>
                  <Textarea
                    placeholder="Hola {user}! El equipo de soporte te atendera en breve. Por favor describe tu problema con detalle."
                    value={cfg.openMessage || ""}
                    onChange={(e) => set("openMessage")(e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Maximo de tickets por usuario</Label>
                  <Input type="number" min={1} max={10} value={cfg.maxTicketsPerUser || 1} onChange={(e) => set("maxTicketsPerUser")(Number(e.target.value))} className="w-32" />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Auto-cierre (horas, 0 = desactivado)</Label>
                  <Input type="number" min={0} max={720} value={cfg.autoClose || 0} onChange={(e) => set("autoClose")(Number(e.target.value))} className="w-32" />
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-sm">Opciones adicionales</h3>
                {[
                  ["mentionSupport", "Mencionar rol de soporte al abrir ticket"],
                  ["autoTranscript", "Transcripcion automatica al cerrar"],
                  ["satisfactionSurvey", "Encuesta de satisfaccion al cerrar"],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm">{label}</Label>
                    <Switch checked={cfg[key] || false} onCheckedChange={set(key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── List Tab ── */}
          {tab === "list" && (
            <div className="space-y-3">
              {!tickets || tickets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay tickets activos</p>
                </div>
              ) : (
                tickets.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", t.status === "open" ? "bg-green-400" : "bg-muted-foreground")} />
                      <div>
                        <p className="font-medium text-sm">{t.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.username} · #{t.id} · {new Date(t.createdAt).toLocaleDateString("es")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", t.status === "open" ? "bg-green-500/15 text-green-400" : "bg-secondary text-muted-foreground")}>
                        {t.status === "open" ? "Abierto" : "Cerrado"}
                      </span>
                      {t.status === "open" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleClose(t.id)}>
                          <X className="w-3 h-3 mr-1" /> Cerrar
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReopen(t.id)}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Reabrir
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
