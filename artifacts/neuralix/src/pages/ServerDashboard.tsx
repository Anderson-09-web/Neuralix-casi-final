import { useParams, useLocation } from "wouter";
import { Users, Ticket, Shield, ShieldAlert, Database, FileText, ExternalLink, AlertTriangle, Bell, CheckCircle, RefreshCw } from "lucide-react";
import { useGetGuild, useGetGuildStats, useGetGuildBotStatus, useGetAnnouncements, getGetGuildQueryKey, getGetGuildStatsQueryKey, getGetGuildBotStatusQueryKey, getGetAnnouncementsQueryKey } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const POLL_INTERVAL = 30_000; // 30 seconds

export default function ServerDashboard() {
  const { guildId } = useParams<{ guildId: string }>();
  const [, setLocation] = useLocation();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsSince, setSecondsSince] = useState(0);

  const { data: guild, isLoading: guildLoading, refetch: refetchGuild } = useGetGuild(guildId, {
    query: {
      queryKey: getGetGuildQueryKey(guildId),
      enabled: !!guildId,
      staleTime: 0,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const { data: stats, refetch: refetchStats } = useGetGuildStats(guildId, {
    query: {
      queryKey: getGetGuildStatsQueryKey(guildId),
      enabled: !!guildId,
      staleTime: 0,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
      refetchOnMount: true,
    },
  });

  const { data: botStatus, refetch: refetchBot } = useGetGuildBotStatus(guildId, {
    query: {
      queryKey: getGetGuildBotStatusQueryKey(guildId),
      enabled: !!guildId,
      staleTime: 0,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const { data: announcements } = useGetAnnouncements({
    query: { queryKey: getGetAnnouncementsQueryKey(), enabled: true },
  });

  // Track seconds since last update for the live indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsSince(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Update lastUpdated whenever stats change
  useEffect(() => {
    if (stats) setLastUpdated(new Date());
  }, [stats]);

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
      {/* Bot not present banner */}
      {botStatus && !botStatus.present && (
        <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm text-yellow-300">Bot no instalado</p>
              <p className="text-xs text-yellow-300/70">Agrega el bot al servidor para activar todas las funciones.</p>
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

        {/* Live indicator + refresh button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span>
              {secondsSince < 5
                ? "Actualizado"
                : secondsSince < 60
                  ? `Hace ${secondsSince}s`
                  : `Hace ${Math.floor(secondsSince / 60)}m`}
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
        <StatCard
          label="Miembros"
          value={stats?.memberCount?.toLocaleString() ?? "—"}
          icon={<Users className="w-5 h-5" />}
          color="primary"
          trend="Total en el servidor"
        />
        <StatCard
          label="Tickets abiertos"
          value={stats?.openTickets ?? "—"}
          icon={<Ticket className="w-5 h-5" />}
          color="accent"
          trend="Tickets activos"
        />
        <StatCard
          label="Detecciones AntiRaid"
          value={stats?.antiraidDetections ?? "—"}
          icon={<ShieldAlert className="w-5 h-5" />}
          color="red"
          trend="Total detectado"
        />
        <StatCard
          label="Backups"
          value={stats?.backupsCount ?? "—"}
          icon={<Database className="w-5 h-5" />}
          color="green"
          trend="Copias disponibles"
        />
      </div>

      {/* Quick access */}
      <h2 className="text-lg font-bold mb-4">Acceso rapido</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          { href: `/servers/${guildId}/antiraid`, icon: ShieldAlert, label: "AntiRaid", desc: "Configura los 20+ modulos de proteccion", color: "text-primary" },
          { href: `/servers/${guildId}/verification`, icon: Shield, label: "Verificacion", desc: "Filtra alts, bots y VPNs automaticamente", color: "text-accent" },
          { href: `/servers/${guildId}/tickets`, icon: Ticket, label: "Tickets", desc: "Gestiona el sistema de soporte", color: "text-green-400" },
          { href: `/servers/${guildId}/logs`, icon: FileText, label: "Logs", desc: "Revisa el historial de actividad", color: "text-yellow-400" },
          { href: `/servers/${guildId}/backups`, icon: Database, label: "Backups", desc: "Crea y restaura copias de seguridad", color: "text-primary" },
          { href: `/servers/${guildId}/welcome`, icon: Users, label: "Bienvenidas", desc: "Configura mensajes de entrada/salida", color: "text-accent" },
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
              info:    { bg: "bg-blue-500/5",    border: "border-blue-500/20",   badge: "bg-blue-500/20 text-blue-300",   text: "text-blue-300" },
              warning: { bg: "bg-yellow-500/5",  border: "border-yellow-500/20", badge: "bg-yellow-500/20 text-yellow-300", text: "text-yellow-300" },
              success: { bg: "bg-green-500/5",   border: "border-green-500/20",  badge: "bg-green-500/20 text-green-300",  text: "text-green-300" },
              danger:  { bg: "bg-red-500/5",     border: "border-red-500/20",    badge: "bg-red-500/20 text-red-300",      text: "text-red-300" },
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
