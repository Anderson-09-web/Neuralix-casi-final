import { useParams } from "wouter";
import { useState } from "react";
import { Gift, Plus, Trophy, Users, Clock, RefreshCw, Trash2, CheckCircle, XCircle, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Giveaway = {
  id: number;
  guildId: string;
  channelId: string;
  messageId?: string | null;
  title: string;
  prize: string;
  winnerCount: number;
  endsAt: string;
  status: "active" | "ended" | "cancelled";
  entrants: string[];
  winners: string[];
  hostedBy: string;
  hostedByUsername: string;
  createdAt: string;
  requirements?: { minMessages?: number; minAccountAge?: number; requiredRole?: string } | null;
};

const emptyForm = {
  channelId: "",
  title: "",
  prize: "",
  winnerCount: "1",
  durationMinutes: "60",
  reqRole: "",
  reqMinAge: "",
};

const STATUS_CONFIG = {
  active: { label: "Activo", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  ended: { label: "Finalizado", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  cancelled: { label: "Cancelado", color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Finalizado";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function GiveawaysPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "ended" | "cancelled">("active");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useState(() => {
    if (!guildId) return;
    fetch(`/api/guilds/${guildId}/giveaways`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setGiveaways(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  });

  const refetch = () => {
    if (!guildId) return;
    fetch(`/api/guilds/${guildId}/giveaways`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setGiveaways(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  const createGiveaway = async () => {
    if (!form.channelId || !form.title || !form.prize || !form.durationMinutes) {
      toast({ title: "Campos requeridos", description: "Canal, titulo, premio y duracion son obligatorios.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const body: any = {
        channelId: form.channelId,
        title: form.title,
        prize: form.prize,
        winnerCount: Number(form.winnerCount) || 1,
        durationMinutes: Number(form.durationMinutes),
      };
      if (form.reqRole) body.requirements = { ...body.requirements, requiredRole: form.reqRole };
      if (form.reqMinAge) body.requirements = { ...body.requirements, minAccountAge: Number(form.reqMinAge) };

      const r = await fetch(`/api/guilds/${guildId}/giveaways`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error al crear sorteo");
      toast({ title: "Sorteo creado", description: `El sorteo "${form.prize}" fue publicado en Discord.` });
      setShowCreate(false);
      setForm({ ...emptyForm });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const endGiveaway = async (id: number) => {
    setActionLoading(id);
    try {
      const r = await fetch(`/api/guilds/${guildId}/giveaways/${id}/end`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: "Sorteo finalizado", description: `Ganadores: ${data.winners?.map((w: string) => `<@${w}>`).join(", ") || "Nadie participó"}` });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const rerollGiveaway = async (id: number) => {
    setActionLoading(id);
    try {
      const r = await fetch(`/api/guilds/${guildId}/giveaways/${id}/reroll`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Error al rerollear");
      toast({ title: "Nuevo ganador seleccionado" });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const cancelGiveaway = async (id: number) => {
    setActionLoading(id);
    try {
      const r = await fetch(`/api/guilds/${guildId}/giveaways/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Error al cancelar");
      toast({ title: "Sorteo cancelado" });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = giveaways.filter((g) => g.status === tab);

  const TABS = [
    { id: "active" as const, label: "Activos", count: giveaways.filter((g) => g.status === "active").length },
    { id: "ended" as const, label: "Finalizados", count: giveaways.filter((g) => g.status === "ended").length },
    { id: "cancelled" as const, label: "Cancelados", count: giveaways.filter((g) => g.status === "cancelled").length },
  ];

  return (
    <Layout guildId={guildId}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Sorteos</h1>
              <p className="text-sm text-muted-foreground">Gestiona sorteos y eventos para tu servidor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
              <Plus className="w-4 h-4 mr-1" />
              Nuevo sorteo
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Sorteos activos", value: giveaways.filter((g) => g.status === "active").length, color: "text-green-400", bg: "bg-green-500/10" },
            { label: "Total participantes", value: giveaways.reduce((acc, g) => acc + (g.entrants?.length ?? 0), 0), color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Ganadores elegidos", value: giveaways.reduce((acc, g) => acc + (g.winners?.length ?? 0), 0), color: "text-yellow-400", bg: "bg-yellow-500/10" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><Gift className="w-4 h-4 text-yellow-400" /> Nuevo Sorteo</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}><XCircle className="w-4 h-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ID del canal <span className="text-destructive">*</span></Label>
                <Input placeholder="123456789012345678" value={form.channelId} onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Canal de Discord donde se publicara</p>
              </div>
              <div className="space-y-1.5">
                <Label>Premio <span className="text-destructive">*</span></Label>
                <Input placeholder="Nitro Classic x1" value={form.prize} onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Titulo <span className="text-destructive">*</span></Label>
                <Input placeholder="Sorteo de aniversario" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Duracion (minutos) <span className="text-destructive">*</span></Label>
                <Input type="number" min="1" placeholder="60" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
                <p className="text-xs text-muted-foreground">60 = 1h · 1440 = 24h · 10080 = 7d</p>
              </div>
              <div className="space-y-1.5">
                <Label>Numero de ganadores</Label>
                <Input type="number" min="1" max="20" value={form.winnerCount} onChange={(e) => setForm((f) => ({ ...f, winnerCount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rol requerido (ID, opcional)</Label>
                <Input placeholder="ID del rol" value={form.reqRole} onChange={(e) => setForm((f) => ({ ...f, reqRole: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Edad minima de cuenta (dias, opcional)</Label>
                <Input type="number" min="0" placeholder="7" value={form.reqMinAge} onChange={(e) => setForm((f) => ({ ...f, reqMinAge: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button onClick={createGiveaway} disabled={creating} className="bg-yellow-500 hover:bg-yellow-600 text-black">
                {creating ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Gift className="w-4 h-4 mr-1" />}
                Crear y publicar
              </Button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
              {t.count > 0 && <span className={cn("text-xs px-1.5 py-0.5 rounded-full", tab === t.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Giveaway list */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No hay sorteos {tab === "active" ? "activos" : tab === "ended" ? "finalizados" : "cancelados"}</p>
            {tab === "active" && <p className="text-sm mt-1">Crea tu primer sorteo con el boton de arriba</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((g) => {
              const sc = STATUS_CONFIG[g.status] || STATUS_CONFIG.active;
              const isLoading = actionLoading === g.id;
              return (
                <div key={g.id} className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{g.prize}</span>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", sc.color)}>{sc.label}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{g.title}</p>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{g.entrants?.length ?? 0} participantes</span>
                          <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />{g.winnerCount} ganador{g.winnerCount !== 1 ? "es" : ""}</span>
                          {g.status === "active" && <span className="flex items-center gap-1 text-yellow-400"><Clock className="w-3 h-3" />{timeLeft(g.endsAt)}</span>}
                          <span>Canal: <code className="font-mono">{g.channelId}</code></span>
                          <span>Por: {g.hostedByUsername}</span>
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {g.status === "active" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => endGiveaway(g.id)} disabled={isLoading} className="text-green-400 border-green-500/30 hover:bg-green-500/10">
                            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            <span className="ml-1 hidden sm:inline">Finalizar</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => cancelGiveaway(g.id)} disabled={isLoading} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span className="ml-1 hidden sm:inline">Cancelar</span>
                          </Button>
                        </>
                      )}
                      {g.status === "ended" && (
                        <Button size="sm" variant="outline" onClick={() => rerollGiveaway(g.id)} disabled={isLoading} className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10">
                          {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          <span className="ml-1 hidden sm:inline">Rerollear</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Winners */}
                  {g.winners && g.winners.length > 0 && (
                    <div className="pt-3 border-t flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground">Ganadores:</span>
                      {g.winners.map((w) => (
                        <span key={w} className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Trophy className="w-3 h-3" />{"<@" + w + ">"}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Requirements */}
                  {g.requirements && (g.requirements.requiredRole || g.requirements.minAccountAge) && (
                    <div className="pt-2 border-t flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium">Requisitos:</span>
                      {g.requirements.requiredRole && <span>Rol: <code>{g.requirements.requiredRole}</code></span>}
                      {g.requirements.minAccountAge && <span>Cuenta &gt; {g.requirements.minAccountAge} dias</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
