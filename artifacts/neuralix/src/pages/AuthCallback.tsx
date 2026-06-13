import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const redirected = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const MAX_ATTEMPTS = 12;
  const DELAY_MS = 700;

  useEffect(() => {
    if (redirected.current) return;

    // Immediately wipe any cached /me state so we never read stale 401
    queryClient.removeQueries({ queryKey: getGetMeQueryKey() });

    let cancelled = false;

    async function pollMe() {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled || redirected.current) return;

        // Small delay before each attempt (first one too — cookie needs a tick)
        await new Promise((r) => setTimeout(r, DELAY_MS));
        if (cancelled || redirected.current) return;

        setAttempt(i + 1);

        try {
          const res = await fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          });

          if (res.ok) {
            if (redirected.current) return;
            redirected.current = true;

            // Populate React Query cache with the fresh user data
            const user = await res.json();
            queryClient.setQueryData(getGetMeQueryKey(), user);
            queryClient.invalidateQueries();

            // If came from verify portal, redirect back there
            const verifyRedirect = sessionStorage.getItem("verify_redirect");
            if (verifyRedirect) {
              sessionStorage.removeItem("verify_redirect");
              window.location.href = verifyRedirect;
              return;
            }
            setLocation("/servers");
            return;
          }
        } catch {
          // Network error — keep retrying
        }
      }

      // All attempts exhausted
      if (!redirected.current) {
        redirected.current = true;
        setLocation("/?error=oauth_failed");
      }
    }

    pollMe();

    return () => {
      cancelled = true;
    };
  }, [queryClient, setLocation]);

  const dots = ".".repeat((attempt % 3) + 1).padEnd(3, "\u00a0");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-5">
        <div className="relative w-14 h-14 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full bg-primary/20" />
          </div>
        </div>
        <div>
          <p className="text-foreground font-semibold">Verificando sesion{dots}</p>
          <p className="text-muted-foreground text-xs mt-1">Por favor espera un momento</p>
        </div>
        {attempt >= 6 && (
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Tardando mas de lo esperado. Asegurate de que las cookies esten habilitadas en tu navegador.
          </p>
        )}
      </div>
    </div>
  );
}
