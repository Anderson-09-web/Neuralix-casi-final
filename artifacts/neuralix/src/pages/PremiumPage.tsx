import { useParams } from "wouter";
import { useState, useRef, useEffect } from "react";
import { Star, Check, Crown, Zap, Shield, Lock, Webhook } from "lucide-react";
import { useGetGuildPremium, useGetPremiumPlans, getGetGuildPremiumQueryKey, getGetPremiumPlansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const planIcons: Record<string, any> = { plus: Zap, pro: Star, ultra: Crown };
const planColors: Record<string, string> = {
  plus: "border-primary/40 bg-primary/5",
  pro: "border-accent/40 bg-accent/5",
  ultra: "border-yellow-500/40 bg-yellow-500/5",
};
const planBadgeColors: Record<string, string> = {
  plus: "bg-primary text-primary-foreground",
  pro: "bg-accent text-accent-foreground",
  ultra: "bg-yellow-500 text-black",
};

export default function PremiumPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const licenseRef = useRef<HTMLInputElement>(null);

  const [webhookName, setWebhookName] = useState("");
  const [webhookAvatar, setWebhookAvatar] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    fetch(`/api/guilds/${guildId}/premium/webhook-config`, { credentials: "include" })
      .then((r) => r.json()).then((d) => { setWebhookName(d.webhookBotName || ""); setWebhookAvatar(d.webhookBotAvatar || ""); }).catch(() => {});
  }, [guildId]);

  const saveWebhookConfig = async () => {
    setSavingWebhook(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/premium/webhook-config`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookBotName: webhookName, webhookBotAvatar: webhookAvatar }),
      });
      if (res.ok) toast({ title: "Configuracion de webhook guardada" });
      else { const d = await res.json(); toast({ title: d.error || "Error al guardar", variant: "destructive" }); }
    } catch { toast({ title: "Error de conexion", variant: "destructive" }); }
    finally { setSavingWebhook(false); }
  };

  const { data: premium, refetch: refetchPremium } = useGetGuildPremium(guildId, {
    query: { queryKey: getGetGuildPremiumQueryKey(guildId), enabled: !!guildId }
  });
  const { data: plans } = useGetPremiumPlans({ query: { queryKey: getGetPremiumPlansQueryKey() } });

  const handleActivate = async () => {
    const key = licenseKey.trim();
    if (!key) {
      licenseRef.current?.focus();
      toast({ title: "Ingresa una clave de licencia", variant: "destructive" });
      return;
    }
    setActivating(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/premium/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Error al activar", variant: "destructive" });
      } else {
        toast({ title: `Premium ${data.planName} activado correctamente` });
        setLicenseKey("");
        refetchPremium();
        qc.invalidateQueries({ queryKey: getGetGuildPremiumQueryKey(guildId) });
      }
    } catch {
      toast({ title: "Error de conexion. Intentalo de nuevo.", variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  return (
    <Layout guildId={guildId}>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-black mb-1">Premium</h1>
        <p className="text-muted-foreground text-sm">Desbloquea funciones avanzadas para tu servidor.</p>
      </div>

      {premium?.active && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 md:p-5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-4"
          role="status"
          aria-label={`Plan premium ${premium.plan} activo`}
        >
          <Crown className="w-8 h-8 text-yellow-400 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold text-yellow-300">Premium {premium.plan?.toUpperCase()} activo</p>
            <p className="text-sm text-yellow-300/70">
              {premium.expiresAt
                ? `Expira: ${new Date(premium.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`
                : "Sin fecha de expiracion"}
            </p>
          </div>
        </motion.div>
      )}

      {/* Plans grid */}
      {plans && (
        <section aria-label="Planes premium disponibles">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            {plans.map((plan, i) => {
              const Icon = planIcons[plan.id] || Star;
              const isActive = premium?.plan === plan.id && premium?.active;
              const badgeColor = planBadgeColors[plan.id] || "bg-primary text-primary-foreground";
              return (
                <article
                  key={plan.id}
                  aria-label={`Plan ${plan.name} a $${plan.price} por mes`}
                  className={`rounded-xl border p-5 md:p-6 relative flex flex-col ${planColors[plan.id] || "border-card-border bg-card"} ${isActive ? "ring-2 ring-primary" : ""}`}
                >
                  {isActive && (
                    <div
                      className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold ${badgeColor}`}
                      aria-label="Plan actual activo"
                    >
                      Plan actual
                    </div>
                  )}
                  {plan.id === "ultra" && !isActive && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold bg-yellow-500 text-black">
                      Mas popular
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center border border-border flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{plan.name}</h3>
                      <p className="text-2xl font-black text-primary">
                        ${plan.price}
                        <span className="text-sm font-normal text-muted-foreground">/mes</span>
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2 mb-6 flex-1" role="list" aria-label={`Caracteristicas del plan ${plan.name}`}>
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full mt-auto"
                    variant={isActive ? "secondary" : "default"}
                    disabled={isActive}
                    data-testid={`btn-plan-${plan.id}`}
                    aria-label={isActive ? `Plan ${plan.name} ya activo` : `Activar plan ${plan.name} por $${plan.price} por mes`}
                    onClick={() => {
                      if (!isActive) licenseRef.current?.focus();
                    }}
                  >
                    {isActive ? "Plan actual" : `Activar ${plan.name}`}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* License activation */}
      <section className="p-4 md:p-5 rounded-xl bg-card border border-card-border" aria-label="Activar con codigo de licencia">
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Activar con codigo de licencia</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Si tienes un codigo de licencia, ingresalo aqui para activar tu plan Premium inmediatamente.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="license-key-input" className="sr-only">Codigo de licencia</label>
            <input
              id="license-key-input"
              ref={licenseRef}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
              placeholder="NRX-PRO-XXXXXXXXXXXXXXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleActivate()}
              data-testid="input-license-key"
              aria-label="Codigo de licencia premium"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <Button
            onClick={handleActivate}
            disabled={activating || !licenseKey.trim()}
            data-testid="btn-activate-license"
            aria-label="Activar licencia premium"
            className="sm:w-auto"
          >
            {activating ? "Activando..." : "Activar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <Lock className="w-3 h-3" aria-hidden="true" />
          Las claves son de un solo uso y se asignan a este servidor al activarse.
        </p>
      </section>

      {/* Webhook customization — Ultra plan */}
      {premium?.active && (premium.plan === "ultra" || premium.plan === "pro") && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-5 rounded-xl bg-card border border-yellow-500/20"
          aria-label="Personalizacion del bot con webhook"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Webhook className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Personalizacion del bot</h3>
              <p className="text-xs text-muted-foreground">El bot usara este nombre y avatar al enviar mensajes de bienvenida y notificaciones.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="text-xs mb-1.5 block">Nombre del bot personalizado</Label>
              <Input
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                placeholder="Ej: Servidor Oficial"
                maxLength={80}
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">URL del avatar personalizado</Label>
              <Input
                value={webhookAvatar}
                onChange={(e) => setWebhookAvatar(e.target.value)}
                placeholder="https://i.imgur.com/tu-avatar.png"
              />
            </div>
          </div>
          {webhookAvatar && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-secondary/30 rounded-lg">
              <img src={webhookAvatar} alt="Preview avatar" className="w-10 h-10 rounded-full object-cover border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div>
                <p className="font-semibold text-sm">{webhookName || "Neuralix Bot"}</p>
                <p className="text-xs text-muted-foreground">Vista previa del aspecto del bot</p>
              </div>
            </div>
          )}
          <Button size="sm" onClick={saveWebhookConfig} disabled={savingWebhook}>
            {savingWebhook ? "Guardando..." : "Guardar configuracion"}
          </Button>
        </motion.section>
      )}

      {/* Feature comparison table */}
      <section className="mt-8 p-4 md:p-5 rounded-xl bg-card border border-card-border" aria-label="Comparacion completa de planes">
        <h3 className="font-semibold mb-5">Comparacion completa de planes</h3>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground py-2 pr-4 w-2/5">Funcion</th>
                {["Free", "Plus", "Pro", "Ultra"].map((p) => (
                  <th key={p} className="text-center font-semibold py-2 px-2">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { feature: "AntiRaid basico",                     free: true,  plus: true,  pro: true,  ultra: true  },
                { feature: "AntiSpam",                            free: true,  plus: true,  pro: true,  ultra: true  },
                { feature: "Sistema de tickets",                   free: true,  plus: true,  pro: true,  ultra: true  },
                { feature: "Bienvenidas y despedidas",             free: true,  plus: true,  pro: true,  ultra: true  },
                { feature: "Soporte IA basico",                   free: true,  plus: true,  pro: true,  ultra: true  },
                { feature: "Backups manuales (Free: 1, Plus: 5, Pro: 25, Ultra: ∞)", free: true,  plus: true,  pro: true,  ultra: true  },
                { feature: "Backups programados automaticos",       free: false, plus: false, pro: true,  ultra: true  },
                { feature: "Backup en tiempo real",                 free: false, plus: false, pro: false, ultra: true  },
                { feature: "Transferir config entre servidores",    free: false, plus: false, pro: false, ultra: true  },
                { feature: "Exportar backup (JSON)",                free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "AntiNuke completo",                     free: false, plus: false, pro: true,  ultra: true  },
                { feature: "AntiAlt avanzado",                      free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Verificacion CAPTCHA",                  free: false, plus: false, pro: true,  ultra: true  },
                { feature: "AntiVPN / AntiProxy",                   free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "URL de verificacion personalizada",     free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Multi-panel de tickets",                free: false, plus: false, pro: true,  ultra: true  },
                { feature: "Transcripciones de tickets",            free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Respuesta IA en tickets",               free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Analisis de seguridad IA",              free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Configuracion automatica (IA Ultra)",   free: false, plus: false, pro: false, ultra: true  },
                { feature: "Logs avanzados de moderacion",          free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Analitica del servidor",                free: false, plus: false, pro: true,  ultra: true  },
                { feature: "API de Neuralix (bot integration)",     free: false, plus: false, pro: true,  ultra: true  },
                { feature: "Blacklist global de usuarios",          free: false, plus: false, pro: true,  ultra: true  },
                { feature: "Check blacklist al unirse (endpoint)",  free: false, plus: false, pro: true,  ultra: true  },
                { feature: "Reset de verificacion de usuarios",     free: false, plus: false, pro: true,  ultra: true  },
                { feature: "Soporte prioritario",                   free: false, plus: true,  pro: true,  ultra: true  },
                { feature: "Soporte dedicado 24/7",                 free: false, plus: false, pro: false, ultra: true  },
                { feature: "Bot con nombre personalizado",          free: false, plus: false, pro: false, ultra: true  },
                { feature: "Integraciones personalizadas",          free: false, plus: false, pro: false, ultra: true  },
                { feature: "Acceso anticipado a nuevas funciones",  free: false, plus: false, pro: false, ultra: true  },
              ].map(({ feature, free, plus, pro, ultra }) => (
                <tr key={feature} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-2 pr-4 text-muted-foreground text-xs">{feature}</td>
                  {[free, plus, pro, ultra].map((val, idx) => (
                    <td key={idx} className="text-center py-2 px-2">
                      {val ? (
                        <Check className="w-4 h-4 text-green-400 mx-auto" aria-label="Incluido" />
                      ) : (
                        <span className="text-border text-lg leading-none" aria-label="No incluido">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}
