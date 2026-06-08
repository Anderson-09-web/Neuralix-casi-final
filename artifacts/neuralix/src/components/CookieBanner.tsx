import { useState, useEffect } from "react";
import { Cookie, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem("neuralix_cookies_accepted");
      if (!accepted) setVisible(true);
    } catch {}
  }, []);

  const accept = () => {
    try { localStorage.setItem("neuralix_cookies_accepted", "all"); } catch {}
    setVisible(false);
  };

  const acceptNecessary = () => {
    try { localStorage.setItem("neuralix_cookies_accepted", "necessary"); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-[100] bg-card border border-border rounded-xl shadow-2xl p-5"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Cookie className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm mb-1">Uso de cookies</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Usamos cookies esenciales para mantener tu sesion activa con Discord OAuth2, y cookies de preferencias para recordar tu tema (oscuro/claro). No usamos cookies de rastreo ni publicidad.
          </p>
        </div>
        <button
          onClick={acceptNecessary}
          aria-label="Cerrar banner de cookies"
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 p-2.5 bg-primary/5 border border-primary/15 rounded-lg">
        <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="text-primary font-medium">Cookies esenciales:</span> Sesion Discord OAuth2 · Preferencias de tema
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={acceptNecessary}
        >
          Solo necesarias
        </Button>
        <Button
          size="sm"
          className="flex-1 text-xs"
          onClick={accept}
        >
          Aceptar todas
        </Button>
      </div>
    </div>
  );
}
