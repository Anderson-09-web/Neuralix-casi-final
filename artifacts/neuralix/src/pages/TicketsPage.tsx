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
import GuildChannelSelect from "@/components/GuildChannelSelect";
import GuildRoleSelect from "@/components/GuildRoleSelect";
import GuildRoleMultiSelect from "@/components/GuildRoleMultiSelect";

const TABS = [
  { id: "paneles", label: "Paneles", icon: PanelIcon },
  { id: "modules", label: "Modulos", icon: Layers },
  { id: "config", label: "Configuracion", icon: Settings },
  { id: "list", label: "Tickets", icon: List },
] as const;
type Tab = typeof TABS[number]["id"];

const BUTTON_COLORS = ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"] as const;
const emptyModule = { name: "", description: "", emoji: "", welcomeMessage: "", welcomeEmbedEnabled: false, welcomeEmbedTitle: "", welcomeEmbedDescription: "", welcomeEmbedColor: "", supportRoleIds: "", categoryId: "", buttonLabel: "", buttonColor: "PRIMARY", sortOrder: "0" };
const emptyPanel = { name: "", description: "", channelId: "", panelType: "button", buttonLabel: "Abrir Ticket", buttonColor: "PRIMARY", buttonEmoji: "", embedTitle: "", embedDescription: "", embedColor: "#5865F2", embedFooter: "", embedImage: "", useModules: false, sortOrder: "0", selectedModuleIds: [] as number[] };

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
  const [tab, setTab] = useState<Tab>("paneles");

  const { data: config, isLoading, isError } = useGetTicketConfig(guildId, { query: { queryKey: getGetTicketConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const { data: tickets } = useGetTickets(guildId, { query: { queryKey: getGetTicketsQueryKey(guildId), enabled: !!guildId && tab === "list", refetchInterval: 5000, refetchIntervalInBackground: false } });
  const update = useUpdateTicketConfig();
  const closeTicket = useCloseTicket();
  const reopenTicket = useReopenTicket();
  const [cfg, setCfg] = useState<any>(null);
  const isMounted = useRef(false);

  // Modules state
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleForm, setModuleForm] = useState({ ...emptyModule });
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [showModuleForm, setShowModuleForm] = useState(false);

  // Panels state
  const [panels, setPanels] = useState<any[]>([]);
  const [panelForm, setPanelForm] = useState({ ...emptyPanel });
  const [editingPanelId, setEditingPanelId] = useState<number | null>(null);
  const [showPanelForm, setShowPanelForm] = useState(false);
  const [sendingPanelId, setSendingPanelId] = useState<number | null>(null);
  const [sendChannelInput, setSendChannelInput] = useState<{ panelId: number; channelId: string } | null>(null);

  const fetchModules = async () => {
    const res = await fetch(`/api/guilds/${guildId}/tickets/modules`, { credentials: "include" });
    if (res.ok) setModules(await res.json());
  };

  const fetchPanels = async () => {
    const res = await fetch(`/api/guilds/${guildId}/tickets/panels`, { credentials: "include" });
    if (res.ok) setPanels(await res.json());
  };

  // Load modules whenever panels tab is shown (needed for module picker)
  useEffect(() => {
    if (config && !isMounted.current) {
      setCfg(config);
      isMounted.current = true;
    }
  }, [config]);

  useEffect(() => {
    if (guildId && (tab === "modules" || tab === "paneles")) fetchModules();
  }, [guildId, tab]);

  useEffect(() => {
    if (guildId && tab === "paneles") fetchPanels();
  }, [guildId, tab]);

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));
  const setMF = (k: string) => (v: any) => setModuleForm((f) => ({ ...f, [k]: v }));
  const setPF = (k: string) => (v: any) => setPanelForm((f) => ({ ...f, [k]: v }));

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

  const savePanel = async () => {
    const body = {
      name: panelForm.name,
      description: panelForm.description,
      channelId: panelForm.channelId,
      panelType: panelForm.panelType,
      buttonLabel: panelForm.buttonLabel,
      buttonColor: panelForm.buttonColor,
      buttonEmoji: panelForm.buttonEmoji,
      embedTitle: panelForm.embedTitle,
      embedDescription: panelForm.embedDescription,
      embedColor: panelForm.embedColor,
      embedFooter: panelForm.embedFooter,
      embedImage: panelForm.embedImage,
      useModules: panelForm.useModules,
      sortOrder: Number(panelForm.sortOrder) || 0,
      moduleIds: panelForm.useModules ? panelForm.selectedModuleIds : [],
    };
    if (!body.name) { toast({ title: "Nombre del panel requerido", variant: "destructive" }); return; }
    const url = editingPanelId ? `/api/guilds/${guildId}/tickets/panels/${editingPanelId}` : `/api/guilds/${guildId}/tickets/panels`;
    const method = editingPanelId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: editingPanelId ? "Panel actualizado" : "Panel creado" });
      setPanelForm({ ...emptyPanel });
      setEditingPanelId(null);
      setShowPanelForm(false);
      fetchPanels();
      fetchModules();
    } else {
      toast({ title: data.error || "Error al guardar panel", variant: "destructive" });
    }
  };

  const deletePanel = async (id: number) => {
    const res = await fetch(`/api/guilds/${guildId}/tickets/panels/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Panel eliminado" }); fetchPanels(); }
    else toast({ title: "Error al eliminar panel", variant: "destructive" });
  };

  const sendPanel = async (id: number, overrideChannelId?: string) => {
    const panel = panels.find((p) => p.id === id);
    const channelId = overrideChannelId || panel?.channelId;
    if (!channelId) {
      setSendChannelInput({ panelId: id, channelId: "" });
      return;
    }
    setSendingPanelId(id);
    setSendChannelInput(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/tickets/panels/${id}/send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok !== false) toast({ title: "Panel enviado al canal correctamente" });
      else toast({ title: data?.error || "Error al enviar panel", description: data?.hint, variant: "destructive" });
    } catch { toast({ title: "Error de red", variant: "destructive" }); }
    setSendingPanelId(null);
  };

  const startEditPanel = (p: any) => {
    // Load which modules are currently assigned to this panel
    const assignedModuleIds = modules.filter((m: any) => m.panelId === p.id).map((m: any) => m.id);
    setPanelForm({
      name: p.name || "", description: p.description || "",
      channelId: p.channelId || "", panelType: p.panelType || "button",
      buttonLabel: p.buttonLabel || "Abrir Ticket",
      buttonColor: p.buttonColor || "PRIMARY", buttonEmoji: p.buttonEmoji || "",
      embedTitle: p.embedTitle || "", embedDescription: p.embedDescription || "",
      embedColor: p.embedColor || "#5865F2", embedFooter: p.embedFooter || "",
      embedImage: p.embedImage || "", useModules: !!p.useModules, sortOrder: String(p.sortOrder || 0),
      selectedModuleIds: assignedModuleIds,
    });
    setEditingPanelId(p.id);
    setShowPanelForm(true);
  };

  const saveModule = async () => {
    const body = {
      name: moduleForm.name,
      description: moduleForm.description,
      emoji: moduleForm.emoji,
      welcomeMessage: moduleForm.welcomeMessage,
      welcomeEmbedEnabled: moduleForm.welcomeEmbedEnabled,
      welcomeEmbedTitle: moduleForm.welcomeEmbedTitle,
      welcomeEmbedDescription: moduleForm.welcomeEmbedDescription,
      welcomeEmbedColor: moduleForm.welcomeEmbedColor,
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
      welcomeEmbedEnabled: !!(m as any).welcomeEmbedEnabled,
      welcomeEmbedTitle: (m as any).welcomeEmbedTitle || "",
      welcomeEmbedDescription: (m as any).welcomeEmbedDescription || "",
      welcomeEmbedColor: (m as any).welcomeEmbedColor || "",
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
            {tab === "config" && <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-tickets">Guardar</Button>}
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
          {/* ── Paneles Tab ── */}
          {tab === "paneles" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Crea multiples paneles de tickets, cada uno con su propio canal y configuracion visual.</p>
                <Button size="sm" onClick={() => { setPanelForm({ ...emptyPanel }); setEditingPanelId(null); setShowPanelForm(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Nuevo Panel
                </Button>
              </div>

              {showPanelForm && (
                <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
                  <h3 className="font-semibold text-sm">{editingPanelId ? "Editar Panel" : "Nuevo Panel"}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs mb-1.5 block">Nombre del panel *</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.name} onChange={(e) => setPF("name")(e.target.value)} placeholder="Panel Principal" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Canal de Discord</Label>
                      <GuildChannelSelect guildId={guildId!} value={panelForm.channelId} onChange={setPF("channelId")} types={[0, 5]} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Descripcion</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.description} onChange={(e) => setPF("description")(e.target.value)} placeholder="Descripcion opcional del panel" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Titulo del embed</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.embedTitle} onChange={(e) => setPF("embedTitle")(e.target.value)} placeholder="Centro de Soporte" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Color del embed (hex)</Label>
                      <div className="flex gap-2">
                        <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.embedColor} onChange={(e) => setPF("embedColor")(e.target.value)} placeholder="#5865F2" />
                        {panelForm.embedColor && <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: panelForm.embedColor }} />}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Descripcion del embed</Label>
                      <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" value={panelForm.embedDescription} onChange={(e) => setPF("embedDescription")(e.target.value)} placeholder="Abre un ticket para recibir asistencia." rows={2} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Footer del embed</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.embedFooter} onChange={(e) => setPF("embedFooter")(e.target.value)} placeholder="Neuralix Support" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Imagen del panel (URL)</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.embedImage} onChange={(e) => setPF("embedImage")(e.target.value)} placeholder="https://..." />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Etiqueta del boton</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.buttonLabel} onChange={(e) => setPF("buttonLabel")(e.target.value)} placeholder="Abrir Ticket" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Emoji del boton</Label>
                      <input className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.buttonEmoji} onChange={(e) => setPF("buttonEmoji")(e.target.value)} placeholder="🎫" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Color del boton</Label>
                      <NativeSelect value={panelForm.buttonColor} onChange={setPF("buttonColor")}>
                        {BUTTON_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Orden</Label>
                      <input type="number" min="0" className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={panelForm.sortOrder} onChange={(e) => setPF("sortOrder")(e.target.value)} />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium">Usar modulos de tickets</p>
                        <p className="text-xs text-muted-foreground">Muestra un selector de modulos al abrir un ticket desde este panel</p>
                      </div>
                      <Switch checked={panelForm.useModules} onCheckedChange={(v) => setPF("useModules")(v)} />
                    </div>
                    {panelForm.useModules && (
                      <div className="md:col-span-2">
                        <Label className="text-xs mb-1.5 block">Tipo de selector de modulos</Label>
                        <div className="flex gap-2">
                          {(["button", "select_menu"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setPF("panelType")(t)}
                              className={cn(
                                "flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all text-left",
                                panelForm.panelType === t
                                  ? "bg-primary/10 border-primary/50 text-foreground"
                                  : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/30"
                              )}
                            >
                              <div className="font-semibold mb-0.5">{t === "button" ? "Botones" : "Menu de seleccion"}</div>
                              <div className="text-xs text-muted-foreground leading-tight">
                                {t === "button" ? "Hasta 5 botones (uno por modulo)" : "Lista desplegable (hasta 25 modulos)"}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {panelForm.useModules && (
                      <div className="md:col-span-2">
                        <Label className="text-xs mb-2 block">Selecciona los modulos que aparecen en este panel</Label>
                        {modules.length === 0 ? (
                          <div className="p-3 bg-secondary/50 rounded-lg text-xs text-muted-foreground">
                            Sin modulos creados. Ve a la pestana "Modulos" y crea al menos uno.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {modules.map((m: any) => {
                              const isSelected = panelForm.selectedModuleIds.includes(m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    const ids = isSelected
                                      ? panelForm.selectedModuleIds.filter((id) => id !== m.id)
                                      : [...panelForm.selectedModuleIds, m.id];
                                    setPF("selectedModuleIds")(ids);
                                  }}
                                  className={cn(
                                    "flex items-center gap-2.5 p-3 rounded-lg border text-xs text-left transition-all",
                                    isSelected
                                      ? "bg-primary/10 border-primary/50 text-foreground"
                                      : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/30"
                                  )}
                                >
                                  <div className={cn("w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px]", isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                                    {isSelected && "✓"}
                                  </div>
                                  <span className="text-base leading-none">{m.emoji || "🎫"}</span>
                                  <span className="font-medium truncate">{m.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {panelForm.selectedModuleIds.length === 0
                            ? "Ninguno seleccionado — el panel usara todos los modulos del servidor"
                            : `${panelForm.selectedModuleIds.length} modulo${panelForm.selectedModuleIds.length !== 1 ? "s" : ""} seleccionado${panelForm.selectedModuleIds.length !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={savePanel}>Guardar</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowPanelForm(false); setEditingPanelId(null); setPanelForm({ ...emptyPanel }); }}>Cancelar</Button>
                  </div>
                </div>
              )}

              {panels.length === 0 && !showPanelForm ? (
                <div className="text-center py-16 bg-card rounded-xl border border-card-border">
                  <PanelIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">Sin paneles configurados</p>
                  <p className="text-sm text-muted-foreground mt-1">Crea paneles independientes para diferentes canales o categorias de soporte.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {panels.map((p: any) => (
                    <div key={p.id} className="bg-card border border-card-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: p.embedColor ? `${p.embedColor}22` : "#5865F222", borderLeft: `3px solid ${p.embedColor || "#5865F2"}` }}>
                            <PanelIcon className="w-4 h-4" style={{ color: p.embedColor || "#5865F2" }} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{p.name}</p>
                              {p.useModules && <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-primary/15 text-primary">Modulos</span>}
                              {p.useModules && p.panelType === "select_menu" && <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-violet-500/15 text-violet-400">Menu</span>}
                              {p._moduleCount != null && <span className="text-xs text-muted-foreground">{p._moduleCount} modulo{p._moduleCount !== 1 ? "s" : ""}</span>}
                            </div>
                            {p.embedTitle && <p className="text-xs text-muted-foreground mt-0.5">{p.embedTitle}</p>}
                            {p.description && <p className="text-xs text-muted-foreground/60 mt-0.5">{p.description}</p>}
                            {p.channelId && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-xs bg-secondary font-mono px-1.5 py-0.5 rounded"># {p.channelId}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                            disabled={sendingPanelId === p.id}
                            onClick={() => sendPanel(p.id)}
                          >
                            {sendingPanelId === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            <span>Enviar</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEditPanel(p)}>
                            <Settings className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deletePanel(p.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Inline channel prompt when no channelId is configured */}
                      {sendChannelInput?.panelId === p.id && (
                        <div className="mt-3 pt-3 border-t border-border space-y-2">
                          <p className="text-xs text-muted-foreground">Este panel no tiene canal configurado. Selecciona el canal de Discord donde enviarlo:</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <GuildChannelSelect
                                guildId={guildId!}
                                value={sendChannelInput.channelId}
                                onChange={(v) => setSendChannelInput({ panelId: p.id, channelId: v })}
                                types={[0, 5]}
                              />
                            </div>
                            <Button size="sm" className="h-9 text-xs" disabled={!sendChannelInput.channelId} onClick={() => sendPanel(p.id, sendChannelInput.channelId)}>
                              <Send className="w-3 h-3 mr-1" />Enviar
                            </Button>
                            <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSendChannelInput(null)}>Cancelar</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
                      <Label className="text-xs mb-1.5 block">Categoria de Discord</Label>
                      <GuildChannelSelect guildId={guildId!} value={moduleForm.categoryId} onChange={setMF("categoryId")} types={[4]} placeholder="Seleccionar categoria..." />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Roles de soporte para este modulo</Label>
                      <GuildRoleMultiSelect guildId={guildId!} value={moduleForm.supportRoleIds} onChange={setMF("supportRoleIds")} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Mensaje de bienvenida del ticket</Label>
                      <Textarea value={moduleForm.welcomeMessage} onChange={(e) => setMF("welcomeMessage")(e.target.value)} placeholder="Hola {user}, un agente de soporte te atendra en breve." rows={2} />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium">Embed de bienvenida</p>
                        <p className="text-xs text-muted-foreground">Muestra un embed al abrir el ticket en este modulo</p>
                      </div>
                      <Switch checked={moduleForm.welcomeEmbedEnabled} onCheckedChange={(v) => setMF("welcomeEmbedEnabled")(v)} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Titulo del embed de bienvenida</Label>
                      <Input value={moduleForm.welcomeEmbedTitle} onChange={(e) => setMF("welcomeEmbedTitle")(e.target.value)} placeholder="Ticket abierto" disabled={!moduleForm.welcomeEmbedEnabled} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Color del embed (hex)</Label>
                      <div className="flex gap-2">
                        <Input value={moduleForm.welcomeEmbedColor} onChange={(e) => setMF("welcomeEmbedColor")(e.target.value)} placeholder="#5865F2" />
                        {moduleForm.welcomeEmbedColor && <div className="w-9 h-9 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: moduleForm.welcomeEmbedColor }} />}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs mb-1.5 block">Descripcion del embed de bienvenida</Label>
                      <Textarea value={moduleForm.welcomeEmbedDescription} onChange={(e) => setMF("welcomeEmbedDescription")(e.target.value)} placeholder="Un agente te atendra lo antes posible. Por favor describe tu problema." rows={2} />
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
                    <Label className="text-sm mb-1.5 block">Categoria de tickets</Label>
                    <GuildChannelSelect guildId={guildId!} value={cfg.categoryId || ""} onChange={set("categoryId")} types={[4]} placeholder="Seleccionar categoria..." />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de transcripciones</Label>
                    <GuildChannelSelect guildId={guildId!} value={cfg.transcriptChannelId || ""} onChange={set("transcriptChannelId")} types={[0, 5]} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de logs de tickets</Label>
                    <GuildChannelSelect guildId={guildId!} value={cfg.logsChannelId || ""} onChange={set("logsChannelId")} types={[0, 5]} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Canal de calificaciones (encuesta)</Label>
                    <GuildChannelSelect guildId={guildId!} value={cfg.satisfactionLogChannelId || ""} onChange={set("satisfactionLogChannelId")} types={[0, 5]} />
                    <p className="text-xs text-muted-foreground mt-1">Registra las calificaciones de usuarios cuando responden la encuesta de satisfaccion.</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
                <h3 className="font-semibold text-sm">Roles de soporte</h3>
                <div>
                  <Label className="text-sm mb-1.5 block">Roles de soporte</Label>
                  <GuildRoleMultiSelect
                    guildId={guildId!}
                    value={Array.isArray(cfg.supportRoleIds) ? cfg.supportRoleIds.join(", ") : (cfg.supportRoleIds || "")}
                    onChange={(v) => set("supportRoleIds")(v.split(",").map((s: string) => s.trim()).filter(Boolean))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Estos roles pueden ver y gestionar todos los tickets (a menos que el modulo tenga sus propios roles).</p>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Rol de soporte principal</Label>
                  <GuildRoleSelect guildId={guildId!} value={cfg.supportRoleId || ""} onChange={set("supportRoleId")} placeholder="Seleccionar rol..." />
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
