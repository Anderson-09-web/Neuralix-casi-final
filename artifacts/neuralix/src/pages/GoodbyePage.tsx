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
import { Eye, RefreshCw } from "lucide-react";
import GuildChannelSelect from "@/components/GuildChannelSelect";

function renderPreview(template: string, guildName = "Mi Servidor", memberCount = 99): string {
  const now = new Date();
  return template
    .replace(/\{user\}/gi, "@UsuarioPrueba")
    .replace(/\{username\}/gi, "UsuarioPrueba")
    .replace(/\{tag\}/gi, "UsuarioPrueba#0000")
    .replace(/\{server\}/gi, guildName)
    .replace(/\{membercount\}/gi, String(memberCount))
    .replace(/\{date\}/gi, now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }))
    .replace(/\{time\}/gi, now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
}

export default function GoodbyePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading, isError } = useGetGoodbyeConfig(guildId, {
    query: {
      queryKey: getGetGoodbyeConfigQueryKey(guildId),
      enabled: !!guildId,
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
    },
  });
  const update = useUpdateGoodbyeConfig();
  const testGoodbye = useTestGoodbye();
  const [cfg, setCfg] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    if (config && !isMounted.current) {
      setCfg({ messageEnabled: true, ...config });
      isMounted.current = true;
    }
  }, [config]);

  if (isLoading || (!cfg && !isError)) return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </Layout>
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
      onSuccess: () => {
        toast({ title: "Despedidas guardadas" });
        qc.invalidateQueries({ queryKey: getGetGoodbyeConfigQueryKey(guildId) });
      },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const previewContent = (cfg.messageEnabled ?? true) && cfg.message ? renderPreview(cfg.message) : null;
  const previewEmbedTitle = cfg.embedEnabled && cfg.embedTitle ? renderPreview(cfg.embedTitle) : null;
  const previewEmbedDesc = cfg.embedEnabled && cfg.embedDescription ? renderPreview(cfg.embedDescription) : null;

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Sistema de Despedidas</h1>
          <p className="text-muted-foreground text-sm">Configura los mensajes cuando un miembro abandona el servidor.</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)} className="gap-2">
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? "Ocultar preview" : "Vista previa"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => testGoodbye.mutate({ guildId }, {
            onSuccess: (data: any) => {
              if (data?.ok === false) toast({ title: data.error || "Error al enviar", description: data.hint, variant: "destructive" });
              else toast({ title: "Mensaje de despedida enviado al canal" });
            },
            onError: (err: any) => toast({ title: err?.data?.error || "Error al enviar", variant: "destructive" }),
          })} disabled={testGoodbye.isPending} data-testid="btn-test-goodbye" className="gap-2">
            <span className="flex items-center gap-1.5">
              {testGoodbye.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Probar</span>
            </span>
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-goodbye">Guardar</Button>
        </div>
      </div>

      {showPreview && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wide">Vista previa en vivo</p>
          {previewContent && (
            <p className="text-sm text-foreground mb-3 whitespace-pre-wrap">{previewContent}</p>
          )}
          {cfg.embedEnabled && (previewEmbedTitle || previewEmbedDesc) && (
            <div
              className="rounded-lg border-l-4 bg-card p-4 space-y-1"
              style={{ borderColor: cfg.embedColor || "#ED4245" }}
            >
              {previewEmbedTitle && <p className="font-bold text-sm">{previewEmbedTitle}</p>}
              {previewEmbedDesc && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewEmbedDesc}</p>}
              {cfg.embedFooter && <p className="text-xs text-muted-foreground/60 pt-1">{cfg.embedFooter}</p>}
            </div>
          )}
          {!previewContent && !cfg.embedEnabled && (
            <p className="text-xs text-muted-foreground italic">Activa el mensaje libre o el embed para ver la vista previa.</p>
          )}
          <p className="text-xs text-muted-foreground/50 mt-3">Variables reemplazadas con valores de ejemplo.</p>
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        {/* General */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Activar despedidas</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Habilita el sistema completo de despedidas</p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-goodbye-enabled" />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Canal de despedidas</Label>
            <GuildChannelSelect
              guildId={guildId}
              value={cfg.channelId || ""}
              onChange={set("channelId")}
              placeholder="Seleccionar canal de despedidas..."
              types={[0, 5]}
            />
          </div>
        </div>

        {/* Mensaje libre */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Mensaje libre</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Texto plano que se envia al canal de despedidas</p>
            </div>
            <Switch
              checked={cfg.messageEnabled ?? true}
              onCheckedChange={set("messageEnabled")}
              data-testid="toggle-goodbye-message-enabled"
            />
          </div>
          {(cfg.messageEnabled ?? true) && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm">Contenido del mensaje</Label>
                <VariablesModal variables={GOODBYE_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, message: (c.message || "") + v }))} />
              </div>
              <Textarea
                placeholder="Hasta luego {user}! Nos quedan {membercount} miembros."
                value={cfg.message || ""}
                onChange={(e) => set("message")(e.target.value)}
                rows={4}
                data-testid="textarea-goodbye-message"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variables: <code className="text-primary/80">{"{user}"}</code> <code className="text-primary/80">{"{username}"}</code> <code className="text-primary/80">{"{server}"}</code> <code className="text-primary/80">{"{membercount}"}</code> <code className="text-primary/80">{"{date}"}</code> <code className="text-primary/80">{"{time}"}</code>
              </p>
            </div>
          )}
        </div>

        {/* Embed */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Embed</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Mensaje enriquecido con titulo, descripcion y color</p>
            </div>
            <Switch checked={cfg.embedEnabled} onCheckedChange={set("embedEnabled")} data-testid="toggle-goodbye-embed" />
          </div>
          {cfg.embedEnabled && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm">Titulo</Label>
                  <VariablesModal variables={GOODBYE_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, embedTitle: (c.embedTitle || "") + v }))} />
                </div>
                <Input placeholder="Adios, {user}!" value={cfg.embedTitle || ""} onChange={(e) => set("embedTitle")(e.target.value)} />
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
              <div>
                <Label className="text-sm mb-1.5 block">Imagen adjunta (URL)</Label>
                <Input placeholder="https://cdn.discordapp.com/..." value={cfg.embedImage || ""} onChange={(e) => set("embedImage")(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* Tarjeta de despedida */}
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Tarjeta de Despedida</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Imagen personalizada que se envia al despedir a un miembro</p>
            </div>
            <Switch checked={cfg.cardEnabled ?? false} onCheckedChange={set("cardEnabled")} data-testid="toggle-goodbye-card" />
          </div>
          {cfg.cardEnabled && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Texto de despedida en la tarjeta</Label>
                <Input
                  placeholder="Hasta luego..."
                  value={cfg.cardGoodbyeText || ""}
                  onChange={(e) => set("cardGoodbyeText")(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Imagen de fondo (URL)</Label>
                <Input
                  placeholder="https://cdn.discordapp.com/attachments/... (opcional)"
                  value={cfg.cardBackgroundUrl || ""}
                  onChange={(e) => set("cardBackgroundUrl")(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Color de fondo (hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#1e1b4b"
                      value={cfg.cardBackground || ""}
                      onChange={(e) => set("cardBackground")(e.target.value)}
                      data-testid="input-goodbye-card-bg"
                    />
                    <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.cardBackground || "#1e1b4b" }} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Color de texto (hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#ffffff"
                      value={cfg.cardTextColor || ""}
                      onChange={(e) => set("cardTextColor")(e.target.value)}
                      data-testid="input-goodbye-card-text"
                    />
                    <div className="w-10 h-10 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: cfg.cardTextColor || "#ffffff" }} />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Color del borde del avatar (hex)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="#ED4245"
                    value={cfg.cardAvatarBorderColor || ""}
                    onChange={(e) => set("cardAvatarBorderColor")(e.target.value)}
                  />
                  <div className="w-10 h-10 rounded-full border-4 flex-shrink-0" style={{ borderColor: cfg.cardAvatarBorderColor || "#ED4245" }} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Vista previa</p>
                <div className="rounded-xl overflow-hidden border border-border relative"
                  style={{
                    background: cfg.cardBackgroundUrl ? `url(${cfg.cardBackgroundUrl}) center/cover` : (cfg.cardBackground || "#1e1b4b"),
                    minHeight: 120,
                  }}>
                  {cfg.cardBackgroundUrl && <div className="absolute inset-0 bg-black/40 rounded-xl" />}
                  <div className="relative flex items-center gap-5 px-8 py-7">
                    <div className="w-16 h-16 rounded-full bg-white/20 border-4 flex items-center justify-center flex-shrink-0 text-2xl font-black"
                      style={{ color: cfg.cardTextColor || "#ffffff", borderColor: cfg.cardAvatarBorderColor || "#ED4245" }}>
                      U
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest opacity-70" style={{ color: cfg.cardTextColor || "#ffffff" }}>
                        {cfg.cardGoodbyeText || "Hasta luego..."}
                      </p>
                      <p className="text-xl font-black leading-tight" style={{ color: cfg.cardTextColor || "#ffffff" }}>UsuarioPrueba</p>
                      <p className="text-sm opacity-60 mt-0.5" style={{ color: cfg.cardTextColor || "#ffffff" }}>Nos quedan 99 miembros</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/50 mt-1.5">La tarjeta real se genera como imagen PNG con el avatar del usuario.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
