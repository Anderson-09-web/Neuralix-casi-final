import { useLocation } from "wouter";
import { Shield, CheckCircle, XCircle } from "lucide-react";
import { useVerifyUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function VerifyPortal() {
  const [location] = useLocation();
  const guildId = new URLSearchParams(window.location.search).get("guild") || "";
  const verify = useVerifyUser();
  const [done, setDone] = useState(false);

  const handleVerify = () => {
    verify.mutate({ guildId }, {
      onSuccess: () => setDone(true),
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-card-border rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          {done ? <CheckCircle className="w-8 h-8 text-green-400" /> : <Shield className="w-8 h-8 text-primary" />}
        </div>

        {done ? (
          <>
            <h1 className="text-2xl font-black mb-3 text-green-400">Verificacion exitosa</h1>
            <p className="text-muted-foreground mb-6">Tu rol ha sido asignado. Ya puedes acceder al servidor.</p>
            <Button variant="outline" onClick={() => window.close()}>Cerrar ventana</Button>
          </>
        ) : verify.data && !verify.data.success ? (
          <>
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-black mb-3 text-destructive">Verificacion fallida</h1>
            <p className="text-muted-foreground">{verify.data.message}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black mb-3">Verificacion de miembro</h1>
            <p className="text-muted-foreground mb-2">Para acceder al servidor, necesitas verificar tu identidad.</p>
            {guildId ? (
              <p className="text-xs text-muted-foreground mb-8">Servidor ID: <span className="font-mono text-foreground">{guildId}</span></p>
            ) : (
              <p className="text-xs text-destructive mb-8">No se especifico un servidor valido.</p>
            )}
            <Button className="w-full" size="lg" onClick={handleVerify} disabled={!guildId || verify.isPending} data-testid="btn-verify">
              {verify.isPending ? "Verificando..." : "Verificarme ahora"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
