import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { FileText, Shield, Users, MessageSquare, Settings, Mic, Volume2, Hash, AtSign, BookOpen, Gift, RefreshCw, Search, ChevronDown, Filter } from "lucide-react";
import { useGetLogsConfig, useUpdateLogsConfig, useGetGuildLogs, getGetLogsConfigQueryKey, getGetGuildLogsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import GuildChannelSelect from "@/components/GuildChannelSelect";

const ACTION_LABELS: Record<string, string> = {
  member_join: "Miembro unido",
  member_leave: "Miembro salido",
  member_ban: "Miembro baneado",
  member_unban: "Baneo levantado",
  member_kick: "Miembro expulsado",
  member_timeout: "Miembro silenciado",
  timeout_lifted: "Silencio levantado",
  nickname_change: "Apodo cambiado",
  role_change: "Roles actualizados",
  message_edit: "Mensaje editado",
  message_delete: "Mensaje eliminado",
  voice_join: "Unido a voz",
  voice_leave: "Salida de voz",
  voice_move: "Cambio de canal voz",
  channel_create: "Canal creado",
  channel_delete: "Canal eliminado",
  channel_update: "Canal actualizado",
  role_create: "Rol creado",
  role_delete: "Rol eliminado",
  role_update: "Rol actualizado",
  webhook_create: "Webhook creado",
  webhook_delete: "Webhook eliminado",
  guild_update: "Servidor modificado",
  emoji_create: "Emoji creado",
  emoji_delete: "Emoji eliminado",
  invite_create: "Invitacion creada",
  invite_delete: "Invitacion eliminada",
  ticket_open: "Ticket abierto",
  ticket_close: "Ticket cerrado",
  ticket_claim: "Ticket reclamado",
  giveaway_start: "Sorteo iniciado",
  giveaway_end: "Sorteo finalizado",
  giveaway_reroll: "Sorteo reejeccion",
};

const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  member: { label: "Miembros", color: "text-blue-400", icon: Users },
  message: { label: "Mensajes", color: "text-green-400", icon: MessageSquare },
  moderation: { label: "Moderacion", color: "text-red-400", icon: Shield },
  security: { label: "Seguridad", color: "text-orange-400", icon: Shield },
  voice: { label: "Voz", color: "text-purple-400", icon: Volume2 },
  channel: { label: "Canales", color: "text-yellow-400", icon: Hash },
  role: { label: "Roles", color: "text-pink-400", icon: Settings },
  server: { label: "Servidor", color: "text-indigo-400", icon: Settings },
  ticket: { label: "Tickets", color: "text-cyan-400", icon: BookOpen },
  giveaway: { label: "Sorteos", color: "text-emerald-400", icon: Gift },
};

const LOG_CATEGORIES = [
  { key: "logMembers", label: "Miembros", desc: "Entrada/salida, baneos, kicks", icon: Users },
  { key: "logMessages", label: "Mensajes", desc: "Mensajes editados y eliminados", icon: MessageSquare },
  { key: "logRoles", label: "Roles", desc: "Creacion, eliminacion y cambios de roles", icon: Settings },
  { key: "logChannels", label: "Canales", desc: "Creacion, eliminacion y cambios de canales", icon: Hash },
  { key: "logModeration", label: "Moderacion", desc: "Baneos, kicks, mutes, timeouts", icon: Shield },
  { key: "logSecurity", label: "Seguridad", desc: "AntiRaid, verificacion, blacklist", icon: Shield },
  { key: "logVerifications", label: "Verificaciones", desc: "Resultados de verificaciones de usuarios", icon: AtSign },
  { key: "logTickets", label: "Tickets", desc: "Apertura y cierre de tickets de soporte", icon: BookOpen },
  { key: "logGiveaways", label: "Sorteos", desc: "Inicio, fin y ganadores de sorteos", icon: Gift },
  { key: "logVoice", label: "Voz", desc: "Entradas/salidas de canales de voz", icon: Volume2 },
  { key: "logNicknames", label: "Apodos", desc: "Cambios de apodo y actualizaciones de roles", icon: Mic },
  { key: "logInvites", label: "Invitaciones", desc: "Creacion y uso de invitaciones", icon: FileText },
];

const CHANNEL_OVERRIDES = [
  { key: "memberChannelId", label: "Canal — Miembros", category: "logMembers" },
  { key: "messageChannelId", label: "Canal — Mensajes", category: "logMessages" },
  { key: "roleChannelId", label: "Canal — Roles", category: "logRoles" },
  { key: "channelLogsChannelId", label: "Canal — Canales", category: "logChannels" },
  { key: "moderationChannelId", label: "Canal — Moderacion", category: "logModeration" },
  { key: "securityChannelId", label: "Canal — Seguridad", category: "logSecurity" },
  { key: "ticketChannelId", label: "Canal — Tickets", category: "logTickets" },
  { key: "verificationChannelId", label: "Canal — Verificaciones", category: "logVerifications" },
  { key: "giveawayChannelId", label: "Canal — Sorteos", category: "logGiveaways" },
];

export default function LogsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"config" | "logs">("logs");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: logsConfig } = useGetLogsConfig(guildId, { query: { queryKey: getGetLogsConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const { data: logs, isLoading, refetch } = useGetGuildLogs(guildId, { query: { queryKey: getGetGuildLogsQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const update = useUpdateLogsConfig();
  const [cfg, setCfg] = useState<any>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    if (logsConfig && !isMounted.current) {
      setCfg(logsConfig);
      isMounted.current = true;
    }
  }, [logsConfig]);

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Logs guardados" }); qc.invalidateQueries({ queryKey: getGetLogsConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const allLogs = Array.isArray(logs) ? (logs as any[]) : [];
  const filteredLogs = allLogs.filter((log) => {
    if (filterCategory !== "all" && log.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (log.action ?? "").toLowerCase().includes(q)
        || (log.username ?? "").toLowerCase().includes(q)
        || (log.details ?? "").toLowerCase().includes(q)
        || (log.targetName ?? "").toLowerCase().includes(q)
        || (log.channelName ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const enabledCount = cfg ? LOG_CATEGORIES.filter(({ key }) => cfg[key]).length : 0;
  const uniqueCategories = [...new Set(allLogs.map((l) => l.category as string))].filter(Boolean);

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Logs del Servidor</h1>
          <p className="text-muted-foreground text-sm">Registra toda la actividad del servidor con canales especializados por categoria.</p>
        </div>
        {tab === "config" && cfg && <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-logs">Guardar</Button>}
        {tab === "logs" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="w-3.5 h-3.5" />
              Filtros
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit mb-6">
        {(["logs", "config"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`tab-${t}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "logs" ? "Ver Logs" : "Configuracion"}
          </button>
        ))}
      </div>

      {tab === "logs" && (
        <div className="space-y-4">
          {/* Filters panel */}
          {showFilters && (
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-48">
                  <Label className="text-xs mb-1.5 block text-muted-foreground">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Usuario, accion, canal..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">Categoria</Label>
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => setFilterCategory("all")}
                      className={cn("px-3 py-1 rounded-full text-xs font-medium transition-all border", filterCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                      Todas
                    </button>
                    {uniqueCategories.map((cat) => {
                      const meta = CATEGORY_META[cat];
                      return (
                        <button key={cat} onClick={() => setFilterCategory(cat)}
                          className={cn("px-3 py-1 rounded-full text-xs font-medium transition-all border", filterCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                          {meta?.label ?? cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {(filterCategory !== "all" || searchQuery) && (
                <p className="text-xs text-muted-foreground">
                  Mostrando {filteredLogs.length} de {allLogs.length} registros
                  <button onClick={() => { setFilterCategory("all"); setSearchQuery(""); }} className="ml-2 text-primary hover:underline">Limpiar filtros</button>
                </p>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : !filteredLogs.length ? (
            <div className="text-center py-16 bg-card rounded-xl border border-card-border">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">{allLogs.length ? "Sin resultados" : "Sin registros"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {allLogs.length
                  ? "Prueba ajustando los filtros."
                  : "Los logs apareceran aqui cuando el bot registre actividad en el servidor."}
              </p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-5 py-2.5 border-b border-border bg-secondary/50">
                <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                <span className="text-xs font-medium text-muted-foreground">Detalle</span>
                <span className="text-xs font-medium text-muted-foreground">Usuario</span>
                <span className="text-xs font-medium text-muted-foreground">Fecha</span>
              </div>
              {filteredLogs.slice(0, 200).map((log) => {
                const meta = CATEGORY_META[log.category];
                const Icon = meta?.icon ?? Settings;
                const label = ACTION_LABELS[log.action] ?? log.action;
                return (
                  <div key={log.id} data-testid={`log-row-${log.id}`}
                    className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-5 py-3 hover:bg-secondary/40 transition-colors border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2 w-36">
                      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", meta?.color ?? "text-muted-foreground")} />
                      <div>
                        <span className="text-xs font-medium leading-tight block">{label}</span>
                        {log.category && <span className="text-[10px] text-muted-foreground">{meta?.label ?? log.category}</span>}
                      </div>
                    </div>
                    <div className="min-w-0">
                      {(log.targetName || log.channelName) && (
                        <span className="text-xs font-medium mr-2 text-foreground/80">
                          {log.targetName || log.channelName}
                        </span>
                      )}
                      {log.details && <span className="text-xs text-muted-foreground truncate block max-w-xs">{log.details}</span>}
                      {log.reason && <span className="text-xs text-muted-foreground italic">Razon: {log.reason}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {log.username && <span className="font-mono text-foreground/70">{log.username}</span>}
                      {log.moderatorName && <span className="ml-1 text-muted-foreground/60">por {log.moderatorName}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              {filteredLogs.length > 200 && (
                <div className="px-5 py-3 text-xs text-muted-foreground text-center border-t border-border bg-secondary/30">
                  Mostrando los 200 registros mas recientes de {filteredLogs.length} totales.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "config" && cfg && (
        <div className="max-w-3xl space-y-5">
          {/* General */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">Logs activos</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Activa el sistema de registro de actividad del servidor.</p>
              </div>
              <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-logs-enabled" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Canal de logs principal</Label>
              <GuildChannelSelect
                guildId={guildId}
                value={cfg.channelId || ""}
                onChange={set("channelId")}
                placeholder="Canal para todos los logs (fallback)..."
                types={[0, 5]}
              />
              <p className="text-xs text-muted-foreground mt-1">Este canal se usa cuando no hay un canal especifico para la categoria.</p>
            </div>
          </div>

          {/* Category toggles */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Categorias de logs</h3>
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{enabledCount}/{LOG_CATEGORIES.length} activas</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {LOG_CATEGORIES.map(({ key, label, desc, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/50">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <Label className="text-sm cursor-pointer">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Switch checked={cfg[key] ?? false} onCheckedChange={set(key)} data-testid={`toggle-${key}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Per-category channels */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div>
              <h3 className="font-semibold text-sm">Canales por categoria</h3>
              <p className="text-xs text-muted-foreground mt-1">Opcional: envia cada categoria a un canal diferente. Si se deja vacio, se usa el canal principal.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CHANNEL_OVERRIDES.map(({ key, label, category }) => (
                <div key={key} className={!cfg[category] ? "opacity-50 pointer-events-none" : ""}>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">{label}</Label>
                  <GuildChannelSelect
                    guildId={guildId}
                    value={cfg[key] || ""}
                    onChange={(v) => set(key)(v || null)}
                    placeholder={!cfg[category] ? "Categoria desactivada" : "Seleccionar canal..."}
                    types={[0, 5]}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
