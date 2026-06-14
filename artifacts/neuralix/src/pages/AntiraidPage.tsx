import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { ShieldAlert, RefreshCw, Shield, Users, Plus, Trash2, UserCheck, TrendingDown, Zap, AlertTriangle, Activity, Radio } from "lucide-react";
import GuildRoleSelect from "@/components/GuildRoleSelect";
import { useGetAntiraidConfig, useUpdateAntiraidConfig, useGetAntiraidStats, getGetAntiraidConfigQueryKey, getGetAntiraidStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "config", label: "Configuracion" },
  { id: "whitelist", label: "Whitelist" },
  { id: "stats", label: "Estadisticas" },
  { id: "alerts", label: "Alertas en Vivo" },
] as const;
type Tab = typeof TABS[number]["id"];

type LiveAlert = { id: string; ts: number; module: string; description: string; action: string; username?: string; userId?: string; historical?: boolean };

const MODULE_COLOR: Record<string, string> = {
  AntiBot: "border-blue-500 bg-blue-500/10 text-blue-400",
  AntiAlt: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
  AntiJoin: "border-red-500 bg-red-500/10 text-red-400",
  AntiFlood: "border-orange-500 bg-orange-500/10 text-orange-400",
  AntiSpam: "border-orange-500 bg-orange-500/10 text-orange-400",
  AntiMassMention: "border-purple-500 bg-purple-500/10 text-purple-400",
  AntiWebhook: "border-red-500 bg-red-500/10 text-red-400",
  AntiNuke: "border-rose-500 bg-rose-500/10 text-rose-400",
};
const ACTION_LABEL: Record<string, string> = { ban: "BAN", kick: "KICK", timeout: "TIMEOUT", mute: "TIMEOUT", strip: "STRIP ROLES" };

function NativeSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
      {children}
    </select>
  );
}

type WhitelistEntry = { id: number; entityId: string; entityType: string; name?: string | null; reason?: string | null; addedByUsername?: string | null; createdAt: string };
const emptyWlForm = { entityId: "", entityType: "user", name: "", reason: "" };

export default function AntiraidPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("config");
  const [testing, setTesting] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!guildId || tab !== "alerts") return;
    const evtSource = new EventSource(`/api/guilds/${guildId}/antiraid/alerts/stream`, { withCredentials: true });
    evtSource.onopen = () => setSseConnected(true);
    evtSource.onerror = () => setSseConnected(false);
    evtSource.onmessage = (e) => {
      try {
        const alert: LiveAlert = JSON.parse(e.data);
        setLiveAlerts((prev) => {
          const next = [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, 100);
          return next;
        });
        if (!alert.historical) {
          toast({ title: `${alert.module} — Ataque detectado`, description: alert.description, variant: "destructive" });
        }
      } catch {}
    };
    return () => { evtSource.close(); setSseConnected(false); };
  }, [guildId, tab]);

  const { data: config, isLoading } = useGetAntiraidConfig(guildId, { query: { queryKey: getGetAntiraidConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 10000, refetchIntervalInBackground: false } });
  const { data: stats } = useGetAntiraidStats(guildId, { query: { queryKey: getGetAntiraidStatsQueryKey(guildId), enabled: !!guildId && tab === "stats", refetchInterval: 5000, refetchIntervalInBackground: false } });
  const update = useUpdateAntiraidConfig();
  const [cfg, setCfg] = useState<any>(null);
  const isMounted = useRef(false);

  // Whitelist state
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [wlForm, setWlForm] = useState({ ...emptyWlForm });
  const [addingWl, setAddingWl] = useState(false);
  const [showWlForm, setShowWlForm] = useState(false);

  useEffect(() => {
    if (config && !isMounted.current) { setCfg(config); isMounted.current = true; }
  }, [config]);

  useEffect(() => {
    if (guildId && tab === "whitelist") fetchWhitelist();
  }, [guildId, tab]);

  const fetchWhitelist = async () => {
    const res = await fetch(`/api/guilds/${guildId}/antiraid/whitelist`, { credentials: "include" });
    if (res.ok) setWhitelist(await res.json());
  };

  const set = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));
  const setN = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg((c: any) => ({ ...c, [key]: Number(e.target.value) || 0 }));

  const save = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "AntiRaid guardado" }); qc.invalidateQueries({ queryKey: getGetAntiraidConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const [ultraLoading, setUltraLoading] = useState(false);
  const [ultraConfirm, setUltraConfirm] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    const res = await fetch(`/api/guilds/${guildId}/antiraid/test`, { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok !== false) toast({ title: "Alerta de prueba enviada al canal de logs" });
    else toast({ title: data?.error || "Error al enviar prueba", variant: "destructive" });
    setTesting(false);
  };

  const handleUltra = async () => {
    if (!ultraConfirm) { setUltraConfirm(true); setTimeout(() => setUltraConfirm(false), 5000); return; }
    setUltraLoading(true);
    setUltraConfirm(false);
    try {
      const res = await fetch(`/api/guilds/${guildId}/antiraid/ultra`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "ANTIRAID ULTRA activado", description: "Todos los modulos en maxima proteccion anti-bot" });
        qc.invalidateQueries({ queryKey: getGetAntiraidConfigQueryKey(guildId) });
        isMounted.current = false;
      } else {
        toast({ title: data?.error || "Error al activar ULTRA", variant: "destructive" });
      }
    } catch { toast({ title: "Error de conexion", variant: "destructive" }); }
    setUltraLoading(false);
  };

  const addToWhitelist = async () => {
    if (!wlForm.entityId) { toast({ title: "ID de entidad requerido", variant: "destructive" }); return; }
    setAddingWl(true);
    const res = await fetch(`/api/guilds/${guildId}/antiraid/whitelist`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(wlForm),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { toast({ title: "Agregado a la whitelist" }); setWlForm({ ...emptyWlForm }); setShowWlForm(false); fetchWhitelist(); }
    else toast({ title: data.error || "Error al agregar", variant: "destructive" });
    setAddingWl(false);
  };

  const removeFromWhitelist = async (id: number) => {
    const res = await fetch(`/api/guilds/${guildId}/antiraid/whitelist/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Eliminado de la whitelist" }); fetchWhitelist(); }
    else toast({ title: "Error al eliminar", variant: "destructive" });
  };

  if (isLoading || (!cfg && !config)) return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
    </Layout>
  );

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black mb-1">AntiRaid</h1>
          <p className="text-muted-foreground text-sm">Proteccion avanzada contra raids, spam, bots y nuke con whitelist y auto-accion.</p>
        </div>
        {tab === "config" && cfg && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="gap-1.5">
              {testing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Enviar Prueba</span>
            </Button>
            <Button size="sm" onClick={save} disabled={update.isPending} data-testid="btn-save-antiraid">Guardar</Button>
          </div>
        )}
      </div>

      {/* ── ANTIRAID ULTRA Banner ── */}
      {tab === "config" && (
        <div className="max-w-3xl mb-6 rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-red-300">ANTIRAID ULTRA</p>
              <p className="text-xs text-red-400/80 mt-0.5">Activa todos los modulos al maximo. Proteccion total contra bots, raids, webhooks y ataques via conexiones OAuth. Accion: <span className="font-semibold">ban inmediato</span> en todo.</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleUltra}
            disabled={ultraLoading}
            className={cn(
              "flex-shrink-0 gap-1.5 font-bold transition-all",
              ultraConfirm
                ? "bg-red-600 hover:bg-red-700 text-white border-red-500 animate-pulse"
                : "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40"
            )}
            variant="ghost"
          >
            {ultraLoading
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <AlertTriangle className="w-3.5 h-3.5" />}
            {ultraConfirm ? "Confirmar — Activar ULTRA" : "Activar ULTRA"}
          </Button>
        </div>
      )}

      <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit mb-6">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all", tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Config Tab ── */}
      {tab === "config" && cfg && (
        <div className="max-w-3xl space-y-5">
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold text-base">AntiRaid activo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Activa todos los modulos de proteccion configurados.</p>
              </div>
              <Switch checked={cfg.enabled} onCheckedChange={set("enabled")} data-testid="toggle-antiraid-enabled" />
            </div>
          </div>

          {/* AntiJoin */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiJoin</Label><p className="text-xs text-muted-foreground">Bloquea joins masivos en poco tiempo</p></div>
              <Switch checked={cfg.antiJoin} onCheckedChange={set("antiJoin")} data-testid="toggle-antijoin" />
            </div>
            {cfg.antiJoin && (
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-xs mb-1.5 block">Limite de joins</Label><Input type="number" min={2} value={cfg.antiJoinThreshold ?? 5} onChange={setN("antiJoinThreshold")} /></div>
                <div><Label className="text-xs mb-1.5 block">Ventana (segundos)</Label><Input type="number" min={1} value={cfg.antiJoinInterval ?? 10} onChange={setN("antiJoinInterval")} /></div>
                <div><Label className="text-xs mb-1.5 block">Accion</Label>
                  <NativeSelect value={cfg.antiJoinAction || "ban"} onChange={set("antiJoinAction")}>
                    <option value="ban">Ban</option><option value="kick">Kick</option><option value="timeout">Timeout</option>
                  </NativeSelect>
                </div>
              </div>
            )}
          </div>

          {/* AntiAlt */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiAlt</Label><p className="text-xs text-muted-foreground">Bloquea cuentas nuevas o alternativas</p></div>
              <Switch checked={cfg.antiAlt} onCheckedChange={set("antiAlt")} data-testid="toggle-antialt" />
            </div>
            {cfg.antiAlt && (
              <div><Label className="text-xs mb-1.5 block">Edad minima de la cuenta (dias)</Label><Input type="number" min={1} value={cfg.antiAltMinAge ?? 7} onChange={setN("antiAltMinAge")} className="w-32" /></div>
            )}
          </div>

          {/* AntiSpam */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiSpam</Label><p className="text-xs text-muted-foreground">Sanciona mensajes repetidos o rapidos</p></div>
              <Switch checked={cfg.antiSpam} onCheckedChange={set("antiSpam")} data-testid="toggle-antispam" />
            </div>
            {cfg.antiSpam && (
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-xs mb-1.5 block">Mensajes maximos</Label><Input type="number" min={2} value={cfg.antiSpamLimit ?? 5} onChange={setN("antiSpamLimit")} /></div>
                <div><Label className="text-xs mb-1.5 block">Ventana (segundos)</Label><Input type="number" min={1} value={cfg.antiSpamInterval ?? 5} onChange={setN("antiSpamInterval")} /></div>
                <div><Label className="text-xs mb-1.5 block">Accion</Label>
                  <NativeSelect value={cfg.antiSpamAction || "mute"} onChange={set("antiSpamAction")}>
                    <option value="mute">Timeout</option><option value="kick">Kick</option><option value="ban">Ban</option>
                  </NativeSelect>
                </div>
              </div>
            )}
          </div>

          {/* AntiBot */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiBot</Label><p className="text-xs text-muted-foreground">Bloquea bots no autorizados</p></div>
              <Switch checked={cfg.antiBot} onCheckedChange={set("antiBot")} data-testid="toggle-antibot" />
            </div>
            {cfg.antiBot && (
              <div>
                <Label className="text-xs mb-1.5 block">IDs de bots autorizados (separados por coma)</Label>
                <Input placeholder="ID1, ID2, ID3"
                  value={Array.isArray(cfg.antiBotWhitelist) ? cfg.antiBotWhitelist.join(", ") : ""}
                  onChange={(e) => set("antiBotWhitelist")(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} />
              </div>
            )}
          </div>

          {/* AntiLinks */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiLinks</Label><p className="text-xs text-muted-foreground">Bloquea enlaces, invitaciones Discord, contenido NSFW y dominios maliciosos</p></div>
              <Switch checked={cfg.antiLinks} onCheckedChange={set("antiLinks")} data-testid="toggle-antilinks" />
            </div>
            {cfg.antiLinks && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">Accion al detectar enlace</Label>
                    <NativeSelect value={(cfg as any).antiLinksAction || "delete"} onChange={set("antiLinksAction")}>
                      <option value="delete">Solo eliminar mensaje</option>
                      <option value="timeout">Eliminar + Silenciar (10min)</option>
                      <option value="kick">Eliminar + Expulsar</option>
                      <option value="ban">Eliminar + Banear</option>
                    </NativeSelect>
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <Switch checked={cfg.antiDiscordInvites ?? true} onCheckedChange={set("antiDiscordInvites")} />
                    <Label className="text-sm">Bloquear invitaciones Discord</Label>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Dominios permitidos (whitelist)</Label>
                  <Input placeholder="youtube.com, twitch.tv, github.com"
                    value={Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains.join(", ") : ""}
                    onChange={(e) => set("allowedDomains")(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Dominios bloqueados especificos (vacio = bloquear todos salvo whitelist)</Label>
                  <Input placeholder="bit.ly, tinyurl.com"
                    value={Array.isArray(cfg.blockedDomains) ? cfg.blockedDomains.join(", ") : ""}
                    onChange={(e) => set("blockedDomains")(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} />
                </div>
                <p className="text-xs text-muted-foreground">NSFW (pornhub, onlyfans, etc.) y dominios maliciosos (grabify, iplogger) siempre bloqueados automaticamente.</p>
              </div>
            )}
          </div>

          {/* MassMention */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiMassMention</Label><p className="text-xs text-muted-foreground">Bloquea menciones masivas en un mensaje</p></div>
              <Switch checked={cfg.antiMassMention} onCheckedChange={set("antiMassMention")} />
            </div>
            {cfg.antiMassMention && (
              <div><Label className="text-xs mb-1.5 block">Max. menciones por mensaje</Label><Input type="number" min={2} value={cfg.massMentionLimit ?? 5} onChange={setN("massMentionLimit")} className="w-32" /></div>
            )}
          </div>

          {/* AntiNuke */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="font-semibold text-sm">AntiNuke</Label><p className="text-xs text-muted-foreground">Detecta y actua contra nukeos del servidor</p></div>
              <Switch checked={cfg.antiNuke} onCheckedChange={set("antiNuke")} data-testid="toggle-antinuke" />
            </div>
            {cfg.antiNuke && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-xs mb-1.5 block">Acciones para detectar nuke</Label><Input type="number" min={3} value={cfg.nukeThreshold ?? 10} onChange={setN("nukeThreshold")} /></div>
                <div><Label className="text-xs mb-1.5 block">Accion al detectar nuke</Label>
                  <NativeSelect value={cfg.nukeAction || "strip_permissions"} onChange={set("nukeAction")}>
                    <option value="strip_permissions">Quitar permisos</option><option value="kick">Kick</option><option value="ban">Ban</option>
                  </NativeSelect>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
              {([
                ["antiChannelCreate", "Crear canales", "Detecta creacion masiva de canales"],
                ["antiChannelDelete", "Eliminar canales", "Detecta borrado masivo de canales"],
                ["antiRoleCreate", "Crear roles", "Detecta creacion masiva de roles"],
                ["antiRoleDelete", "Eliminar roles", "Detecta borrado masivo de roles"],
                ["antiBanMass", "Baneos masivos", "Detecta baneos en cadena rapidos"],
                ["antiKickMass", "Kicks masivos", "Detecta kicks en cadena rapidos"],
                ["antiEmojiDelete", "Eliminar emojis", "Detecta borrado masivo de emojis"],
              ] as const).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between py-0.5">
                  <div>
                    <Label className="text-sm">{label}</Label>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch checked={cfg[key] || false} onCheckedChange={set(key)} />
                </div>
              ))}
            </div>
          </div>

          {/* AntiWebhook Spam */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold text-sm">AntiWebhook Spam</Label>
                <p className="text-xs text-muted-foreground">Detecta y actua contra la creacion masiva de webhooks</p>
              </div>
              <Switch checked={cfg.antiWebhook || false} onCheckedChange={set("antiWebhook")} />
            </div>
            {cfg.antiWebhook && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-1.5 block">Webhooks maximos</Label>
                  <Input type="number" min={1} value={cfg.webhookSpamThreshold ?? 3} onChange={setN("webhookSpamThreshold")} />
                  <p className="text-xs text-muted-foreground mt-1">Cuantos webhooks en la ventana de tiempo activa la accion</p>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Ventana (segundos)</Label>
                  <Input type="number" min={1} value={cfg.webhookSpamInterval ?? 60} onChange={setN("webhookSpamInterval")} />
                  <p className="text-xs text-muted-foreground mt-1">Ventana de tiempo en segundos para contar webhooks</p>
                </div>
              </div>
            )}
          </div>

          {/* AntiFlood */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold text-sm">AntiFlood</Label>
                <p className="text-xs text-muted-foreground">Sanciona a usuarios que envian demasiados mensajes en poco tiempo</p>
              </div>
              <Switch checked={cfg.antiFlood ?? false} onCheckedChange={set("antiFlood")} data-testid="toggle-antiflood" />
            </div>
            {cfg.antiFlood && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">Limite de mensajes</Label>
                    <Input type="number" min={2} max={50} value={cfg.floodLimit ?? 5} onChange={setN("floodLimit")} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Intervalo (segundos)</Label>
                    <Input type="number" min={1} max={60} value={cfg.floodInterval ?? 5} onChange={setN("floodInterval")} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Accion</Label>
                    <NativeSelect value={cfg.floodAction || "mute"} onChange={set("floodAction")}>
                      <option value="warn">Advertencia</option>
                      <option value="mute">Timeout</option>
                      <option value="kick">Kick</option>
                      <option value="ban">Ban</option>
                    </NativeSelect>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Eliminar mensajes al detectar flood</Label>
                    <p className="text-xs text-muted-foreground">Borra automaticamente los mensajes del usuario sancionado</p>
                  </div>
                  <Switch checked={cfg.deleteOnTrigger ?? false} onCheckedChange={set("deleteOnTrigger")} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Whitelist Tab ── */}
      {tab === "whitelist" && (
        <div className="max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Usuarios y roles exentos de todas las protecciones AntiRaid.</p>
            <Button size="sm" onClick={() => setShowWlForm(!showWlForm)}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          </div>

          {showWlForm && (
            <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm">Agregar a Whitelist</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-1.5 block">
                    {wlForm.entityType === "role" ? "Rol *" : "ID de Discord *"}
                  </Label>
                  {wlForm.entityType === "role" ? (
                    <GuildRoleSelect guildId={guildId!} value={wlForm.entityId} onChange={(v) => setWlForm((f) => ({ ...f, entityId: v }))} placeholder="Seleccionar rol..." />
                  ) : (
                    <Input value={wlForm.entityId} onChange={(e) => setWlForm((f) => ({ ...f, entityId: e.target.value }))} placeholder="ID de Discord" />
                  )}
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Tipo</Label>
                  <NativeSelect value={wlForm.entityType} onChange={(v) => setWlForm((f) => ({ ...f, entityType: v }))}>
                    <option value="user">Usuario</option>
                    <option value="role">Rol</option>
                    <option value="bot">Bot</option>
                  </NativeSelect>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Nombre (opcional)</Label>
                  <Input value={wlForm.name} onChange={(e) => setWlForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre del usuario/rol" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Razon (opcional)</Label>
                  <Input value={wlForm.reason} onChange={(e) => setWlForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Razon de la exencion" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={addToWhitelist} disabled={addingWl}>Agregar</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowWlForm(false); setWlForm({ ...emptyWlForm }); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {whitelist.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-card-border">
              <UserCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">Whitelist vacia</p>
              <p className="text-sm text-muted-foreground mt-1">Agrega usuarios o roles que deban estar exentos de las protecciones AntiRaid.</p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl divide-y divide-border overflow-hidden">
              {whitelist.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      entry.entityType === "role" ? "bg-purple-500/20" : "bg-green-500/20")}>
                      {entry.entityType === "role" ? <Shield className="w-4 h-4 text-purple-400" /> : <Users className="w-4 h-4 text-green-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{entry.name || entry.entityId}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{entry.entityId}</span>
                        <span className="capitalize bg-secondary px-1.5 py-0.5 rounded">{entry.entityType}</span>
                        {entry.reason && <span>· {entry.reason}</span>}
                        {entry.addedByUsername && <span>· por {entry.addedByUsername}</span>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeFromWhitelist(entry.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Alerts Tab ── */}
      {tab === "alerts" && (
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-5">
            <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border", sseConnected ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-muted bg-muted/30 text-muted-foreground")}>
              <span className={cn("w-2 h-2 rounded-full", sseConnected ? "bg-green-400 animate-pulse" : "bg-muted-foreground")} />
              {sseConnected ? "Conectado — Escuchando en tiempo real" : "Conectando..."}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className="w-3.5 h-3.5" />
              {liveAlerts.length} eventos
            </div>
            {liveAlerts.length > 0 && (
              <button onClick={() => setLiveAlerts([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
                Limpiar
              </button>
            )}
          </div>

          {liveAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Activity className="w-10 h-10 opacity-20" />
              <p className="text-sm">Sin alertas recientes</p>
              <p className="text-xs opacity-60">Las alertas aparecen aqui en tiempo real cuando AntiRaid detecta ataques</p>
            </div>
          ) : (
            <div ref={alertsRef} className="flex flex-col gap-2">
              {liveAlerts.map((alert) => (
                <div key={alert.id} className={cn("border-l-2 rounded-lg p-4 flex items-start gap-4 transition-all", MODULE_COLOR[alert.module] ?? "border-muted bg-muted/20 text-muted-foreground", alert.historical ? "opacity-60" : "animate-in fade-in slide-in-from-top-1 duration-300")}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider">{alert.module}</span>
                      {alert.historical && <span className="text-[10px] opacity-50 font-normal">(historico)</span>}
                    </div>
                    <p className="text-sm text-foreground/90 truncate">{alert.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{new Date(alert.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                  </div>
                  <span className={cn("shrink-0 text-[10px] font-black px-2 py-0.5 rounded border", alert.action === "ban" ? "border-red-500/40 bg-red-500/20 text-red-400" : alert.action === "kick" ? "border-orange-500/40 bg-orange-500/20 text-orange-400" : "border-yellow-500/40 bg-yellow-500/20 text-yellow-400")}>
                    {ACTION_LABEL[alert.action] ?? alert.action.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Stats Tab ── */}
      {tab === "stats" && (
        <div className="max-w-2xl">
          {!stats ? (
            <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {([
                  { label: "Detecciones totales", value: (stats as any).totalDetections ?? 0, color: "text-red-400" },
                  { label: "Detectados hoy", value: (stats as any).detectedToday ?? 0, color: "text-orange-400" },
                  { label: "Bots bloqueados", value: (stats as any).blockedBot ?? 0, color: "text-blue-400" },
                  { label: "Alts bloqueados", value: (stats as any).blockedAlt ?? 0, color: "text-yellow-400" },
                  { label: "Spam bloqueado", value: (stats as any).blockedSpam ?? 0, color: "text-green-400" },
                  { label: "VPN/Proxy bloqueados", value: (stats as any).blockedVpn ?? 0, color: "text-purple-400" },
                ] as const).map(({ label, value, color }) => (
                  <div key={label} className="bg-card border border-card-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={cn("text-3xl font-black", color)}>{value}</p>
                  </div>
                ))}
              </div>
              {(stats as any).lastDetectionAt && (
                <p className="text-xs text-muted-foreground text-center">Ultima deteccion: {new Date((stats as any).lastDetectionAt).toLocaleString("es")}</p>
              )}
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
