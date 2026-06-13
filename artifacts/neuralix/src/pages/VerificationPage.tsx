import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useGetVerificationConfig, useUpdateVerificationConfig, useGetGuildPremium, getGetVerificationConfigQueryKey, getGetGuildPremiumQueryKey } from "@workspace/api-client-react";
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
import { Lock, Crown, RefreshCw, Send, Copy, Shield, Users, CheckCircle, Trash2, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import GuildChannelSelect from "@/components/GuildChannelSelect";
import GuildRoleSelect from "@/components/GuildRoleSelect";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "config", label: "Configuracion" },
  { id: "panel", label: "Panel Discord" },
  { id: "users", label: "Usuarios Verificados" },
] as const;
type Tab = typeof TABS[number]["id"];

type VerifiedUser = { id: number; discordId: string; username?: string | null; verifiedAt: string };

function EmbedPreview({ cfg }: { cfg: any }) {
  const hexToColor = (hex: string) => hex || "#5865F2";
  const borderColor = hexToColor(cfg.panelColor || "#5865F2");

  return (
    <div className="rounded-lg overflow-hidden border border-card-border bg-[#2b2d31] max-w-md">
      <div className="flex">
        <div className="w-1 flex-shrink-0 rounded-l-sm" style={{ backgroundColor: borderColor }} />
        <div className="flex-1 p-4 space-y-2">
          <div className="flex items-start gap-3">
            {cfg.panelThumbnailUrl && (
              <img src={cfg.panelThumbnailUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm leading-snug">{cfg.panelTitle || "Verificacion de Miembros"}</p>
              <p className="text-[#dbdee1] text-xs mt-1 leading-relaxed whitespace-pre-line">
                {cfg.panelDescription || "Para acceder al servidor, verifica tu identidad haciendo clic en el boton."}
              </p>
            </div>
          </div>
          {cfg.panelImageUrl && (
            <img src={cfg.panelImageUrl} alt="" className="w-full rounded-md mt-2 object-cover max-h-40" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <p className="text-[#949ba4] text-[10px]">Neuralix Verificacion · Seguro y privado</p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <button className="px-4 py-1.5 text-xs font-medium text-white rounded flex items-center gap-1.5" style={{ backgroundColor: borderColor }}>
          ✅ {cfg.panelButtonText || "Verificarme"}
        </button>
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading, isError } = useGetVerificationConfig(guildId, {
    query: { queryKey: getGetVerificationConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false },
  });
  const { data: premium } = useGetGuildPremium(guildId, {
    query: { enabled: !!guildId, queryKey: getGetGuildPremiumQueryKey(guildId), refetchInterval: 30000, refetchIntervalInBackground: false },
  });
  const update = useUpdateVerificationConfig();
  const [cfg, setCfg] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("config");
  const [testingVerif, setTestingVerif] = useState(false);
  const [sendingPanel, setSendingPanel] = useState(false);
  const [panelChannelOverride, setPanelChannelOverride] = useState("");
  const [verifiedUsers, setVerifiedUsers] = useState<VerifiedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const isMounted = useRef(false);
  const plan = (premium as any)?.plan || null;
  const isPlus = !!plan;

  useEffect(() => {
    if (config && !isMounted.current) {
      setCfg(config);
      isMounted.current = true;
    }
  }, [config]);

  useEffect(() => {
    if (guildId && tab === "users") fetchVerifiedUsers();
  }, [guildId, tab]);

  const fetchVerifiedUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/verification/verified-users`, { credentials: "include" });
      if (res.ok) setVerifiedUsers(await res.json());
    } catch {}
    finally { setLoadingUsers(false); }
  };

  const resetUser = async (discordId: string) => {
    const res = await fetch(`/api/guilds/${guildId}/verification/verified-users/${discordId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setVerifiedUsers((prev) => prev.filter((u) => u.discordId !== discordId));
      toast({ title: "Verificacion reseteada" });
    } else {
      toast({ title: "Error al resetear", variant: "destructive" });
    }
  };

  const handleTest = async () => {
    setTestingVerif(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/verification/test`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok !== false) toast({ title: "Log de verificacion enviado al canal" });
      else toast({ title: data?.error || "Error al enviar prueba", description: data?.hint, variant: "destructive" });
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setTestingVerif(false);
    }
  };

  const handleSendPanel = async () => {
    const channelId = panelChannelOverride || cfg.panelChannelId;
    if (!channelId) {
      toast({ title: "Selecciona un canal", description: "Elige el canal donde enviar el panel.", variant: "destructive" });
      return;
    }
    setSendingPanel(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/verification/send-panel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast({ title: "Panel enviado correctamente", description: `Panel de verificacion enviado al canal.` });
        setCfg((c: any) => ({ ...c, panelChannelId: channelId, panelMessageId: data.messageId }));
        qc.invalidateQueries({ queryKey: getGetVerificationConfigQueryKey(guildId) });
      } else {
        toast({ title: data?.error || "Error al enviar panel", description: data?.hint, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSendingPanel(false);
    }
  };

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
        <p className="text-muted-foreground text-sm">No se pudo cargar la configuracion de verificacion.<br />Asegurate de que el bot esta en el servidor.</p>
      </div>
    </Layout>
  );

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => {
        toast({ title: "Verificacion guardada" });
        qc.invalidateQueries({ queryKey: getGetVerificationConfigQueryKey(guildId) });
      },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const verifyPortalUrl = cfg.customVerifyUrl || `${window.location.origin}/verify?guild=${guildId}`;

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black mb-1">Verificacion</h1>
          <p className="text-muted-foreground text-sm">Protege tu servidor con filtros de verificacion avanzados y un portal personalizado.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testingVerif} className="gap-2">
            {testingVerif && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Probar Log
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-verification">
            {update.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Guardar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-card border border-card-border rounded-xl mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Config Tab ── */}
      {tab === "config" && (
        <div className="max-w-2xl space-y-4">
          {/* Core settings */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <h3 className="font-semibold text-sm">Configuracion general</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">Verificacion activa</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Los nuevos miembros deben pasar la verificacion para acceder</p>
              </div>
              <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-verification-enabled" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Rol verificado</Label>
              <GuildRoleSelect guildId={guildId} value={cfg.roleId || ""} onChange={set("roleId")} placeholder="Seleccionar rol verificado..." />
              <p className="text-xs text-muted-foreground mt-1">Se asignara este rol al verificarse</p>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Canal de logs</Label>
              <GuildChannelSelect guildId={guildId} value={cfg.logChannelId || ""} onChange={set("logChannelId")} placeholder="Seleccionar canal de logs..." types={[0, 5]} />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Edad minima de cuenta (dias)</Label>
              <Input type="number" value={cfg.minAccountAge} onChange={(e) => set("minAccountAge")(Number(e.target.value))} className="w-32" data-testid="input-min-age" />
            </div>
          </div>

          {/* Filters */}
          {isPlus ? (
            <>
              <ToggleModule title="AntiVPN" description="Bloquea usuarios conectados via VPN o proxy" enabled={cfg.antiVpn} onToggle={set("antiVpn")} badge="Plus" />
              <ToggleModule title="AntiAlt" description="Bloquea cuentas que parecen ser alternativas (edad < minima)" enabled={cfg.antiAlt} onToggle={set("antiAlt")} badge="Plus" />
              <ToggleModule title="AntiBot" description="Bloquea cuentas identificadas como bots no autorizados" enabled={cfg.antiBot} onToggle={set("antiBot")} badge="Plus" />
            </>
          ) : (
            <div className="bg-card border border-card-border rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm mb-0.5">AntiVPN · AntiAlt · AntiBot</p>
                <p className="text-xs text-muted-foreground">Filtros avanzados disponibles en plan Plus.</p>
              </div>
              <Link href={`/servers/${guildId}/premium`}>
                <Button size="sm" className="gap-1.5 text-xs flex-shrink-0"><Crown className="w-3.5 h-3.5" />Activar Plus</Button>
              </Link>
            </div>
          )}

          {/* Custom messages */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <h3 className="font-semibold text-sm">Mensajes personalizados</h3>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm">Mensaje al verificarse</Label>
                <VariablesModal variables={VERIFICATION_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, successMessage: (c.successMessage || "") + v }))} />
              </div>
              <Textarea placeholder="Bienvenido {user}! Has sido verificado correctamente." value={cfg.successMessage || ""} onChange={(e) => set("successMessage")(e.target.value)} rows={2} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm">Mensaje al rechazar</Label>
                <VariablesModal variables={VERIFICATION_VARIABLES} onInsert={(v) => setCfg((c: any) => ({ ...c, rejectMessage: (c.rejectMessage || "") + v }))} />
              </div>
              <Textarea placeholder="Tu cuenta no cumple los requisitos de verificacion." value={cfg.rejectMessage || ""} onChange={(e) => set("rejectMessage")(e.target.value)} rows={2} />
            </div>
          </div>

          {/* Portal link */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ExternalLink className="w-3.5 h-3.5 text-primary" />
              <h3 className="font-semibold text-sm text-primary">Enlace del Portal</h3>
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">Compartir</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Comparte este enlace con los miembros para que se verifiquen.</p>
            <div className="flex gap-2">
              <Input readOnly value={verifyPortalUrl} className="text-xs font-mono bg-background" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(verifyPortalUrl); toast({ title: "Enlace copiado" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel Tab ── */}
      {tab === "panel" && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div>
              <h3 className="font-semibold text-sm mb-1">Personalizar embed del panel</h3>
              <p className="text-xs text-muted-foreground">Configura como se vera el panel de verificacion en Discord.</p>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Titulo del embed</Label>
              <Input placeholder="Verificacion de Miembros" value={cfg.panelTitle || ""} onChange={(e) => set("panelTitle")(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Descripcion del embed</Label>
              <Textarea
                placeholder="Para acceder al servidor, verifica tu identidad haciendo clic en el boton."
                value={cfg.panelDescription || ""}
                onChange={(e) => set("panelDescription")(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">Color del embed</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={cfg.panelColor || "#5865F2"} onChange={(e) => set("panelColor")(e.target.value)} className="h-9 w-16 cursor-pointer rounded-md border border-input bg-background p-1" />
                  <Input value={cfg.panelColor || "#5865F2"} onChange={(e) => set("panelColor")(e.target.value)} className="font-mono text-sm flex-1" placeholder="#5865F2" />
                </div>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Texto del boton</Label>
                <Input placeholder="Verificarme" value={cfg.panelButtonText || ""} onChange={(e) => set("panelButtonText")(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">URL de imagen (banner)</Label>
              <Input type="url" placeholder="https://... (opcional)" value={cfg.panelImageUrl || ""} onChange={(e) => set("panelImageUrl")(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">URL de miniatura (thumbnail)</Label>
              <Input type="url" placeholder="https://... (opcional)" value={cfg.panelThumbnailUrl || ""} onChange={(e) => set("panelThumbnailUrl")(e.target.value)} />
            </div>
            {isPlus && (
              <div className="flex items-center justify-between pt-2 border-t border-card-border">
                <div>
                  <Label className="font-semibold text-sm">Usar persona personalizada del bot</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Envia el panel usando el nombre y avatar del bot configurado en Personalizacion</p>
                </div>
                <Switch checked={cfg.useCustomBotPersona} onCheckedChange={set("useCustomBotPersona")} />
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3">Vista previa del panel</h3>
            <EmbedPreview cfg={cfg} />
          </div>

          {/* Send panel */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-1">Enviar panel a Discord</h3>
              <p className="text-xs text-muted-foreground">Envia el panel de verificacion a un canal de Discord. El boton lleva al portal de verificacion.</p>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Canal de destino</Label>
              <GuildChannelSelect
                guildId={guildId}
                value={panelChannelOverride || cfg.panelChannelId || ""}
                onChange={(v) => { setPanelChannelOverride(v); set("panelChannelId")(v); }}
                placeholder="Seleccionar canal..."
                types={[0, 5]}
              />
            </div>
            {cfg.panelMessageId && (
              <p className="text-xs text-green-400">Panel enviado anteriormente (mensaje: {cfg.panelMessageId}). Puedes volver a enviar para actualizarlo.</p>
            )}
            <Button onClick={handleSendPanel} disabled={sendingPanel || (!panelChannelOverride && !cfg.panelChannelId)} className="gap-2">
              {sendingPanel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingPanel ? "Enviando..." : "Enviar panel a Discord"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Users Tab ── */}
      {tab === "users" && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Usuarios verificados</h3>
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">{verifiedUsers.length}</span>
              </div>
              <Button size="sm" variant="outline" onClick={fetchVerifiedUsers} disabled={loadingUsers}>
                <RefreshCw className={cn("w-3.5 h-3.5", loadingUsers && "animate-spin")} />
              </Button>
            </div>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : verifiedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                <CheckCircle className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No hay usuarios verificados aun</p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {verifiedUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-5 py-3 hover:bg-primary/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.username || "Desconocido"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.discordId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(u.verifiedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => resetUser(u.discordId)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
