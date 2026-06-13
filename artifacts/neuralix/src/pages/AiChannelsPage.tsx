import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Plus, Trash2, Settings, Bot, Hash, Sparkles, Info } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;

function NativeSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
      {children}
    </select>
  );
}

const emptyForm = {
  channelId: "", name: "Canal IA",
  systemPrompt: "", model: "llama-3.1-8b-instant",
  enabled: true, mentionOnly: false,
  maxTokens: "500", temperature: "70", cooldownSeconds: "3",
};

type AiChannel = {
  id: number; guildId: string; channelId: string; name: string;
  systemPrompt?: string | null; model: string; enabled: boolean;
  mentionOnly: boolean; maxTokens: number; temperature: number; cooldownSeconds: number;
};

const models = [
  { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Rapido)" },
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Potente)" },
  { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
  { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Contexto largo)" },
  { value: "gemma2-9b-it", label: "Gemma 2 9B" },
];

export default function AiChannelsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { toast } = useToast();
  const [channels, setChannels] = useState<AiChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchChannels = async () => {
    setLoading(true);
    const res = await fetch(API(`/guilds/${guildId}/ai-channels`), { credentials: "include" });
    if (res.ok) setChannels(await res.json());
    setLoading(false);
  };

  useEffect(() => { if (guildId) fetchChannels(); }, [guildId]);

  const setF = (k: string) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const body = {
      channelId: form.channelId,
      name: form.name,
      systemPrompt: form.systemPrompt || null,
      model: form.model,
      enabled: form.enabled,
      mentionOnly: form.mentionOnly,
      maxTokens: Number(form.maxTokens) || 500,
      temperature: Number(form.temperature) || 70,
      cooldownSeconds: Number(form.cooldownSeconds) || 3,
    };
    if (!body.channelId) { toast({ title: "ID de canal requerido", variant: "destructive" }); return; }
    const url = editingId ? API(`/guilds/${guildId}/ai-channels/${editingId}`) : API(`/guilds/${guildId}/ai-channels`);
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editingId ? "Canal IA actualizado" : "Canal IA creado" });
      setForm({ ...emptyForm });
      setEditingId(null);
      setShowForm(false);
      fetchChannels();
    } else {
      const data = await res.json().catch(() => ({}));
      toast({ title: data.error || "Error al guardar", variant: "destructive" });
    }
  };

  const deleteChannel = async (id: number) => {
    setDeleting(id);
    const res = await fetch(API(`/guilds/${guildId}/ai-channels/${id}`), { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Canal IA eliminado" }); fetchChannels(); }
    else toast({ title: "Error al eliminar", variant: "destructive" });
    setDeleting(null);
  };

  const startEdit = (c: AiChannel) => {
    setForm({
      channelId: c.channelId, name: c.name,
      systemPrompt: c.systemPrompt || "", model: c.model,
      enabled: c.enabled, mentionOnly: c.mentionOnly,
      maxTokens: String(c.maxTokens), temperature: String(c.temperature), cooldownSeconds: String(c.cooldownSeconds),
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const modelLabel = (m: string) => models.find((x) => x.value === m)?.label || m;

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black mb-1">Canales IA</h1>
          <p className="text-muted-foreground text-sm">Designa canales donde el bot responde automaticamente con inteligencia artificial.</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo Canal IA
        </Button>
      </div>

      {/* Setup notice */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-300 mb-0.5">Configuracion requerida</p>
          <p className="text-muted-foreground">Esta funcion requiere una clave API de <strong className="text-foreground">Groq</strong> (gratis en console.groq.com). Configura <code className="bg-card px-1 rounded text-xs">GROQ_API_KEY</code> en las variables de entorno del servidor.</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-6 mb-6 space-y-5">
          <h3 className="font-semibold text-sm">{editingId ? "Editar Canal IA" : "Nuevo Canal IA"}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">ID del Canal *</Label>
              <Input value={form.channelId} onChange={(e) => setF("channelId")(e.target.value)} placeholder="ID del canal de Discord" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Nombre (referencia)</Label>
              <Input value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="Canal IA" />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Modelo de IA</Label>
            <NativeSelect value={form.model} onChange={setF("model")}>
              {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </NativeSelect>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Prompt del sistema (opcional)</Label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setF("systemPrompt")(e.target.value)}
              rows={3}
              placeholder="Eres un asistente util del servidor Discord. Responde siempre en español."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Max. tokens</Label>
              <Input type="number" min={50} max={2000} value={form.maxTokens} onChange={(e) => setF("maxTokens")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Temperatura (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.temperature} onChange={(e) => setF("temperature")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Cooldown (seg)</Label>
              <Input type="number" min={0} max={60} value={form.cooldownSeconds} onChange={(e) => setF("cooldownSeconds")(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={setF("enabled")} />
              <Label className="text-sm">Habilitado</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.mentionOnly} onCheckedChange={setF("mentionOnly")} />
              <Label className="text-sm">Solo responder si mencionan al bot</Label>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : channels.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-card-border">
          <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">Sin canales IA configurados</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primer canal IA usando el boton de arriba.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((c) => (
            <div key={c.id} className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${c.enabled ? "bg-primary/20" : "bg-muted"}`}>
                    <Sparkles className={`w-3.5 h-3.5 ${c.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">#{c.channelId}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(c)}>
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteChannel(c.id)} disabled={deleting === c.id}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{modelLabel(c.model)}</span>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{c.maxTokens} tokens</span>
                {c.mentionOnly && <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">Solo menciones</span>}
                {c.cooldownSeconds > 0 && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{c.cooldownSeconds}s cooldown</span>}
              </div>

              {c.systemPrompt && (
                <p className="text-xs text-muted-foreground italic mb-3 line-clamp-2">"{c.systemPrompt}"</p>
              )}

              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.enabled ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                  {c.enabled ? "Activo" : "Desactivado"}
                </span>
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
