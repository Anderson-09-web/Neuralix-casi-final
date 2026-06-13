import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Plus, Trash2, Send, Users, Settings, Tag, Zap, Hash, ChevronDown, Smile } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import GuildChannelSelect from "@/components/GuildChannelSelect";
import GuildRoleMultiSelect from "@/components/GuildRoleMultiSelect";

const API = (path: string) => `/api${path}`;

function NativeSelect({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer ${className || ""}`}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
      {children}
    </select>
  );
}

const emptyForm = {
  name: "", type: "join", description: "",
  roleIds: "" as string, buttonLabel: "", buttonEmoji: "", buttonColor: "PRIMARY",
  channelId: "", messageId: "", temporary: false, durationMinutes: "0",
};

type AutoRole = {
  id: number; name: string; type: string; description?: string | null;
  roleIds: string[]; buttonLabel?: string | null; buttonEmoji?: string | null;
  buttonColor: string; channelId?: string | null; messageId?: string | null;
  temporary: boolean; durationMinutes: number; enabled: boolean;
};

const typeLabels: Record<string, string> = {
  join: "Auto (al unirse)",
  button: "Boton",
  select: "Menu desplegable",
  reaction: "Reaccion",
};
const colorLabels: Record<string, { label: string }> = {
  PRIMARY: { label: "Azul" },
  SECONDARY: { label: "Gris" },
  SUCCESS: { label: "Verde" },
  DANGER: { label: "Rojo" },
};

function TypeIcon({ type }: { type: string }) {
  if (type === "join") return <Users className="w-4 h-4 text-primary" />;
  if (type === "button") return <Zap className="w-4 h-4 text-yellow-500" />;
  if (type === "select") return <ChevronDown className="w-4 h-4 text-blue-400" />;
  if (type === "reaction") return <Smile className="w-4 h-4 text-pink-400" />;
  return <Tag className="w-4 h-4 text-muted-foreground" />;
}

export default function AutoRolesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { toast } = useToast();
  const [roles, setRoles] = useState<AutoRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchRoles = async () => {
    setLoading(true);
    const res = await fetch(API(`/guilds/${guildId}/auto-roles`), { credentials: "include" });
    if (res.ok) setRoles(await res.json());
    setLoading(false);
  };

  useEffect(() => { if (guildId) fetchRoles(); }, [guildId]);

  const setF = (k: string) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const body = {
      name: form.name,
      type: form.type,
      description: form.description,
      roleIds: form.roleIds.split(",").map((s) => s.trim()).filter(Boolean),
      buttonLabel: form.buttonLabel,
      buttonEmoji: form.buttonEmoji,
      buttonColor: form.buttonColor,
      channelId: form.channelId || null,
      messageId: form.messageId || null,
      temporary: form.temporary,
      durationMinutes: Number(form.durationMinutes) || 0,
    };
    if (!body.name) { toast({ title: "Nombre requerido", variant: "destructive" }); return; }
    const url = editingId ? API(`/guilds/${guildId}/auto-roles/${editingId}`) : API(`/guilds/${guildId}/auto-roles`);
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editingId ? "Auto-rol actualizado" : "Auto-rol creado" });
      setForm({ ...emptyForm });
      setEditingId(null);
      setShowForm(false);
      fetchRoles();
    } else {
      const data = await res.json().catch(() => ({}));
      toast({ title: data.error || "Error al guardar", variant: "destructive" });
    }
  };

  const deleteRole = async (id: number) => {
    setDeleting(id);
    const res = await fetch(API(`/guilds/${guildId}/auto-roles/${id}`), { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Auto-rol eliminado" }); fetchRoles(); }
    else toast({ title: "Error al eliminar", variant: "destructive" });
    setDeleting(null);
  };

  const sendPanel = async (id: number) => {
    setSending(id);
    const res = await fetch(API(`/guilds/${guildId}/auto-roles/${id}/send`), { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast({ title: data.message || "Panel enviado al canal" });
    else toast({ title: data.error || "Error al enviar", variant: "destructive" });
    setSending(null);
  };

  const startEdit = (r: AutoRole) => {
    setForm({
      name: r.name, type: r.type, description: r.description || "",
      roleIds: (r.roleIds || []).join(", "),
      buttonLabel: r.buttonLabel || "", buttonEmoji: r.buttonEmoji || "",
      buttonColor: r.buttonColor || "PRIMARY", channelId: r.channelId || "",
      messageId: r.messageId || "", temporary: r.temporary,
      durationMinutes: String(r.durationMinutes || 0),
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  const grouped = {
    join: roles.filter((r) => r.type === "join"),
    button: roles.filter((r) => r.type === "button"),
    select: roles.filter((r) => r.type === "select"),
    reaction: roles.filter((r) => r.type === "reaction"),
  };

  return (
    <Layout guildId={guildId}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1">Auto-Roles</h1>
          <p className="text-muted-foreground text-sm">Asigna roles automaticamente al unirse o mediante botones, menus o reacciones en Discord.</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo Auto-Rol
        </Button>
      </div>

      {/* Info banners por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { type: "join", color: "indigo", count: grouped.join.length, desc: "Al unirse" },
          { type: "button", color: "yellow", count: grouped.button.length, desc: "Boton" },
          { type: "select", color: "blue", count: grouped.select.length, desc: "Menu" },
          { type: "reaction", color: "pink", count: grouped.reaction.length, desc: "Reaccion" },
        ].map((g) => (
          <div key={g.type} className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
            <TypeIcon type={g.type} />
            <div>
              <p className="text-lg font-bold leading-none">{g.count}</p>
              <p className="text-xs text-muted-foreground">{g.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-6 mb-6 space-y-5">
          <h3 className="font-semibold text-sm">{editingId ? "Editar Auto-Rol" : "Nuevo Auto-Rol"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Nombre *</Label>
              <Input value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="Ej: Roles de color" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Tipo</Label>
              <NativeSelect value={form.type} onChange={setF("type")}>
                <option value="join">Auto (al unirse)</option>
                <option value="button">Boton en canal</option>
                <option value="select">Menu desplegable</option>
                <option value="reaction">Rol por reaccion</option>
              </NativeSelect>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Roles</Label>
            <GuildRoleMultiSelect guildId={guildId!} value={form.roleIds} onChange={setF("roleIds")} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Descripcion</Label>
            <Input value={form.description} onChange={(e) => setF("description")(e.target.value)} placeholder="Descripcion del auto-rol" />
          </div>

          {/* Boton / Select fields */}
          {(form.type === "button" || form.type === "select") && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs mb-1.5 block">{form.type === "select" ? "Etiqueta de opcion" : "Etiqueta del boton"}</Label>
                  <Input value={form.buttonLabel} onChange={(e) => setF("buttonLabel")(e.target.value)} placeholder="Obtener Rol" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Emoji</Label>
                  <Input value={form.buttonEmoji} onChange={(e) => setF("buttonEmoji")(e.target.value)} placeholder="✨" />
                </div>
                {form.type === "button" && (
                  <div>
                    <Label className="text-xs mb-1.5 block">Color del boton</Label>
                    <NativeSelect value={form.buttonColor} onChange={setF("buttonColor")}>
                      {Object.entries(colorLabels).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                    </NativeSelect>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Canal donde enviar el panel</Label>
                <GuildChannelSelect guildId={guildId!} value={form.channelId} onChange={setF("channelId")} types={[0, 5]} />
              </div>
              {form.type === "select" && (
                <p className="text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded px-3 py-2">
                  Al enviar, se construira un menu unico con todas las opciones de tipo "Menu desplegable" activas en este servidor.
                </p>
              )}
            </>
          )}

          {/* Reaction role fields */}
          {form.type === "reaction" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-1.5 block">ID del mensaje a vigilar</Label>
                  <Input value={form.messageId} onChange={(e) => setF("messageId")(e.target.value)} placeholder="ID del mensaje" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Emoji de reaccion</Label>
                  <Input value={form.buttonEmoji} onChange={(e) => setF("buttonEmoji")(e.target.value)} placeholder="⭐" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-pink-500/5 border border-pink-500/20 rounded px-3 py-2">
                El bot vigilara las reacciones del mensaje especificado. Al reaccionar con el emoji configurado, el usuario recibe los roles asignados. Al quitar la reaccion, pierde los roles.
              </p>
            </>
          )}

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.temporary} onCheckedChange={setF("temporary")} />
              <Label className="text-sm">Rol temporal</Label>
            </div>
            {form.temporary && (
              <div className="flex items-center gap-2">
                <Input type="number" min="1" value={form.durationMinutes} onChange={(e) => setF("durationMinutes")(e.target.value)} className="w-24" />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : roles.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-card-border">
          <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">Sin auto-roles configurados</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primer auto-rol usando el boton de arriba.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((r) => (
            <div key={r.id} className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TypeIcon type={r.type} />
                  <div>
                    <p className="font-semibold text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabels[r.type] || r.type}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(r)}>
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteRole(r.id)} disabled={deleting === r.id}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {r.description && <p className="text-xs text-muted-foreground mb-3">{r.description}</p>}
              <div className="flex flex-wrap gap-1 mb-3">
                {(r.roleIds || []).map((rid) => (
                  <span key={rid} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">{rid}</span>
                ))}
                {(r.roleIds || []).length === 0 && <span className="text-xs text-muted-foreground">Sin roles configurados</span>}
              </div>
              {r.type === "reaction" && r.messageId && (
                <p className="text-xs text-muted-foreground mb-2 font-mono">Mensaje: {r.messageId} {r.buttonEmoji && `| Emoji: ${r.buttonEmoji}`}</p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {r.temporary && <span className="bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">Temporal {r.durationMinutes}min</span>}
                  {r.messageId && r.type !== "reaction" && <span className="bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded">Panel activo</span>}
                  {r.type === "reaction" && r.messageId && <span className="bg-pink-500/10 text-pink-400 px-1.5 py-0.5 rounded">Vigilando reacciones</span>}
                  {r.type === "reaction" && !r.messageId && <span className="bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded">Sin mensaje configurado</span>}
                </div>
                {(r.type === "button" || r.type === "select") && r.channelId && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => sendPanel(r.id)} disabled={sending === r.id}>
                    <Send className="w-3 h-3" />{sending === r.id ? "Enviando..." : "Enviar Panel"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
