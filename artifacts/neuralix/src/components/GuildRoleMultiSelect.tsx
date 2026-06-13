import { useEffect, useState, useRef, useCallback } from "react";
import { X, Plus, RefreshCw } from "lucide-react";

type DiscordRole = { id: string; name: string; color: number; position: number };

type CacheEntry = { data: DiscordRole[]; ts: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

const pendingRequests = new Map<string, Promise<DiscordRole[]>>();

async function fetchRoles(guildId: string): Promise<DiscordRole[]> {
  const existing = pendingRequests.get(guildId);
  if (existing) return existing;

  const promise = fetch(`/api/guilds/${guildId}/roles`, { credentials: "include" })
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    })
    .then((data) => (Array.isArray(data) ? data : []))
    .finally(() => pendingRequests.delete(guildId));

  pendingRequests.set(guildId, promise);
  return promise;
}

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

type State = "loading" | "ok" | "empty" | "error";

export default function GuildRoleMultiSelect({ guildId, value, onChange, placeholder = "Agregar rol..." }: Props) {
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [state, setState] = useState<State>("loading");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedIds = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const load = useCallback(async (bust = false) => {
    if (!guildId) return;
    setState("loading");
    setOpen(false);

    if (!bust) {
      const hit = cache.get(guildId);
      if (hit && Date.now() - hit.ts < CACHE_TTL) {
        setRoles(hit.data);
        setState(hit.data.length ? "ok" : "empty");
        return;
      }
    }

    try {
      const data = await fetchRoles(guildId);
      cache.set(guildId, { data, ts: Date.now() });
      setRoles(data);
      setState(data.length ? "ok" : "empty");
    } catch {
      setState("error");
    }
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

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

  if (state === "loading") {
    return (
      <div className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground flex items-center gap-2">
        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Cargando roles...
      </div>
    );
  }

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={() => load(true)}
        className="h-9 w-full rounded-md border border-destructive/50 bg-background px-3 py-1 text-sm text-destructive flex items-center gap-2 hover:bg-destructive/5 transition-colors"
      >
        <RefreshCw className="w-3 h-3 flex-shrink-0" />
        Error al cargar — Reintentar
      </button>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ID1, ID2, ID3"
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => load(true)}
          title="Reintentar"
          className="h-9 w-9 flex-shrink-0 rounded-md border border-input bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
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
