import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { Ticket, CheckCircle, X, RotateCcw, Layout as PanelIcon, Settings, List, Star, RefreshCw, Plus, Trash2, Layers, Send } from "lucide-react";
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
  { id: "modules", label: "Modulos", icon: Layers },
  { id: "config", label: "Configuracion", icon: Settings },
  { id: "list", label: "Tickets", icon: List },
] as const;
type Tab = typeof TABS[number]["id"];

const BUTTON_COLORS = ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"] as const;
const emptyModule = { name: "", description: "", emoji: "", welcomeMessage: "", supportRoleIds: "", categoryId: "", buttonLabel: "", buttonColor: "PRIMARY", sortOrder: "0" };

function NativeSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
      {children}
    </select>
  );
}

type Module = { id: number; name: string; description?: string | null; emoji?: string | null; welcomeMessage?: string | null; supportRoleIds: string[]; categoryId?: string | null; buttonLabel?: string | null; buttonColor: string; sortOrder: number; enabled: boolean };

export default function TicketsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("panel");

  const { data: config, isLoading, isError } = useGetTicketConfig(guildId, { query: { queryKey: getGetTicketConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const { data: tickets } = useGetTickets(guildId, { query: { queryKey: getGetTicketsQueryKey(guildId), enabled: !!guildId && tab === "list", refetchInterval: 5000, refetchIntervalInBackground: false } });
  const update = useUpdateTicketConfig();
  const closeTicket = useCloseTicket();
  const reopenTicket = useReopenTicket();
  const [cfg, setCfg] = useState<any>(null);
  const [sendingPanel, setSendingPanel] = useState(false);
  const isMounted = useRef(false);

  // Modules state
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleForm, setModuleForm] = useState({ ...emptyModule });
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [showModuleForm, setShowModuleForm] = useState(false);

  const fetchModules = async () => {
    const res = await fetch(`/api/guilds/${guildId}/tickets/modules`, { credentials: "include" });
    if (res.ok) setModules(await res.json());
  };

  useEffect(() => {
    if (config && !isMounted.current) {
      setCfg(config);
      isMounted.current = true;
    }
  }, [config]);

  useEffect(() => {
    if (guildId && tab === "modules") fetchModules();
  }, [guildId, tab]);

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));
  const setMF = (k: string) => (v: any) => setModuleForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Tickets guardado" }); qc.invalidateQueries({ queryKey: getGetTicketConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const handleSendPanel = async () => {
    setSendingPanel(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/tickets/send-panel`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok !== false) toast({ title: "Panel enviado al canal correctamente" });
      else toast({ title: data?.error || "Error al enviar panel", description: data?.hint, variant: "destructive" });
    } catch { toast({ title: "Error de red", variant: "destructive" }); }
    setSendingPanel(false);
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

  const saveModule = async () => {
    const body = {
      name: moduleForm.name,
      description: moduleForm.description,
      emoji: moduleForm.emoji,
      welcomeMessage: moduleForm.welcomeMessage,
      supportRoleIds: moduleForm.supportRoleIds.split(",").map((s) => s.trim()).filter(Boolean),
      categoryId: moduleForm.categoryId,
      buttonLabel: moduleForm.buttonLabel,
      buttonColor: moduleForm.buttonColor,
      sortOrder: Number(moduleForm.sortOrder) || 0,
    };
    if (!body.name) { toast({ title: "Nombre del modulo requerido", variant: "destructive" }); return; }
    const url = editingModuleId ? `/api/guilds/${guildId}/tickets/modules/${editingModuleId}` : `/api/guilds/${guildId}/tickets/modules`;
    const method = editingModuleId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: editingModuleId ? "Modulo actualizado" : "Modulo creado" });
      setModuleForm({ ...emptyModule });
      setEditingModuleId(null);
      setShowModuleForm(false);
      fetchModules();
    } else {
      toast({ title: data.error || "Error al guardar modulo", variant: "destructive" });
    }
  };

  const deleteModule = async (id: number) => {
    const res = await fetch(`/api/guilds/${guildId}/tickets/modules/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Modulo eliminado" }); fetchModules(); }
    else toast({ title: "Error al eliminar modulo", variant: "destructive" });
  };

  const startEditModule = (m: Module) => {
    setModuleForm({
      name: m.name, description: m.description || "", emoji: m.emoji || "",
      welcomeMessage: m.welcomeMessage || "",
      supportRoleIds: (m.supportRoleIds || []).join(", "),
      categoryId: m.categoryId || "", buttonLabel: m.buttonLabel || "",
      buttonColor: m.buttonColor || "PRIMARY", sortOrder: String(m.sortOrder || 0),
    });
    setEditingModuleId(m.id);
    setShowModuleForm(true);
  };

  const openTicketCount = Array.isArray(tickets) ? tickets.filter((t: any) => t.status === "open").length : 0;

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Sistema de Tickets</h1>
          <p className="text-muted-foreground text-sm">Panel de soporte con modulos, transcripciones y botones interactivos en Discord.</p>
        </div>
        {tab !== "list" && cfg && (
          <div className="flex gap-2">
            {tab === "panel" && (
              <Button variant="outline" size="sm" onClick={handleSendPanel} disabled={sendingPanel} className="gap-1.5">
                {sendingPanel && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Panel</span>
              </Button>
            )}
            {tab !== "modules" && <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-tickets">Guardar</Button>}
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} data-testid={`tab-${id}`}
            className={cn("flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="w-3.5 h-3.5" />{label}
            {id === "list" && openTicketCount > 0 && <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{openTicketCount}</span>}
          </button>
        ))}
      </div>

      {isLoading || (!cfg && !isError) ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : isError || !cfg ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <Ticket className="w-10 h-10 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">No se pudo cargar el sistema de tickets.</p>
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
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Usar Modulos</Label>
                    <p className="text-xs text-muted-foreground">Muestra un menu de categorias en lugar de un solo boton</p>
                  </div>
                  <Switch checked={cfg.useModules || false} onCheckedChange={set("useModules")} />
                </div>
              </div>

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
                  <Textarea placeholder="Abre un ticket para recibir asistencia del equipo de soporte." value={cfg.panelDescription || ""} onChange={(e) => set("panelDescription")(e.target.value)} rows={3} />
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

              {!cfg.useModules && (
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
                      <NativeSelect value={cfg.buttonColor || "PRIMARY"} onChange={set("buttonColor")}>
                        {BUTTON_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </NativeSelect>
                    </div>
                  </div>
                </div>
              )}

              {cfg.useModules && modules.length === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-600 dark:text-yellow-400">
                  El modo modulos esta activado pero no hay modulos configurados. Ve a la pestana <strong>Modulos</strong> para crear al menos uno.
                </div>
              )}
            </div>
          )}

          {/* ── Modules Tab ── */}
          {tab === "modules" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Los modulos son categorias de tickets. Activa "Usar Modulos" en la pestana Panel.</p>
                <Button size="sm" onClick={() => { setModuleForm({ ...emptyModule }); setEditingModuleId(null); setShowModuleForm(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Nuevo Modulo
                </Button>
              </div>

              {showModuleForm && (
                <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
                  <h3 className="font-semibold text-sm">{editingModuleId ? "Editar Modulo" : "Nuevo Modulo"}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs mb-1.5 block">Nombre *</Label>
                      <Input value={moduleForm.name} onChange={(e) => setMF("name")(e.target.value)} placeholder="Soporte General" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Emoji</Label>
                      <Input value={moduleForm.emoji} onChange={(e) => setMF("emoji")(e.target.value)} placeholder="🎫" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Descripcion</Label>
                      <Input value={moduleForm.description} onChange={(e) => setMF("description")(e.target.value)} placeholder="Para dudas y consultas generales" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Categoria de Discord (ID)</Label>
                      <Input value={moduleForm.categoryId} onChange={(e) => setMF("categoryId")(e.target.value)} placeholder="ID de categoria" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Roles de soporte para este modulo (IDs separados por coma)</Label>
                      <Input value={moduleForm.supportRoleIds} onChange={(e) => setMF("supportRoleIds")(e.target.value)} placeholder="ID1, ID2, ID3" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Mensaje de bienvenida del ticket</Label>
                      <Textarea value={moduleForm.welcomeMessage} onChange={(e) => setMF("welcomeMessage")(e.target.value)} placeholder="Hola {user}, un agente de soporte te atendra en breve." rows={2} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Etiqueta del boton</Label>
                      <Input value={moduleForm.buttonLabel} onChange={(e) => setMF("buttonLabel")(e.target.value)} placeholder="Soporte General" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Color del boton</Label>
                      <NativeSelect value={moduleForm.buttonColor} onChange={setMF("buttonColor")}>
                        {BUTTON_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Orden</Label>
                      <Input type="number" min="0" value={moduleForm.sortOrder} onChange={(e) => setMF("sortOrder")(e.target.value)} className="w-24" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveModule}>Guardar</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowModuleForm(false); setEditingModuleId(null); setModuleForm({ ...emptyModule }); }}>Cancelar</Button>
                  </div>
                </div>
              )}

              {modules.length === 0 && !showModuleForm ? (
                <div className="text-center py-16 bg-card rounded-xl border border-card-border">
                  <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">Sin modulos configurados</p>
                  <p className="text-sm text-muted-foreground mt-1">Crea categorias de tickets para organizar mejor el soporte.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {modules.map((m) => (
                    <div key={m.id} className="bg-card border border-card-border rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-lg">{m.emoji || "🎫"}</div>
                        <div>
                          <p className="font-medium text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.description || "Sin descripcion"}</p>
                          {(m.supportRoleIds || []).length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(m.supportRoleIds || []).slice(0, 3).map((rid) => (
                                <span key={rid} className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded">{rid}</span>
                              ))}
                              {(m.supportRoleIds || []).length > 3 && <span className="text-xs text-muted-foreground">+{(m.supportRoleIds || []).length - 3} mas</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEditModule(m)}>
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteModule(m.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Config Tab ── */}
          {tab === "config" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Canales</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Categoria de tickets (ID)</Label>
                    <Input placeholder="Categoria donde se crean los tickets" value={cfg.categoryId || ""} onChange={(e) => set("categoryId")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de transcripciones (ID)</Label>
                    <Input placeholder="Canal de transcripciones" value={cfg.transcriptChannelId || ""} onChange={(e) => set("transcriptChannelId")(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de logs de tickets (ID)</Label>
                    <Input placeholder="Canal de auditoria" value={cfg.logsChannelId || ""} onChange={(e) => set("logsChannelId")(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Roles de soporte</h3>
                <div>
                  <Label className="text-sm mb-1.5 block">Roles de soporte (IDs separados por coma)</Label>
                  <Input
                    placeholder="ID1, ID2, ID3"
                    value={Array.isArray(cfg.supportRoleIds) ? cfg.supportRoleIds.join(", ") : (cfg.supportRoleIds || "")}
                    onChange={(e) => set("supportRoleIds")(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Estos roles pueden ver y gestionar todos los tickets (a menos que el modulo tenga sus propios roles).</p>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Rol de soporte principal (legacy ID)</Label>
                  <Input placeholder="ID del rol principal" value={cfg.supportRoleId || ""} onChange={(e) => set("supportRoleId")(e.target.value)} />
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Configuracion del ticket</h3>
                <div>
                  <Label className="text-sm mb-1.5 block">Nombre del canal del ticket</Label>
                  <Input placeholder="ticket-{username}" value={cfg.ticketNameFormat || ""} onChange={(e) => set("ticketNameFormat")(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Variables: {"{username}"}, {"{userid}"}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm">Mensaje al abrir ticket</Label>
                    <VariablesModal variables={TICKET_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, openMessage: (c.openMessage || "") + v }))} />
                  </div>
                  <Textarea placeholder="Hola {user}! El equipo de soporte te atendera en breve." value={cfg.openMessage || ""} onChange={(e) => set("openMessage")(e.target.value)} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Max. tickets por usuario</Label>
                    <Input type="number" min={1} max={10} value={cfg.maxTicketsPerUser ?? 1} onChange={(e) => set("maxTicketsPerUser")(Number(e.target.value) || 1)} className="w-24" />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Auto-cierre (horas, 0 = desactivado)</Label>
                    <Input type="number" min={0} max={720} value={cfg.autoClose ?? 0} onChange={(e) => set("autoClose")(Number(e.target.value) || 0)} className="w-24" />
                  </div>
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-sm">Opciones</h3>
                {[
                  ["mentionSupport", "Mencionar roles de soporte al abrir ticket"],
                  ["autoTranscript", "Transcripcion automatica al cerrar"],
                  ["claimEnabled", "Boton 'Reclamar' en los tickets"],
                  ["deleteEnabled", "Boton 'Eliminar canal' en los tickets"],
                  ["satisfactionSurvey", "Encuesta de satisfaccion al cerrar"],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm">{label}</Label>
                    <Switch checked={cfg[key] ?? true} onCheckedChange={set(key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── List Tab ── */}
          {tab === "list" && (
            <div className="space-y-3">
              {!tickets || (tickets as any[]).length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay tickets</p>
                </div>
              ) : (
                (tickets as any[]).map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", t.status === "open" ? "bg-green-400" : "bg-muted-foreground")} />
                      <div>
                        <p className="font-medium text-sm">{t.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.username} · #{t.id}
                          {t.moduleName && <span className="ml-1 text-primary/70">[{t.moduleName}]</span>}
                          {t.claimedByUsername && <span className="ml-1">· Reclamado: {t.claimedByUsername}</span>}
                          · {new Date(t.createdAt).toLocaleDateString("es")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", t.status === "open" ? "bg-green-500/15 text-green-400" : "bg-secondary text-muted-foreground")}>
                        {t.status === "open" ? "Abierto" : t.status === "deleted" ? "Eliminado" : "Cerrado"}
                      </span>
                      {t.status === "open" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleClose(t.id)}>
                          <X className="w-3 h-3 mr-1" />Cerrar
                        </Button>
                      ) : t.status === "closed" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReopen(t.id)}>
                          <RotateCcw className="w-3 h-3 mr-1" />Reabrir
                        </Button>
                      ) : null}
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
