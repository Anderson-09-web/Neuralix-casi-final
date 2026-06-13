import { useEffect, useState, useRef } from "react";
import { X, Plus } from "lucide-react";

type DiscordRole = { id: string; name: string; color: number; position: number };

function roleColor(color: number): string {
  if (!color) return "#6b7280";
  return `#${color.toString(16).padStart(6, "0")}`;
}

type Props = {
  guildId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export default function GuildRoleMultiSelect({ guildId, value, onChange, placeholder = "Agregar rol..." }: Props) {
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedIds = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    fetch(`/api/guilds/${guildId}/roles`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const add = (id: string) => {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id].join(", "));
    setOpen(false);
  };

  const remove = (id: string) => {
    onChange(selectedIds.filter((s) => s !== id).join(", "));
  };

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name || id;
  const roleCol = (id: string) => roleColor(roles.find((r) => r.id === id)?.color || 0);

  if (loading) {
    return (
      <div className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground flex items-center gap-2">
        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Cargando roles...
      </div>
    );
  }

  if (!roles.length) {
    return (
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ID1, ID2, ID3"
        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    );
  }

  const available = roles.filter((r) => !selectedIds.includes(r.id));

  return (
    <div ref={ref} className="relative">
      <div
        className="min-h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm flex flex-wrap gap-1 items-center cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        {selectedIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white"
            style={{ backgroundColor: roleCol(id) + "cc" }}
          >
            {roleName(id)}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(id); }}
              className="hover:opacity-70 leading-none"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1 py-0.5">
          <Plus className="w-3 h-3" />{selectedIds.length === 0 ? placeholder : "Agregar"}
        </span>
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
          {available.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Todos los roles ya seleccionados</div>
          ) : (
            available.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => add(r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: roleColor(r.color) }} />
                {r.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
