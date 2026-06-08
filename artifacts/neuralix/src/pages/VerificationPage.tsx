import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { useGetVerificationConfig, useUpdateVerificationConfig, getGetVerificationConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import ToggleModule from "@/components/ToggleModule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { VariablesModal, VERIFICATION_VARIABLES } from "@/components/VariablesModal";

export default function VerificationPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading, isError } = useGetVerificationConfig(guildId, { query: { queryKey: getGetVerificationConfigQueryKey(guildId), enabled: !!guildId } });
  const update = useUpdateVerificationConfig();
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => { if (config) setCfg(config); }, [config]);

  if (isLoading || (!cfg && !isError)) return (
    <Layout guildId={guildId}><div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></Layout>
  );

  if (isError || !cfg) return (
    <Layout guildId={guildId}>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-muted-foreground text-sm">No se pudo cargar la configuracion de verificacion.<br />Asegurate de que el bot esta en el servidor.</p>
      </div>
    </Layout>
  );

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Verificacion guardada" }); qc.invalidateQueries({ queryKey: getGetVerificationConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Verificacion</h1>
          <p className="text-muted-foreground text-sm">Protege tu servidor con filtros de verificacion avanzados.</p>
        </div>
        <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-verification">Guardar</Button>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Core settings */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-semibold">Verificacion activa</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Los nuevos miembros deben pasar la verificacion para acceder</p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-verification-enabled" />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">ID del rol verificado</Label>
            <Input placeholder="ID del rol que se asignara al verificarse" value={cfg.roleId || ""} onChange={(e) => set("roleId")(e.target.value)} data-testid="input-verification-role" />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Canal de logs de verificacion (ID)</Label>
            <Input placeholder="ID del canal de auditoria" value={cfg.logChannelId || ""} onChange={(e) => set("logChannelId")(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Edad minima de cuenta (dias)</Label>
            <Input type="number" value={cfg.minAccountAge} onChange={(e) => set("minAccountAge")(Number(e.target.value))} className="w-32" data-testid="input-min-age" />
          </div>
        </div>

        {/* Filters */}
        <ToggleModule title="AntiVPN" description="Bloquea usuarios conectados via VPN o proxy" enabled={cfg.antiVpn} onToggle={set("antiVpn")} badge="Recomendado" />
        <ToggleModule title="AntiAlt" description="Bloquea cuentas que parecen ser alternativas (edad < minima)" enabled={cfg.antiAlt} onToggle={set("antiAlt")} badge="Recomendado" />
        <ToggleModule title="AntiBot" description="Bloquea cuentas identificadas como bots no autorizados" enabled={cfg.antiBot} onToggle={set("antiBot")} />

        {/* Custom messages */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <h3 className="font-semibold text-sm">Mensajes personalizados</h3>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">Mensaje al verificarse</Label>
              <VariablesModal variables={VERIFICATION_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, successMessage: (c.successMessage || "") + v }))} />
            </div>
            <Textarea
              placeholder="Bienvenido {user}! Has sido verificado correctamente en {server}."
              value={cfg.successMessage || ""}
              onChange={(e) => set("successMessage")(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">Mensaje al rechazar</Label>
              <VariablesModal variables={VERIFICATION_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, rejectMessage: (c.rejectMessage || "") + v }))} />
            </div>
            <Textarea
              placeholder="Tu cuenta no cumple los requisitos de verificacion de {server}."
              value={cfg.rejectMessage || ""}
              onChange={(e) => set("rejectMessage")(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Portal link — read-only. Manage custom URL from Admin Panel */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm text-primary">Portal de Verificacion</h3>
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">Compartir este enlace</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Comparte este enlace con tus miembros para que se verifiquen. No compartas la URL del panel.</p>
          <div className="flex gap-2">
            <Input readOnly value={cfg.customVerifyUrl || `${window.location.origin}/verify?guild=${guildId}`} className="text-xs font-mono bg-background" />
            <Button size="sm" variant="outline" onClick={() => {
              const link = cfg.customVerifyUrl || `${window.location.origin}/verify?guild=${guildId}`;
              navigator.clipboard.writeText(link);
              toast({ title: "Enlace copiado", description: "Comparte este enlace con tus miembros, no la URL del panel." });
            }}>Copiar</Button>
          </div>
          <p className="text-xs text-amber-400/80 mt-2">
            Para cambiar la URL personalizada del portal, usa el Panel de Administracion.
          </p>
        </div>
      </div>
    </Layout>
  );
}
