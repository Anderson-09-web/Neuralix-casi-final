import { useState } from "react";
import { X, Copy, Check, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Variable {
  key: string;
  desc: string;
  example: string;
}

export const WELCOME_VARIABLES: Variable[] = [
  { key: "{user}", desc: "Menciona al nuevo miembro", example: "@Usuario" },
  { key: "{username}", desc: "Nombre de usuario", example: "Usuario" },
  { key: "{usertag}", desc: "Usuario con discriminador", example: "Usuario#0" },
  { key: "{userid}", desc: "ID de Discord del miembro", example: "123456789012345678" },
  { key: "{server}", desc: "Nombre del servidor", example: "Mi Servidor" },
  { key: "{membercount}", desc: "Total de miembros", example: "1523" },
  { key: "{memberposition}", desc: "Posicion del nuevo miembro", example: "1523" },
  { key: "{date}", desc: "Fecha actual", example: "06/06/2026" },
  { key: "{time}", desc: "Hora actual", example: "14:30" },
  { key: "{mention}", desc: "Mencion directa", example: "<@123456789>" },
];

export const GOODBYE_VARIABLES: Variable[] = [
  { key: "{user}", desc: "Nombre del miembro que salio", example: "Usuario" },
  { key: "{username}", desc: "Nombre de usuario", example: "Usuario" },
  { key: "{userid}", desc: "ID de Discord del miembro", example: "123456789012345678" },
  { key: "{server}", desc: "Nombre del servidor", example: "Mi Servidor" },
  { key: "{membercount}", desc: "Total de miembros restantes", example: "1522" },
  { key: "{date}", desc: "Fecha de salida", example: "06/06/2026" },
  { key: "{time}", desc: "Hora de salida", example: "14:30" },
];

export const TICKET_VARIABLES: Variable[] = [
  { key: "{user}", desc: "Menciona al creador del ticket (@mention)", example: "<@123>" },
  { key: "{mention}", desc: "Alias de {user}, menciona al creador", example: "<@123>" },
  { key: "{username}", desc: "Nombre de usuario del creador", example: "usuario123" },
  { key: "{channel}", desc: "Canal del ticket (#canal)", example: "#ticket-usuario123" },
  { key: "{guild}", desc: "Nombre del servidor", example: "Mi Servidor" },
  { key: "{server}", desc: "Alias de {guild}, nombre del servidor", example: "Mi Servidor" },
  { key: "{ticket_id}", desc: "Numero del ticket", example: "42" },
  { key: "{id}", desc: "Alias de {ticket_id}", example: "42" },
  { key: "{module}", desc: "Nombre del modulo seleccionado", example: "Soporte General" },
];

export const VERIFICATION_VARIABLES: Variable[] = [
  { key: "{user}", desc: "Menciona al usuario", example: "@Usuario" },
  { key: "{username}", desc: "Nombre de usuario", example: "Usuario" },
  { key: "{userid}", desc: "ID del usuario", example: "123456789012345678" },
  { key: "{server}", desc: "Nombre del servidor", example: "Mi Servidor" },
  { key: "{role}", desc: "Rol verificado", example: "@Verificado" },
  { key: "{date}", desc: "Fecha de verificacion", example: "06/06/2026" },
];

interface VariablesModalProps {
  variables: Variable[];
  onInsert?: (key: string) => void;
}

export function VariablesModal({ variables, onInsert }: VariablesModalProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
    onInsert?.(key);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 text-xs h-7"
        onClick={() => setOpen(true)}
        data-testid="btn-variables"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Hash className="w-3.5 h-3.5" aria-hidden="true" />
        Ver Variables
      </Button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Variables disponibles"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md px-4"
        >
          <div className="bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold text-sm">Variables disponibles</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Copia cualquier variable para usarla en tu mensaje
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar modal de variables"
                className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="p-3 max-h-80 overflow-y-auto space-y-1" role="list">
              {variables.map((v) => (
                <li key={v.key}>
                  <button
                    onClick={() => copy(v.key)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Copiar variable ${v.key}: ${v.desc}`}
                  >
                    <code className={cn(
                      "font-mono text-xs px-2 py-1 rounded border flex-shrink-0 transition-colors",
                      copied === v.key
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-primary/10 text-primary border-primary/20"
                    )}>
                      {v.key}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{v.desc}</p>
                      <p className="text-xs text-muted-foreground truncate">Ej: {v.example}</p>
                    </div>
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                      {copied === v.key
                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                        : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-3 border-t border-border bg-secondary/30">
              <p className="text-xs text-muted-foreground">
                Haz click en una variable para copiarla al portapapeles e insertarla
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
