import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Bot, Plus, RefreshCw, Server, Users, Crown, AlertTriangle } from "lucide-react";
import { useGetMe, useGetGuilds, getGetMeQueryKey, getGetGuildsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";

export default function ServersPage() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: guilds, isLoading: guildsLoading, refetch, isError: guildsError } = useGetGuilds({ query: { queryKey: getGetGuildsQueryKey(), enabled: !!user, refetchOnMount: true, staleTime: 0, refetchInterval: 30000, refetchIntervalInBackground: false } });
  const logout = useLogout();
  const [botInviteUrl, setBotInviteUrl] = useState<string>("#");

  useEffect(() => {
    fetch("/api/auth/bot-invite")
      .then((r) => r.json())
      .then((d) => { if (d.url) setBotInviteUrl(d.url); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/");
    }
  }, [user, userLoading, setLocation]);

  if (userLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return null;

  const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png` : undefined;

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => { qc.clear(); setLocation("/"); } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm px-4 md:px-6 h-14 md:h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm md:text-base">Neuralix</span>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="refresh-guilds">
            <RefreshCw className={`w-4 h-4 ${guildsLoading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-border">
            {avatarUrl ? (
              <img src={avatarUrl} className="w-7 h-7 md:w-8 md:h-8 rounded-full" alt={user.username} />
            ) : (
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">{(user.username?.[0] ?? "?").toUpperCase()}</div>
            )}
            <span className="text-sm font-medium hidden sm:block">{user.username}</span>
          </div>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive transition-colors" data-testid="btn-logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-black mb-2">Tus Servidores</h1>
          <p className="text-muted-foreground mb-10">Selecciona un servidor para gestionarlo con Neuralix.</p>

          {guildsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-36 rounded-xl bg-card border border-card-border animate-pulse" />
              ))}
            </div>
          ) : guildsError || !Array.isArray(guilds) ? (
            <div className="text-center py-24 bg-card rounded-xl border border-card-border">
              <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Error al cargar los servidores</h3>
              <p className="text-muted-foreground text-sm mb-6">Tu sesion de Discord pudo haber expirado. Intenta de nuevo o vuelve a iniciar sesion.</p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={() => refetch()} className="gap-2">
                  <RefreshCw className="w-4 h-4" /> Reintentar
                </Button>
                <Button onClick={handleLogout} variant="ghost" className="gap-2 text-destructive hover:text-destructive">
                  <LogOut className="w-4 h-4" /> Volver a iniciar sesion
                </Button>
              </div>
            </div>
          ) : !guilds.length ? (
            <div className="text-center py-24 bg-card rounded-xl border border-card-border">
              <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No tienes servidores con permisos</h3>
              <p className="text-muted-foreground text-sm">Necesitas ser administrador de un servidor para gestionarlo con Neuralix.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {guilds.map((guild, i) => {
                const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;
                return (
                  <div key={guild.id}>
                    <button
                      data-testid={`guild-card-${guild.id}`}
                      onClick={() => setLocation(`/servers/${guild.id}`)}
                      className="w-full text-left p-5 rounded-xl bg-card border border-card-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        {iconUrl ? (
                          <img src={iconUrl} className="w-14 h-14 rounded-full" alt={guild.name} />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-xl font-black text-primary">{guild.name?.[0] ?? "?"}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate group-hover:text-primary transition-colors">{guild.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            {guild.botPresent ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium border border-green-500/20">Bot activo</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium border border-border">Sin bot</span>
                            )}
                            {guild.premiumTier > 0 && (
                              <Crown className="w-3.5 h-3.5 text-yellow-400" />
                            )}
                          </div>
                        </div>
                      </div>
                      {guild.memberCount > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          {guild.memberCount.toLocaleString()} miembros
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}

              {/* Add to new server */}
              <div>
                <a
                  href={botInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center h-full min-h-[140px] p-5 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group cursor-pointer"
                  data-testid="add-bot-link"
                >
                  <Plus className="w-8 h-8 mb-2" />
                  <span className="text-sm font-medium">Agregar a nuevo servidor</span>
                </a>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
