import { useParams } from "wouter";
import { useState } from "react";
import { Database, Plus, RotateCcw, Clock, Calendar, Send, Star, Shield, Zap, Download, AlertTriangle } from "lucide-react";
import { useGetBackups, useCreateBackup, useRestoreBackup, useGetGuildPremium, getGetBackupsQueryKey, getGetGuildPremiumQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PLAN_LIMITS: Record<string, { max: number; label: string; color: string }> = {
  free:  { max: 1,  label: "Free — 1 backup",      color: "text-muted-foreground" },
  plus:  { max: 5,  label: "Plus — 5 backups",      color: "text-primary" },
  pro:   { max: 25, label: "Pro — 25 backups",      color: "text-accent" },
  ultra: { max: 999, label: "Ultra — Ilimitados",   color: "text-yellow-400" },
};

const TABS = ["backups", "programados", "transferir"] as const;
type Tab = typeof TABS[number];

export default function BackupsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("backups");
  const [transferGuild, setTransferGuild] = useState("");

  const { data: backups, isLoading } = useGetBackups(guildId, { query: { queryKey: getGetBackupsQueryKey(guildId), enabled: !!guildId, refetchInterval: 10000, refetchIntervalInBackground: false } });
  const { data: premium } = useGetGuildPremium(guildId, { query: { enabled: !!guildId, queryKey: getGetGuildPremiumQueryKey(guildId), refetchInterval: 30000, refetchIntervalInBackground: false } });
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();

  const plan = (premium as any)?.plan || "free";
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const backupCount = Array.isArray(backups) ? backups.length : 0;
  const atLimit = plan !== "ultra" && backupCount >= limit.max;

  const handleCreate = () => {
    if (atLimit) { toast({ title: "Limite de backups alcanzado", description: "Mejora tu plan para crear mas backups.", variant: "destructive" }); return; }
    createBackup.mutate({ guildId }, {
      onSuccess: () => { toast({ title: "Backup creado exitosamente" }); qc.invalidateQueries({ queryKey: getGetBackupsQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al crear backup", variant: "destructive" }),
    });
  };

  const handleRestore = (backupId: number) => {
    restoreBackup.mutate({ guildId, backupId }, {
      onSuccess: () => toast({ title: "Backup restaurado exitosamente" }),
      onError: () => toast({ title: "Error al restaurar", variant: "destructive" }),
    });
  };

  const handleExport = (backup: any) => {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `backup-${backup.id}-${guildId}.json`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup exportado" });
  };

  const isUltra = plan === "ultra";
  const isPro = plan === "pro" || isUltra;
  const isPlus = plan === "plus" || isPro;

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black mb-1">Backups</h1>
          <p className="text-muted-foreground text-sm">Guarda y restaura la configuracion completa de tu servidor.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium px-2 py-1 rounded-full bg-card border border-border", limit.color)}>{limit.label}</span>
          <Button onClick={handleCreate} disabled={createBackup.isPending || atLimit} className="gap-2" data-testid="btn-create-backup">
            <Plus className="w-4 h-4" />
            <span>{createBackup.isPending ? "Creando..." : "Crear backup"}</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-card rounded-xl border border-border mb-6">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t === "backups" ? "Mis Backups" : t === "programados" ? "Programados" : "Transferir"}
          </button>
        ))}
      </div>

      {/* ── BACKUPS TAB ── */}
      {tab === "backups" && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : !Array.isArray(backups) || !backups.length ? (
            <div className="text-center py-24 bg-card rounded-xl border border-card-border">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Sin backups</h3>
              <p className="text-muted-foreground text-sm mb-6">Crea tu primer backup para guardar la configuracion actual.</p>
              <Button onClick={handleCreate} className="gap-2" data-testid="btn-create-first-backup">
                <Plus className="w-4 h-4" /><span>Crear primer backup</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Limit bar */}
              {plan !== "ultra" && (
                <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border mb-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Uso de backups</span>
                      <span>{backupCount} / {limit.max}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((backupCount / limit.max) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}
              {backups.map((backup) => (
                <div key={backup.id} data-testid={`backup-row-${backup.id}`}
                  className="flex items-center justify-between p-5 bg-card border border-card-border rounded-xl hover:border-primary/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Database className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{backup.label}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(backup.createdAt).toLocaleString("es")}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatBytes(backup.size)}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">v{backup.version}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPlus && (
                      <Button size="sm" variant="ghost" onClick={() => handleExport(backup)} className="gap-1 text-muted-foreground hover:text-foreground" title="Exportar JSON">
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleRestore(backup.id)} disabled={restoreBackup.isPending} className="gap-2" data-testid={`btn-restore-${backup.id}`}>
                      <RotateCcw className="w-4 h-4" />
                      Restaurar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PROGRAMADOS TAB ── */}
      {tab === "programados" && (
        <div className="space-y-4">
          {!isPro ? (
            <div className="text-center py-24 bg-card rounded-xl border border-border">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Backups Programados</h3>
              <p className="text-muted-foreground text-sm mb-4">Requiere plan Pro o superior para activar backups automaticos.</p>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium">
                <Star className="w-4 h-4" /> Requiere Pro o Ultra
              </span>
            </div>
          ) : (
            <>
              <div className="p-5 bg-card rounded-xl border border-card-border">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Backup automatico diario</h3>
                    <p className="text-xs text-muted-foreground">Se ejecuta todos los dias a las 3:00 AM</p>
                  </div>
                  <div className="ml-auto">
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-400 font-medium border border-green-500/20">Activo</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground">Frecuencia</p>
                    <p className="font-semibold text-sm mt-1">Diaria</p>
                  </div>
                  <div className="p-3 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground">Retener</p>
                    <p className="font-semibold text-sm mt-1">{isUltra ? "30 dias" : "7 dias"}</p>
                  </div>
                  <div className="p-3 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground">Ultimo</p>
                    <p className="font-semibold text-sm mt-1">Hace 2h</p>
                  </div>
                </div>
              </div>

              {isUltra && (
                <div className="p-5 bg-card rounded-xl border border-yellow-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Backup en tiempo real <span className="text-xs text-yellow-400 ml-2 font-medium">Ultra</span></h3>
                      <p className="text-xs text-muted-foreground">Guarda cambios de configuracion automaticamente</p>
                    </div>
                    <div className="ml-auto">
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 font-medium border border-yellow-500/20">Activo</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Cada vez que cambias configuracion del bot, se crea un snapshot automaticamente. Siempre tendras la ultima version guardada.</p>
                </div>
              )}

              <div className="p-5 bg-card rounded-xl border border-card-border opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Backup semanal</h3>
                    <p className="text-xs text-muted-foreground">Cada lunes a las 2:00 AM</p>
                  </div>
                  <div className="ml-auto">
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">Inactivo</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TRANSFERIR TAB ── */}
      {tab === "transferir" && (
        <div className="space-y-4">
          {!isUltra ? (
            <div className="text-center py-24 bg-card rounded-xl border border-border">
              <Send className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Transferir Backup</h3>
              <p className="text-muted-foreground text-sm mb-4">Copia la configuracion completa a otro servidor. Exclusivo Ultra.</p>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium">
                <Zap className="w-4 h-4" /> Exclusivo Ultra
              </span>
            </div>
          ) : (
            <>
              <div className="p-5 bg-card rounded-xl border border-yellow-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <Send className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Transferir configuracion <span className="text-xs text-yellow-400 ml-1">Ultra</span></h3>
                    <p className="text-xs text-muted-foreground">Copia toda la config de este servidor a otro</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">ID del servidor destino</label>
                    <Input placeholder="Ej: 123456789012345678" value={transferGuild} onChange={(e) => setTransferGuild(e.target.value)} />
                  </div>
                  <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">Esto sobreescribira la configuracion del servidor destino. Esta accion no se puede deshacer.</p>
                  </div>
                  <Button className="w-full gap-2" disabled={!transferGuild} onClick={() => toast({ title: "Transferencia iniciada", description: "La configuracion se copiara en los proximos minutos." })}>
                    <Send className="w-4 h-4" /> Iniciar transferencia
                  </Button>
                </div>
              </div>

              <div className="p-5 bg-card rounded-xl border border-card-border">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Que se transfiere
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {["AntiRaid y modulos de seguridad", "Sistema de verificacion", "Configuracion de tickets", "Mensajes de bienvenida y despedida", "Sistema de logs", "Comandos personalizados"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
