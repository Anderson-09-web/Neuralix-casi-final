import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { FileText, Shield, Users, MessageSquare, Settings } from "lucide-react";
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
  return <Settings className="w-4 h-4 text-muted-foreground" />;
};

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
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Logs del Servidor</h1>
          <p className="text-muted-foreground text-sm">Revisa y configura el historial de actividad.</p>
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
              {logs.map((log) => (
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
        <div className="max-w-2xl space-y-5">
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Logs activos</Label>
              <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-logs-enabled" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Canal de logs (ID)</Label>
              <Input placeholder="ID del canal" value={cfg.channelId || ""} onChange={(e) => set("channelId")(e.target.value)} data-testid="input-logs-channel" />
            </div>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-sm">Categorias de logs</h3>
            {[
              { key: "logMembers", label: "Miembros (entrada/salida/baneo)" },
              { key: "logMessages", label: "Mensajes (editados/eliminados)" },
              { key: "logRoles", label: "Roles (creacion/eliminacion/cambios)" },
              { key: "logChannels", label: "Canales (creacion/eliminacion/cambios)" },
              { key: "logModeration", label: "Moderacion (baneos, kicks, mutes)" },
              { key: "logSecurity", label: "Seguridad (AntiRaid, verificacion)" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-sm">{label}</Label>
                <Switch checked={cfg[key]} onCheckedChange={set(key)} data-testid={`toggle-${key}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
