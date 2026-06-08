import { Link, useLocation } from "wouter";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, LayoutDashboard, Users, Ticket, ShieldAlert, FileText,
  Star, Database, Settings, ChevronLeft, ChevronRight, Sun, Moon,
  HeadphonesIcon, LogOut, Menu, X, Bot, Bell, ChevronDown
} from "lucide-react";
import { useGetMe, useLogout, useGetGuild, getGetMeQueryKey, getGetGuildQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import SupportWidget from "./SupportWidget";
import AiAssistant from "./AiAssistant";

const navItems = (guildId: string) => [
  { href: `/servers/${guildId}`, icon: LayoutDashboard, label: "Dashboard" },
  { href: `/servers/${guildId}/welcome`, icon: Users, label: "Bienvenidas" },
  { href: `/servers/${guildId}/goodbye`, icon: Users, label: "Despedidas" },
  { href: `/servers/${guildId}/verification`, icon: Shield, label: "Verificacion" },
  { href: `/servers/${guildId}/tickets`, icon: Ticket, label: "Tickets" },
  { href: `/servers/${guildId}/antiraid`, icon: ShieldAlert, label: "AntiRaid" },
  { href: `/servers/${guildId}/logs`, icon: FileText, label: "Logs" },
  { href: `/servers/${guildId}/premium`, icon: Star, label: "Premium" },
  { href: `/servers/${guildId}/backups`, icon: Database, label: "Backups" },
];

interface LayoutProps {
  children: React.ReactNode;
  guildId?: string;
  guildName?: string;
  guildIcon?: string | null;
}

export default function Layout({ children, guildId, guildName, guildIcon }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const logout = useLogout();
  const qc = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => { qc.clear(); window.location.href = "/"; } });
  };

  const avatarUrl = user?.avatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png` : undefined;

  // Auto-fetch del nombre del servidor para que TODAS las páginas del panel muestren el nombre
  const { data: guildData } = useGetGuild(guildId!, {
    query: { queryKey: getGetGuildQueryKey(guildId || ""), enabled: !!guildId }
  });
  const resolvedGuildName = guildName || guildData?.name;
  const resolvedGuildIcon = guildIcon ?? guildData?.icon;

  // Guardar el ultimo servidor visitado para recuperarlo al volver del panel admin
  if (guildId) {
    try { sessionStorage.setItem("neuralix_last_guild", guildId); } catch {}
  }
  const lastGuildId = (() => { try { return sessionStorage.getItem("neuralix_last_guild"); } catch { return null; } })();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 glow-primary">
          <Bot className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-sidebar-foreground text-sm tracking-wide">Neuralix</span>
            <div className="text-xs text-muted-foreground font-medium">Enterprise</div>
          </div>
        )}
      </div>

      {/* Guild info */}
      {guildId && (
        <div className={cn("px-4 py-3 border-b border-sidebar-border", collapsed && "px-2 flex justify-center")}>
          {!collapsed ? (
            <div className="flex items-center gap-2">
              {resolvedGuildIcon ? (
                <img src={`https://cdn.discordapp.com/icons/${guildId}/${resolvedGuildIcon}.png`} className="w-6 h-6 rounded-full" alt="" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{resolvedGuildName?.[0]}</span>
                </div>
              )}
              <span className="text-xs font-semibold text-sidebar-foreground truncate">{resolvedGuildName || "Cargando..."}</span>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">{resolvedGuildName?.[0] || "…"}</span>
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {guildId ? navItems(guildId).map(({ href, icon: Icon, label }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer group",
                active
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className={cn("w-4 h-4 flex-shrink-0", active && "text-primary")} />
              {!collapsed && <span>{label}</span>}
              {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </Link>
          );
        }) : (
          <div className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            {!collapsed && "Selecciona un servidor"}
          </div>
        )}

        {/* Back to servers list */}
        {guildId && (
          <Link
            href="/servers"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer mt-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent",
              collapsed && "justify-center px-2"
            )}
          >
            <ChevronRight className="w-4 h-4 flex-shrink-0 rotate-180" />
            {!collapsed && <span>Volver a servidores</span>}
          </Link>
        )}

        {/* Back to server button when in Admin without guild context */}
        {!guildId && lastGuildId && (
          <Link
            href={`/servers/${lastGuildId}`}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer mt-1 text-primary hover:bg-primary/10 border border-primary/20",
              collapsed && "justify-center px-2"
            )}
          >
            <ChevronRight className="w-4 h-4 flex-shrink-0 rotate-180" />
            {!collapsed && <span>Volver al servidor</span>}
          </Link>
        )}

        {/* Admin link */}
        {(user?.isOwner || (user as any)?.isSecondaryAdmin) && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer mt-1",
              location === "/admin" ? "bg-accent/15 text-accent border border-accent/20" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Admin Global</span>}
          </Link>
        )}
      </nav>

      {/* User */}
      <div className={cn("px-2 py-3 border-t border-sidebar-border space-y-1", collapsed && "px-1")}>
        <button
          onClick={handleLogout}
          aria-label="Cerrar sesion"
          className={cn("flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive", collapsed && "justify-center px-2")}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {!collapsed && <span>Cerrar sesion</span>}
        </button>
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-3 py-2">
            <Avatar className="w-6 h-6">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-xs bg-primary/20 text-primary">{user.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-sidebar-foreground truncate">{user.username}</div>
              {user.isOwner && <div className="text-xs text-accent">Owner</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 56 : 220 }}
        transition={{ duration: 0.2 }}
        className="hidden md:flex flex-col bg-sidebar border-r border-sidebar-border relative flex-shrink-0"
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          data-testid="toggle-sidebar"
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </motion.aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        {mobileOpen && (
          <motion.aside
            key="mobile-sidebar"
            role="navigation"
            aria-label="Menu de navegacion"
            initial={{ x: -220 }}
            animate={{ x: 0 }}
            exit={{ x: -220 }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed left-0 top-0 bottom-0 w-[220px] bg-sidebar border-r border-sidebar-border z-50 md:hidden flex flex-col"
          >
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu de navegacion"
              aria-expanded={mobileOpen}
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <nav className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
              <Link href="/servers" className="hover:text-foreground transition-colors">Servidores</Link>
              {resolvedGuildName && (
                <>
                  <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                  <span className="text-foreground font-medium">{resolvedGuildName}</span>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <SupportWidget />
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg bg-secondary hover:bg-accent/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="toggle-theme"
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>
            {user && (
              <Avatar className="w-8 h-8">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="text-xs bg-primary/20 text-primary">{user.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-3 md:p-6">
          {children}
        </main>
      </div>

      {/* AI Assistant (only in guild pages) */}
      {guildId && <AiAssistant guildId={guildId} />}
    </div>
  );
}
