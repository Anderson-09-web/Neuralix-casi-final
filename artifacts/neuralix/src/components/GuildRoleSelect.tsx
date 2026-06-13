import { useEffect, useState } from "react";

export type DiscordRole = {
  id: string;
  name: string;
  color: number;
  position: number;
};

function roleColor(color: number): string {
  if (!color) return "#6b7280";
  return `#${color.toString(16).padStart(6, "0")}`;
}

type Props = {
  guildId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiple?: false;
};

export default function GuildRoleSelect({ guildId, value, onChange, placeholder = "Seleccionar rol..." }: Props) {
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    fetch(`/api/guilds/${guildId}/roles`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]))
      .finally(() => setLoading(false));
  }, [guildId]);

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
        placeholder="ID del rol"
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
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
