import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useGetGoodbyeConfig, useUpdateGoodbyeConfig, useTestGoodbye, getGetGoodbyeConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { VariablesModal, GOODBYE_VARIABLES } from "@/components/VariablesModal";

export default function GoodbyePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading, isError } = useGetGoodbyeConfig(guildId, { query: { queryKey: getGetGoodbyeConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const update = useUpdateGoodbyeConfig();
  const testGoodbye = useTestGoodbye();
  const [cfg, setCfg] = useState<any>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    if (config && !isMounted.current) {
      setCfg(config);
      isMounted.current = true;
    }
  }, [config]);

  if (isLoading || (!cfg && !isError)) return (
    <Layout guildId={guildId}><div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></Layout>
  );

  if (isError || !cfg) return (
    <Layout guildId={guildId}>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-muted-foreground text-sm">No se pudo cargar la configuracion de despedidas.<br />Asegurate de que el bot esta en el servidor.</p>
      </div>
    </Layout>
  );

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Despedidas guardadas" }); qc.invalidateQueries({ queryKey: getGetGoodbyeConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Sistema de Despedidas</h1>
          <p className="text-muted-foreground text-sm">Configura los mensajes cuando un miembro abandona el servidor.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={() => testGoodbye.mutate({ guildId }, {
            onSuccess: (data: any) => {
              if (data?.ok === false) toast({ title: data.error || "Error al enviar", description: data.hint, variant: "destructive" });
              else toast({ title: "Mensaje de despedida enviado al canal" });
            },
            onError: (err: any) => toast({ title: err?.data?.error || "Error al enviar", variant: "destructive" }),
          })} disabled={testGoodbye.isPending} data-testid="btn-test-goodbye">
            <span className="flex items-center gap-1.5">
              {testGoodbye.isPending && <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />}
              <span>Probar</span>
            </span>
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-goodbye">Guardar</Button>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <Label>Activar despedidas</Label>
            <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-goodbye-enabled" />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Canal de despedidas (ID)</Label>
            <Input placeholder="ID del canal" value={cfg.channelId || ""} onChange={(e) => set("channelId")(e.target.value)} data-testid="input-goodbye-channel" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">Mensaje de despedida</Label>
              <VariablesModal variables={GOODBYE_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, message: (c.message || "") + v }))} />
            </div>
            <Textarea
              placeholder="Hasta luego {user}! Nos quedan {membercount} miembros."
              value={cfg.message || ""}
              onChange={(e) => set("message")(e.target.value)}
              rows={4}
              data-testid="textarea-goodbye-message"
            />
          </div>
        </div>

        {/* Card section */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Tarjeta de Despedida</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Imagen personalizada que se envia al despedir a un miembro</p>
            </div>
            <Switch checked={cfg.cardEnabled ?? false} onCheckedChange={set("cardEnabled")} data-testid="toggle-goodbye-card" />
          </div>
          {cfg.cardEnabled && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Color de fondo (hex)</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#1e1b4b"
                      value={cfg.cardBackground || ""}
                      onChange={(e) => set("cardBackground")(e.target.value)}
                      data-testid="input-goodbye-card-bg"
                    />
                    {cfg.cardBackground && <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.cardBackground }} />}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Color de texto (hex)</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#ffffff"
                      value={cfg.cardTextColor || ""}
                      onChange={(e) => set("cardTextColor")(e.target.value)}
                      data-testid="input-goodbye-card-text"
                    />
                    {cfg.cardTextColor && <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.cardTextColor }} />}
                  </div>
                </div>
              </div>
              {/* Live card preview */}
              <div className="rounded-xl overflow-hidden border border-border">
                <div className="flex items-center gap-4 p-5" style={{ background: cfg.cardBackground || "#1e1b4b", minHeight: 100 }}>
                  <div className="w-16 h-16 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center flex-shrink-0 text-2xl font-black" style={{ color: cfg.cardTextColor || "#ffffff" }}>
                    U
                  </div>
                  <div>
                    <p className="text-lg font-black leading-tight" style={{ color: cfg.cardTextColor || "#ffffff" }}>Hasta luego, UsuarioPrueba</p>
                    <p className="text-sm opacity-70 mt-0.5" style={{ color: cfg.cardTextColor || "#ffffff" }}>Nos quedan 99 miembros en el servidor</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Embed</h3>
            <Switch checked={cfg.embedEnabled} onCheckedChange={set("embedEnabled")} data-testid="toggle-goodbye-embed" />
          </div>
          {cfg.embedEnabled && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm">Titulo</Label>
                  <VariablesModal variables={GOODBYE_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, embedTitle: (c.embedTitle || "") + v }))} />
                </div>
                <Input placeholder="Adios!" value={cfg.embedTitle || ""} onChange={(e) => set("embedTitle")(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm">Descripcion</Label>
                  <VariablesModal variables={GOODBYE_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, embedDescription: (c.embedDescription || "") + v }))} />
                </div>
                <Textarea placeholder="{user} ha abandonado el servidor." value={cfg.embedDescription || ""} onChange={(e) => set("embedDescription")(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Color (hex)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="#ED4245" value={cfg.embedColor || ""} onChange={(e) => set("embedColor")(e.target.value)} />
                    {cfg.embedColor && <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.embedColor }} />}
                  </div>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Footer</Label>
                  <Input placeholder="Neuralix Enterprise" value={cfg.embedFooter || ""} onChange={(e) => set("embedFooter")(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
