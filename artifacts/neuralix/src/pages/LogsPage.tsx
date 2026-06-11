import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { FileText, Shield, Users, MessageSquare, Settings, Mic, Star, Volume2, Hash, AtSign, BookOpen } from "lucide-react";
import { useGetLogsConfig, useUpdateLogsConfig, useGetGuildLogs, getGetLogsConfigQueryKey, getGetGuildLogsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const categoryIcon = (cat: string) => {
  if (cat === "moderation") return <Shield className="w-4 h-4 text-red-400" />;
  if (cat === "member") return <Users className="w-4 h-4 text-blue-400" />;
  if (cat === "message") return <MessageSquare className="w-4 h-4 text-green-400" />;
  if (cat === "security") return <Shield className="w-4 h-4 text-orange-400" />;
  return <Settings className="w-4 h-4 text-muted-foreground" />;
};

const LOG_CATEGORIES = [
  { key: "logMembers", label: "Miembros", desc: "Entrada/salida, baneos, kicks", icon: Users },
  { key: "logMessages", label: "Mensajes", desc: "Mensajes editados y eliminados", icon: MessageSquare },
  { key: "logRoles", label: "Roles", desc: "Creacion, eliminacion y cambios de roles", icon: Star },
  { key: "logChannels", label: "Canales", desc: "Creacion, eliminacion y cambios de canales", icon: Hash },
  { key: "logModeration", label: "Moderacion", desc: "Baneos, kicks, mutes, timeouts", icon: Shield },
  { key: "logSecurity", label: "Seguridad", desc: "AntiRaid, verificacion, blacklist", icon: Shield },
  { key: "logVerifications", label: "Verificaciones", desc: "Resultados de verificaciones de usuarios", icon: AtSign },
  { key: "logTickets", label: "Tickets", desc: "Apertura y cierre de tickets de soporte", icon: BookOpen },
  { key: "logGiveaways", label: "Sorteos", desc: "Inicio, fin y ganadores de sorteos", icon: Star },
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
];

export default function LogsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"config" | "logs">("logs");

  const { data: logsConfig } = useGetLogsConfig(guildId, { query: { queryKey: getGetLogsConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const { data: logs, isLoading } = useGetGuildLogs(guildId, { query: { queryKey: getGetGuildLogsQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
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

  const enabledCount = cfg ? LOG_CATEGORIES.filter(({ key }) => cfg[key]).length : 0;

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Logs del Servidor</h1>
          <p className="text-muted-foreground text-sm">Registra toda la actividad del servidor con canales especializados por categoria.</p>
        </div>
        {tab === "config" && cfg && <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-logs">Guardar</Button>}
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
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : !Array.isArray(logs) || !logs.length ? (
            <div className="text-center py-16 bg-card rounded-xl border border-card-border">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">Sin registros</p>
              <p className="text-sm text-muted-foreground mt-1">Los logs apareceran aqui cuando el bot registre actividad.</p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl divide-y divide-border overflow-hidden">
              {(logs as any[]).map((log) => (
                <div key={log.id} data-testid={`log-row-${log.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors">
                  {categoryIcon(log.category)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{log.action}</p>
                    {log.username && <p className="text-xs text-muted-foreground">Usuario: {log.username}</p>}
                    {log.details && <p className="text-xs text-muted-foreground truncate">{log.details}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(log.createdAt).toLocaleString("es")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "config" && cfg && (
        <div className="max-w-3xl space-y-5">
          {/* General */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Logs activos</Label>
              <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-logs-enabled" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Canal de logs principal (ID)</Label>
              <Input placeholder="Canal para todos los logs (fallback)" value={cfg.channelId || ""} onChange={(e) => set("channelId")(e.target.value)} data-testid="input-logs-channel" />
              <p className="text-xs text-muted-foreground mt-1">Este canal se usa cuando no hay un canal especifico para la categoria.</p>
            </div>
          </div>

          {/* Category toggles */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Categorias de logs</h3>
              <span className="text-xs text-muted-foreground">{enabledCount}/{LOG_CATEGORIES.length} activas</span>
            </div>
            {LOG_CATEGORIES.map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <Label className="text-sm">{label}</Label>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch checked={cfg[key] ?? false} onCheckedChange={set(key)} data-testid={`toggle-${key}`} />
              </div>
            ))}
          </div>

          {/* Per-category channels */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div>
              <h3 className="font-semibold text-sm">Canales por categoria</h3>
              <p className="text-xs text-muted-foreground mt-1">Opcional: envia cada categoria a un canal diferente. Si se deja vacio, se usa el canal principal.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CHANNEL_OVERRIDES.map(({ key, label, category }) => (
                <div key={key}>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">{label}</Label>
                  <Input
                    placeholder={`ID del canal${!cfg[category] ? " (categoria desactivada)" : ""}`}
                    value={cfg[key] || ""}
                    onChange={(e) => set(key)(e.target.value || null)}
                    disabled={!cfg[category]}
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
