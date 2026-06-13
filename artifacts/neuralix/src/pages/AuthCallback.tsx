import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const redirected = useRef(false);

  const { data: user, isError, isSuccess } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: 4,
      retryDelay: (attempt) => Math.min(500 * (attempt + 1), 2000),
    },
  });

  useEffect(() => {
    if (redirected.current) return;

    if (isSuccess && user) {
      redirected.current = true;
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

    if (isError) {
      redirected.current = true;
      setLocation("/?error=oauth_failed");
    }
  }, [isSuccess, isError, user, setLocation, queryClient]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Iniciando sesion...</p>
      </div>
    </div>
  );
}
