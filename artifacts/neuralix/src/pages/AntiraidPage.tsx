import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { ShieldAlert, TrendingDown, Zap, Shield, Network, Lock, Crown } from "lucide-react";
import { useGetAntiraidConfig, useUpdateAntiraidConfig, useGetAntiraidStats, useGetGuildPremium, getGetAntiraidConfigQueryKey, getGetAntiraidStatsQueryKey, getGetGuildPremiumQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import ToggleModule from "@/components/ToggleModule";
import StatCard from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function NativeSelect({ value, onChange, children, className }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer",
        className
      )}
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      {children}
    </select>
  );
}

export default function AntiraidPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading, isError } = useGetAntiraidConfig(guildId, { query: { queryKey: getGetAntiraidConfigQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const { data: stats } = useGetAntiraidStats(guildId, { query: { queryKey: getGetAntiraidStatsQueryKey(guildId), enabled: !!guildId, refetchInterval: 5000, refetchIntervalInBackground: false } });
  const { data: premium } = useGetGuildPremium(guildId, { query: { enabled: !!guildId, queryKey: getGetGuildPremiumQueryKey(guildId), refetchInterval: 30000, refetchIntervalInBackground: false } });
  const update = useUpdateAntiraidConfig();

  const plan = (premium as any)?.plan || null;
  const isPlus = !!plan;

  const [cfg, setCfg] = useState<any>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    if (config && !isMounted.current) {
      setCfg(config);
      isMounted.current = true;
    }
  }, [config]);

  if (isLoading || (!cfg && !isError)) return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
    </Layout>
  );

  if (isError || !cfg) return (
    <Layout guildId={guildId}>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <ShieldAlert className="w-10 h-10 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground text-sm">No se pudo cargar la configuracion de AntiRaid.<br />Asegurate de que el bot esta en el servidor.</p>
      </div>
    </Layout>
  );

  const toggle = (key: string) => (val: boolean) => {
    const next = { ...cfg, [key]: val };
    setCfg(next);
    update.mutate({ guildId, data: { [key]: val } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetAntiraidConfigQueryKey(guildId) }),
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const setField = (key: string) => (val: any) => setCfg((c: any) => ({ ...c, [key]: val }));

  const saveAll = () => {
    update.mutate({ guildId, data: cfg }, {
      onSuccess: () => { toast({ title: "Configuracion guardada" }); qc.invalidateQueries({ queryKey: getGetAntiraidConfigQueryKey(guildId) }); },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const modules = [
    {
      key: "antiJoin", title: "AntiJoin", desc: "Detecta y bloquea raids de union masiva en tiempo real", badge: "Critico",
      children: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Max. uniones por intervalo</Label>
              <Input type="number" className="mt-1" value={cfg.antiJoinThreshold ?? 5} onChange={(e) => setField("antiJoinThreshold")(Number(e.target.value))} min={2} max={50} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Intervalo (segundos)</Label>
              <Input type="number" className="mt-1" value={cfg.antiJoinInterval ?? 10} onChange={(e) => setField("antiJoinInterval")(Number(e.target.value))} min={1} max={60} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Accion automatica</Label>
            <NativeSelect value={cfg.antiJoinAction ?? "ban"} onChange={setField("antiJoinAction")}>
              <option value="ban">Banear</option>
              <option value="kick">Expulsar</option>
              <option value="timeout">Silenciar (timeout)</option>
              <option value="notify">Solo notificar</option>
            </NativeSelect>
          </div>
        </div>
      ),
    },
    {
      key: "antiAlt", title: "AntiAlt", desc: "Bloquea cuentas nuevas segun edad minima de la cuenta", badge: "Recomendado",
      children: (
        <div>
          <Label className="text-xs text-muted-foreground">Edad minima de cuenta (dias)</Label>
          <Input type="number" className="mt-1 w-32" value={cfg.antiAltMinAge ?? 7} onChange={(e) => setField("antiAltMinAge")(Number(e.target.value))} min={1} max={365} />
        </div>
      ),
    },
    { key: "antiBot", title: "AntiBot", desc: "Bloquea bots no autorizados al unirse al servidor" },
    {
      key: "antiSpam", title: "AntiSpam", desc: "Limita la velocidad de mensajes por usuario con accion configurable",
      children: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Mensajes maximos</Label>
              <Input type="number" className="mt-1" value={cfg.antiSpamLimit ?? 5} onChange={(e) => setField("antiSpamLimit")(Number(e.target.value))} min={2} max={30} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Por (segundos)</Label>
              <Input type="number" className="mt-1" value={cfg.antiSpamInterval ?? 5} onChange={(e) => setField("antiSpamInterval")(Number(e.target.value))} min={1} max={60} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Accion</Label>
            <NativeSelect value={cfg.antiSpamAction ?? "mute"} onChange={setField("antiSpamAction")}>
              <option value="mute">Silenciar</option>
              <option value="kick">Expulsar</option>
              <option value="ban">Banear</option>
              <option value="delete">Solo borrar mensajes</option>
            </NativeSelect>
          </div>
        </div>
      ),
    },
    {
      key: "antiLinks", title: "AntiLinks", desc: "Bloquea enlaces no autorizados en mensajes",
      children: (
        <div>
          <Label className="text-xs text-muted-foreground">Dominios permitidos (separados por coma)</Label>
          <Input className="mt-1 text-xs" placeholder="discord.gg, youtube.com" value={(cfg.allowedDomains || []).join(", ")} onChange={(e) => setField("allowedDomains")(e.target.value.split(",").map((d: string) => d.trim()).filter(Boolean))} />
        </div>
      ),
    },
    {
      key: "antiMassMention", title: "AntiMassMention", desc: "Limita el numero de menciones por mensaje",
      children: (
        <div>
          <Label className="text-xs text-muted-foreground">Menciones maximas por mensaje</Label>
          <Input type="number" className="mt-1 w-32" value={cfg.massMentionLimit ?? 5} onChange={(e) => setField("massMentionLimit")(Number(e.target.value))} min={2} max={20} />
        </div>
      ),
    },
    {
      key: "antiVpn", title: "AntiVPN", desc: "Detecta y bloquea usuarios conectados via VPN, Proxy o Tor", badge: "Potente",
      children: (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Nivel de deteccion</Label>
            <NativeSelect value={cfg.vpnCheckLevel ?? "standard"} onChange={setField("vpnCheckLevel")}>
              <option value="basic">Basico (solo VPNs conocidas)</option>
              <option value="standard">Estandar (VPN + Proxy)</option>
              <option value="strict">Estricto (VPN + Proxy + Tor + Datacenter IPs)</option>
            </NativeSelect>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Accion</Label>
            <NativeSelect value={cfg.antiVpnAction ?? "ban"} onChange={setField("antiVpnAction")}>
              <option value="ban">Banear</option>
              <option value="kick">Expulsar</option>
              <option value="notify">Solo notificar al staff</option>
            </NativeSelect>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={!!cfg.antiProxy} onChange={(e) => setField("antiProxy")(e.target.checked)} />
              <span>Detectar Proxies</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={!!cfg.antiTor} onChange={(e) => setField("antiTor")(e.target.checked)} />
              <span>Detectar Tor</span>
            </label>
          </div>
        </div>
      ),
    },
    { key: "antiWebhook", title: "AntiWebhook", desc: "Previene la creacion masiva de webhooks por admins comprometidos" },
    { key: "antiChannelCreate", title: "AntiChannelCreate", desc: "Detecta creacion masiva de canales (indicador de nuke)" },
    { key: "antiChannelDelete", title: "AntiChannelDelete", desc: "Detecta eliminacion masiva de canales (indicador de nuke)" },
    { key: "antiChannelUpdate", title: "AntiChannelUpdate", desc: "Detecta modificaciones masivas de canales" },
    { key: "antiRoleCreate", title: "AntiRoleCreate", desc: "Detecta creacion masiva de roles" },
    { key: "antiRoleDelete", title: "AntiRoleDelete", desc: "Detecta eliminacion masiva de roles" },
    { key: "antiRoleUpdate", title: "AntiRoleUpdate", desc: "Detecta modificaciones masivas de roles" },
    { key: "antiEmojiCreate", title: "AntiEmojiCreate", desc: "Detecta creacion masiva de emojis" },
    { key: "antiEmojiDelete", title: "AntiEmojiDelete", desc: "Detecta eliminacion masiva de emojis" },
    { key: "antiBanMass", title: "AntiBanMass", desc: "Detecta y revierte baneos masivos por administradores comprometidos" },
    { key: "antiKickMass", title: "AntiKickMass", desc: "Detecta y revierte expulsiones masivas" },
    {
      key: "antiNuke", title: "AntiNuke", desc: "Proteccion total contra destruccion del servidor — detecta y revoca permisos al instante", badge: "Premium",
      children: (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Umbral de acciones para activar AntiNuke</Label>
            <Input type="number" className="mt-1 w-32" value={cfg.nukeThreshold ?? 10} onChange={(e) => setField("nukeThreshold")(Number(e.target.value))} min={3} max={50} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Accion al detectar nuke</Label>
            <NativeSelect value={cfg.nukeAction ?? "strip_permissions"} onChange={setField("nukeAction")}>
              <option value="strip_permissions">Revocar permisos del admin</option>
              <option value="ban">Banear al admin</option>
              <option value="kick">Expulsar al admin</option>
              <option value="notify">Solo notificar al owner</option>
            </NativeSelect>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">AntiRaid</h1>
          <p className="text-muted-foreground text-sm">Configura los {modules.length} modulos de proteccion contra raids, VPN y nukes.</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={saveAll} disabled={update.isPending} data-testid="btn-save-antiraid">
            <span>{update.isPending ? "Guardando..." : "Guardar todo"}</span>
          </Button>
          <ToggleModule title="AntiRaid Global" enabled={cfg.enabled} onToggle={toggle("enabled")} />
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total detectado" value={stats.totalDetections} icon={<ShieldAlert className="w-5 h-5" />} color="red" />
          <StatCard label="Alts bloqueados" value={stats.blockedAlt} icon={<TrendingDown className="w-5 h-5" />} color="primary" />
          <StatCard label="Bots bloqueados" value={stats.blockedBot} icon={<Zap className="w-5 h-5" />} color="accent" />
          <StatCard label="Spam detectado" value={stats.blockedSpam} icon={<ShieldAlert className="w-5 h-5" />} color="yellow" />
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Proteccion Raids & Spam</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modules.filter(m => ["antiJoin","antiAlt","antiBot","antiSpam","antiLinks","antiMassMention"].includes(m.key)).map(({ key, title, desc, badge, children }) => (
            <ToggleModule
              key={key}
              title={title}
              description={desc}
              enabled={!!cfg[key]}
              onToggle={toggle(key)}
              badge={badge}
              badgeColor={badge === "Premium" ? "bg-yellow-500/20 text-yellow-400" : badge === "Critico" ? "bg-red-500/20 text-red-400" : badge === "Potente" ? "bg-orange-500/20 text-orange-400" : "bg-primary/20 text-primary"}
            >
              {children}
            </ToggleModule>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Deteccion de Red</h2>
          <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Plus</span>
        </div>
        {isPlus ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modules.filter(m => ["antiVpn"].includes(m.key)).map(({ key, title, desc, badge, children }) => (
              <ToggleModule
                key={key}
                title={title}
                description={desc}
                enabled={!!cfg[key]}
                onToggle={toggle(key)}
                badge={badge}
                badgeColor="bg-orange-500/20 text-orange-400"
              >
                {children}
              </ToggleModule>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-0.5">AntiVPN — Deteccion de Red</p>
              <p className="text-xs text-muted-foreground">Detecta y bloquea VPN, Proxy y Tor. Disponible con plan Plus o superior.</p>
            </div>
            <Link href={`/servers/${guildId}/premium`}>
              <Button size="sm" className="gap-1.5 text-xs flex-shrink-0">
                <Crown className="w-3.5 h-3.5" /><span>Activar Plus</span>
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Proteccion AntiNuke</h2>
          <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Plus</span>
        </div>
        {isPlus ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modules.filter(m => !["antiJoin","antiAlt","antiBot","antiSpam","antiLinks","antiMassMention","antiVpn"].includes(m.key)).map(({ key, title, desc, badge, children }) => (
              <ToggleModule
                key={key}
                title={title}
                description={desc}
                enabled={!!cfg[key]}
                onToggle={toggle(key)}
                badge={badge}
                badgeColor={badge === "Premium" ? "bg-yellow-500/20 text-yellow-400" : "bg-primary/20 text-primary"}
              >
                {children}
              </ToggleModule>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-0.5">Proteccion AntiNuke — 12 modulos</p>
              <p className="text-xs text-muted-foreground">Protege contra nukes, baneos masivos, eliminacion de canales y roles. Disponible con plan Plus o superior.</p>
            </div>
            <Link href={`/servers/${guildId}/premium`}>
              <Button size="sm" className="gap-1.5 text-xs flex-shrink-0">
                <Crown className="w-3.5 h-3.5" /><span>Activar Plus</span>
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
