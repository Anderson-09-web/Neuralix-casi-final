import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

export type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
};

type CacheEntry = { data: DiscordChannel[]; ts: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

const pendingRequests = new Map<string, Promise<DiscordChannel[]>>();

async function fetchChannels(guildId: string): Promise<DiscordChannel[]> {
  const existing = pendingRequests.get(guildId);
  if (existing) return existing;

  const promise = fetch(`/api/guilds/${guildId}/channels`, { credentials: "include" })
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    })
    .then((data) => (Array.isArray(data) ? data : []))
    .finally(() => pendingRequests.delete(guildId));

  pendingRequests.set(guildId, promise);
  return promise;
}

type Props = {
  guildId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  types?: number[];
};

type State = "loading" | "ok" | "empty" | "error";

export default function GuildChannelSelect({ guildId, value, onChange, placeholder = "Seleccionar canal...", types }: Props) {
  const [all, setAll] = useState<DiscordChannel[]>([]);
  const [state, setState] = useState<State>("loading");

  const load = useCallback(async (bust = false) => {
    if (!guildId) return;
    setState("loading");

    if (!bust) {
      const hit = cache.get(guildId);
      if (hit && Date.now() - hit.ts < CACHE_TTL) {
        let filtered = hit.data;
        if (types?.length) filtered = filtered.filter((c) => types.includes(c.type));
        setAll(filtered);
        setState(filtered.length ? "ok" : "empty");
        return;
      }
    }

    try {
      const data = await fetchChannels(guildId);
      cache.set(guildId, { data, ts: Date.now() });
      let filtered = data;
      if (types?.length) filtered = filtered.filter((c) => types.includes(c.type));
      setAll(filtered);
      setState(filtered.length ? "ok" : "empty");
    } catch {
      setState("error");
    }
  }, [guildId, types?.join(",")]);

  useEffect(() => { load(); }, [load]);

  if (state === "loading") {
    return (
      <div className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground flex items-center gap-2">
        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Cargando canales...
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
          placeholder="ID del canal"
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

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      <option value="">{placeholder}</option>
      {all.map((c) => (
        <option key={c.id} value={c.id}>
          {c.type === 2 ? "🔊" : c.type === 4 ? "📁" : c.type === 5 ? "📣" : "#"} {c.name}
        </option>
      ))}
    </select>
  );
}
