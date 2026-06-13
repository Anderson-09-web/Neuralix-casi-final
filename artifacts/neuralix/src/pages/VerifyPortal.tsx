import { useEffect, useState } from "react";
import { Shield, CheckCircle, XCircle, Lock, AlertTriangle, ExternalLink } from "lucide-react";
import { useVerifyUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GuildInfo = {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  enabled: boolean;
  minAccountAge: number;
  antiVpn: boolean;
  antiAlt: boolean;
  antiBot: boolean;
  panelTitle: string | null;
  panelDescription: string | null;
};

function GuildAvatar({ icon, name, size = "md" }: { icon: string | null; name: string; size?: "md" | "lg" }) {
  const px = size === "lg" ? "w-16 h-16 text-2xl" : "w-10 h-10 text-base";
  if (icon) return <img src={icon} alt={name} className={cn("rounded-full object-cover flex-shrink-0", px)} />;
  return (
    <div className={cn("rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 font-bold text-primary", px)}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function VerifyPortal() {
  const guildId = new URLSearchParams(window.location.search).get("guild") || "";
  const verify = useVerifyUser();
  const [done, setDone] = useState(false);
  const [guildInfo, setGuildInfo] = useState<GuildInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState(false);

  useEffect(() => {
    if (!guildId) { setLoadingInfo(false); setInfoError(true); return; }
    fetch(`/api/verify-info/${guildId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setGuildInfo(data))
      .catch(() => setInfoError(true))
      .finally(() => setLoadingInfo(false));
  }, [guildId]);

  const handleVerify = () => {
    verify.mutate({ guildId }, {
      onSuccess: (data: any) => {
        if (data?.success !== false) setDone(true);
      },
    });
  };

  const requirements = guildInfo ? [
    guildInfo.minAccountAge > 0 && { icon: "🗓", text: `Cuenta con al menos ${guildInfo.minAccountAge} dias de antiguedad` },
    guildInfo.antiVpn && { icon: "🌐", text: "No usar VPN ni proxy" },
    guildInfo.antiAlt && { icon: "👤", text: "Sin cuentas alternativas" },
    guildInfo.antiBot && { icon: "🤖", text: "No ser un bot no autorizado" },
  ].filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">

        {/* Main card */}
        <div className="bg-card border border-card-border rounded-2xl p-8 text-center shadow-2xl">

          {/* Success state */}
          {done ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              {guildInfo && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <GuildAvatar icon={guildInfo.guildIcon} name={guildInfo.guildName} />
                  <span className="font-semibold text-sm">{guildInfo.guildName}</span>
                </div>
              )}
              <h1 className="text-2xl font-black mb-2 text-green-400">Verificacion exitosa</h1>
              <p className="text-muted-foreground text-sm mb-6">Tu rol ha sido asignado. Ya puedes acceder al servidor.</p>
              <Button variant="outline" className="w-full" onClick={() => window.close()}>Cerrar ventana</Button>
            </>
          ) : verify.data && (verify.data as any)?.success === false ? (
            /* Rejected state */
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-black mb-2 text-destructive">Verificacion fallida</h1>
              <p className="text-muted-foreground text-sm mb-6">{(verify.data as any)?.message || "No cumples los requisitos de verificacion."}</p>
              <Button variant="outline" className="w-full" onClick={() => verify.reset()}>Intentar de nuevo</Button>
            </>
          ) : loadingInfo ? (
            /* Loading state */
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Cargando informacion del servidor...</p>
            </div>
          ) : infoError ? (
            /* Error / no guild */
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-xl font-black mb-2">Enlace invalido</h1>
              <p className="text-muted-foreground text-sm">
                {!guildId ? "No se especifico un servidor valido en el enlace." : "No se encontro configuracion de verificacion para este servidor. Asegurate de haber configurado la verificacion en el dashboard."}
              </p>
            </>
          ) : guildInfo && !guildInfo.enabled ? (
            /* Verification disabled */
            <>
              <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-orange-400" />
              </div>
              {guildInfo && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <GuildAvatar icon={guildInfo.guildIcon} name={guildInfo.guildName} />
                  <span className="font-semibold text-sm">{guildInfo.guildName}</span>
                </div>
              )}
              <h1 className="text-xl font-black mb-2">Verificacion deshabilitada</h1>
              <p className="text-muted-foreground text-sm">El sistema de verificacion no esta activo en este servidor. Contacta a un administrador.</p>
            </>
          ) : (
            /* Main verify state */
            <>
              {/* Guild header */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <GuildAvatar icon={guildInfo!.guildIcon} name={guildInfo!.guildName} size="lg" />
                <div className="text-left">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Verificacion en</p>
                  <p className="font-black text-lg leading-tight">{guildInfo!.guildName}</p>
                </div>
              </div>

              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>

              <h1 className="text-xl font-black mb-2">{guildInfo!.panelTitle || "Verificacion de miembro"}</h1>
              <p className="text-muted-foreground text-sm mb-5">
                {guildInfo!.panelDescription || "Para acceder al servidor, necesitas verificar tu identidad."}
              </p>

              {/* Requirements */}
              {requirements.length > 0 && (
                <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-5 text-left space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Requisitos</p>
                  {requirements.map((r: any, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="text-sm">{r.icon}</span>
                      <p className="text-xs text-muted-foreground">{r.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Security badge */}
              <div className="flex items-center justify-center gap-1.5 mb-5 text-xs text-muted-foreground">
                <Lock className="w-3 h-3" />
                <span>Proceso seguro y privado — Neuralix</span>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleVerify}
                disabled={!guildId || verify.isPending}
                data-testid="btn-verify"
              >
                {verify.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                    Verificando...
                  </span>
                ) : (
                  "Verificarme ahora"
                )}
              </Button>

              {verify.isError && (
                <p className="text-xs text-destructive mt-3">Error de conexion. Por favor intenta de nuevo.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Sistema de verificacion — <span className="text-primary font-medium">Neuralix</span>
        </p>
      </div>
    </div>
  );
}
