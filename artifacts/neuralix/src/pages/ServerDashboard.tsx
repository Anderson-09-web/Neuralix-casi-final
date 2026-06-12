import { useParams, useLocation } from "wouter";
import { Users, Ticket, Shield, ShieldAlert, Database, FileText, ExternalLink, AlertTriangle, Bell, CheckCircle, RefreshCw, Cpu, Wifi, WifiOff, Gift, MessageSquareWarning, Zap, Ban, Lock } from "lucide-react";
import { useGetGuild, useGetGuildStats, useGetGuildBotStatus, useGetAnnouncements, getGetGuildQueryKey, getGetGuildStatsQueryKey, getGetGuildBotStatusQueryKey, getGetAnnouncementsQueryKey } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const POLL_INTERVAL = 30_000;
const STATUS_POLL   = 15_000;

interface BotGlobalStatus {
  online: boolean;
  ping: number | null;
  tag: string | null;
  guilds: number;
  users: number;
  memoryMb: number;
  uptimeSec: number;
  dbStatus: "ok" | "error";
}

function useBotGlobalStatus() {
  return useQuery<BotGlobalStatus>({
    queryKey: ["bot-global-status"],
    queryFn: async () => {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Error al obtener estado");
      return res.json();
    },
    refetchInterval: STATUS_POLL,
    staleTime: 0,
  });
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", ok ? "bg-green-400" : "bg-red-400")} />
      <span className={cn("relative inline-flex rounded-full h-2 w-2", ok ? "bg-green-500" : "bg-red-500")} />
    </span>
  );
}

function SecurityGlobalCard({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [localAction, setLocalAction] = useState("ban");

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/blacklist-config`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setConfig(d); setLocalAction(d.blacklistAction || "ban"); } })
      .catch(() => {});
  }, [guildId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/blacklist-config`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blacklistAction: localAction }),
      });
      if (res.ok) {
        setConfig((c: any) => ({ ...c, blacklistAction: localAction }));
        toast({ title: "Configuracion de seguridad guardada" });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error || "Error al guardar configuracion", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red al guardar", variant: "destructive" });
    }
    setSaving(false);
  };

  const actionLabels: Record<string, { label: string; color: string }> = {
    ban: { label: "Ban permanente", color: "text-red-400" },
    kick: { label: "Kick del servidor", color: "text-orange-400" },
    timeout: { label: "Timeout (1h)", color: "text-yellow-400" },
    none: { label: "Solo registrar", color: "text-muted-foreground" },
  };
  const current = actionLabels[localAction] || actionLabels.ban;

  return (
    <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <Ban className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-sm flex items-center gap-2">
              Seguridad Global — Blacklist
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium bg-secondary", current.color)}>{current.label}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Accion al detectar un usuario en la blacklist global de Neuralix
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={localAction}
            onChange={(e) => setLocalAction(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-6 cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
          >
            <option value="ban">Ban permanente</option>
            <option value="kick">Kick</option>
            <option value="timeout">Timeout 1h</option>
            <option value="none">Solo registrar</option>
          </select>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={save} disabled={saving || localAction === config?.blacklistAction}>
            {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
            <span>Guardar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ServerDashboard() {
  const { guildId } = useParams<{ guildId: string }>();
  const [, setLocation] = useLocation();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsSince, setSecondsSince] = useState(0);

  const { data: guild, isLoading: guildLoading, refetch: refetchGuild } = useGetGuild(guildId, {
    query: { queryKey: getGetGuildQueryKey(guildId), enabled: !!guildId, staleTime: 0, refetchInterval: POLL_INTERVAL, refetchIntervalInBackground: false },
  });

  const { data: stats, refetch: refetchStats } = useGetGuildStats(guildId, {
    query: { queryKey: getGetGuildStatsQueryKey(guildId), enabled: !!guildId, staleTime: 0, refetchInterval: POLL_INTERVAL, refetchIntervalInBackground: false, refetchOnMount: true },
  });

  const { data: botStatus, refetch: refetchBot } = useGetGuildBotStatus(guildId, {
    query: { queryKey: getGetGuildBotStatusQueryKey(guildId), enabled: !!guildId, staleTime: 0, refetchInterval: POLL_INTERVAL, refetchIntervalInBackground: false },
  });

  const { data: announcements } = useGetAnnouncements({
    query: { queryKey: getGetAnnouncementsQueryKey(), enabled: true },
  });

  const { data: globalStatus } = useBotGlobalStatus();

  useEffect(() => {
    const interval = setInterval(() => setSecondsSince(Math.floor((Date.now() - lastUpdated.getTime()) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  useEffect(() => { if (stats) setLastUpdated(new Date()); }, [stats]);

  function handleManualRefresh() {
    setLastUpdated(new Date());
    refetchGuild();
    refetchStats();
    refetchBot();
  }

  if (guildLoading && !guild) return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </Layout>
  );

  return (
    <Layout guildId={guildId} guildName={guild?.name} guildIcon={guild?.icon}>

      {/* ── Global Bot Status Bar ─────────────────────────────────────────── */}
      <div className={cn(
        "mb-5 rounded-xl border p-3 flex items-center gap-4 flex-wrap text-xs",
        globalStatus?.online
          ? "bg-green-500/5 border-green-500/20"
          : "bg-red-500/5 border-red-500/20",
      )}>
        <div className="flex items-center gap-2 font-semibold">
          <StatusDot ok={globalStatus?.online ?? false} />
          <span className={globalStatus?.online ? "text-green-400" : "text-red-400"}>
            {globalStatus?.online ? "Bot Online" : "Bot Offline"}
          </span>
          {globalStatus?.tag && <span className="text-muted-foreground font-normal">({globalStatus.tag})</span>}
        </div>
        {globalStatus?.online && (
          <>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wifi className="w-3 h-3" />
              <span>{globalStatus.ping ?? "—"} ms</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="w-3 h-3" />
              <span>{globalStatus.guilds} servidores</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3 h-3" />
              <span>{globalStatus.users?.toLocaleString()} usuarios</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Cpu className="w-3 h-3" />
              <span>{globalStatus.memoryMb} MB</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span>Uptime: {formatUptime(globalStatus.uptimeSec)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot ok={globalStatus.dbStatus === "ok"} />
              <span className={globalStatus.dbStatus === "ok" ? "text-green-400" : "text-red-400"}>
                DB {globalStatus.dbStatus === "ok" ? "OK" : "Error"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Bot not present banner */}
      {botStatus && !botStatus.present && (
        <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm text-yellow-300">Bot no instalado en este servidor</p>
              <p className="text-xs text-yellow-300/70">Agrega el bot para activar todas las funciones.</p>
            </div>
          </div>
          <a href={botStatus.addBotUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold">
              <ExternalLink className="w-4 h-4" />
              <span>Agregar Bot</span>
            </Button>
          </a>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {guild?.icon ? (
            <img src={`https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png`} className="w-12 h-12 md:w-16 md:h-16 rounded-full flex-shrink-0" alt={guild.name} />
          ) : (
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xl md:text-2xl font-black text-primary">{guild?.name?.[0]}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black truncate">{guild?.name || guildId}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Panel de control del servidor</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span>
              {secondsSince < 5 ? "Actualizado" : secondsSince < 60 ? `Hace ${secondsSince}s` : `Hace ${Math.floor(secondsSince / 60)}m`}
            </span>
          </div>
          <button
            onClick={handleManualRefresh}
            className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
            title="Actualizar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard label="Miembros" value={stats?.memberCount?.toLocaleString() ?? "—"} icon={<Users className="w-5 h-5" />} color="primary" trend="Total en el servidor" />
        <StatCard label="Tickets abiertos" value={stats?.openTickets ?? "—"} icon={<Ticket className="w-5 h-5" />} color="accent" trend="Tickets activos" />
        <StatCard label="Detecciones AntiRaid" value={stats?.antiraidDetections ?? "—"} icon={<ShieldAlert className="w-5 h-5" />} color="red" trend="Total detectado" />
        <StatCard label="Backups" value={stats?.backupsCount ?? "—"} icon={<Database className="w-5 h-5" />} color="green" trend="Copias disponibles" />
      </div>

      {/* Seguridad Global */}
      <SecurityGlobalCard guildId={guildId} />

      {/* Quick access */}
      <h2 className="text-lg font-bold mb-4">Acceso rapido</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          { href: `/servers/${guildId}/antiraid`,      icon: ShieldAlert,          label: "AntiRaid",       desc: "20+ modulos de proteccion avanzada",        color: "text-primary" },
          { href: `/servers/${guildId}/verification`,  icon: Shield,               label: "Verificacion",   desc: "Filtra alts, bots y VPNs",                  color: "text-accent" },
          { href: `/servers/${guildId}/tickets`,       icon: Ticket,               label: "Tickets",        desc: "Sistema de soporte configurable",            color: "text-green-400" },
          { href: `/servers/${guildId}/logs`,          icon: FileText,             label: "Logs",           desc: "Historial completo de actividad",            color: "text-yellow-400" },
          { href: `/servers/${guildId}/backups`,       icon: Database,             label: "Backups",        desc: "Crea y restaura copias de seguridad",        color: "text-primary" },
          { href: `/servers/${guildId}/welcome`,       icon: Users,                label: "Bienvenidas",    desc: "Mensajes de entrada y salida",               color: "text-accent" },
        ].map(({ href, icon: Icon, label, desc, color }) => (
          <button key={href} onClick={() => setLocation(href)}
            className="p-5 rounded-xl bg-card border border-card-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left group">
            <Icon className={`w-6 h-6 mb-3 ${color} transition-transform group-hover:scale-110`} />
            <h3 className="font-semibold text-sm mb-1">{label}</h3>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>

      {/* Announcements */}
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Bell className="w-5 h-5 text-accent" />
        Anuncios de Neuralix
      </h2>
      {(!announcements || announcements.length === 0) ? (
        <div className="rounded-xl bg-card border border-card-border p-8 text-center text-muted-foreground text-sm">
          No hay anuncios en este momento.
        </div>
      ) : (
        <div className="space-y-3">
          {(announcements as any[]).filter((a: any) => a.published).map((ann: any) => {
            const typeStyles: Record<string, { bg: string; border: string; badge: string; text: string }> = {
              info:    { bg: "bg-blue-500/5",   border: "border-blue-500/20",   badge: "bg-blue-500/20 text-blue-300",    text: "text-blue-300" },
              warning: { bg: "bg-yellow-500/5", border: "border-yellow-500/20", badge: "bg-yellow-500/20 text-yellow-300", text: "text-yellow-300" },
              success: { bg: "bg-green-500/5",  border: "border-green-500/20",  badge: "bg-green-500/20 text-green-300",  text: "text-green-300" },
              danger:  { bg: "bg-red-500/5",    border: "border-red-500/20",    badge: "bg-red-500/20 text-red-300",      text: "text-red-300" },
            };
            const s = typeStyles[ann.type] ?? typeStyles.info;
            return (
              <div key={ann.id} className={cn("rounded-xl border p-4 flex gap-3", s.bg, s.border)}>
                <CheckCircle className={cn("w-5 h-5 mt-0.5 flex-shrink-0", s.text)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{ann.title}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", s.badge)}>{ann.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{ann.content}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {new Date(ann.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
