import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { useGetWelcomeConfig, useUpdateWelcomeConfig, useTestWelcome, getGetWelcomeConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { VariablesModal, WELCOME_VARIABLES } from "@/components/VariablesModal";

export default function WelcomePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading, isError } = useGetWelcomeConfig(guildId, { query: { queryKey: getGetWelcomeConfigQueryKey(guildId), enabled: !!guildId } });
  const update = useUpdateWelcomeConfig();
  const testWelcome = useTestWelcome();
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => { if (config) setCfg(config); }, [config]);

  if (isLoading || (!cfg && !isError)) return (
    <Layout guildId={guildId}><div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></Layout>
  );

  if (isError || !cfg) return (
    <Layout guildId={guildId}>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-muted-foreground text-sm">No se pudo cargar la configuracion de bienvenidas.<br />Asegurate de que el bot esta en el servidor.</p>
      </div>
    </Layout>
  );

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Bienvenidas guardadas" }); qc.invalidateQueries({ queryKey: getGetWelcomeConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const test = () => {
    testWelcome.mutate({ guildId }, { onSuccess: () => toast({ title: "Mensaje de prueba enviado" }) });
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Sistema de Bienvenidas</h1>
          <p className="text-muted-foreground text-sm">Configura los mensajes de bienvenida para nuevos miembros.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={test} disabled={testWelcome.isPending} data-testid="btn-test-welcome">Probar</Button>
          <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-welcome">Guardar</Button>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* General */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <Label>Activar bienvenidas</Label>
            <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-welcome-enabled" />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Canal de bienvenida (ID)</Label>
            <Input placeholder="ID del canal" value={cfg.channelId || ""} onChange={(e) => set("channelId")(e.target.value)} data-testid="input-welcome-channel" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">Mensaje de bienvenida</Label>
              <VariablesModal variables={WELCOME_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, message: (c.message || "") + v }))} />
            </div>
            <Textarea
              placeholder="Usa {user} para mencionar al miembro, {server} para el nombre del servidor..."
              value={cfg.message || ""}
              onChange={(e) => set("message")(e.target.value)}
              rows={4}
              data-testid="textarea-welcome-message"
            />
          </div>
        </div>

        {/* Embed */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Embed</h3>
            <Switch checked={cfg.embedEnabled} onCheckedChange={set("embedEnabled")} data-testid="toggle-embed" />
          </div>
          {cfg.embedEnabled && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm">Titulo del embed</Label>
                  <VariablesModal variables={WELCOME_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, embedTitle: (c.embedTitle || "") + v }))} />
                </div>
                <Input placeholder="Bienvenido al servidor!" value={cfg.embedTitle || ""} onChange={(e) => set("embedTitle")(e.target.value)} data-testid="input-embed-title" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm">Descripcion del embed</Label>
                  <VariablesModal variables={WELCOME_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, embedDescription: (c.embedDescription || "") + v }))} />
                </div>
                <Textarea placeholder="Hola {user}, bienvenido a {server}!" value={cfg.embedDescription || ""} onChange={(e) => set("embedDescription")(e.target.value)} rows={3} data-testid="textarea-embed-desc" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Color (hex)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="#5865F2" value={cfg.embedColor || ""} onChange={(e) => set("embedColor")(e.target.value)} data-testid="input-embed-color" />
                    {cfg.embedColor && <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.embedColor }} />}
                  </div>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Footer</Label>
                  <Input placeholder="Neuralix Enterprise" value={cfg.embedFooter || ""} onChange={(e) => set("embedFooter")(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Imagen (URL)</Label>
                <Input placeholder="https://..." value={cfg.embedImage || ""} onChange={(e) => set("embedImage")(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* DM */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Mensaje privado (DM)</h3>
            <Switch checked={cfg.dmEnabled} onCheckedChange={set("dmEnabled")} data-testid="toggle-dm" />
          </div>
          {cfg.dmEnabled && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm">Mensaje DM</Label>
                <VariablesModal variables={WELCOME_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, dmMessage: (c.dmMessage || "") + v }))} />
              </div>
              <Textarea placeholder="Bienvenido a {server}! Por favor lee las reglas..." value={cfg.dmMessage || ""} onChange={(e) => set("dmMessage")(e.target.value)} rows={3} data-testid="textarea-dm-message" />
            </div>
          )}
        </div>

        {/* AutoRoles */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-sm">AutoRoles</h3>
          <p className="text-xs text-muted-foreground">IDs de roles separados por coma que se asignaran automaticamente al unirse.</p>
          <Input
            placeholder="111222333, 444555666"
            value={Array.isArray(cfg.autoRoleIds) ? cfg.autoRoleIds.join(", ") : (cfg.autoRoleIds || "")}
            onChange={(e) => set("autoRoleIds")(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
            data-testid="input-autoroles"
          />
        </div>
      </div>
    </Layout>
  );
}
