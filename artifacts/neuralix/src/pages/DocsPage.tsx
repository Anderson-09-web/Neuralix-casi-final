import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Lock, Eye, EyeOff, AlertTriangle, Search, ChevronRight, ChevronDown,
  Bot, Shield, ShieldAlert, Ticket, Users, FileText, Database,
  Star, Settings, Globe, Key, Zap, BookOpen, Code2, Terminal,
  ArrowLeft, Clock, CheckCircle, XCircle, Info, Copy, Check,
  Menu, X, Hash, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const DOCS_PASSWORD = "3008053832jp";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;
const STORAGE_KEY = "neuralix_docs_auth";
const ATTEMPTS_KEY = "neuralix_docs_attempts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Attempt { count: number; lockedUntil: number | null; lastAttempt: number; }

// ─── Docs Data ────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "introduccion", label: "Introduccion", icon: BookOpen, subsections: [] },
  {
    id: "dashboard", label: "Dashboard", icon: Settings, subsections: [
      "Gestion de servidores", "Configuraciones", "Permisos", "Sincronizacion", "Guardado automatico"
    ]
  },
  {
    id: "bienvenidas", label: "Bienvenidas", icon: Users, subsections: [
      "Configuracion", "Variables disponibles", "AutoRoles", "Embeds", "Imagenes"
    ]
  },
  {
    id: "despedidas", label: "Despedidas", icon: Users, subsections: [
      "Configuracion", "Variables", "Embeds", "Imagenes"
    ]
  },
  {
    id: "verificacion", label: "Verificacion Web", icon: Shield, subsections: [
      "Configuracion", "OAuth2", "AntiAlt", "AntiVPN", "AntiProxy", "AntiBot", "Roles automaticos", "Flujo de verificacion"
    ]
  },
  {
    id: "tickets", label: "Sistema de Tickets", icon: Ticket, subsections: [
      "Paneles", "Categorias", "Botones", "Menus", "Configuracion", "Transcripciones"
    ]
  },
  {
    id: "soporte-web", label: "Soporte Web", icon: Globe, subsections: [
      "Apertura de tickets", "Chat en tiempo real", "Gestion de soporte", "Historial"
    ]
  },
  {
    id: "ai-assistant", label: "AI Assistant", icon: Bot, subsections: [
      "Configuracion", "Uso", "Analisis automaticos", "Recomendaciones"
    ]
  },
  {
    id: "antiraid", label: "AntiRaid", icon: ShieldAlert, subsections: [
      "AntiRaid General", "AntiAlt", "AntiBot", "AntiSpam", "AntiLinks",
      "AntiMassMention", "AntiWebhook", "AntiChannelCreate", "AntiChannelDelete",
      "AntiChannelUpdate", "AntiRoleCreate", "AntiRoleDelete", "AntiRoleUpdate",
      "AntiEmojiCreate", "AntiEmojiDelete", "AntiBanMass", "AntiKickMass", "AntiNuke"
    ]
  },
  {
    id: "logs", label: "Sistema de Logs", icon: FileText, subsections: [
      "Configuracion", "Canal de logs", "Eventos registrados", "Auditoria"
    ]
  },
  {
    id: "backups", label: "Sistema de Backups", icon: Database, subsections: [
      "Crear backup", "Restaurar backup", "Historial", "Backups automaticos", "Versionado"
    ]
  },
  {
    id: "premium", label: "Sistema Premium", icon: Star, subsections: [
      "Licencias", "Activacion", "Beneficios", "Restricciones"
    ]
  },
  {
    id: "blacklist", label: "Blacklist Global", icon: XCircle, subsections: [
      "Gestion", "Funcionamiento", "Configuracion"
    ]
  },
  {
    id: "admin", label: "Panel de Administracion", icon: Key, subsections: [
      "Gestion Premium", "Tickets Web", "Blacklist", "Anuncios", "Gestion global"
    ]
  },
  {
    id: "api", label: "API Neuralix", icon: Code2, subsections: [
      "Autenticacion", "Endpoints de Auth", "Endpoints de Guilds", "Endpoints de Bienvenidas",
      "Endpoints de Verificacion", "Endpoints de Tickets", "Endpoints de AntiRaid",
      "Endpoints de Logs", "Endpoints de Backups", "Endpoints de Premium",
      "Endpoints de Soporte", "Endpoints de AI", "Endpoints de Admin", "Rate Limits"
    ]
  },
];

// ─── Code Block ───────────────────────────────────────────────────────────────
function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg bg-[hsl(224,35%,6%)] border border-border overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[hsl(224,30%,9%)]">
        <span className="text-xs font-mono text-muted-foreground">{lang}</span>
        <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

// ─── Endpoint Card ────────────────────────────────────────────────────────────
function EndpointCard({ method, url, auth, desc, params, req, res, errors }: {
  method: string; url: string; auth: boolean; desc: string;
  params?: { name: string; type: string; required: boolean; desc: string }[];
  req?: string; res?: string; errors?: { code: number; msg: string }[];
}) {
  const [open, setOpen] = useState(false);
  const colors: Record<string, string> = {
    GET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    POST: "bg-green-500/20 text-green-400 border-green-500/30",
    PUT: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    PATCH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <div className={cn("border border-border rounded-xl overflow-hidden mb-3 transition-all", open && "border-primary/30")}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left">
        <span className={cn("text-xs font-bold px-2 py-0.5 rounded border font-mono flex-shrink-0", colors[method] || "bg-muted text-muted-foreground")}>{method}</span>
        <code className="text-sm font-mono flex-1 text-foreground">{url}</code>
        {auth && <Lock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
          <p className="text-sm text-muted-foreground">{desc}</p>
          {auth && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5" /> Requiere autenticacion (cookie JWT)
            </div>
          )}
          {params && params.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Parametros</p>
              <div className="space-y-1">
                {params.map((p) => (
                  <div key={p.name} className="flex items-start gap-3 text-xs">
                    <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">{p.name}</code>
                    <span className="text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex-shrink-0">{p.type}</span>
                    {p.required && <span className="text-red-400 flex-shrink-0">requerido</span>}
                    <span className="text-muted-foreground">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {req && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ejemplo de peticion</p>
              <CodeBlock code={req} lang="json" />
            </div>
          )}
          {res && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ejemplo de respuesta</p>
              <CodeBlock code={res} lang="json" />
            </div>
          )}
          {errors && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Errores posibles</p>
              <div className="space-y-1">
                {errors.map((e) => (
                  <div key={e.code} className="flex items-center gap-3 text-xs">
                    <code className="font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">{e.code}</code>
                    <span className="text-muted-foreground">{e.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Alert Box ────────────────────────────────────────────────────────────────
function Alert({ type, children }: { type: "info" | "warning" | "tip" | "danger"; children: React.ReactNode }) {
  const styles = {
    info: { cls: "bg-blue-500/10 border-blue-500/20 text-blue-300", icon: <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" /> },
    warning: { cls: "bg-yellow-500/10 border-yellow-500/20 text-yellow-300", icon: <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" /> },
    tip: { cls: "bg-green-500/10 border-green-500/20 text-green-300", icon: <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /> },
    danger: { cls: "bg-red-500/10 border-red-500/20 text-red-300", icon: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> },
  };
  const { cls, icon } = styles[type];
  return (
    <div className={cn("flex gap-3 p-4 rounded-xl border text-sm my-4", cls)}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

// ─── Section Heading ──────────────────────────────────────────────────────────
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-bold mt-10 mb-4 text-foreground flex items-center gap-2 scroll-mt-24">
      <Hash className="w-4 h-4 text-primary opacity-60" />
      {children}
    </h2>
  );
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-base font-semibold mt-6 mb-3 text-foreground scroll-mt-24">{children}</h3>
  );
}

// ─── Full Docs Content ────────────────────────────────────────────────────────
function DocsContent({ activeSection }: { activeSection: string }) {
  return (
    <div className="prose-slate max-w-none text-sm leading-relaxed text-foreground">

      {/* INTRO */}
      {activeSection === "introduccion" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Documentacion de Neuralix</h1>
          <p className="text-muted-foreground text-base mb-6 leading-relaxed">
            Bienvenido a la documentacion oficial de Neuralix Enterprise — la plataforma SaaS para gestionar bots de Discord con seguridad avanzada, IA integrada y control total de tu servidor.
          </p>
          <Alert type="info">
            Esta documentacion describe el funcionamiento real de Neuralix. Las funciones marcadas como <strong>Premium</strong> requieren una licencia activa.
          </Alert>
          <H3>Como esta organizada esta documentacion</H3>
          <p className="text-muted-foreground">Cada seccion cubre un sistema especifico de Neuralix. Usa el buscador superior o el indice lateral para navegar rapidamente. La seccion <strong>API Neuralix</strong> documenta todos los endpoints con ejemplos de peticion y respuesta.</p>
          <H3>Requisitos previos</H3>
          <ul className="space-y-2 text-muted-foreground mt-3">
            {["Cuenta de Discord con permisos de Administrador en el servidor que quieres gestionar.", "Bot Neuralix agregado al servidor (boton 'Agregar Bot' en el dashboard).", "Sesion iniciada en el dashboard via Discord OAuth2."].map((t) => (
              <li key={t} className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
          <H3>Tecnologia</H3>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[["Frontend", "React + Vite + TailwindCSS + shadcn/ui"], ["Backend", "Express 5 + TypeScript"], ["Base de datos", "PostgreSQL + Drizzle ORM"], ["Auth", "Discord OAuth2 + JWT (cookies httpOnly)"], ["AI", "Analisis integrado con recomendaciones"], ["API", "REST + OpenAPI spec"]].map(([k, v]) => (
              <div key={k} className="bg-card border border-card-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{k}</p>
                <p className="font-medium text-sm mt-1">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DASHBOARD */}
      {activeSection === "dashboard" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Dashboard</h1>
          <p className="text-muted-foreground mb-6">El Dashboard es el centro de control de Neuralix. Desde aqui gestionas todos tus servidores, ajustas configuraciones y supervisas el estado del bot.</p>
          <H2 id="gestion-de-servidores">Gestion de servidores</H2>
          <p className="text-muted-foreground">Al iniciar sesion, Neuralix carga automaticamente todos los servidores de Discord donde tienes permiso de <strong>Administrador</strong> o <strong>Gestionar Servidor</strong>.</p>
          <Alert type="info">Solo aparecen servidores donde tienes permisos de administracion. Si no ves un servidor, verifica tus permisos en Discord.</Alert>
          <p className="text-muted-foreground mt-3">Cada servidor muestra:</p>
          <ul className="text-muted-foreground space-y-1 mt-2">
            <li><strong>Icono y nombre</strong> del servidor</li>
            <li><strong>Estado del bot</strong> — activo (verde) o sin instalar (gris)</li>
            <li><strong>Numero de miembros</strong> (si el bot esta presente)</li>
            <li><strong>Nivel de servidor</strong> (Nitro Boost tier)</li>
          </ul>
          <H2 id="configuraciones">Configuraciones</H2>
          <p className="text-muted-foreground">Cada modulo tiene su propia pagina de configuracion. Los cambios se aplican en tiempo real al bot cuando se guarda.</p>
          <H2 id="permisos">Permisos</H2>
          <p className="text-muted-foreground">Neuralix comprueba los permisos via la API de Discord en cada inicio de sesion. Los permisos minimos requeridos son:</p>
          <CodeBlock code={`Bit: 0x8 (ADMINISTRATOR)\nBit: 0x20 (MANAGE_GUILD)`} lang="permisos" />
          <H2 id="sincronizacion">Sincronizacion</H2>
          <p className="text-muted-foreground">El dashboard se sincroniza con Discord en cada sesion. Para forzar una actualizacion de la lista de servidores, usa el boton de refresco en la pagina de servidores.</p>
          <H2 id="guardado-automatico">Guardado automatico</H2>
          <Alert type="tip">Los cambios en los modulos <strong>no</strong> se guardan automaticamente. Siempre presiona el boton <strong>Guardar</strong> despues de modificar una configuracion para aplicar los cambios.</Alert>
        </div>
      )}

      {/* BIENVENIDAS */}
      {activeSection === "bienvenidas" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Bienvenidas</h1>
          <p className="text-muted-foreground mb-6">Configura mensajes personalizados que se envian automaticamente cuando un nuevo miembro se une al servidor.</p>
          <H2 id="configuracion-bienvenidas">Configuracion</H2>
          <p className="text-muted-foreground">Para configurar las bienvenidas, ve a <code className="bg-primary/10 text-primary px-1 rounded">Panel → Bienvenidas</code>.</p>
          <ul className="text-muted-foreground space-y-2 mt-3">
            <li><strong>Activar bienvenidas</strong> — Interruptor principal para habilitar el sistema</li>
            <li><strong>Canal</strong> — ID del canal de Discord donde se enviaran los mensajes</li>
            <li><strong>Mensaje</strong> — Texto del mensaje con soporte de variables</li>
            <li><strong>Usar embed</strong> — Activar para enviar el mensaje como embed de Discord</li>
            <li><strong>Enviar DM</strong> — Enviar un mensaje privado al nuevo miembro</li>
          </ul>
          <H2 id="variables-disponibles">Variables disponibles</H2>
          <p className="text-muted-foreground mb-3">Puedes usar estas variables en el mensaje y en el embed:</p>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Variable</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Descripcion</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Ejemplo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["{user}", "Mencion del nuevo miembro", "@Usuario"],
                  ["{username}", "Nombre de usuario", "Usuario#1234"],
                  ["{server}", "Nombre del servidor", "Mi Servidor"],
                  ["{memberCount}", "Numero total de miembros", "1523"],
                  ["{memberPosition}", "Posicion del miembro (ej: 1523)", "1523"],
                  ["{date}", "Fecha actual", "06/06/2026"],
                ].map(([v, d, e]) => (
                  <tr key={v}>
                    <td className="px-4 py-2.5"><code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs font-mono">{v}</code></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <H2 id="autoroles">AutoRoles</H2>
          <p className="text-muted-foreground">Los AutoRoles asignan roles automaticamente al nuevo miembro al unirse. Configura los IDs de roles en el campo <code className="bg-primary/10 text-primary px-1 rounded">autoRoleIds</code>.</p>
          <Alert type="warning">El bot debe tener el rol por encima de los roles que va a asignar en la jerarquia de Discord.</Alert>
          <H2 id="embeds">Embeds</H2>
          <p className="text-muted-foreground">Cuando se activa el embed, puedes configurar:</p>
          <ul className="text-muted-foreground space-y-1 mt-2">
            <li><strong>Titulo</strong> — Titulo del embed (soporta variables)</li>
            <li><strong>Descripcion</strong> — Descripcion del embed (soporta variables)</li>
            <li><strong>Color</strong> — Color del embed en formato hex (ej: <code>#5865F2</code>)</li>
          </ul>
          <H2 id="imagenes-bienvenidas">Imagenes</H2>
          <p className="text-muted-foreground">Activa <strong>imagen habilitada</strong> para generar una imagen de bienvenida personalizada con el avatar del miembro. Requiere plan Premium.</p>
        </div>
      )}

      {/* DESPEDIDAS */}
      {activeSection === "despedidas" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Despedidas</h1>
          <p className="text-muted-foreground mb-6">Configura mensajes automaticos cuando un miembro abandona el servidor o es baneado/expulsado.</p>
          <H2 id="configuracion-despedidas">Configuracion</H2>
          <p className="text-muted-foreground">Ve a <code className="bg-primary/10 text-primary px-1 rounded">Panel → Despedidas</code>. La configuracion es similar a Bienvenidas.</p>
          <H2 id="variables-despedidas">Variables</H2>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Variable</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Descripcion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[["{user}", "Nombre del miembro que se fue"], ["{server}", "Nombre del servidor"], ["{memberCount}", "Miembros restantes"], ["{date}", "Fecha de salida"]].map(([v, d]) => (
                  <tr key={v}><td className="px-4 py-2.5"><code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs font-mono">{v}</code></td><td className="px-4 py-2.5 text-muted-foreground">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <H2 id="embeds-despedidas">Embeds</H2>
          <p className="text-muted-foreground">Igual que en bienvenidas: titulo, descripcion y color en hex.</p>
          <H2 id="imagenes-despedidas">Imagenes</H2>
          <p className="text-muted-foreground">Genera imagenes de despedida con el avatar del miembro. Requiere Premium.</p>
        </div>
      )}

      {/* VERIFICACION */}
      {activeSection === "verificacion" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Verificacion Web</h1>
          <p className="text-muted-foreground mb-6">Filtra automaticamente alts, bots, VPNs y proxies antes de que los usuarios accedan al servidor completo.</p>
          <H2 id="configuracion-verificacion">Configuracion</H2>
          <ul className="text-muted-foreground space-y-2 mt-3">
            <li><strong>Rol verificado</strong> — ID del rol que se asigna al pasar la verificacion</li>
            <li><strong>Edad minima de cuenta</strong> — Dias minimos que debe tener la cuenta de Discord</li>
            <li><strong>AntiVPN</strong> — Bloquea usuarios con VPN/proxy/Tor</li>
            <li><strong>AntiAlt</strong> — Bloquea cuentas alternativas sospechosas</li>
            <li><strong>AntiBot</strong> — Bloquea cuentas identificadas como bots</li>
          </ul>
          <H2 id="oauth2-verificacion">OAuth2</H2>
          <p className="text-muted-foreground">El portal de verificacion usa Discord OAuth2 para identificar al usuario antes de asignar el rol. El flujo es:</p>
          <div className="flex flex-col gap-2 mt-3">
            {["Usuario hace click en el enlace de verificacion", "Se redirige a Discord OAuth2", "Usuario autoriza la app", "Neuralix verifica la cuenta (edad, VPN, etc.)", "Si pasa todos los filtros, se asigna el rol verificado", "Si falla algun filtro, se deniega el acceso con mensaje de error"].map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
          <H2 id="antialt">AntiAlt</H2>
          <p className="text-muted-foreground">Detecta y bloquea cuentas alternativas basandose en la edad de la cuenta de Discord. Configura el numero minimo de dias en la opcion <strong>Edad minima</strong>.</p>
          <Alert type="tip">Recomendamos un minimo de 7 dias para evitar la mayoria de cuentas alt.</Alert>
          <H2 id="antivpn">AntiVPN</H2>
          <p className="text-muted-foreground">Detecta conexiones via VPN, proxy, Tor u otros metodos de anonimizacion. Los usuarios bloqueados reciben un mensaje explicando como desactivar la VPN para verificarse.</p>
          <H2 id="antiproxy">AntiProxy</H2>
          <p className="text-muted-foreground">Bloquea IPs catalogadas como proxies residenciales o datacenter. Complementa AntiVPN para mayor cobertura.</p>
          <H2 id="antibot-verificacion">AntiBot</H2>
          <p className="text-muted-foreground">Detecta cuentas con comportamiento automatizado o marcadas como bot en la API de Discord.</p>
          <H2 id="roles-automaticos">Roles automaticos</H2>
          <p className="text-muted-foreground">Al pasar la verificacion, se asigna automaticamente el rol configurado en <strong>ID del rol verificado</strong>.</p>
          <H2 id="flujo-verificacion">Flujo de verificacion</H2>
          <p className="text-muted-foreground">El enlace del portal de verificacion se puede compartir en Discord. El formato es:</p>
          <CodeBlock code={`https://tu-dominio.replit.app/verify?guild=TU_GUILD_ID`} lang="url" />
        </div>
      )}

      {/* TICKETS */}
      {activeSection === "tickets" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Tickets</h1>
          <p className="text-muted-foreground mb-6">Gestiona solicitudes de soporte de tus miembros directamente en Discord con canales privados, transcripciones y roles de soporte.</p>
          <H2 id="paneles">Paneles</H2>
          <p className="text-muted-foreground">Un panel de tickets es un mensaje con botones que los miembros usan para abrir un ticket. Configura el canal del panel en <strong>Canal del panel</strong> y el mensaje en <strong>Mensaje del panel</strong>.</p>
          <H2 id="categorias">Categorias</H2>
          <p className="text-muted-foreground">Configura la categoria de Discord donde se crearan los canales de tickets. Usa el campo <strong>Categoria (ID)</strong>.</p>
          <Alert type="info">Crea una categoria llamada "Tickets" en Discord y copia su ID (clic derecho → Copiar ID con Modo Desarrollador activo).</Alert>
          <H2 id="botones">Botones</H2>
          <p className="text-muted-foreground">El panel muestra automaticamente un boton "Abrir Ticket". Los miembros lo pulsan para crear un canal privado.</p>
          <H2 id="menus">Menus</H2>
          <p className="text-muted-foreground">Con Premium, puedes usar menus desplegables para que el usuario seleccione el tipo de ticket antes de abrirlo.</p>
          <H2 id="configuracion-tickets">Configuracion</H2>
          <ul className="text-muted-foreground space-y-2 mt-3">
            <li><strong>Categoria (ID)</strong> — Donde se crean los canales de tickets</li>
            <li><strong>Rol de soporte (ID)</strong> — Rol que puede ver y responder todos los tickets</li>
            <li><strong>Canal de transcripciones (ID)</strong> — Donde se guardan las transcripciones al cerrar</li>
            <li><strong>Maximo de tickets por usuario</strong> — Evita abuso (por defecto: 1)</li>
          </ul>
          <H2 id="transcripciones">Transcripciones</H2>
          <p className="text-muted-foreground">Al cerrar un ticket, se genera automaticamente una transcripcion en formato HTML y se envia al canal configurado. Incluye todos los mensajes, fechas y participantes.</p>
        </div>
      )}

      {/* SOPORTE WEB */}
      {activeSection === "soporte-web" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Soporte Web</h1>
          <p className="text-muted-foreground mb-6">El soporte web permite a los usuarios abrir tickets desde el dashboard sin necesidad de Discord, con chat en tiempo real y seguimiento del estado.</p>
          <H2 id="apertura-tickets">Apertura de tickets</H2>
          <p className="text-muted-foreground">Ve a <code className="bg-primary/10 text-primary px-1 rounded">/support</code> y pulsa <strong>Nuevo ticket</strong>. Rellena el asunto y la descripcion.</p>
          <H2 id="chat-tiempo-real">Chat en tiempo real</H2>
          <p className="text-muted-foreground">Los mensajes se actualizan al recargar. El equipo de soporte (usuarios con permisos de owner) ve todos los tickets y puede responder desde el panel.</p>
          <H2 id="gestion-soporte">Gestion de soporte</H2>
          <p className="text-muted-foreground">Los administradores ven todos los tickets en <code className="bg-primary/10 text-primary px-1 rounded">/admin</code> y pueden responder desde el dashboard.</p>
          <H2 id="historial">Historial</H2>
          <p className="text-muted-foreground">Todos los tickets y mensajes se guardan en la base de datos. Los tickets cerrados permanecen en el historial para referencia futura.</p>
        </div>
      )}

      {/* AI ASSISTANT */}
      {activeSection === "ai-assistant" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Neuralix AI Assistant</h1>
          <p className="text-muted-foreground mb-6">El asistente IA de Neuralix analiza tu servidor y te da recomendaciones de seguridad personalizadas.</p>
          <H2 id="configuracion-ai">Configuracion</H2>
          <p className="text-muted-foreground">El AI Assistant esta disponible en todas las paginas de servidor. Haz click en el boton del bot en la esquina inferior derecha para abrirlo.</p>
          <H2 id="uso-ai">Uso</H2>
          <p className="text-muted-foreground">Puedes hacerle preguntas sobre cualquier modulo de Neuralix:</p>
          <div className="space-y-2 mt-3">
            {["Como activo el AntiRaid?", "Como configuro la verificacion?", "Que es AntiNuke?", "Como creo un panel de tickets?"].map((q) => (
              <div key={q} className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary flex-shrink-0" />
                "{q}"
              </div>
            ))}
          </div>
          <H2 id="analisis-automaticos">Analisis automaticos</H2>
          <p className="text-muted-foreground">Pulsa <strong>Analizar Servidor</strong> en la pestana "Analisis" del asistente. Neuralix revisara:</p>
          <ul className="text-muted-foreground space-y-1 mt-2">
            <li>Estado del AntiRaid y modulos activos</li>
            <li>Configuracion de verificacion</li>
            <li>Sistema de logs</li>
            <li>Sistema de tickets</li>
            <li>Backups disponibles</li>
          </ul>
          <H2 id="recomendaciones">Recomendaciones</H2>
          <p className="text-muted-foreground">El analisis genera una <strong>puntuacion de seguridad</strong> de 0 a 100 y una lista de recomendaciones priorizadas por severidad:</p>
          <div className="space-y-2 mt-3">
            {[["Alta", "text-red-400 bg-red-500/10 border-red-500/20", "Accion inmediata recomendada"], ["Media", "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", "Mejora importante de seguridad"], ["Baja", "text-blue-400 bg-blue-500/10 border-blue-500/20", "Optimizacion recomendada"], ["Info", "text-green-400 bg-green-500/10 border-green-500/20", "Buena configuracion"]].map(([s, cls, d]) => (
              <div key={s} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg border text-sm", cls)}>
                <strong>{s}</strong><span className="text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ANTIRAID */}
      {activeSection === "antiraid" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema AntiRaid</h1>
          <p className="text-muted-foreground mb-6">El sistema AntiRaid de Neuralix incluye 18 modulos independientes para proteger tu servidor contra todo tipo de ataques.</p>
          <Alert type="tip">Activa primero el interruptor global <strong>AntiRaid</strong> y luego habilita los modulos individuales que necesites.</Alert>
          {[
            ["AntiRaid General", "antiraid-general", "El modulo principal que controla el sistema AntiRaid. Debe estar activado para que los demas modulos funcionen. Cuando detecta una amenaza, puede aplicar acciones como timeout, kick o ban segun la configuracion."],
            ["AntiAlt", "antialt-module", "Bloquea cuentas con menos dias de antiguedad que el minimo configurado. Util para prevenir raids de cuentas recien creadas. Configuracion: edad minima en dias (recomendado: 7)."],
            ["AntiBot", "antibot-module", "Bloquea bots no autorizados que intenten unirse. Puedes configurar una whitelist de IDs de bots permitidos (ej: bots de musica o utilidades de confianza)."],
            ["AntiSpam", "antispam-module", "Detecta y sanciona a usuarios que envian mensajes a una velocidad excesiva. Configura el limite de mensajes por intervalo de tiempo."],
            ["AntiLinks", "antilinks-module", "Bloquea enlaces no autorizados en mensajes. Puedes configurar dominios permitidos (whitelist) y dominios bloqueados (blacklist). Los enlaces de Discord son permitidos por defecto."],
            ["AntiMassMention", "antimassmention-module", "Detecta mensajes con demasiadas menciones simultaneas. Configura el maximo de menciones por mensaje (recomendado: 5)."],
            ["AntiWebhook", "antiwebhook-module", "Previene la creacion masiva de webhooks, tecnica usada en ataques de spam. Monitorea los webhooks creados por usuarios en un intervalo de tiempo."],
            ["AntiChannelCreate", "antichannelcreate-module", "Detecta cuando un usuario crea canales de forma masiva en poco tiempo, patron comun en ataques tipo 'nuke'. Aplica sancion automatica al detectarlo."],
            ["AntiChannelDelete", "antichanneldelete-module", "Detecta eliminacion masiva de canales. Si un usuario elimina varios canales en poco tiempo, se aplica la sancion configurada y se puede restaurar desde backup."],
            ["AntiChannelUpdate", "antichannelupdate-module", "Detecta modificaciones masivas de canales (nombre, permisos, categoria). Util para detectar admins comprometidos."],
            ["AntiRoleCreate", "antirolecreate-module", "Detecta creacion masiva de roles, patron usado para dar permisos peligrosos a bots o usuarios maliciosos."],
            ["AntiRoleDelete", "antiroledelete-module", "Detecta eliminacion masiva de roles. Junto con AntiNuke, protege la estructura de permisos del servidor."],
            ["AntiRoleUpdate", "antiroleupdate-module", "Detecta modificaciones masivas de roles, especialmente cambios de permisos peligrosos (Administrator, Manage Guild, etc.)."],
            ["AntiEmojiCreate", "antiemojicreate-module", "Detecta adicion masiva de emojis en poco tiempo. Util para prevenir el spam de emojis que consume el limite del servidor."],
            ["AntiEmojiDelete", "antiemojidelete-module", "Detecta eliminacion masiva de emojis del servidor."],
            ["AntiBanMass", "antibanmass-module", "Detecta cuando un administrador banea a multiples miembros en poco tiempo. Puede indicar una cuenta de admin comprometida."],
            ["AntiKickMass", "antikickmass-module", "Detecta expulsiones masivas. Similar a AntiBanMass pero para kicks."],
            ["AntiNuke", "antinuke-module", "El modulo mas avanzado. Detecta patrones de destruccion total del servidor (eliminar todos los canales, roles, banear masivamente). Al detectar un ataque nuke, revoca inmediatamente los permisos del atacante y puede restaurar desde el ultimo backup. <strong>Requiere Premium.</strong>"],
          ].map(([title, id, desc]) => (
            <div key={id}>
              <H2 id={id}>{title}</H2>
              <p className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: desc }} />
            </div>
          ))}
        </div>
      )}

      {/* LOGS */}
      {activeSection === "logs" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Logs</h1>
          <p className="text-muted-foreground mb-6">Registra toda la actividad del servidor para auditoria y seguimiento.</p>
          <H2 id="configuracion-logs">Configuracion</H2>
          <ul className="text-muted-foreground space-y-2 mt-3">
            <li><strong>Logs activos</strong> — Interruptor principal</li>
            <li><strong>Canal de logs (ID)</strong> — Canal de Discord donde se enviaran los registros</li>
          </ul>
          <H2 id="canal-de-logs">Canal de logs</H2>
          <Alert type="info">Crea un canal privado visible solo para administradores y copia su ID para el campo Canal de logs.</Alert>
          <H2 id="eventos-registrados">Eventos registrados</H2>
          <div className="border border-border rounded-xl overflow-hidden mt-3">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Categoria</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Eventos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[["Miembros", "Entrada, salida, ban, unban, cambio de nickname, cambio de roles"], ["Mensajes", "Edicion, eliminacion, bulk delete"], ["Roles", "Creacion, eliminacion, modificacion de permisos"], ["Canales", "Creacion, eliminacion, modificacion"], ["Moderacion", "Baneos, kicks, timeouts, warns"], ["Seguridad", "Detecciones AntiRaid, verificaciones, acciones del bot"]].map(([cat, evts]) => (
                  <tr key={cat}><td className="px-4 py-2.5 font-medium">{cat}</td><td className="px-4 py-2.5 text-muted-foreground">{evts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <H2 id="auditoria">Auditoria</H2>
          <p className="text-muted-foreground">El dashboard muestra los logs de tu servidor en tiempo real. Puedes filtrar por categoria y fecha. Los logs se guardan en la base de datos de Neuralix para consulta futura.</p>
        </div>
      )}

      {/* BACKUPS */}
      {activeSection === "backups" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema de Backups</h1>
          <p className="text-muted-foreground mb-6">Guarda y restaura la configuracion completa de tu servidor con un solo click.</p>
          <H2 id="crear-backup">Crear backup</H2>
          <p className="text-muted-foreground">Ve a <code className="bg-primary/10 text-primary px-1 rounded">Panel → Backups</code> y pulsa <strong>Crear backup</strong>. Neuralix guardara el estado actual de:</p>
          <ul className="text-muted-foreground space-y-1 mt-2">
            <li>Configuracion de bienvenidas y despedidas</li>
            <li>Configuracion AntiRaid (todos los modulos)</li>
            <li>Configuracion de tickets</li>
            <li>Configuracion de verificacion</li>
            <li>Configuracion de logs</li>
          </ul>
          <H2 id="restaurar-backup">Restaurar backup</H2>
          <p className="text-muted-foreground">Haz click en <strong>Restaurar</strong> en cualquier backup de la lista. La configuracion se sobrescribira con la del backup seleccionado.</p>
          <Alert type="danger">Restaurar un backup sobrescribe la configuracion actual. Esta accion no se puede deshacer.</Alert>
          <H2 id="historial-backups">Historial</H2>
          <p className="text-muted-foreground">Todos los backups se muestran con nombre, fecha, tamano y numero de version. Los mas recientes aparecen primero.</p>
          <H2 id="backups-automaticos">Backups automaticos</H2>
          <p className="text-muted-foreground">Con plan Premium, Neuralix puede crear backups automaticos segun un intervalo configurado (diario, semanal).</p>
          <H2 id="versionado">Versionado</H2>
          <p className="text-muted-foreground">Cada backup tiene un numero de version incremental. El formato del nombre es <code className="font-mono text-xs bg-primary/10 text-primary px-1 rounded">Backup #N - DD/MM/AAAA</code>.</p>
        </div>
      )}

      {/* PREMIUM */}
      {activeSection === "premium" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Sistema Premium</h1>
          <p className="text-muted-foreground mb-6">Desbloquea funciones avanzadas de Neuralix con un plan Premium.</p>
          <H2 id="planes">Planes disponibles</H2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            {[
              { name: "Plus", price: "$4.99/mes", features: ["5 backups", "AI Assistant", "Soporte prioritario", "Comandos personalizados"] },
              { name: "Pro", price: "$9.99/mes", features: ["Backups ilimitados", "IA Avanzada", "Proteccion AntiNuke", "Multi-panel de tickets", "Acceso a API"] },
              { name: "Ultra", price: "$19.99/mes", features: ["Todo en Pro", "Soporte dedicado", "Integraciones personalizadas", "Garantia SLA", "Analytics avanzado"] },
            ].map((p) => (
              <div key={p.name} className="bg-card border border-card-border rounded-xl p-4">
                <h3 className="font-bold text-primary">{p.name}</h3>
                <p className="text-lg font-black mb-3">{p.price}</p>
                {p.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />{f}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <H2 id="licencias">Licencias</H2>
          <p className="text-muted-foreground">Las licencias son codigos unicos con formato <code className="font-mono text-xs bg-primary/10 text-primary px-1 rounded">NRX-PLAN-XXXXXXXXXXXXXXXX</code> que activan el Premium en un servidor.</p>
          <H2 id="activacion">Activacion</H2>
          <p className="text-muted-foreground">Ve a <code className="bg-primary/10 text-primary px-1 rounded">Panel → Premium</code> e introduce el codigo de licencia en el campo <strong>Activar con codigo</strong>.</p>
          <H2 id="beneficios">Beneficios</H2>
          <p className="text-muted-foreground">Cada plan desbloquea funciones adicionales. AntiNuke, backups automaticos e imagenes de bienvenida requieren minimo plan Plus.</p>
          <H2 id="restricciones">Restricciones</H2>
          <p className="text-muted-foreground">Una licencia es valida para un unico servidor. Si quieres activar Premium en varios servidores, necesitas una licencia por servidor.</p>
        </div>
      )}

      {/* BLACKLIST */}
      {activeSection === "blacklist" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Blacklist Global</h1>
          <p className="text-muted-foreground mb-6">La blacklist global de Neuralix bloquea usuarios en todos los servidores que tengan el bot instalado.</p>
          <H2 id="gestion-blacklist">Gestion</H2>
          <p className="text-muted-foreground">Solo los owners de Neuralix pueden gestionar la blacklist desde <code className="bg-primary/10 text-primary px-1 rounded">/admin → Blacklist</code>.</p>
          <H2 id="funcionamiento-blacklist">Funcionamiento</H2>
          <p className="text-muted-foreground">Cuando un usuario en la blacklist intenta unirse a cualquier servidor con el bot, es rechazado automaticamente con un mensaje privado explicando la situacion.</p>
          <Alert type="warning">La blacklist global afecta al usuario en TODOS los servidores con Neuralix instalado, no solo en uno.</Alert>
          <H2 id="configuracion-blacklist">Configuracion</H2>
          <p className="text-muted-foreground">Para agregar un usuario:</p>
          <ul className="text-muted-foreground space-y-1 mt-2">
            <li><strong>Discord ID</strong> — El ID numerico del usuario</li>
            <li><strong>Nombre de usuario</strong> — Para identificacion</li>
            <li><strong>Razon</strong> — Motivo del bloqueo (visible en logs)</li>
          </ul>
        </div>
      )}

      {/* ADMIN */}
      {activeSection === "admin" && (
        <div>
          <h1 className="text-3xl font-black mb-4">Panel de Administracion</h1>
          <p className="text-muted-foreground mb-6">El panel de administracion global solo es accesible para los owners de Neuralix (configurado via env OWNER_DISCORD_IDS).</p>
          <Alert type="danger">Este panel da acceso completo al sistema. Solo usuarios de confianza deben tener acceso de owner.</Alert>
          <H2 id="gestion-premium">Gestion Premium</H2>
          <p className="text-muted-foreground">Desde <code className="bg-primary/10 text-primary px-1 rounded">Admin → Licencias</code> puedes generar codigos de licencia para cada plan y revocarlos si es necesario.</p>
          <H2 id="tickets-web">Tickets Web</H2>
          <p className="text-muted-foreground">El admin ve todos los tickets de soporte web de todos los usuarios y puede responder desde el dashboard.</p>
          <H2 id="blacklist-admin">Blacklist</H2>
          <p className="text-muted-foreground">Gestion completa de la blacklist global desde <code className="bg-primary/10 text-primary px-1 rounded">Admin → Blacklist</code>.</p>
          <H2 id="anuncios">Anuncios</H2>
          <p className="text-muted-foreground">Publica anuncios que aparecen en la pagina de inicio de Neuralix. Tipos disponibles: <code>info</code>, <code>warning</code>, <code>success</code>.</p>
          <H2 id="gestion-global">Gestion global</H2>
          <p className="text-muted-foreground">Las estadisticas globales muestran el total de servidores registrados, usuarios, tickets y backups en el sistema.</p>
        </div>
      )}

      {/* API */}
      {activeSection === "api" && (
        <div>
          <h1 className="text-3xl font-black mb-4">API Neuralix</h1>
          <p className="text-muted-foreground mb-4">Documentacion completa de todos los endpoints REST de Neuralix. Usa esta API para integrar Neuralix con tu bot de Discord o cualquier otra aplicacion.</p>

          <H2 id="autenticacion">Autenticacion y API Key</H2>
          <p className="text-muted-foreground mb-4">Neuralix usa <strong>JWT (JSON Web Token)</strong> para autenticar todas las peticiones. El token se genera automaticamente cuando inicias sesion con Discord OAuth2 y dura 7 dias.</p>

          <Alert type="info">
            <strong>¿Que es un JWT?</strong> Es un token de seguridad que identifica quien eres. Es como tu "llave de acceso" a la API. Se genera al iniciar sesion con Discord y no necesitas crearlo manualmente.
          </Alert>

          <H3>Como obtener tu API Key (JWT)</H3>
          <p className="text-muted-foreground mb-2">El JWT se llama <code className="font-mono text-xs bg-secondary px-1 py-0.5 rounded">token</code> y esta guardado en una cookie de tu navegador despues de iniciar sesion. Para usarlo en tu bot:</p>
          <ol className="space-y-2 text-muted-foreground mt-3 mb-4">
            {[
              "Inicia sesion en el dashboard con Discord.",
              "Abre las herramientas de desarrollador del navegador (F12).",
              'Ve a Aplicacion → Cookies → busca la cookie llamada "token".',
              "Copia el valor — ese es tu JWT / API Key.",
              'Usalo en el header Authorization: Bearer <tu_token> en todas las peticiones.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-sm">{step}</span>
              </li>
            ))}
          </ol>

          <H3>Usar el token en tu bot</H3>
          <p className="text-muted-foreground mb-2">La API acepta el JWT de dos formas:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-card border border-card-border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Metodo 1: Header Authorization (recomendado para bots)</p>
              <CodeBlock code={`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI...`} lang="http" />
            </div>
            <div className="bg-card border border-card-border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Metodo 2: Cookie httpOnly (automatico en navegador)</p>
              <CodeBlock code={`Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI...`} lang="http" />
            </div>
          </div>

          <H3>Ejemplo completo — Node.js / Discord.js</H3>
          <CodeBlock lang="javascript" code={`const API_BASE = "https://tu-dominio.replit.app/api";
const API_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // tu JWT

// Ejemplo: obtener stats de un servidor
async function getServerStats(guildId) {
  const res = await fetch(\`\${API_BASE}/guilds/\${guildId}/stats\`, {
    headers: {
      "Authorization": \`Bearer \${API_TOKEN}\`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

// Ejemplo: activar AntiRaid
async function enableAntiRaid(guildId) {
  const res = await fetch(\`\${API_BASE}/guilds/\${guildId}/antiraid\`, {
    method: "PUT",
    headers: {
      "Authorization": \`Bearer \${API_TOKEN}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ enabled: true, antiBot: true, antiSpam: true })
  });
  return res.json();
}`} />

          <Alert type="warning">
            <strong>Seguridad:</strong> Nunca compartas tu JWT publicamente ni lo pongas en codigo que subas a GitHub. Si crees que fue comprometido, cierra sesion y vuelve a iniciar sesion para obtener uno nuevo.
          </Alert>

          <Alert type="tip">
            <strong>Base URL:</strong> <code className="font-mono text-xs">https://tu-dominio.replit.app/api</code> — En desarrollo local: <code className="font-mono text-xs">http://localhost:8080/api</code><br />
            <strong>Content-Type:</strong> siempre <code className="font-mono text-xs">application/json</code> en peticiones con cuerpo.
          </Alert>

          <H2 id="endpoints-auth">Endpoints de Auth</H2>
          <EndpointCard method="GET" url="/api/auth/discord/url" auth={false} desc="Obtiene la URL de autorizacion de Discord OAuth2 para iniciar sesion."
            res={`{ "url": "https://discord.com/api/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=identify+email+guilds" }`}
            errors={[{ code: 500, msg: "Error interno del servidor" }]}
          />
          <EndpointCard method="GET" url="/api/auth/discord/callback" auth={false} desc="Callback de Discord OAuth2. Recibe el codigo, obtiene el token y redirige al usuario. No se llama directamente — Discord redirige aqui."
            params={[{ name: "code", type: "query string", required: true, desc: "Codigo de autorizacion de Discord" }]}
            errors={[{ code: 302, msg: "Redirige a /?error=oauth_failed si algo falla" }]}
          />
          <EndpointCard method="GET" url="/api/auth/me" auth={true} desc="Devuelve los datos del usuario autenticado actual."
            res={`{
  "id": "user_123456789",
  "discordId": "123456789",
  "username": "usuario",
  "discriminator": "0",
  "avatar": "abc123hash",
  "email": "user@example.com",
  "isOwner": false,
  "isPremium": false,
  "premiumPlan": null,
  "createdAt": "2026-06-06T00:00:00.000Z"
}`}
            errors={[{ code: 401, msg: "Unauthorized — no hay sesion activa" }]}
          />
          <EndpointCard method="POST" url="/api/auth/logout" auth={true} desc="Cierra la sesion del usuario (limpia la cookie JWT)."
            res={`{ "ok": true }`}
            errors={[{ code: 401, msg: "Unauthorized" }]}
          />

          <H2 id="endpoints-guilds">Endpoints de Guilds</H2>
          <EndpointCard method="GET" url="/api/guilds" auth={true} desc="Lista todos los servidores donde el usuario tiene permisos de administracion."
            res={`[
  {
    "id": "987654321",
    "name": "Mi Servidor",
    "icon": "iconhash",
    "memberCount": 0,
    "botPresent": true,
    "premiumTier": 0,
    "permissions": "2147483647"
  }
]`}
            errors={[{ code: 401, msg: "Unauthorized" }, { code: 500, msg: "Error al obtener servidores de Discord" }]}
          />
          <EndpointCard method="GET" url="/api/guilds/:guildId" auth={true} desc="Obtiene los detalles de un servidor especifico."
            params={[{ name: "guildId", type: "path param", required: true, desc: "ID del servidor de Discord" }]}
            res={`{
  "id": "987654321",
  "name": "Mi Servidor",
  "icon": "iconhash",
  "memberCount": 1523,
  "botPresent": true,
  "premiumActive": false,
  "openTickets": 3
}`}
            errors={[{ code: 401, msg: "Unauthorized" }]}
          />
          <EndpointCard method="GET" url="/api/guilds/:guildId/stats" auth={true} desc="Estadisticas del servidor: miembros, tickets, detecciones, backups."
            res={`{
  "guildId": "987654321",
  "memberCount": 1523,
  "onlineCount": 456,
  "openTickets": 3,
  "closedTickets": 47,
  "antiraidDetections": 12,
  "recentLogs": 89,
  "backupsCount": 5
}`}
          />
          <EndpointCard method="GET" url="/api/guilds/:guildId/bot-status" auth={true} desc="Estado del bot en el servidor y URL para invitarlo si no esta presente."
            res={`{
  "present": true,
  "addBotUrl": "https://discord.com/api/oauth2/authorize?client_id=...&permissions=8&scope=bot%20applications.commands&guild_id=987654321"
}`}
          />

          <H2 id="endpoints-bienvenidas">Endpoints de Bienvenidas</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/welcome" auth={true} desc="Obtiene la configuracion de bienvenidas del servidor."
            res={`{
  "id": 1,
  "guildId": "987654321",
  "enabled": false,
  "channelId": null,
  "message": null,
  "embedEnabled": false,
  "embedColor": null,
  "embedTitle": null,
  "embedDescription": null,
  "autoRoleIds": [],
  "dmEnabled": false,
  "dmMessage": null
}`}
          />
          <EndpointCard method="PUT" url="/api/guilds/:guildId/welcome" auth={true} desc="Actualiza la configuracion de bienvenidas."
            req={`{
  "enabled": true,
  "channelId": "111222333",
  "message": "Bienvenido {user} al servidor {server}!",
  "embedEnabled": true,
  "embedTitle": "Bienvenido!",
  "embedDescription": "Ya eres el miembro #{ memberCount}",
  "embedColor": "#5865F2",
  "dmEnabled": false,
  "autoRoleIds": ["444555666"]
}`}
            errors={[{ code: 401, msg: "Unauthorized" }]}
          />
          <EndpointCard method="POST" url="/api/guilds/:guildId/welcome/test" auth={true} desc="Envia un mensaje de prueba de bienvenida al canal configurado."
            res={`{ "ok": true, "message": "Test welcome message sent" }`}
          />
          <EndpointCard method="GET" url="/api/guilds/:guildId/goodbye" auth={true} desc="Obtiene la configuracion de despedidas." res={`{ "id": 1, "guildId": "987654321", "enabled": false, ... }`} />
          <EndpointCard method="PUT" url="/api/guilds/:guildId/goodbye" auth={true} desc="Actualiza la configuracion de despedidas." req={`{ "enabled": true, "channelId": "111222333", "message": "Adios {user}!" }`} />
          <EndpointCard method="POST" url="/api/guilds/:guildId/goodbye/test" auth={true} desc="Envia un mensaje de prueba de despedida." res={`{ "ok": true }`} />

          <H2 id="endpoints-verificacion">Endpoints de Verificacion</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/verification" auth={true} desc="Obtiene la configuracion del sistema de verificacion."
            res={`{
  "guildId": "987654321",
  "enabled": false,
  "roleId": null,
  "minAccountAge": 0,
  "antiVpn": false,
  "antiAlt": false,
  "antiBot": false
}`}
          />
          <EndpointCard method="PUT" url="/api/guilds/:guildId/verification" auth={true} desc="Actualiza la configuracion de verificacion."
            req={`{
  "enabled": true,
  "roleId": "777888999",
  "minAccountAge": 7,
  "antiVpn": true,
  "antiAlt": true,
  "antiBot": false
}`}
          />
          <EndpointCard method="POST" url="/api/verify/:guildId" auth={true} desc="Verifica al usuario autenticado en el servidor especificado."
            res={`{
  "success": true,
  "message": "Verificacion exitosa! Tu rol ha sido asignado.",
  "roleAssigned": true
}`}
            errors={[{ code: 200, msg: "success: false si la verificacion esta desactivada" }]}
          />

          <H2 id="endpoints-tickets">Endpoints de Tickets</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/tickets/config" auth={true} desc="Configuracion del sistema de tickets." res={`{ "guildId": "987654321", "enabled": false, "categoryId": null, "supportRoleId": null, "maxTicketsPerUser": 1, ... }`} />
          <EndpointCard method="PUT" url="/api/guilds/:guildId/tickets/config" auth={true} desc="Actualiza la configuracion de tickets." req={`{ "enabled": true, "categoryId": "123", "supportRoleId": "456", "maxTicketsPerUser": 1 }`} />
          <EndpointCard method="GET" url="/api/guilds/:guildId/tickets" auth={true} desc="Lista todos los tickets del servidor."
            res={`[
  {
    "id": 1,
    "guildId": "987654321",
    "channelId": "ticket-channel-id",
    "userId": "user-id",
    "username": "usuario",
    "subject": "Problema de acceso",
    "status": "open",
    "claimedBy": null,
    "createdAt": "2026-06-06T00:00:00.000Z"
  }
]`}
          />
          <EndpointCard method="POST" url="/api/guilds/:guildId/tickets/:ticketId/close" auth={true} desc="Cierra un ticket especifico." res={`{ "ok": true }`} />

          <H2 id="endpoints-antiraid">Endpoints de AntiRaid</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/antiraid" auth={true} desc="Obtiene la configuracion completa de AntiRaid."
            res={`{
  "guildId": "987654321",
  "enabled": false,
  "antiAlt": false,
  "antiAltMinAge": 7,
  "antiBot": false,
  "antiBotWhitelist": [],
  "antiSpam": false,
  "antiSpamLimit": 5,
  "antiLinks": false,
  "allowedDomains": [],
  "blockedDomains": [],
  "antiMassMention": false,
  "massMentionLimit": 5,
  "antiWebhook": false,
  "antiChannelCreate": false,
  "antiChannelDelete": false,
  "antiChannelUpdate": false,
  "antiRoleCreate": false,
  "antiRoleDelete": false,
  "antiRoleUpdate": false,
  "antiEmojiCreate": false,
  "antiEmojiDelete": false,
  "antiBanMass": false,
  "antiKickMass": false,
  "antiNuke": false
}`}
          />
          <EndpointCard method="PUT" url="/api/guilds/:guildId/antiraid" auth={true} desc="Actualiza la configuracion de AntiRaid. Puedes enviar solo los campos que quieres cambiar."
            req={`{
  "enabled": true,
  "antiAlt": true,
  "antiAltMinAge": 7,
  "antiNuke": true
}`}
          />
          <EndpointCard method="GET" url="/api/guilds/:guildId/antiraid/stats" auth={true} desc="Estadisticas de detecciones del AntiRaid."
            res={`{
  "guildId": "987654321",
  "detectedToday": 3,
  "blockedAlt": 12,
  "blockedVpn": 5,
  "blockedBot": 2,
  "blockedSpam": 8,
  "totalDetections": 27
}`}
          />

          <H2 id="endpoints-logs">Endpoints de Logs</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/logs/config" auth={true} desc="Configuracion del sistema de logs." res={`{ "guildId": "987654321", "enabled": false, "channelId": null, "logMembers": true, "logMessages": true, ... }`} />
          <EndpointCard method="PUT" url="/api/guilds/:guildId/logs/config" auth={true} desc="Actualiza la configuracion de logs." req={`{ "enabled": true, "channelId": "111222333", "logModeration": true, "logSecurity": true }`} />
          <EndpointCard method="GET" url="/api/guilds/:guildId/logs" auth={true} desc="Lista los ultimos 100 registros de actividad del servidor."
            res={`[
  {
    "id": 1,
    "guildId": "987654321",
    "userId": "user-id",
    "username": "usuario",
    "action": "MEMBER_JOIN",
    "category": "member",
    "details": "Se unio al servidor",
    "createdAt": "2026-06-06T00:00:00.000Z"
  }
]`}
          />

          <H2 id="endpoints-backups">Endpoints de Backups</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/backups" auth={true} desc="Lista todos los backups del servidor." res={`[{ "id": 1, "guildId": "987654321", "label": "Backup #1", "size": 2048, "version": 1, "createdAt": "..." }]`} />
          <EndpointCard method="POST" url="/api/guilds/:guildId/backups" auth={true} desc="Crea un nuevo backup de la configuracion actual." res={`{ "id": 2, "label": "Backup #2 - 06/06/2026", "size": 2048, "version": 2, "createdAt": "..." }`} />
          <EndpointCard method="POST" url="/api/guilds/:guildId/backups/:backupId/restore" auth={true} desc="Restaura la configuracion del servidor desde un backup especifico." res={`{ "ok": true, "message": "Backup restaurado exitosamente" }`} errors={[{ code: 404, msg: "Backup no encontrado" }]} />

          <H2 id="endpoints-premium">Endpoints de Premium</H2>
          <EndpointCard method="GET" url="/api/guilds/:guildId/premium" auth={true} desc="Estado del premium del servidor." res={`{ "guildId": "987654321", "active": false, "plan": null, "expiresAt": null, "features": [] }`} />
          <EndpointCard method="GET" url="/api/premium/plans" auth={false} desc="Lista los planes premium disponibles." res={`[{ "id": "plus", "name": "Plus", "price": 4.99, "features": [...] }]`} />

          <H2 id="endpoints-soporte">Endpoints de Soporte Web</H2>
          <EndpointCard method="GET" url="/api/support/tickets" auth={true} desc="Lista los tickets de soporte web. Los owners ven todos; los usuarios normales ven solo los suyos." res={`[{ "id": 1, "userId": "user-id", "username": "usuario", "subject": "Ayuda", "status": "open", "priority": "normal", "createdAt": "..." }]`} />
          <EndpointCard method="POST" url="/api/support/tickets" auth={true} desc="Crea un nuevo ticket de soporte web."
            req={`{
  "subject": "Problema con AntiRaid",
  "message": "El AntiRaid no detecta los raids...",
  "priority": "normal"
}`}
            res={`{ "id": 1, "subject": "Problema con AntiRaid", "status": "open", "createdAt": "..." }`}
          />
          <EndpointCard method="GET" url="/api/support/tickets/:id/messages" auth={true} desc="Obtiene los mensajes de un ticket de soporte." res={`[{ "id": 1, "ticketId": 1, "userId": "user-id", "username": "usuario", "content": "...", "isStaff": false, "createdAt": "..." }]`} />
          <EndpointCard method="POST" url="/api/support/tickets/:id/messages" auth={true} desc="Envia un mensaje en un ticket de soporte." req={`{ "content": "Gracias por contactar con soporte..." }`} res={`{ "id": 2, "content": "...", "isStaff": true, "createdAt": "..." }`} />

          <H2 id="endpoints-ai">Endpoints de AI</H2>
          <EndpointCard method="POST" url="/api/guilds/:guildId/ai/analyze" auth={true} desc="Analiza la configuracion de seguridad del servidor y devuelve recomendaciones."
            res={`{
  "guildId": "987654321",
  "score": 75,
  "recommendations": [
    {
      "category": "AntiRaid",
      "severity": "high",
      "title": "AntiRaid desactivado",
      "description": "Activa el AntiRaid para proteger tu servidor."
    }
  ],
  "summary": "Puntuacion: 75/100. 1 recomendacion.",
  "analyzedAt": "2026-06-06T00:00:00.000Z"
}`}
          />
          <EndpointCard method="POST" url="/api/guilds/:guildId/ai/chat" auth={true} desc="Envia un mensaje al asistente IA de Neuralix."
            req={`{ "message": "Como activo el AntiRaid?" }`}
            res={`{
  "response": "Para activar el AntiRaid, ve a Panel → AntiRaid...",
  "suggestions": ["Como configuro la verificacion?", "Que es AntiNuke?"]
}`}
          />

          <H2 id="endpoints-admin">Endpoints de Admin (Solo Owner)</H2>
          <EndpointCard method="GET" url="/api/admin/stats" auth={true} desc="Estadisticas globales del sistema. Requiere permiso de owner."
            res={`{
  "totalGuilds": 3,
  "totalUsers": 12,
  "totalTickets": 8,
  "premiumGuilds": 1,
  "activeBlacklist": 0,
  "totalBackups": 15
}`}
            errors={[{ code: 403, msg: "Owner access required" }]}
          />
          <EndpointCard method="GET" url="/api/admin/licenses" auth={true} desc="Lista todas las licencias." res={`[{ "id": 1, "key": "NRX-PRO-ABCD1234...", "plan": "pro", "guildId": null, "active": true, "createdAt": "..." }]`} />
          <EndpointCard method="POST" url="/api/admin/licenses" auth={true} desc="Genera una nueva licencia." req={`{ "plan": "pro", "guildId": null, "expiresAt": null }`} res={`{ "id": 2, "key": "NRX-PRO-XXXX...", "plan": "pro", "active": true }`} />
          <EndpointCard method="DELETE" url="/api/admin/licenses/:id" auth={true} desc="Revoca una licencia." res={`(vacío, 204 No Content)`} />
          <EndpointCard method="GET" url="/api/blacklist" auth={true} desc="Lista de usuarios en la blacklist global." res={`[{ "id": 1, "userId": "baduser123", "username": "BadUser", "reason": "Raid", "addedBy": "admin" }]`} />
          <EndpointCard method="POST" url="/api/blacklist" auth={true} desc="Agrega un usuario a la blacklist." req={`{ "userId": "baduser123", "username": "BadUser", "reason": "Intento de raid" }`} />
          <EndpointCard method="DELETE" url="/api/blacklist/:userId" auth={true} desc="Elimina un usuario de la blacklist." res={`(vacío, 204 No Content)`} />
          <EndpointCard method="GET" url="/api/announcements" auth={false} desc="Lista todos los anuncios publicados." res={`[{ "id": 1, "title": "...", "content": "...", "type": "info", "published": true, "createdAt": "..." }]`} />
          <EndpointCard method="POST" url="/api/announcements" auth={true} desc="Crea un nuevo anuncio (solo owner)." req={`{ "title": "Nuevo modulo", "content": "...", "type": "info", "published": true }`} />
          <EndpointCard method="PATCH" url="/api/announcements/:id" auth={true} desc="Actualiza un anuncio existente." req={`{ "title": "Titulo actualizado", "published": false }`} />
          <EndpointCard method="DELETE" url="/api/announcements/:id" auth={true} desc="Elimina un anuncio." res={`(vacío, 204 No Content)`} />

          <H2 id="rate-limits">Rate Limits</H2>
          <Alert type="warning">Actualmente Neuralix no implementa rate limits por endpoint. Se recomienda no hacer mas de 60 peticiones por minuto desde la misma IP para evitar bloqueos del servidor proxy.</Alert>
          <div className="border border-border rounded-xl overflow-hidden mt-3">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Limite recomendado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[["Endpoints de lectura (GET)", "60 req/min"], ["Endpoints de escritura (POST/PUT/PATCH)", "30 req/min"], ["Endpoints de admin", "20 req/min"], ["Endpoints de AI", "10 req/min"]].map(([t, l]) => (
                  <tr key={t}><td className="px-4 py-2.5 text-muted-foreground">{t}</td><td className="px-4 py-2.5 font-mono text-sm text-primary">{l}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Password Gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState<Attempt>({ count: 0, lockedUntil: null, lastAttempt: 0 });
  const [timeLeft, setTimeLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(ATTEMPTS_KEY);
    if (stored) {
      const a: Attempt = JSON.parse(stored);
      setAttempts(a);
      if (a.lockedUntil && Date.now() < a.lockedUntil) {
        setTimeLeft(Math.ceil((a.lockedUntil - Date.now()) / 1000));
      }
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  const isLocked = attempts.lockedUntil !== null && Date.now() < attempts.lockedUntil;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    if (password === DOCS_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.removeItem(ATTEMPTS_KEY);
      onUnlock();
    } else {
      const newCount = attempts.count + 1;
      const lockedUntil = newCount >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MINUTES * 60 * 1000 : null;
      const newAttempts: Attempt = { count: newCount, lockedUntil, lastAttempt: Date.now() };
      setAttempts(newAttempts);
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(newAttempts));
      setPassword("");

      if (lockedUntil) {
        setTimeLeft(LOCKOUT_MINUTES * 60);
        setError(`Demasiados intentos fallidos. Bloqueado por ${LOCKOUT_MINUTES} minutos.`);
      } else {
        const remaining = MAX_ATTEMPTS - newCount;
        setError(`Contrasena incorrecta. ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`);
      }
    }
  };

  const remainingAttempts = MAX_ATTEMPTS - attempts.count;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
        <div className="bg-card border border-card-border rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-black text-center">Documentacion Protegida</h1>
            <p className="text-muted-foreground text-sm text-center mt-2">Introduce la contrasena para acceder a la documentacion de Neuralix.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                placeholder="Contrasena"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLocked}
                className="pr-10 h-12 text-base"
                data-testid="input-docs-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{error}</p>
                    {isLocked && timeLeft > 0 && (
                      <p className="text-xs mt-1 text-destructive/70 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Tiempo restante: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!isLocked && attempts.count > 0 && attempts.count < MAX_ATTEMPTS && (
              <div className="flex gap-1">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < MAX_ATTEMPTS - remainingAttempts ? "bg-destructive" : "bg-border"}`} />
                ))}
              </div>
            )}

            <Button type="submit" className="w-full h-12 text-base" disabled={isLocked || !password} data-testid="btn-unlock-docs">
              {isLocked ? `Bloqueado (${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")})` : "Acceder"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            <button onClick={() => window.location.href = "/"} className="flex items-center justify-center gap-1 hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Volver al inicio
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Docs Page ────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  const [activeSection, setActiveSection] = useState("introduccion");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["introduccion"]));
  const { theme, toggleTheme } = useTheme();
  const contentRef = useRef<HTMLDivElement>(null);

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!search) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter((s) =>
      s.label.toLowerCase().includes(q) ||
      s.subsections.some((sub) => sub.toLowerCase().includes(q))
    );
  }, [search]);

  const toggleExpand = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const navigate = (sectionId: string) => {
    setActiveSection(sectionId);
    setSidebarOpen(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <span className="font-bold text-sm">Neuralix Docs</span>
          <div className="text-xs text-muted-foreground">v1.0 — 2026</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3 border-b border-sidebar-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-secondary"
            data-testid="docs-search"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {filteredSections.map(({ id, label, icon: Icon, subsections }) => {
          const isActive = activeSection === id;
          const isExpanded = expandedSections.has(id);
          return (
            <div key={id}>
              <button
                onClick={() => { navigate(id); if (subsections.length > 0) toggleExpand(id); }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  isActive ? "bg-primary/15 text-primary border border-primary/20" : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                data-testid={`docs-nav-${id}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left text-xs">{label}</span>
                {subsections.length > 0 && (
                  <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                )}
              </button>
              {isExpanded && subsections.length > 0 && (
                <div className="ml-5 mt-0.5 space-y-0.5 pl-3 border-l border-border">
                  {subsections.filter((sub) => !search || sub.toLowerCase().includes(search.toLowerCase())).map((sub) => (
                    <button key={sub}
                      onClick={() => {
                        navigate(id);
                        setTimeout(() => {
                          const el = document.getElementById(sub.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                          el?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 100);
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all text-left"
                    >
                      <Hash className="w-3 h-3 flex-shrink-0 opacity-40" />
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <button onClick={() => window.location.href = "/"} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3 h-3" /> Volver al panel
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }} transition={{ type: "spring", damping: 25 }} className="fixed left-0 top-0 bottom-0 w-60 bg-sidebar border-r border-sidebar-border z-50 md:hidden flex flex-col">
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <nav className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
              <span>Docs</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground font-medium">{SECTIONS.find((s) => s.id === activeSection)?.label}</span>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setUnlocked(false); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary"
              data-testid="btn-docs-lock">
              <Lock className="w-3 h-3" /> Cerrar sesion
            </button>
          </div>
        </header>

        {/* Content */}
        <main ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-10">
            <div key={activeSection}>
              <DocsContent activeSection={activeSection} />
            </div>

            {/* Prev / Next */}
            <div className="flex items-center justify-between mt-16 pt-8 border-t border-border">
              {SECTIONS.findIndex((s) => s.id === activeSection) > 0 ? (
                <button onClick={() => navigate(SECTIONS[SECTIONS.findIndex((s) => s.id === activeSection) - 1].id)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  {SECTIONS[SECTIONS.findIndex((s) => s.id === activeSection) - 1].label}
                </button>
              ) : <div />}
              {SECTIONS.findIndex((s) => s.id === activeSection) < SECTIONS.length - 1 ? (
                <button onClick={() => navigate(SECTIONS[SECTIONS.findIndex((s) => s.id === activeSection) + 1].id)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group ml-auto">
                  {SECTIONS[SECTIONS.findIndex((s) => s.id === activeSection) + 1].label}
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              ) : <div />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
