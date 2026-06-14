import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

export type DiscordRole = {
  id: string;
  name: string;
  color: number;
  position: number;
};

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

export function roleColor(color: number): string {
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

export default function GuildRoleSelect({ guildId, value, onChange, placeholder = "Seleccionar rol..." }: Props) {
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [state, setState] = useState<State>("loading");
  const [showManual, setShowManual] = useState(false);

  const load = useCallback(async (bust = false) => {
    if (!guildId) return;
    setState("loading");

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
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => load(true)}
          className="h-9 w-full rounded-md border border-destructive/50 bg-background px-3 py-1 text-sm text-destructive flex items-center gap-2 hover:bg-destructive/5 transition-colors"
        >
          <RefreshCw className="w-3 h-3 flex-shrink-0" />
          Error al cargar — Reintentar
        </button>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="O ingresa el ID del rol manualmente"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ID del rol"
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

  // ok state: show dropdown + optional manual override
  if (showManual) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="ID del rol"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => setShowManual(false)}
            className="h-9 px-2.5 rounded-md border border-input bg-background text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
          >
            Lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
        }}
      >
        <option value="">{placeholder}</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setShowManual(true)}
        title="Ingresar ID manualmente"
        className="h-9 px-2.5 rounded-md border border-input bg-background text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
      >
        ID
      </button>
    </div>
  );
}
