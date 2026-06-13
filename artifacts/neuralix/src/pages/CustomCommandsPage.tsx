import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Terminal, AlertTriangle } from "lucide-react";
import Layout from "@/components/Layout";
import { GuildRoleSelect } from "@/components/GuildRoleSelect";

type Cmd = {
  id: number; guildId: string; name: string; description: string; response: string;
  enabled: boolean; premiumOnly: boolean; cooldownSeconds: number; restrictedRoleId: string | null;
  discordCommandId: string | null; useEmbed: boolean; embedTitle: string | null; embedColor: string | null;
};

const EMPTY: Omit<Cmd, "id" | "guildId" | "discordCommandId"> = {
  name: "", description: "Comando personalizado", response: "", enabled: true,
  premiumOnly: false, cooldownSeconds: 0, restrictedRoleId: null,
  useEmbed: false, embedTitle: null, embedColor: "#5865F2",
};

export default function CustomCommandsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cmd | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: cmds = [], isLoading } = useQuery<Cmd[]>({
    queryKey: ["custom-commands", guildId],
    queryFn: async () => {
      const r = await fetch(`/api/guilds/${guildId}/custom-commands`, { credentials: "include" });
      if (!r.ok) throw new Error("Error al cargar comandos");
      return r.json();
    },
    enabled: !!guildId,
  });

  const save = useMutation({
    mutationFn: async (data: typeof EMPTY) => {
      const url = editing ? `/api/guilds/${guildId}/custom-commands/${editing.id}` : `/api/guilds/${guildId}/custom-commands`;
      const r = await fetch(url, {
        method: editing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Error al guardar"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-commands", guildId] });
      toast({ title: editing ? "Comando actualizado" : "Comando creado", description: "Los cambios se aplicaron en Discord." });
      setOpen(false); setEditing(null); setForm({ ...EMPTY });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/guilds/${guildId}/custom-commands/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custom-commands", guildId] }); toast({ title: "Comando eliminado" }); setConfirmDeleteId(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const r = await fetch(`/api/guilds/${guildId}/custom-commands/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-commands", guildId] }),
  });

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setOpen(true); }
  function openEdit(cmd: Cmd) {
    setEditing(cmd);
    setForm({ name: cmd.name, description: cmd.description, response: cmd.response, enabled: cmd.enabled, premiumOnly: cmd.premiumOnly, cooldownSeconds: cmd.cooldownSeconds, restrictedRoleId: cmd.restrictedRoleId, useEmbed: cmd.useEmbed, embedTitle: cmd.embedTitle, embedColor: cmd.embedColor || "#5865F2" });
    setOpen(true);
  }

  return (
    <Layout guildId={guildId}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Terminal className="w-6 h-6 text-indigo-400" /> Comandos Personalizados</h1>
            <p className="text-sm text-muted-foreground mt-1">Crea comandos slash personalizados que el bot responde automaticamente en tu servidor.</p>
          </div>
          <Button onClick={openCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-700"><Plus className="w-4 h-4" /> Nuevo comando</Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando comandos...</div>
        ) : cmds.length === 0 ? (
          <Card className="border-dashed border-zinc-700 bg-zinc-900/50">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <Terminal className="w-12 h-12 text-zinc-600" />
              <p className="text-sm text-muted-foreground">No hay comandos personalizados. Crea el primero con el boton de arriba.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cmds.map((cmd) => (
              <Card key={cmd.id} className={`bg-zinc-900/60 border-zinc-800 transition-opacity ${cmd.enabled ? "" : "opacity-60"}`}>
                <CardContent className="flex items-center gap-4 py-4 px-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-indigo-400 font-semibold text-sm">/{cmd.name}</span>
                      {cmd.premiumOnly && <Badge variant="outline" className="text-yellow-400 border-yellow-500/40 text-xs">Premium</Badge>}
                      {!cmd.enabled && <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-xs">Desactivado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{cmd.description}</p>
                    <p className="text-xs text-zinc-400 mt-1 truncate max-w-md">{cmd.response}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={cmd.enabled} onCheckedChange={(v) => toggleEnabled.mutate({ id: cmd.id, enabled: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cmd)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setConfirmDeleteId(cmd.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm({ ...EMPTY }); } }}>
          <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar comando" : "Nuevo comando"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre del comando *</Label>
                  <Input placeholder="ej: reglas" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-") }))} className="bg-zinc-900 border-zinc-700 font-mono" />
                  <p className="text-xs text-muted-foreground">Solo letras minusculas, numeros y guiones.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Descripcion</Label>
                  <Input placeholder="Descripcion breve" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="bg-zinc-900 border-zinc-700" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Respuesta *</Label>
                <Textarea placeholder="Texto que el bot enviara al ejecutar el comando..." value={form.response} onChange={(e) => setForm((f) => ({ ...f, response: e.target.value }))} className="bg-zinc-900 border-zinc-700 min-h-[80px]" />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="useEmbed" checked={form.useEmbed} onCheckedChange={(v) => setForm((f) => ({ ...f, useEmbed: v }))} />
                <Label htmlFor="useEmbed">Enviar como embed</Label>
              </div>
              {form.useEmbed && (
                <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-indigo-500/30">
                  <div className="space-y-1.5">
                    <Label>Titulo del embed</Label>
                    <Input placeholder="Titulo (opcional)" value={form.embedTitle || ""} onChange={(e) => setForm((f) => ({ ...f, embedTitle: e.target.value || null }))} className="bg-zinc-900 border-zinc-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Color del embed</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.embedColor || "#5865F2"} onChange={(e) => setForm((f) => ({ ...f, embedColor: e.target.value }))} className="w-10 h-9 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
                      <Input value={form.embedColor || "#5865F2"} onChange={(e) => setForm((f) => ({ ...f, embedColor: e.target.value }))} className="bg-zinc-900 border-zinc-700 font-mono text-sm" />
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Rol requerido (opcional)</Label>
                <GuildRoleSelect guildId={guildId!} value={form.restrictedRoleId || ""} onChange={(v) => setForm((f) => ({ ...f, restrictedRoleId: v || null }))} placeholder="Sin restriccion de rol" />
              </div>
              <div className="space-y-1.5">
                <Label>Cooldown (segundos)</Label>
                <Input type="number" min="0" max="3600" value={form.cooldownSeconds} onChange={(e) => setForm((f) => ({ ...f, cooldownSeconds: Number(e.target.value) }))} className="bg-zinc-900 border-zinc-700 w-32" />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch id="enabled" checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
                  <Label htmlFor="enabled">Activo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="premiumOnly" checked={form.premiumOnly} onCheckedChange={(v) => setForm((f) => ({ ...f, premiumOnly: v }))} />
                  <Label htmlFor="premiumOnly">Solo Premium</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOpen(false); setEditing(null); setForm({ ...EMPTY }); }}>Cancelar</Button>
              <Button onClick={() => save.mutate(form)} disabled={!form.name || !form.response || save.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                {save.isPending ? "Guardando..." : editing ? "Guardar cambios" : "Crear comando"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Delete */}
        <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => !v && setConfirmDeleteId(null)}>
          <DialogContent className="max-w-sm bg-zinc-950 border-zinc-800">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" /> Eliminar comando</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Esto eliminara el comando de Discord y del sistema. Esta accion no se puede deshacer.</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => confirmDeleteId !== null && del.mutate(confirmDeleteId)} disabled={del.isPending}>Eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
