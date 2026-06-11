import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Plus, Trash2, Send, Webhook, Settings, Copy, ExternalLink } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;

type WebhookItem = { id: number; name: string; channelId: string; webhookId: string; avatarUrl?: string | null; description?: string | null; createdByUsername?: string | null; createdAt: string };

const emptyForm = { name: "", channelId: "", avatarUrl: "", description: "" };
const emptySend = { content: "", embedTitle: "", embedDescription: "", embedColor: "#5865F2", username: "" };

export default function WebhooksPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { toast } = useToast();
  const [hooks, setHooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [sendForm, setSendForm] = useState({ ...emptySend });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [sendingTo, setSendingTo] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchHooks = async () => {
    setLoading(true);
    const res = await fetch(API(`/guilds/${guildId}/webhooks`), { credentials: "include" });
    if (res.ok) setHooks(await res.json());
    setLoading(false);
  };

  useEffect(() => { if (guildId) fetchHooks(); }, [guildId]);

  const setF = (k: string) => (v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setSF = (k: string) => (v: any) => setSendForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.name || !form.channelId) { toast({ title: "Nombre y canal requeridos", variant: "destructive" }); return; }
    const url = editingId ? API(`/guilds/${guildId}/webhooks/${editingId}`) : API(`/guilds/${guildId}/webhooks`);
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: editingId ? "Webhook actualizado" : "Webhook creado correctamente" });
      setForm({ ...emptyForm });
      setEditingId(null);
      setShowCreate(false);
      fetchHooks();
    } else {
      toast({ title: data.error || "Error al guardar webhook", variant: "destructive" });
    }
  };

  const deleteHook = async (id: number) => {
    setDeleting(id);
    const res = await fetch(API(`/guilds/${guildId}/webhooks/${id}`), { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Webhook eliminado" }); fetchHooks(); }
    else toast({ title: "Error al eliminar", variant: "destructive" });
    setDeleting(null);
  };

  const sendMessage = async () => {
    if (!sendingTo) return;
    if (!sendForm.content && !sendForm.embedTitle && !sendForm.embedDescription) {
      toast({ title: "Escribe algun contenido para enviar", variant: "destructive" }); return;
    }
    setSending(true);
    const body: any = {};
    if (sendForm.content) body.content = sendForm.content;
    if (sendForm.embedTitle || sendForm.embedDescription) {
      body.embeds = [{ title: sendForm.embedTitle || undefined, description: sendForm.embedDescription || undefined, color: parseInt((sendForm.embedColor || "#5865F2").replace("#", ""), 16) }];
    }
    if (sendForm.username) body.username = sendForm.username;
    const res = await fetch(API(`/guilds/${guildId}/webhooks/${sendingTo}/send`), {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { toast({ title: "Mensaje enviado via webhook" }); setSendForm({ ...emptySend }); setSendingTo(null); }
    else toast({ title: data.error || "Error al enviar", variant: "destructive" });
    setSending(false);
  };

  const startEdit = (h: WebhookItem) => {
    setForm({ name: h.name, channelId: h.channelId, avatarUrl: h.avatarUrl || "", description: h.description || "" });
    setEditingId(h.id);
    setShowCreate(true);
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Webhooks</h1>
          <p className="text-muted-foreground text-sm">Gestiona webhooks para enviar mensajes personalizados a canales de Discord.</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowCreate(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo Webhook
        </Button>
      </div>

      {showCreate && (
        <div className="bg-card border border-card-border rounded-xl p-6 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">{editingId ? "Editar Webhook" : "Crear Nuevo Webhook"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Nombre del webhook *</Label>
              <Input value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="Mi Webhook" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">ID del canal *</Label>
              <Input value={form.channelId} onChange={(e) => setF("channelId")(e.target.value)} placeholder="ID del canal de Discord" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">URL de avatar (opcional)</Label>
              <Input value={form.avatarUrl} onChange={(e) => setF("avatarUrl")(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Descripcion (opcional)</Label>
              <Input value={form.description} onChange={(e) => setF("description")(e.target.value)} placeholder="Para que se usa este webhook" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={create}>{editingId ? "Actualizar" : "Crear Webhook"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setEditingId(null); setForm({ ...emptyForm }); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {sendingTo !== null && (
        <div className="bg-card border border-card-border rounded-xl p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Enviar Mensaje — {hooks.find((h) => h.id === sendingTo)?.name}</h3>
            <Button variant="ghost" size="sm" onClick={() => setSendingTo(null)}>Cancelar</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Nombre personalizado (opcional)</Label>
              <Input value={sendForm.username} onChange={(e) => setSF("username")(e.target.value)} placeholder="Override del nombre del webhook" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Contenido (texto plano)</Label>
              <Input value={sendForm.content} onChange={(e) => setSF("content")(e.target.value)} placeholder="Mensaje de texto..." />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Titulo del embed</Label>
              <Input value={sendForm.embedTitle} onChange={(e) => setSF("embedTitle")(e.target.value)} placeholder="Titulo del embed" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Color del embed</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={sendForm.embedColor} onChange={(e) => setSF("embedColor")(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-input" />
                <Input value={sendForm.embedColor} onChange={(e) => setSF("embedColor")(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Descripcion del embed</Label>
            <Textarea value={sendForm.embedDescription} onChange={(e) => setSF("embedDescription")(e.target.value)} placeholder="Descripcion del embed..." rows={3} />
          </div>
          <Button size="sm" onClick={sendMessage} disabled={sending}>
            <Send className="w-4 h-4 mr-1" />{sending ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : hooks.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-card-border">
          <Webhook className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">Sin webhooks configurados</p>
          <p className="text-sm text-muted-foreground mt-1">Crea un webhook para enviar mensajes programaticos a canales de Discord.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hooks.map((h) => (
            <div key={h.id} className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {h.avatarUrl ? <img src={h.avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" /> : <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center"><Webhook className="w-4 h-4 text-primary" /></div>}
                  <div>
                    <p className="font-semibold text-sm">{h.name}</p>
                    <p className="text-xs text-muted-foreground">Canal: <code className="font-mono">{h.channelId}</code></p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(h)}>
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteHook(h.id)} disabled={deleting === h.id}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {h.description && <p className="text-xs text-muted-foreground mb-3">{h.description}</p>}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>
                  ID: <code className="font-mono text-xs">{h.webhookId}</code>
                  {h.createdByUsername && <span className="ml-2">por {h.createdByUsername}</span>}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSendingTo(h.id)}>
                  <Send className="w-3 h-3" /> Enviar Mensaje
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
