import { useEffect, useState } from "react";
import { Hash, Volume2, Folder, Megaphone, MonitorPlay } from "lucide-react";

// Discord channel types
const CHANNEL_TYPE_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  0: Hash,
  2: Volume2,
  4: Folder,
  5: Megaphone,
  13: MonitorPlay,
};

export type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
};

type Props = {
  guildId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  types?: number[];
};

export default function GuildChannelSelect({ guildId, value, onChange, placeholder = "Seleccionar canal...", types }: Props) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    fetch(`/api/guilds/${guildId}/channels`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        let all: DiscordChannel[] = Array.isArray(data) ? data : [];
        if (types?.length) all = all.filter((c) => types.includes(c.type));
        setChannels(all);
      })
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  if (loading) {
    return (
      <div className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground flex items-center gap-2">
        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Cargando canales...
      </div>
    );
  }

  if (!channels.length) {
    return (
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ID del canal"
        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
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
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          {c.type === 2 ? "🔊" : c.type === 4 ? "📁" : c.type === 5 ? "📣" : "#"} {c.name}
        </option>
      ))}
    </select>
  );
}
