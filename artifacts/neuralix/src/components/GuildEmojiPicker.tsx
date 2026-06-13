import { useState, useEffect, useRef } from "react";
import { Smile, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type GuildEmoji = {
  id: string;
  name: string;
  animated: boolean;
  url: string;
  formatted: string;
};

interface GuildEmojiPickerProps {
  guildId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function GuildEmojiPicker({ guildId, value, onChange, placeholder = "Emoji (opcional)" }: GuildEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [emojis, setEmojis] = useState<GuildEmoji[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || emojis.length > 0) return;
    setLoading(true);
    fetch(`/api/guilds/${guildId}/emojis`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setEmojis(data) : setEmojis([]))
      .catch(() => setEmojis([]))
      .finally(() => setLoading(false));
  }, [open, guildId, emojis.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = emojis.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));

  const currentEmoji = value ? emojis.find((e) => e.formatted === value) : null;

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-1">
        <input
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-9 w-9 rounded-md border border-input bg-background flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0"
          title="Emojis del servidor"
        >
          {currentEmoji ? (
            <img src={currentEmoji.url} alt={currentEmoji.name} className="w-5 h-5 object-contain" />
          ) : (
            <Smile className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-border flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Buscar emoji..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="p-2 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {emojis.length === 0 ? "Este servidor no tiene emojis personalizados" : "Sin resultados"}
              </p>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    title={`:${e.name}:`}
                    onClick={() => { onChange(e.formatted); setOpen(false); setFilter(""); }}
                    className={cn(
                      "w-9 h-9 rounded flex items-center justify-center hover:bg-secondary transition-colors",
                      value === e.formatted && "bg-primary/20 ring-1 ring-primary/40"
                    )}
                  >
                    <img src={e.url} alt={e.name} className="w-6 h-6 object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border bg-secondary/30">
            <p className="text-xs text-muted-foreground">
              Emojis del servidor · Tambien puedes escribir un emoji normal
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
