import { useState, useRef, useEffect, useCallback } from "react";
import { Settings, Users, FileText, Shield, BarChart3, Plus, Trash2, CheckCircle, UserCheck, UserX, Edit2, X, MessageSquare, Send, ChevronRight, Clock, CheckCheck, RefreshCw, Crown, Key, Copy, Check, Activity, Ban, ShieldOff, ShieldCheck, KeyRound, KeySquare, UserMinus, UserPlus, Bell, BellOff, Globe, Zap, Star } from "lucide-react";
import {
  useGetAdminStats, useGetLicenses, useCreateLicense, useRevokeLicense,
  useGetBlacklist, useAddToBlacklist, useRemoveFromBlacklist,
  useGetAnnouncements, useCreateAnnouncement, useDeleteAnnouncement,
  useGetSupportTickets, useGetSupportMessages, useSendSupportMessage,
  useGetMe, useGetBotSettings, useUpdateBotSettings,
  getGetAdminStatsQueryKey, getGetLicensesQueryKey, getGetBlacklistQueryKey, getGetAnnouncementsQueryKey,
  getGetSupportTicketsQueryKey, getGetSupportMessagesQueryKey, getGetMeQueryKey, getGetBotSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ALL_TABS = ["stats", "licenses", "blacklist", "announcements", "admins", "soporte", "actividad", "servidores", "masivas", "links", "bot"] as const;
type Tab = typeof ALL_TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  stats: "Estadisticas",
  licenses: "Licencias",
  blacklist: "Blacklist",
  announcements: "Anuncios",
  admins: "Administradores",
  soporte: "Soporte",
  actividad: "Actividad",
  servidores: "Servidores",
  masivas: "Acciones Masivas",
  links: "Links",
  bot: "Credenciales Bot",
};

const PERM_TO_TAB: Partial<Record<Tab, string>> = {
  stats: "view_stats",
  licenses: "manage_licenses",
  blacklist: "manage_blacklist",
  announcements: "manage_announcements",
  soporte: "manage_support",
};

const ALL_PERMISSIONS = [
  { id: "manage_licenses", label: "Gestionar licencias" },
  { id: "manage_blacklist", label: "Gestionar blacklist" },
  { id: "manage_announcements", label: "Gestionar anuncios" },
  { id: "view_stats", label: "Ver estadisticas" },
  { id: "manage_support", label: "Gestionar soporte" },
];

const ACTION_META: Record<string, { label: string; color: string; Icon: any }> = {
  create_license:    { label: "Licencia creada",         color: "text-green-400 bg-green-500/10",  Icon: KeyRound },
  revoke_license:    { label: "Licencia revocada",       color: "text-red-400 bg-red-500/10",     Icon: KeySquare },
  add_blacklist:     { label: "Agregado a blacklist",    color: "text-red-400 bg-red-500/10",     Icon: Ban },
  update_blacklist:  { label: "Blacklist actualizada",   color: "text-orange-400 bg-orange-500/10", Icon: Shield },
  remove_blacklist:  { label: "Removido de blacklist",   color: "text-blue-400 bg-blue-500/10",   Icon: ShieldOff },
  grant_admin:       { label: "Admin otorgado",          color: "text-primary bg-primary/10",     Icon: UserPlus },
  update_admin:      { label: "Admin actualizado",       color: "text-accent bg-accent/10",       Icon: UserCheck },
  update_admin_perms:{ label: "Permisos actualizados",  color: "text-accent bg-accent/10",       Icon: Settings },
  activate_admin:    { label: "Admin activado",          color: "text-green-400 bg-green-500/10", Icon: ShieldCheck },
  suspend_admin:     { label: "Admin suspendido",        color: "text-orange-400 bg-orange-500/10", Icon: UserX },
  delete_admin:      { label: "Admin eliminado",         color: "text-red-400 bg-red-500/10",     Icon: UserMinus },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  normal: "bg-blue-500/20 text-blue-400",
  low: "bg-secondary text-muted-foreground",
};

const LS_KEY = "nrl_admin_entered_tickets";
function getEnteredSet(): Set<number> {
  try { const raw = localStorage.getItem(LS_KEY); return new Set(raw ? (JSON.parse(raw) as number[]) : []); } catch { return new Set(); }
}
function markEntered(id: number): void {
  try { const s = getEnteredSet(); s.add(id); localStorage.setItem(LS_KEY, JSON.stringify([...s])); } catch {}
}
function hasEntered(id: number): boolean { return getEnteredSet().has(id); }

/* ── Native styled select (no Radix portal) ──────────────────────────── */
function NativeSelect({ value, onChange, children, className }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer",
        className
      )}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
    >
      {children}
    </select>
  );
}

/* ── Copy button ─────────────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <button onClick={copy} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" aria-label="Copiar clave">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Admin Support Chat ───────────────────────────────────────────────── */
function AdminSupportChat({ ticketId, ticketSubject, ticketStatus, ticketUsername, onBack, onStatusChange }: {
  ticketId: number; ticketSubject: string; ticketStatus: string; ticketUsername: string;
  onBack: () => void; onStatusChange: (s: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [chatMsg, setChatMsg] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [localStatus, setLocalStatus] = useState(ticketStatus);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendMessage = useSendSupportMessage();

  useEffect(() => { setLocalStatus(ticketStatus); }, [ticketStatus]);

  const { data: messages } = useGetSupportMessages(ticketId, {
    query: { enabled: !!ticketId, queryKey: getGetSupportMessagesQueryKey(ticketId), refetchInterval: 3000 },
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!ticketId || hasEntered(ticketId)) return;
    markEntered(ticketId);
    sendMessage.mutate(
      { id: ticketId, data: { content: "⚡ Un administrador ha entrado al chat. En breve te atenderemos." } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey(ticketId) }) }
    );
  }, [ticketId]);

  const handleSend = () => {
    if (!chatMsg.trim()) return;
    const content = chatMsg;
    setChatMsg("");
    sendMessage.mutate(
      { id: ticketId, data: { content } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey(ticketId) }) }
    );
  };

  const handleToggleStatus = async () => {
    setUpdatingStatus(true);
    const newStatus = localStatus === "open" ? "closed" : "open";
    let success = false;
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any)?.error || `HTTP ${res.status}`); }
      success = true;
    } catch (err: any) {
      toast({ title: `Error: ${err?.message || "No se pudo actualizar el ticket"}`, variant: "destructive" });
    } finally { setUpdatingStatus(false); }
    if (success) {
      setLocalStatus(newStatus); onStatusChange(newStatus);
      qc.invalidateQueries({ queryKey: getGetSupportTicketsQueryKey() });
      toast({ title: newStatus === "closed" ? "Ticket cerrado" : "Ticket reabierto" });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          ← Volver a tickets
        </button>
        <Button size="sm" variant={localStatus === "open" ? "outline" : "default"}
          className={cn("gap-2 h-8 text-xs", localStatus === "closed" && "border-green-500/50 text-green-400 hover:text-green-300")}
          onClick={handleToggleStatus} disabled={updatingStatus}>
          {localStatus === "open" ? <><X className="w-3.5 h-3.5" /><span>Cerrar ticket</span></> : <><CheckCheck className="w-3.5 h-3.5" /><span>Reabrir ticket</span></>}
        </Button>
      </div>
      <div className="bg-card border border-card-border rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-semibold text-sm">{ticketSubject}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Usuario: {ticketUsername} · Ticket #{ticketId}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", localStatus === "open" ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground")}>
              {localStatus === "open" ? "Abierto" : "Cerrado"}
            </span>
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0" style={{ maxHeight: "420px" }}>
          {!messages || messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Sin mensajes aun</div>
          ) : messages.map((m) => (
            <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
              {m.isStaff && (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div className={cn("max-w-[75%] px-4 py-2.5 rounded-xl text-sm", m.isStaff ? "bg-secondary text-foreground" : "bg-primary/20 text-foreground border border-primary/20")}>
                {m.isStaff && <p className="text-xs font-bold mb-1 text-primary">[Soporte] {m.username}</p>}
                <p className="leading-relaxed">{m.content}</p>
                <p className="text-xs mt-1.5 opacity-50">{new Date(m.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        {localStatus === "open" ? (
          <div className="p-4 border-t border-border flex gap-3 flex-shrink-0">
            <Input placeholder="Responder como soporte..." value={chatMsg} onChange={(e) => setChatMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()} />
            <Button onClick={handleSend} disabled={sendMessage.isPending || !chatMsg.trim()} size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="p-4 border-t border-border text-center text-xs text-muted-foreground flex-shrink-0">
            Este ticket esta cerrado. Reabre el ticket para seguir respondiendo.
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("stats");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isOwner = !!(me as any)?.isOwner;
  const isSecondaryAdmin = !!(me as any)?.isSecondaryAdmin;
  const adminPermissions: string[] = (me as any)?.adminPermissions || [];

  const visibleTabs = ALL_TABS.filter((t) => {
    if (isOwner) return true;
    if (t === "admins") return false;
    const perm = PERM_TO_TAB[t];
    return perm ? adminPermissions.includes(perm) : false;
  });

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(tab)) setTab(visibleTabs[0]);
  }, [isOwner, isSecondaryAdmin]);

  const { data: stats } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey(), enabled: isOwner || adminPermissions.includes("view_stats") } });
  const { data: licenses, isLoading: licensesLoading } = useGetLicenses({ query: { queryKey: getGetLicensesQueryKey(), enabled: isOwner || adminPermissions.includes("manage_licenses") } });
  const { data: blacklist } = useGetBlacklist({ query: { queryKey: getGetBlacklistQueryKey(), enabled: isOwner || adminPermissions.includes("manage_blacklist") } });
  const { data: announcements } = useGetAnnouncements({ query: { queryKey: getGetAnnouncementsQueryKey() } });
  const { data: supportTickets } = useGetSupportTickets({
    query: {
      queryKey: getGetSupportTicketsQueryKey(),
      refetchInterval: tab === "soporte" ? 5000 : false,
      enabled: isOwner || adminPermissions.includes("manage_support"),
    },
  });

  const createLicense = useCreateLicense();
  const revokeLicense = useRevokeLicense();
  const addBlacklist = useAddToBlacklist();
  const removeBlacklist = useRemoveFromBlacklist();
  const createAnnouncement = useCreateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  /* License form */
  const [newLicensePlan, setNewLicensePlan] = useState("plus");
  const [newLicenseExpiry, setNewLicenseExpiry] = useState("");

  /* Blacklist form */
  const [blUserId, setBlUserId] = useState("");
  const [blUsername, setBlUsername] = useState("");
  const [blReason, setBlReason] = useState("");
  const [blEvidence, setBlEvidence] = useState("");
  const [blDuration, setBlDuration] = useState("0");
  const [selectedBl, setSelectedBl] = useState<any>(null);

  /* Announcements form */
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [annType, setAnnType] = useState("info");

  /* Admins form */
  const [adminDiscordId, setAdminDiscordId] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPerms, setAdminPerms] = useState<string[]>(["view_stats"]);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  /* Support */
  const [supportView, setSupportView] = useState<"list" | "chat">("list");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "closed">("open");

  /* Activity logs */
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  /* Servidores */
  const [guildsList, setGuildsList] = useState<any[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [guildsLoaded, setGuildsLoaded] = useState(false);

  /* Blacklist sweep */
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<any>(null);

  /* Servidores pagination */
  const [servidoresPage, setServidoresPage] = useState(0);
  const SERVIDORES_PAGE_SIZE = 20;

  /* Acciones Masivas */
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastColor, setBroadcastColor] = useState("#5865F2");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<any>(null);
  const [csvBlacklistText, setCsvBlacklistText] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<any>(null);
  const [bulkRevokePlan, setBulkRevokePlan] = useState("");
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [bulkRevokeResult, setBulkRevokeResult] = useState<number | null>(null);

  const fetchActivityLogs = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch("/api/admin/activity-logs?limit=100", { credentials: "include" });
      if (res.ok) { setActivityLogs(await res.json()); setActivityLoaded(true); }
      else { const d = await res.json().catch(() => ({})); toast({ title: d.error || "Error al cargar actividad", variant: "destructive" }); }
    } catch { toast({ title: "Error de red al cargar actividad", variant: "destructive" }); } finally { setActivityLoading(false); }
  }, []);

  const fetchGuilds = useCallback(async () => {
    setGuildsLoading(true);
    try {
      const res = await fetch("/api/admin/guilds", { credentials: "include" });
      if (res.ok) { setGuildsList(await res.json()); setGuildsLoaded(true); }
      else { const d = await res.json().catch(() => ({})); toast({ title: d.error || "Error al cargar servidores", variant: "destructive" }); }
    } catch { toast({ title: "Error de red al cargar servidores", variant: "destructive" }); } finally { setGuildsLoading(false); }
  }, []);

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim() && !broadcastTitle.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: broadcastMsg,
          embedTitle: broadcastTitle,
          embedColor: broadcastColor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBroadcastResult(data);
        toast({ title: `Mensaje enviado a ${data.sent} servidores` });
        setBroadcastMsg(""); setBroadcastTitle(""); setBroadcastColor("#5865F2");
      } else {
        toast({ title: data.error || "Error al enviar broadcast", variant: "destructive" });
      }
    } catch { toast({ title: "Error de red", variant: "destructive" }); }
    setBroadcasting(false);
  };

  useEffect(() => {
    if (tab === "actividad" && isOwner && !activityLoaded) fetchActivityLogs();
  }, [tab, isOwner]);

  const handleCsvBlacklistImport = async () => {
    const ids = csvBlacklistText.split(/[\n,]+/).map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s));
    if (ids.length === 0) { toast({ title: "No se detectaron IDs validos", variant: "destructive" }); return; }
    setCsvImporting(true);
    setCsvImportResult(null);
    let added = 0; let skipped = 0; let errors = 0;
    for (const discordId of ids) {
      try {
        const res = await fetch("/api/blacklist", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: discordId, username: discordId, reason: "Importacion masiva CSV" }),
        });
        if (res.status === 409 || res.status === 400) skipped++;
        else if (res.ok) added++;
        else errors++;
      } catch { errors++; }
    }
    setCsvImportResult({ added, skipped, errors });
    toast({ title: `Blacklist importada: ${added} agregados, ${skipped} duplicados, ${errors} errores` });
    setCsvBlacklistText("");
    setCsvImporting(false);
  };

  const handleBulkRevoke = async () => {
    if (!bulkRevokePlan) return;
    setBulkRevoking(true);
    setBulkRevokeResult(null);
    try {
      const res = await fetch("/api/admin/licenses/bulk-revoke", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: bulkRevokePlan }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBulkRevokeResult(data.revoked ?? 0);
        toast({ title: `${data.revoked ?? 0} licencias ${bulkRevokePlan} revocadas` });
        setBulkRevokePlan("");
      } else {
        toast({ title: data.error || "Error al revocar licencias", variant: "destructive" });
      }
    } catch { toast({ title: "Error de red", variant: "destructive" }); }
    setBulkRevoking(false);
  };

  useEffect(() => {
    if (tab === "servidores" && isOwner && !guildsLoaded) fetchGuilds();
  }, [tab, isOwner]);

  /* Bot Settings */
  const { data: botSettings, refetch: refetchBotSettings } = useGetBotSettings({
    query: { queryKey: getGetBotSettingsQueryKey(), enabled: isOwner && tab === "bot" },
  });
  const updateBotSettings = useUpdateBotSettings();
  const [botToken, setBotToken] = useState("");
  const [botClientId, setBotClientId] = useState("");
  const [botClientSecret, setBotClientSecret] = useState("");
  const [botSessionSecret, setBotSessionSecret] = useState("");
  const [botOwnerIds, setBotOwnerIds] = useState("");
  const [botSaving, setBotSaving] = useState(false);

  const handleSaveBotSettings = async () => {
    setBotSaving(true);
    try {
      await updateBotSettings.mutateAsync({
        data: {
          botToken: botToken || null,
          clientId: botClientId || null,
          clientSecret: botClientSecret || null,
          sessionSecret: botSessionSecret || null,
          ownerDiscordIds: botOwnerIds || null,
        },
      });
      toast({ title: "Credenciales del bot guardadas correctamente" });
      setBotToken(""); setBotClientId(""); setBotClientSecret(""); setBotSessionSecret(""); setBotOwnerIds("");
      qc.invalidateQueries({ queryKey: getGetBotSettingsQueryKey() });
    } catch (err: any) {
      toast({ title: `Error: ${err?.data?.error || err?.message || "Error al guardar"}`, variant: "destructive" });
    } finally { setBotSaving(false); }
  };

  useEffect(() => {
    if (tab === "bot" && isOwner) refetchBotSettings();
  }, [tab, isOwner]);

  /* Links */
  const [linksData, setLinksData] = useState<any>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksCopied, setLinksCopied] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const res = await fetch("/api/admin/links", { credentials: "include" });
      if (res.ok) setLinksData(await res.json());
    } catch {} finally { setLinksLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "links" && isOwner) fetchLinks();
  }, [tab, isOwner]);

  const copyLink = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setLinksCopied(key);
      setTimeout(() => setLinksCopied(null), 2000);
    });
  };

  const fetchAdminsList = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const res = await fetch("/api/admin/admins", { credentials: "include" });
      if (res.ok) setAdminsList(await res.json());
    } catch {} finally { setAdminsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "admins" && isOwner) fetchAdminsList(); }, [tab, isOwner]);

  const onErr = (label: string) => (err: any) => {
    const msg = err?.data?.error || err?.message || "Error desconocido";
    toast({ title: `${label}: ${msg}`, variant: "destructive" });
  };

  /* ── Handlers ──────────────────────────────────────────────────────── */
  const handleCreateLicense = async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        createLicense.mutate(
          { data: { plan: newLicensePlan, expiresAt: newLicenseExpiry || undefined } as any },
          {
            onSuccess: () => {
              toast({ title: `Licencia ${newLicensePlan.toUpperCase()} creada correctamente` });
              qc.invalidateQueries({ queryKey: getGetLicensesQueryKey() });
              resolve();
            },
            onError: (err: any) => reject(err),
          }
        );
      });
    } catch (err: any) {
      onErr("Error al crear licencia")(err);
    }
  };

  const handleRevoke = (id: number) => {
    revokeLicense.mutate({ id }, {
      onSuccess: () => { toast({ title: "Licencia revocada" }); qc.invalidateQueries({ queryKey: getGetLicensesQueryKey() }); },
      onError: onErr("Error al revocar licencia"),
    });
  };

  const handleBlacklist = () => {
    if (!blUserId || !blReason) { toast({ title: "ID y motivo son obligatorios", variant: "destructive" }); return; }
    const evidenceArr = blEvidence ? blEvidence.split("\n").map((s) => s.trim()).filter(Boolean) : [];
    const durationDays = blDuration !== "0" ? parseInt(blDuration, 10) : undefined;
    addBlacklist.mutate(
      { data: { userId: blUserId, username: blUsername || blUserId, reason: blReason, evidence: evidenceArr, ...(durationDays ? { durationDays } : {}) } as any },
      {
        onSuccess: () => {
          toast({ title: "Anadido a blacklist" });
          qc.invalidateQueries({ queryKey: getGetBlacklistQueryKey() });
          setBlUserId(""); setBlUsername(""); setBlReason(""); setBlEvidence(""); setBlDuration("0");
        },
        onError: onErr("Error al agregar a blacklist"),
      }
    );
  };

  const handleAnnouncement = () => {
    if (!annTitle || !annContent) { toast({ title: "Completa titulo y contenido", variant: "destructive" }); return; }
    createAnnouncement.mutate({ data: { title: annTitle, content: annContent, type: annType, published: true } }, {
      onSuccess: () => { toast({ title: "Anuncio publicado" }); qc.invalidateQueries({ queryKey: getGetAnnouncementsQueryKey() }); setAnnTitle(""); setAnnContent(""); },
      onError: onErr("Error al publicar anuncio"),
    });
  };

  const handleGrantAdmin = async () => {
    if (!adminDiscordId || !adminUsername) { toast({ title: "ID de Discord y nombre son obligatorios", variant: "destructive" }); return; }
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId: adminDiscordId, username: adminUsername, permissions: adminPerms }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any).error || "Error"); }
      toast({ title: editingAdmin ? "Administrador actualizado" : "Administrador anadido" });
      setAdminDiscordId(""); setAdminUsername(""); setAdminPerms(["view_stats"]);
      setEditingAdmin(null);
      fetchAdminsList();
    } catch (err: any) { toast({ title: err?.message || "Error al guardar administrador", variant: "destructive" }); }
  };

  const handleUpdateAdmin = async (id: number, permissions: string[], active: boolean) => {
    try {
      const res = await fetch(`/api/admin/admins/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions, active }),
      });
      if (!res.ok) throw new Error();
      toast({ title: active ? "Administrador activado" : "Administrador suspendido" });
      fetchAdminsList();
    } catch { toast({ title: "Error al actualizar", variant: "destructive" }); }
  };

  const handleDeleteAdmin = async (id: number) => {
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/admin/admins/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      toast({ title: "Administrador eliminado" });
      fetchAdminsList();
    } catch { toast({ title: "Error al eliminar", variant: "destructive" }); }
  };

  const handleEditAdmin = (a: any) => {
    setEditingAdmin(a);
    setAdminDiscordId(a.discordId);
    setAdminUsername(a.username);
    setAdminPerms(a.permissions || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditingAdmin(null); setAdminDiscordId(""); setAdminUsername(""); setAdminPerms(["view_stats"]); };

  const togglePerm = (perm: string) =>
    setAdminPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);

  const filteredTickets = Array.isArray(supportTickets)
    ? supportTickets.filter((t: any) => ticketFilter === "all" || t.status === ticketFilter)
    : [];
  const openCount = Array.isArray(supportTickets) ? supportTickets.filter((t: any) => t.status === "open").length : 0;

  if (!isOwner && !isSecondaryAdmin && me) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <Shield className="w-16 h-16 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-black mb-2">Acceso denegado</h1>
          <p className="text-muted-foreground">No tienes permisos para acceder al panel de administracion.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-black mb-1">Panel de Administracion</h1>
        <p className="text-muted-foreground text-sm">
          {isOwner ? "Control global de Neuralix. Acceso exclusivo para el Owner." : "Panel de administrador. Acceso limitado segun tus permisos."}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit mb-6 flex-wrap" role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => { setTab(t); setSupportView("list"); }}
            data-testid={`admin-tab-${t}`}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all relative",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {TAB_LABELS[t]}
            {t === "soporte" && openCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
                {openCount > 9 ? "9+" : openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Stats ── */}
      {tab === "stats" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ["Servidores", stats?.totalGuilds ?? 0, "text-primary"],
            ["Usuarios", stats?.totalUsers ?? 0, "text-accent"],
            ["Tickets soporte", (stats as any)?.openSupport ?? 0, "text-green-400"],
            ["Blacklist", stats?.activeBlacklist ?? 0, "text-red-400"],
            ["Premium activo", stats?.premiumGuilds ?? 0, "text-yellow-400"],
            ["Backups totales", stats?.totalBackups ?? 0, "text-blue-400"],
            ["Admins activos", (stats as any)?.totalAdmins ?? 0, "text-purple-400"],
            ["Tickets Discord", (stats as any)?.totalTickets ?? 0, "text-orange-400"],
          ].map(([label, val, cls]) => (
            <div key={label as string} className="bg-card border border-card-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-2xl font-black mt-1", cls as string)}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Licenses ── */}
      {tab === "licenses" && (
        <div className="space-y-5">
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold mb-4 text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> Generar nueva licencia
            </h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Plan</label>
                <NativeSelect value={newLicensePlan} onChange={setNewLicensePlan} className="w-32">
                  <option value="plus">Plus</option>
                  <option value="pro">Pro</option>
                  <option value="ultra">Ultra</option>
                </NativeSelect>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Expiracion (opcional)</label>
                <input
                  type="date"
                  value={newLicenseExpiry}
                  onChange={(e) => setNewLicenseExpiry(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <Button
                onClick={handleCreateLicense}
                disabled={createLicense.isPending}
                className="gap-2 h-9"
                data-testid="btn-create-license"
              >
                <Plus className="w-4 h-4" />
                <span>{createLicense.isPending ? "Generando..." : "Generar licencia"}</span>
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {licensesLoading ? "Cargando..." : `${Array.isArray(licenses) ? licenses.length : 0} licencias`}
            </p>
            <div className="space-y-2">
              {!Array.isArray(licenses) || licenses.length === 0 ? (
                <div className="text-center py-12 bg-card border border-card-border rounded-xl text-muted-foreground text-sm">
                  No hay licencias generadas aun
                </div>
              ) : licenses.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-4 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", l.active ? "bg-green-400" : "bg-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono text-primary">{l.key}</code>
                        <CopyBtn text={l.key} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium",
                          l.plan === "ultra" ? "bg-yellow-500/20 text-yellow-400" : l.plan === "pro" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
                        )}>{l.plan?.toUpperCase()}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded", l.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                          {l.active ? "Activa" : "Usada/Revocada"}
                        </span>
                        {l.guildId && <span className="text-xs text-muted-foreground">Servidor: {l.guildId}</span>}
                        {l.expiresAt && <span className="text-xs text-muted-foreground">Expira: {new Date(l.expiresAt).toLocaleDateString("es")}</span>}
                      </div>
                    </div>
                  </div>
                  {l.active && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 w-8 p-0 flex-shrink-0"
                      onClick={() => handleRevoke(l.id)} aria-label="Revocar licencia">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Blacklist ── */}
      {tab === "blacklist" && (
        <div className="space-y-5">
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Agregar a blacklist global</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Discord ID *</Label>
                <Input placeholder="123456789012345678" value={blUserId} onChange={(e) => setBlUserId(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Nombre de usuario</Label>
                <Input placeholder="Usuario#0" value={blUsername} onChange={(e) => setBlUsername(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Motivo completo *</Label>
              <Textarea placeholder="Describe detalladamente el motivo..." value={blReason} onChange={(e) => setBlReason(e.target.value)} rows={3} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Evidencias (una por linea)</Label>
              <Textarea placeholder="https://cdn.discord.com/..." value={blEvidence} onChange={(e) => setBlEvidence(e.target.value)} rows={3} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Duracion del ban</Label>
              <NativeSelect value={blDuration} onChange={setBlDuration} className="w-full">
                <option value="0">Permanente</option>
                <option value="1">1 dia</option>
                <option value="3">3 dias</option>
                <option value="7">7 dias</option>
                <option value="14">14 dias</option>
                <option value="30">30 dias</option>
                <option value="60">60 dias</option>
                <option value="90">90 dias</option>
                <option value="180">180 dias</option>
                <option value="365">1 año</option>
              </NativeSelect>
            </div>
            <Button onClick={handleBlacklist} disabled={addBlacklist.isPending} className="gap-2">
              <Shield className="w-4 h-4" /><span>Agregar a blacklist</span>
            </Button>
          </div>

          {/* Global sweep */}
          <div className="bg-card border border-card-border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium text-sm">Barrido Global</p>
              <p className="text-xs text-muted-foreground mt-0.5">Analiza todos los servidores y aplica acciones a miembros en la blacklist que aun esten activos.</p>
              {sweepResult && (
                <p className="text-xs mt-1.5 text-green-400">
                  Barrido completado: <strong>{sweepResult.actioned}</strong> usuarios sancionados en <strong>{sweepResult.guilds}</strong> servidores.
                </p>
              )}
            </div>
            <Button
              size="sm" variant="destructive" className="gap-2 flex-shrink-0"
              disabled={sweeping}
              onClick={async () => {
                setSweeping(true); setSweepResult(null);
                try {
                  const r = await fetch("/api/admin/blacklist/sweep", { method: "POST", credentials: "include" });
                  const d = await r.json().catch(() => ({}));
                  if (r.ok) { setSweepResult(d); toast({ title: `Barrido completado: ${d.actioned} acciones` }); }
                  else toast({ title: d.error || "Error en barrido", variant: "destructive" });
                } catch { toast({ title: "Error de red", variant: "destructive" }); }
                setSweeping(false);
              }}
            >
              {sweeping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {sweeping ? "Barriendo..." : "Iniciar barrido"}
            </Button>
          </div>

          <div className="space-y-2">
            {!Array.isArray(blacklist) || blacklist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Blacklist vacia</p>
            ) : blacklist.map((b: any) => (
              <div key={b.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
                <div
                  className="px-4 py-3 flex items-start justify-between gap-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setSelectedBl(selectedBl?.id === b.id ? null : b)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                      <UserX className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{b.username}</p>
                      <p className="text-xs text-muted-foreground font-mono">{b.userId}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{b.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.expiresAt
                      ? <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-500/15 text-yellow-400">{b.durationDays}d</span>
                      : <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-red-500/15 text-red-400">Perm</span>
                    }
                    <span className="text-xs text-muted-foreground hidden sm:block">{new Date(b.createdAt).toLocaleDateString("es")}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeBlacklist.mutate({ userId: b.userId }, { onSuccess: () => { toast({ title: "Eliminado de blacklist" }); qc.invalidateQueries({ queryKey: getGetBlacklistQueryKey() }); }, onError: onErr("Error al eliminar") }); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {selectedBl?.id === b.id && (
                  <div className="border-t border-border bg-secondary/20 px-5 py-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Motivo</p>
                      <p className="text-sm">{b.reason}</p>
                    </div>
                    {b.addedByUsername && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Moderador</p>
                        <p className="text-sm">{b.addedByUsername}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Duracion</p>
                      <p className="text-sm">
                        {b.expiresAt
                          ? (() => {
                              const expDate = new Date(b.expiresAt);
                              const expired = expDate < new Date();
                              return expired
                                ? <span className="text-orange-400">Expirado el {expDate.toLocaleDateString("es")}</span>
                                : <span className="text-yellow-400">{b.durationDays} dias — expira el {expDate.toLocaleDateString("es")}</span>;
                            })()
                          : <span className="text-red-400 font-medium">Permanente</span>}
                      </p>
                    </div>
                    {b.evidence?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Evidencias</p>
                        <div className="space-y-1">
                          {b.evidence.map((ev: string, i: number) => (
                            <a key={i} href={ev.startsWith("http") ? ev : undefined} target="_blank" rel="noopener noreferrer"
                              className={cn("block text-xs p-2 rounded-lg bg-card border border-card-border break-all", ev.startsWith("http") && "text-primary hover:underline")}>
                              {ev}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Announcements ── */}
      {tab === "announcements" && (
        <div className="space-y-5">
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Nuevo anuncio</h3>
            <div>
              <Label className="text-xs mb-1.5 block">Titulo</Label>
              <Input placeholder="Titulo del anuncio" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Contenido</Label>
              <Textarea placeholder="Contenido del anuncio..." value={annContent} onChange={(e) => setAnnContent(e.target.value)} rows={4} />
            </div>
            <div className="flex gap-3">
              <NativeSelect value={annType} onChange={setAnnType} className="w-36">
                <option value="info">Info</option>
                <option value="warning">Advertencia</option>
                <option value="success">Exito</option>
              </NativeSelect>
              <Button onClick={handleAnnouncement} disabled={createAnnouncement.isPending} className="gap-2">
                <Plus className="w-4 h-4" /><span>Publicar</span>
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {!Array.isArray(announcements) || announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay anuncios publicados</p>
            ) : announcements.map((a: any) => (
              <div key={a.id} className="flex items-start justify-between bg-card border border-card-border rounded-xl px-4 py-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium",
                      a.type === "info" ? "bg-blue-500/10 text-blue-400" : a.type === "warning" ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"
                    )}>{a.type}</span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded", a.published ? "bg-green-500/10 text-green-400" : "bg-secondary text-muted-foreground")}>
                      {a.published ? "Publicado" : "Borrador"}
                    </span>
                  </div>
                  <p className="font-medium text-sm">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 flex-shrink-0"
                  onClick={() => deleteAnnouncement.mutate({ id: a.id }, { onSuccess: () => { toast({ title: "Anuncio eliminado" }); qc.invalidateQueries({ queryKey: getGetAnnouncementsQueryKey() }); }, onError: onErr("Error al eliminar anuncio") })}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Admins (owner only) ── */}
      {tab === "admins" && isOwner && (
        <div className="space-y-5">
          {/* Form */}
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" />
                {editingAdmin ? `Editando: ${editingAdmin.username}` : "Otorgar acceso administrativo"}
              </h3>
              {editingAdmin && (
                <button onClick={cancelEdit} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar edicion
                </button>
              )}
            </div>
            {!editingAdmin && (
              <p className="text-xs text-muted-foreground">El usuario debe haber iniciado sesion en Neuralix al menos una vez para que el acceso sea efectivo.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Discord ID *</Label>
                <Input placeholder="123456789012345678" value={adminDiscordId} onChange={(e) => setAdminDiscordId(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Nombre de usuario *</Label>
                <Input placeholder="NombreUsuario" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-2 block">Permisos del administrador</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 cursor-pointer p-2.5 rounded-lg hover:bg-secondary/50 transition-colors border border-transparent hover:border-border">
                    <Switch checked={adminPerms.includes(p.id)} onCheckedChange={() => togglePerm(p.id)} className="scale-90" />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleGrantAdmin} className="gap-2">
              <UserCheck className="w-4 h-4" />
              {editingAdmin ? "Guardar cambios" : "Otorgar acceso"}
            </Button>
          </div>

          {/* Admins list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                Administradores actuales
                <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{adminsList.length}</span>
              </h3>
              <button onClick={fetchAdminsList} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /><span>Actualizar</span>
              </button>
            </div>

            {adminsLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
            ) : adminsList.length === 0 ? (
              <div className="text-center py-12 bg-card border border-card-border rounded-xl text-muted-foreground text-sm">
                No hay administradores secundarios configurados
              </div>
            ) : (
              <div className="space-y-3">
                {adminsList.map((a: any) => (
                  <div key={a.id} className={cn("bg-card border rounded-xl overflow-hidden transition-all", a.active ? "border-card-border" : "border-border opacity-60")}>
                    <div className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        {/* Avatar + info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                            a.active ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                            {a.username?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{a.username}</p>
                              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                                a.active ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                                {a.active ? "Activo" : "Suspendido"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{a.discordId}</p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleEditAdmin(a)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                            aria-label="Editar permisos"
                            title="Editar permisos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleUpdateAdmin(a.id, a.permissions, !a.active)}
                            className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                              a.active ? "text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10" : "text-muted-foreground hover:text-green-400 hover:bg-green-500/10")}
                            aria-label={a.active ? "Suspender administrador" : "Activar administrador"}
                            title={a.active ? "Suspender" : "Activar"}
                          >
                            {a.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                          {confirmDelete === a.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDeleteAdmin(a.id)}
                                className="h-8 px-2 rounded-lg text-xs bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-all font-medium">
                                Confirmar
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-all">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(a.id)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                              aria-label="Eliminar administrador"
                              title="Eliminar administrador"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Permissions badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5 pl-[52px]">
                        {(a.permissions as string[]).length === 0 ? (
                          <span className="text-xs text-muted-foreground">Sin permisos asignados</span>
                        ) : (a.permissions as string[]).map((perm: string) => (
                          <span key={perm} className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                            {ALL_PERMISSIONS.find((p) => p.id === perm)?.label || perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-xs text-amber-300 font-semibold mb-1">Nota de seguridad</p>
            <p className="text-xs text-amber-400/80">Los administradores secundarios solo pueden realizar acciones segun sus permisos asignados. Tu cuenta de Owner tiene acceso completo e irrevocable.</p>
          </div>
        </div>
      )}

      {/* ── Actividad ── */}
      {tab === "actividad" && isOwner && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Registro de actividad</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Todas las acciones realizadas por administradores</p>
            </div>
            <button
              onClick={() => { setActivityLoaded(false); fetchActivityLogs(); }}
              disabled={activityLoading}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3 h-3", activityLoading && "animate-spin")} />
              {activityLoading ? "Cargando..." : "Actualizar"}
            </button>
          </div>

          {activityLoading && activityLogs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Cargando actividad...</div>
          ) : activityLogs.length === 0 ? (
            <div className="text-center py-16 bg-card border border-card-border rounded-xl">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">No hay actividad registrada aun</p>
              <p className="text-xs text-muted-foreground mt-1">Las acciones del panel apareceran aqui</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activityLogs.map((log: any) => {
                const meta = ACTION_META[log.action] || { label: log.action, color: "text-muted-foreground bg-secondary", Icon: Activity };
                const { Icon } = meta;
                const dateStr = new Date(log.createdAt).toLocaleString("es-ES", {
                  day: "2-digit", month: "2-digit", year: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                });
                return (
                  <div key={log.id} className="flex items-start gap-3 bg-card border border-card-border rounded-xl px-4 py-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", meta.color.split(" ")[1])}>
                      <Icon className={cn("w-4 h-4", meta.color.split(" ")[0])} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-sm">{meta.label}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {dateStr}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Por <span className="text-foreground font-medium">{log.actorUsername}</span>
                        {log.target && <> · Objetivo: <span className="font-mono text-xs text-primary">{log.target}</span></>}
                      </p>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {Object.entries(log.details).map(([k, v]) =>
                            v != null && v !== "" && v !== false ? (
                              <span key={k} className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">
                                {k}: {Array.isArray(v) ? (v as any[]).join(", ") : String(v)}
                              </span>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Servidores ── */}
      {tab === "servidores" && isOwner && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {guildsLoaded ? `${guildsList.length} servidor${guildsList.length !== 1 ? "es" : ""} registrado${guildsList.length !== 1 ? "s" : ""}` : "Cargando lista de servidores..."}
            </p>
            <button onClick={() => { setGuildsLoaded(false); fetchGuilds(); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <RefreshCw className="w-3 h-3" /><span>Actualizar</span>
            </button>
          </div>

          {guildsLoading ? (
            <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : guildsList.length === 0 ? (
            <div className="text-center py-16 bg-card border border-card-border rounded-xl">
              <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="font-semibold">Sin servidores</p>
              <p className="text-sm text-muted-foreground mt-1">Ninguna guild ha configurado el bot aun</p>
            </div>
          ) : (() => {
            const totalPages = Math.ceil(guildsList.length / SERVIDORES_PAGE_SIZE);
            const pageItems = guildsList.slice(servidoresPage * SERVIDORES_PAGE_SIZE, (servidoresPage + 1) * SERVIDORES_PAGE_SIZE);
            return (
              <>
                <div className="overflow-auto rounded-xl border border-card-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Servidor</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">ID</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Miembros</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Unido</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">BL</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tickets</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Plan</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((g: any) => (
                        <tr key={g.guildId} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {g.iconURL ? (
                                <img src={g.iconURL} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Globe className="w-3.5 h-3.5 text-primary" />
                                </div>
                              )}
                              <span className="font-medium truncate max-w-[140px]">{g.name || g.guildId}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="font-mono text-xs text-muted-foreground">{g.guildId}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                            {g.memberCount != null ? g.memberCount.toLocaleString("es") : "—"}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                            {g.botJoinedAt ? new Date(g.botJoinedAt).toLocaleDateString("es") : "—"}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              g.blacklistAction === "ban" ? "bg-red-500/15 text-red-400" :
                              g.blacklistAction === "kick" ? "bg-orange-500/15 text-orange-400" :
                              g.blacklistAction === "timeout" ? "bg-yellow-500/15 text-yellow-400" :
                              "bg-secondary text-muted-foreground"
                            }`}>
                              {g.blacklistAction || "ban"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{g.tickets ?? 0}</td>
                          <td className="px-4 py-3">
                            {g.premiumActive ? (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-500/15 text-yellow-400 flex items-center gap-1 w-fit">
                                <Star className="w-2.5 h-2.5" />{g.premiumPlan || "Premium"}
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Gratis</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={`/servers/${g.guildId}`}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ChevronRight className="w-3 h-3" />Dashboard
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-muted-foreground">
                      Mostrando {servidoresPage * SERVIDORES_PAGE_SIZE + 1}–{Math.min((servidoresPage + 1) * SERVIDORES_PAGE_SIZE, guildsList.length)} de {guildsList.length}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={servidoresPage === 0} onClick={() => setServidoresPage(p => p - 1)}>Anterior</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={servidoresPage >= totalPages - 1} onClick={() => setServidoresPage(p => p + 1)}>Siguiente</Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Acciones Masivas ── */}
      {tab === "masivas" && isOwner && (
        <div className="max-w-2xl space-y-6">
          {/* Broadcast */}
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" /> Broadcast global
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Envia un mensaje al canal del sistema (o el primer canal disponible) de todos los servidores donde el bot esta activo.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Titulo del embed (opcional)</Label>
                <Input placeholder="Mantenimiento programado" value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Color del embed (hex)</Label>
                <div className="flex gap-2">
                  <Input placeholder="#5865F2" value={broadcastColor} onChange={(e) => setBroadcastColor(e.target.value)} />
                  {broadcastColor && <div className="w-9 h-9 rounded-lg border border-border flex-shrink-0" style={{ backgroundColor: broadcastColor }} />}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Cuerpo del mensaje / descripcion del embed</Label>
              <Textarea
                placeholder="Escribe el mensaje de broadcast aqui..."
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                rows={4}
              />
            </div>
            {broadcastResult && (
              <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
                <p className="text-sm font-medium">Resultado del ultimo broadcast</p>
                <div className="flex gap-4 mt-2">
                  <span className="text-sm text-green-400">Enviado: <strong>{broadcastResult.sent}</strong></span>
                  <span className="text-sm text-red-400">Fallido: <strong>{broadcastResult.failed}</strong></span>
                  <span className="text-sm text-muted-foreground">Total: <strong>{broadcastResult.total}</strong></span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleBroadcast} disabled={broadcasting || (!broadcastMsg.trim() && !broadcastTitle.trim())} className="gap-2">
                {broadcasting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {broadcasting ? "Enviando..." : "Enviar broadcast"}
              </Button>
              {(broadcastMsg || broadcastTitle) && (
                <Button variant="ghost" onClick={() => { setBroadcastMsg(""); setBroadcastTitle(""); setBroadcastColor("#5865F2"); setBroadcastResult(null); }}>Limpiar</Button>
              )}
            </div>
          </div>

          {/* CSV Blacklist Import */}
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400" /> Importar blacklist masiva (CSV)
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Pega IDs de Discord separados por comas o saltos de linea para agregar multiples usuarios a la blacklist global de una vez.
              </p>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">IDs de Discord (uno por linea o separados por coma)</Label>
              <Textarea
                placeholder={"123456789012345678\n987654321098765432\n..."}
                value={csvBlacklistText}
                onChange={(e) => setCsvBlacklistText(e.target.value)}
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {csvBlacklistText.trim() ? `${csvBlacklistText.split(/[\n,]+/).map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s)).length} IDs validos detectados` : "Sin IDs"}
              </p>
            </div>
            {csvImportResult && (
              <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
                <p className="text-sm font-medium">Resultado de la importacion</p>
                <div className="flex gap-4 mt-2 flex-wrap">
                  <span className="text-sm text-green-400">Importados: <strong>{csvImportResult.added}</strong></span>
                  <span className="text-sm text-yellow-400">Ya en lista: <strong>{csvImportResult.skipped}</strong></span>
                  <span className="text-sm text-red-400">Error: <strong>{csvImportResult.errors}</strong></span>
                </div>
              </div>
            )}
            <Button
              onClick={handleCsvBlacklistImport}
              disabled={csvImporting || !csvBlacklistText.trim()}
              variant="destructive"
              className="gap-2"
            >
              {csvImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              {csvImporting ? "Importando..." : "Importar a blacklist"}
            </Button>
          </div>

          {/* Bulk License Revoke */}
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ShieldOff className="w-4 h-4 text-orange-400" /> Revocar licencias en masa
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Revoca todas las licencias activas de un plan especifico. Esta accion no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-32">
                <Label className="text-xs mb-1.5 block">Plan a revocar</Label>
                <select
                  value={bulkRevokePlan}
                  onChange={(e) => setBulkRevokePlan(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-6 cursor-pointer"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  <option value="">Seleccionar plan...</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <Button
                onClick={handleBulkRevoke}
                disabled={bulkRevoking || !bulkRevokePlan}
                variant="destructive"
                className="gap-2 h-9"
              >
                {bulkRevoking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                {bulkRevoking ? "Revocando..." : "Revocar plan"}
              </Button>
            </div>
            {bulkRevokeResult != null && (
              <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
                <span className="text-sm text-orange-400">Licencias revocadas: <strong>{bulkRevokeResult}</strong></span>
              </div>
            )}
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
            <p className="text-sm text-yellow-400 font-medium">Acciones con impacto masivo</p>
            <p className="text-xs text-yellow-400/70 mt-1">
              Estas herramientas afectan a multiples servidores y usuarios a la vez. Usalas con responsabilidad.
            </p>
          </div>
        </div>
      )}

      {/* ── Links ── */}
      {tab === "links" && (
        <div className="space-y-5 max-w-2xl">
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-1">URLs de la aplicacion</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Estas URLs se generan automaticamente segun el dominio activo. Cuando despliegues en un nuevo host, los links se actualizan solos. Copia el Redirect URI y pegalo en Discord Developer Portal.
            </p>
            {linksLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : !linksData ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No se pudieron cargar los links. <button onClick={fetchLinks} className="text-primary underline ml-1">Reintentar</button></div>
            ) : (
              <div className="space-y-4">
                {/* Dominio activo */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border">
                  <span className="text-xs text-muted-foreground font-medium w-24 flex-shrink-0">Dominio activo</span>
                  <span className="text-xs font-mono text-primary flex-1 truncate">{linksData.domain}</span>
                </div>

                {/* Credenciales */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "CLIENT_ID", ok: linksData.clientIdConfigured },
                    { label: "CLIENT_SECRET", ok: linksData.clientSecretConfigured },
                    { label: "BOT_TOKEN", ok: linksData.botTokenConfigured },
                  ].map(({ label, ok }) => (
                    <div key={label} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium", ok ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400")}>
                      <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", ok ? "bg-green-400" : "bg-red-400")} />
                      {label}
                    </div>
                  ))}
                </div>

                {/* URLs */}
                {[
                  {
                    key: "redirectUri",
                    label: "Redirect URI",
                    sublabel: "Pega esto en Discord Developer Portal → OAuth2 → Redirects",
                    value: linksData.redirectUri,
                    highlight: true,
                  },
                  {
                    key: "oauthUrl",
                    label: "OAuth2 URL completa",
                    sublabel: "URL que usa el boton Iniciar sesion con Discord",
                    value: linksData.oauthUrl,
                    highlight: false,
                  },
                  {
                    key: "botInvite",
                    label: "Invitar bot al servidor",
                    sublabel: "Usa esta URL para agregar el bot a cualquier servidor",
                    value: linksData.botInvite,
                    highlight: false,
                  },
                ].map(({ key, label, sublabel, value, highlight }) => (
                  <div key={key} className={cn("rounded-xl border p-4 space-y-2", highlight ? "border-primary/30 bg-primary/5" : "border-card-border bg-card")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
                      </div>
                      <Button size="sm" variant="outline" className={cn("gap-1.5 text-xs h-7", linksCopied === key && "border-green-500/50 text-green-400")}
                        onClick={() => copyLink(key, value)} disabled={!value}>
                        {linksCopied === key ? <><Check className="w-3 h-3" /><span>Copiado</span></> : <><Copy className="w-3 h-3" /><span>Copiar</span></>}
                      </Button>
                    </div>
                    <div className="bg-background rounded-lg px-3 py-2 border border-border">
                      <p className="text-xs font-mono text-primary/80 break-all leading-relaxed">{value || "(no disponible)"}</p>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end">
                  <button onClick={fetchLinks} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    <RefreshCw className="w-3 h-3" /><span>Actualizar links</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bot Credentials ── */}
      {tab === "bot" && isOwner && (
        <div className="space-y-6">
          {/* Status cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Bot Token", ok: !!(botSettings as any)?.botTokenConfigured, mask: (botSettings as any)?.botTokenMask },
              { label: "Client ID", ok: !!(botSettings as any)?.clientIdConfigured, mask: (botSettings as any)?.clientIdMask },
              { label: "Client Secret", ok: !!(botSettings as any)?.clientSecretConfigured },
              { label: "Session Secret", ok: !!(botSettings as any)?.sessionSecretConfigured },
            ].map(({ label, ok, mask }) => (
              <div key={label} className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <div className="flex items-center gap-2">
                  {ok
                    ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    : <X className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  <span className={cn("text-sm font-semibold", ok ? "text-green-400" : "text-red-400")}>
                    {ok ? "Configurado" : "No configurado"}
                  </span>
                </div>
                {mask && <p className="text-xs text-muted-foreground mt-1 font-mono">{mask}</p>}
              </div>
            ))}
          </div>

          {(botSettings as any)?.fromEnv && (
            <div className="flex items-start gap-3 bg-primary/10 border border-primary/20 rounded-xl p-4">
              <Shield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary">
                Las credenciales activas provienen de variables de entorno del sistema. Los valores guardados en DB se usan solo como fallback.
              </p>
            </div>
          )}

          {/* Update form */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Actualizar credenciales
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              Deja en blanco los campos que no quieras modificar. Los valores se almacenan cifrados en la base de datos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Bot Token</Label>
                <Input
                  type="password"
                  placeholder="Nuevo token del bot (opcional)"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client ID</Label>
                <Input
                  type="text"
                  placeholder="Discord Client ID (opcional)"
                  value={botClientId}
                  onChange={(e) => setBotClientId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Secret</Label>
                <Input
                  type="password"
                  placeholder="Discord Client Secret (opcional)"
                  value={botClientSecret}
                  onChange={(e) => setBotClientSecret(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Session Secret</Label>
                <Input
                  type="password"
                  placeholder="Session secret JWT (opcional)"
                  value={botSessionSecret}
                  onChange={(e) => setBotSessionSecret(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Owner Discord IDs</Label>
                <Input
                  type="text"
                  placeholder="IDs separados por comas: 123456789,987654321"
                  value={botOwnerIds}
                  onChange={(e) => setBotOwnerIds(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  IDs de Discord de los owners con acceso total al panel de administracion.
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <Button
                onClick={handleSaveBotSettings}
                disabled={botSaving || (!botToken && !botClientId && !botClientSecret && !botSessionSecret && !botOwnerIds)}
                className="gap-2"
              >
                {botSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {botSaving ? "Guardando..." : "Guardar credenciales"}
              </Button>
            </div>
          </div>

          {(botSettings as any)?.updatedAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Ultima actualizacion: {new Date((botSettings as any).updatedAt).toLocaleString("es")}
            </p>
          )}
        </div>
      )}

      {/* ── Soporte ── */}
      {tab === "soporte" && (
        <div>
          {supportView === "list" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-1 bg-secondary rounded-lg p-1">
                  {(["open", "closed", "all"] as const).map((f) => (
                    <button key={f} onClick={() => setTicketFilter(f)}
                      className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all",
                        ticketFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                      {f === "open" ? `Abiertos${openCount > 0 ? ` (${openCount})` : ""}` : f === "closed" ? "Cerrados" : "Todos"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-pulse" /> Actualizando cada 5s
                </p>
              </div>
              {filteredTickets.length === 0 ? (
                <div className="text-center py-24 bg-card rounded-xl border border-card-border">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Sin tickets</h3>
                  <p className="text-muted-foreground text-sm">No hay tickets {ticketFilter === "open" ? "abiertos" : ticketFilter === "closed" ? "cerrados" : ""} en este momento.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTickets.map((ticket: any) => (
                    <button key={ticket.id}
                      onClick={() => { setSelectedTicket(ticket); setSupportView("chat"); }}
                      className="w-full flex items-center justify-between p-4 bg-card border border-card-border rounded-xl hover:border-primary/30 transition-all text-left group">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", ticket.status === "open" ? "bg-green-400" : "bg-muted-foreground")} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{ticket.subject}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">@{ticket.username}</span>
                            <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.normal)}>{ticket.priority}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(ticket.createdAt).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : selectedTicket ? (
            <AdminSupportChat
              ticketId={selectedTicket.id}
              ticketSubject={selectedTicket.subject}
              ticketStatus={selectedTicket.status}
              ticketUsername={selectedTicket.username}
              onBack={() => { setSupportView("list"); setSelectedTicket(null); }}
              onStatusChange={(newStatus: string) => {
                setSelectedTicket((prev: any) => prev ? { ...prev, status: newStatus } : prev);
              }}
            />
          ) : null}
        </div>
      )}
    </Layout>
  );
}
