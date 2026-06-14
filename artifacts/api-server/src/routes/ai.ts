import { Router } from "express";
import { db, antiraidConfigsTable, verificationConfigsTable, ticketConfigsTable, logsConfigsTable, guildConfigsTable, giveawaysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const DISCORD_SUPPORT = "discord.gg/wukr8apdQq";
const ADMIN_FALLBACK = `Para esto necesitas ayuda de un administrador. Puedes contactar soporte en ${DISCORD_SUPPORT} o abrir un ticket desde el panel de soporte del dashboard.`;

// ─── Respuestas por plan ─────────────────────────────────────────────────────
const RESPONSES: Record<string, Record<string, string>> = {
  free: {
    soporte: `Para soporte tecnico crea un ticket desde la seccion "Soporte" del dashboard o unete a ${DISCORD_SUPPORT}`,
    premium: `Neuralix Premium incluye IA avanzada, backups ilimitados y proteccion AntiNuke. Activa tu licencia en la seccion Premium o contactanos en ${DISCORD_SUPPORT}`,
    ticket: `Abre un ticket desde la seccion "Soporte" del menu lateral. Escribe tu asunto y el equipo te respondera.`,
    dashboard: "El dashboard te permite gestionar todos los sistemas de tu servidor. Inicia sesion con Discord y selecciona tu servidor.",
    antiraid: `Para configurar AntiRaid:
1. Ve a la seccion "AntiRaid" en el menu lateral
2. Activa el interruptor principal "AntiRaid Global"
3. Activa los modulos: AntiJoin, AntiAlt, AntiBot, AntiSpam
4. Configura los umbrales en cada modulo
5. Haz clic en "Guardar"`,
    verification: `Para configurar Verificacion:
1. Ve a "Verificacion" en el menu lateral
2. Activa "Verificacion activa"
3. Ingresa el ID del rol que se asignara al verificarse
4. Activa AntiVPN y AntiAlt si quieres filtros adicionales
5. Copia el enlace del "Portal de Verificacion" y compartelo
6. Haz clic en "Guardar"`,
    tickets: `Para configurar Tickets:
1. Ve a "Tickets" en el menu lateral
2. Activa el sistema de tickets
3. Configura el ID de la categoria donde se crearan los tickets
4. Ingresa el ID del rol de soporte
5. En la tab "Paneles": crea un panel y personalizalo
6. Haz clic en "Enviar" para publicar el panel en Discord`,
    logs: `Para configurar Logs:
1. Ve a "Logs" en el menu lateral
2. Activa "Logs activos"
3. Ingresa el ID del canal de Discord para los logs
4. Selecciona los eventos a registrar (miembros, mensajes, roles, etc.)
5. Opcionalmente configura canales distintos por categoria
6. Haz clic en "Guardar"`,
    backups: `Para crear un Backup:
1. Ve a "Backups" en el menu lateral
2. Haz clic en "Crear backup"
3. Para restaurar: haz clic en "Restaurar" en el backup deseado
Plan Free: 1 backup maximo.`,
    welcome: `Para configurar Bienvenidas:
1. Ve a "Bienvenidas" en el menu lateral
2. Activa "Sistema de bienvenidas"
3. Ingresa el ID del canal de bienvenidas
4. Personaliza el mensaje con variables: {user}, {username}, {server}, {membercount}, {ordinal}, {date}, {time}, {accountage}
5. Activa el embed para un mensaje mas visual
6. Haz clic en "Guardar"`,
    goodbye: `Para configurar Despedidas:
1. Ve a "Despedidas" en el menu lateral
2. Activa "Sistema de despedidas"
3. Ingresa el ID del canal
4. Personaliza el mensaje con variables: {user}, {server}, {membercount}, {date}
5. Haz clic en "Guardar"`,
    giveaway: `Para crear un Sorteo:
1. Ve a "Sorteos" en el menu lateral
2. Haz clic en "Nuevo Sorteo"
3. Ingresa el premio, numero de ganadores y duracion
4. Selecciona el canal donde se publicara
5. El bot publicara el sorteo automaticamente con el emoji 🎉
6. Los miembros reaccionan para participar
7. Al finalizar, el bot anunciara los ganadores automaticamente`,
    automod: `Para configurar AutoMod:
1. Ve a "AntiRaid" en el menu lateral
2. Activa "AntiSpam" para limitar mensajes repetidos
3. Activa "AntiLinks" para bloquear enlaces no autorizados
4. Activa "AntiMassMention" para limitar menciones masivas
5. Activa "AntiFlood" para mensajes demasiado rapidos
6. Haz clic en "Guardar"`,
    default: `Soy el asistente de Neuralix. Puedo ayudarte a configurar: AntiRaid, Verificacion, Tickets, Logs, Backups, Bienvenidas, Sorteos, Automod.
Si necesitas ayuda mas avanzada, un administrador puede asistirte en ${DISCORD_SUPPORT}`,
    restrict: `Esta funcion requiere plan Plus o superior. Puedo explicarte como configurarlo manualmente — pregunta "como configuro [modulo]".
Si necesitas asistencia adicional, un administrador puede ayudarte en ${DISCORD_SUPPORT}`,
    admin: ADMIN_FALLBACK,
  },
  plus: {
    antiraid: `Para activar AntiRaid (plan Plus):
1. Ve al panel "AntiRaid" en el menu lateral
2. Activa el interruptor principal "AntiRaid activo"
3. Configura AntiJoin: umbral de 5 usuarios en 10 segundos
4. Activa AntiAlt: minimo 7 dias de antiguedad de cuenta
5. Activa AntiBot para bloquear bots no autorizados
6. Activa AntiSpam en modo "estricto"
7. Haz clic en "Guardar"`,
    antijoin: `Para configurar AntiJoin:
1. Ve al panel "AntiRaid" en el sidebar
2. Activa el modulo "AntiJoin"
3. Umbral recomendado: 5 uniones en 10 segundos
4. Accion: "Banear" para maxima seguridad
5. Guarda los cambios`,
    verification: `Para configurar Verificacion (Plus):
1. Ve al panel "Verificacion"
2. Activa y configura el rol verificado
3. Activa AntiVPN para bloquear proxies
4. Activa AntiAlt con minimo 7 dias de cuenta
5. Personaliza el mensaje de exito
6. Copia y comparte el enlace del Portal
7. Guarda los cambios`,
    tickets: `Para configurar Tickets:
1. Ve al panel "Tickets"
2. Activa el sistema
3. Configura la categoria de Discord y el rol de soporte
4. Crea paneles en la tab "Paneles" con diferentes canales y embeds
5. Activa "Usar modulos" para tickets categoricos
6. Haz clic en "Enviar" para publicar el panel en Discord`,
    logs: `Para activar Logs:
1. Ve al panel "Logs"
2. Activa el interruptor
3. Ingresa el ID del canal principal de Discord
4. Selecciona las categorias: Miembros, Mensajes, Roles, Canales, Moderacion, Seguridad, Tickets, Sorteos, Voz, Invitaciones
5. Configura canales distintos para cada categoria si lo prefieres
6. Guarda los cambios`,
    backups: `Para gestionar Backups (Plus):
1. Ve a "Backups" tab "Mis Backups"
2. Haz clic en "Crear backup ahora"
3. Para restaurar: selecciona el backup y haz clic en "Restaurar"
4. Para exportar JSON: boton de exportar`,
    welcome: `Para configurar Bienvenidas (Plus):
1. Activa el sistema y configura el canal
2. Usa variables: {user}, {server}, {membercount}, {ordinal}, {date}, {time}, {accountage}
3. Activa el embed con color, footer, imagen y autor personalizados
4. Activa DM para enviar mensaje privado al nuevo miembro
5. Activa la Tarjeta de Bienvenida con fondo personalizado
6. Guarda los cambios`,
    goodbye: `Para configurar Despedidas:
1. Activa el sistema y configura el canal
2. Personaliza con variables: {user}, {server}, {membercount}, {date}
3. Configura el embed con color e imagen (opcional)
4. Guarda los cambios`,
    giveaway: `Para gestionar Sorteos (Plus):
1. Ve al panel "Sorteos" en el menu lateral
2. Crea sorteos con premio, ganadores y duracion personalizada
3. Los sorteos se publican en el canal de Discord elegido
4. Los miembros reaccionan con 🎉 para participar
5. Para finalizar antes: boton "Finalizar" en el dashboard
6. Para reseleccionar ganadores: boton "Reseleccionar"
7. El bot finaliza automaticamente los sorteos expirados`,
    automod: `Para AutoMod completo (Plus):
1. AntiSpam: define cuantos mensajes/segundos activa la sancion
2. AntiLinks: permite dominios especificos, bloquea el resto
3. AntiMassMention: limita menciones por mensaje (recomendado: 5)
4. AntiFlood: mensajes demasiado rapidos en un canal
5. AntiWebhook Spam: detecta creacion masiva de webhooks
6. Todas las acciones pueden ser: Advertencia, Timeout, Kick o Ban`,
    premium: "Tienes plan Plus activo. Incluye: IA avanzada, hasta 5 backups, exportar JSON, soporte prioritario.",
    default: `Soy Neuralix AI (plan Plus). Pregunta sobre: AntiRaid, Verificacion, Tickets, Logs, Backups, Bienvenidas, Sorteos, AutoMod.
Si hay algo que no puedo resolver, un administrador puede ayudarte en ${DISCORD_SUPPORT}`,
    admin: ADMIN_FALLBACK,
  },
  pro: {
    antiraid: `Con plan Pro tienes AntiNuke completo:
1. Ve al panel "AntiRaid"
2. Activa el modulo principal
3. Activa AntiNuke: protege contra borrado masivo de canales/roles
4. Configura umbral de nuke: 10 acciones destructivas
5. Activa AntiJoin con 5 usuarios/10s
6. Activa AntiAlt con 14 dias de minimo
7. Activa AntiWebhook Spam para detectar webhooks masivos
8. Guarda los cambios`,
    verification: `Con plan Pro tienes verificacion avanzada:
1. Ve al panel "Verificacion"
2. Activa el sistema y configura el rol
3. Activa AntiVPN y AntiProxy con deteccion mejorada
4. Establece edad minima de 14 dias
5. Configura la URL personalizada del portal (si tienes dominio)
6. Guarda y comparte el enlace`,
    backups: `Con plan Pro tienes hasta 25 backups:
1. Ve a "Backups" tab "Mis Backups"
2. Crea backups manuales o automaticos semanales
3. Configura backup automatico en tab "Programados"`,
    giveaway: `Con plan Pro tienes sorteos avanzados:
1. Sorteos sin limite de duracion
2. Multiples ganadores
3. Auto-finalizacion garantizada
4. Ve al panel "Sorteos" para gestionar todos los sorteos activos y pasados`,
    default: "Soy Neuralix AI Pro. Tengo acceso a todas las funciones avanzadas. Pregunta lo que necesites.",
    admin: ADMIN_FALLBACK,
  },
  ultra: {
    default: "Soy Neuralix AI Ultra. Puedo configurar automaticamente los sistemas de tu servidor. Escribe 'activa el antiraid', 'configura la verificacion', 'activa los logs' o 'activa los tickets'.",
    admin: ADMIN_FALLBACK,
  },
};

function detectIntent(msg: string): string {
  const lower = msg.toLowerCase();
  // Order matters — most specific first
  if (lower.includes("antijoin") || lower.includes("anti join") || lower.includes("uniones masivas")) return "antijoin";
  if (lower.includes("antiraid") || lower.includes("anti raid") || lower.includes("raid") || lower.includes("ataque") || lower.includes("nuke") || lower.includes("antinuke")) return "antiraid";
  if (lower.includes("antiwebhook") || lower.includes("anti webhook") || lower.includes("webhook spam")) return "antiraid";
  if (lower.includes("verif") || lower.includes("vpn") || lower.includes("anti alt") || lower.includes("antialt") || lower.includes("captcha") || lower.includes("portal")) return "verification";
  if (lower.includes("sorteo") || lower.includes("giveaway") || lower.includes("rifar") || lower.includes("ganador") || lower.includes("premio") || lower.includes("reseleccionar")) return "giveaway";
  if (lower.includes("automod") || lower.includes("auto mod") || lower.includes("antispam") || lower.includes("antilinks") || lower.includes("flood") || lower.includes("filtro")) return "automod";
  if ((lower.includes("ticket") && !lower.includes("soport")) || lower.includes("panel de soporte") || lower.includes("sistema de tickets")) return "tickets";
  if (lower.includes("log") || lower.includes("auditoria") || lower.includes("registro") || lower.includes("historial")) return "logs";
  if (lower.includes("backup") || lower.includes("copia") || lower.includes("respaldo") || lower.includes("restaurar")) return "backups";
  if (lower.includes("bienvenid") || lower.includes("welcome") || lower.includes("nuevo miembro")) return "welcome";
  if (lower.includes("despedid") || lower.includes("goodbye") || lower.includes("adios") || lower.includes("miembro abandon")) return "goodbye";
  if (lower.includes("premium") || lower.includes("plan") || lower.includes("licencia") || lower.includes("upgrade")) return "premium";
  if (lower.includes("soport") || lower.includes("ticket de soporte") || lower.includes("contactar")) return "ticket";
  if (lower.includes("dashboard") || lower.includes("panel") || lower.includes("como entrar")) return "dashboard";
  if (lower.includes("no puedo") || lower.includes("no funciona") || lower.includes("error") || lower.includes("problema") || lower.includes("falla") || lower.includes("roto")) return "admin";
  return "default";
}

function isOutOfScope(msg: string): boolean {
  const lower = msg.toLowerCase();
  const outOfScopePatterns = [
    "politica", "gobierno", "guerra", "sexo", "drogas",
    "hack", "estafar", "phishing", "contraseña de otro",
    "programar un bot diferente", "codigo python",
    "ensenha a hackear", "como atacar",
  ];
  return outOfScopePatterns.some((p) => lower.includes(p));
}

async function upsertEnabled(table: any, guildId: string, extraFields: Record<string, unknown> = {}) {
  const [existing] = await db.select().from(table).where(eq(table.guildId, guildId));
  if (existing) {
    await db.update(table).set({ enabled: true, ...extraFields }).where(eq(table.guildId, guildId));
  } else {
    await db.insert(table).values({ guildId, enabled: true, ...extraFields });
  }
}

async function applyConfig(guildId: string, intent: string): Promise<{ action: string; steps: string } | null> {
  if (intent === "antiraid") {
    await upsertEnabled(antiraidConfigsTable, guildId, { antiJoin: true, antiBot: true, antiAlt: true, antiSpam: true, antiWebhook: true });
    return {
      action: "AntiRaid activado",
      steps: `AntiRaid activado con AntiJoin, AntiBot, AntiAlt, AntiSpam y AntiWebhook.\n\nPasos siguientes:\n1. Ve al panel "AntiRaid" para ajustar los umbrales\n2. Recomendado: AntiJoin en 5 usuarios/10s, AntiAlt con 7 dias minimo\n3. Haz clic en "Guardar" para confirmar`,
    };
  }
  if (intent === "verification") {
    await upsertEnabled(verificationConfigsTable, guildId, { antiVpn: true, antiAlt: true, minAccountAge: 7 });
    return {
      action: "Verificacion activada",
      steps: `Verificacion activada con AntiVPN, AntiAlt y edad minima 7 dias.\n\nPasos siguientes:\n1. Ve al panel "Verificacion"\n2. Ingresa el ID del rol verificado\n3. Copia el enlace del Portal y compartelo en tu servidor\n4. Haz clic en "Guardar"`,
    };
  }
  if (intent === "logs") {
    await upsertEnabled(logsConfigsTable, guildId, { logMembers: true, logMessages: true, logModeration: true, logSecurity: true });
    return {
      action: "Logs activados",
      steps: `Logs activados con Miembros, Mensajes, Moderacion y Seguridad.\n\nPasos siguientes:\n1. Ve al panel "Logs"\n2. Ingresa el ID del canal de Discord\n3. Activa categorias adicionales si lo deseas\n4. Haz clic en "Guardar"`,
    };
  }
  if (intent === "tickets") {
    await upsertEnabled(ticketConfigsTable, guildId);
    return {
      action: "Sistema de tickets activado",
      steps: `Tickets activados.\n\nPasos siguientes:\n1. Ve al panel "Tickets"\n2. Ingresa el ID de la categoria y el rol de soporte\n3. En "Paneles": crea un panel y personaliza el embed\n4. Haz clic en "Enviar" para publicar en Discord`,
    };
  }
  return null;
}

// ─── Server Analysis ─────────────────────────────────────────────────────────
router.post("/guilds/:guildId/ai/analyze", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const [[antiraid], [verification], [tickets], [logs], activeGiveaways] = await Promise.all([
      db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)),
      db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId)),
      db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId)),
      db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)),
      db.select().from(giveawaysTable).where(and(eq(giveawaysTable.guildId, guildId), eq(giveawaysTable.status, "active"))),
    ]);

    const recommendations: { category: string; severity: string; title: string; description: string }[] = [];
    let score = 100;

    // AntiRaid analysis
    if (!antiraid?.enabled) {
      recommendations.push({ category: "AntiRaid", severity: "high", title: "AntiRaid desactivado", description: "Activa AntiRaid para proteger tu servidor de ataques masivos." });
      score -= 25;
    } else {
      if (!antiraid.antiJoin) { recommendations.push({ category: "AntiRaid", severity: "medium", title: "AntiJoin desactivado", description: "Activa AntiJoin para bloquear raids de union masiva." }); score -= 5; }
      if (!antiraid.antiAlt) { recommendations.push({ category: "AntiRaid", severity: "medium", title: "AntiAlt desactivado", description: "Activa AntiAlt para bloquear cuentas nuevas en raids." }); score -= 5; }
      if (!antiraid.antiSpam) { recommendations.push({ category: "AntiRaid", severity: "low", title: "AntiSpam desactivado", description: "Activa AntiSpam para limitar mensajes masivos." }); score -= 3; }
      if (!antiraid.antiWebhook) { recommendations.push({ category: "AntiRaid", severity: "low", title: "AntiWebhook desactivado", description: "Activa AntiWebhook para detectar creacion masiva de webhooks." }); score -= 3; }
    }
    if (!antiraid?.antiNuke) {
      recommendations.push({ category: "AntiRaid", severity: "medium", title: "AntiNuke no configurado", description: "AntiNuke evita danos catastroficos. Requiere plan Pro." });
      score -= 10;
    }

    // Verification analysis
    if (!verification?.enabled) {
      recommendations.push({ category: "Verificacion", severity: "medium", title: "Verificacion desactivada", description: "Activa la verificacion para filtrar bots y alts." });
      score -= 10;
    } else {
      if (!verification.antiVpn) { recommendations.push({ category: "Seguridad", severity: "low", title: "AntiVPN desactivado", description: "Activa AntiVPN en el panel Verificacion." }); score -= 5; }
      if (!verification.antiAlt) { recommendations.push({ category: "Seguridad", severity: "low", title: "AntiAlt en verificacion desactivado", description: "Activa AntiAlt en verificacion para mayor seguridad." }); score -= 3; }
    }

    // Tickets analysis
    if (!tickets?.enabled) {
      recommendations.push({ category: "Soporte", severity: "low", title: "Tickets desactivados", description: "Configura tickets para gestionar solicitudes de soporte." });
      score -= 5;
    }

    // Logs analysis
    if (!logs?.enabled) {
      recommendations.push({ category: "Logs", severity: "medium", title: "Logs desactivados", description: "Activa logs para registrar la actividad del servidor." });
      score -= 10;
    } else {
      if (!logs.logModeration) { recommendations.push({ category: "Logs", severity: "low", title: "Logs de moderacion desactivados", description: "Activa logs de moderacion para registrar baneos y kicks." }); score -= 2; }
      if (!logs.logSecurity) { recommendations.push({ category: "Logs", severity: "low", title: "Logs de seguridad desactivados", description: "Activa logs de seguridad para monitorear el AntiRaid." }); score -= 2; }
    }

    // Giveaway info
    if (activeGiveaways.length > 0) {
      recommendations.push({ category: "Sorteos", severity: "info", title: `${activeGiveaways.length} sorteo(s) activo(s)`, description: `Hay ${activeGiveaways.length} sorteo(s) en curso. El bot los finalizara automaticamente.` });
    }

    if (recommendations.filter((r) => r.severity !== "info").length === 0) {
      recommendations.push({ category: "General", severity: "info", title: "Servidor bien configurado", description: "La configuracion de seguridad se ve excelente. Sigue asi." });
    }

    res.json({
      guildId,
      score: Math.max(0, score),
      recommendations,
      summary: `Puntuacion de seguridad: ${Math.max(0, score)}/100. Se encontraron ${recommendations.filter((r) => r.severity !== "info").length} recomendacion(es).`,
      analyzedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al analizar servidor" });
  }
});

// ─── Groq LLM helper ────────────────────────────────────────────────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Eres el asistente IA de Neuralix, una plataforma enterprise de gestion de bots de Discord. Respondes SIEMPRE en español, de forma concisa y profesional. Solo ayudas con temas relacionados a Neuralix y la configuracion de servidores Discord. Si el usuario pregunta algo fuera de scope (politica, hackeo, adulto, etc.) lo rechazas amablemente. Modulos disponibles: AntiRaid (AntiJoin, AntiAlt, AntiBot, AntiSpam, AntiFlood, AntiLinks, AntiWebhook, AntiNuke), Verificacion (AntiVPN, AntiProxy, AntiAlt), Tickets, Logs, Backups, Bienvenidas, Despedidas, Sorteos, Auto-Roles, Comandos Personalizados, Webhooks personalizados. Para soporte adicional: ${DISCORD_SUPPORT}`;

const GROQ_MODELS_FALLBACK = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

async function callGroq(userMessage: string, guildContext: string): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const body = (model: string) => ({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT + (guildContext ? `\n\nContexto del servidor:\n${guildContext}` : "") },
      { role: "user", content: userMessage },
    ],
    max_tokens: 512,
    temperature: 0.4,
  });

  const headers = { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" };

  for (const model of GROQ_MODELS_FALLBACK) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(GROQ_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body(model)),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({})) as any;
        const isModelErr = resp.status === 400 || resp.status === 404 ||
          /decommissioned|deprecated|not found|not exist|invalid model/i.test(errData?.error?.message || "");
        if (isModelErr) continue; // try next model
        return null;
      }

      const data = await resp.json() as any;
      return data?.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      // timeout or network error — try next model
      continue;
    }
  }
  return null;
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────
router.post("/guilds/:guildId/ai/chat", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const { message } = req.body as { message: string };

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Mensaje requerido" });
      return;
    }

    if (isOutOfScope(message)) {
      res.json({
        response: `No puedo ayudarte con ese tema. Estoy especializado en la configuracion del dashboard de Neuralix. Si necesitas ayuda adicional, un administrador puede asistirte en ${DISCORD_SUPPORT}`,
        action: undefined,
        plan: "free",
      });
      return;
    }

    const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    const effectivePlan: string = cfg?.premiumActive && cfg?.premiumPlan ? cfg.premiumPlan : "free";

    const intent = detectIntent(message);
    const lower = message.toLowerCase();

    let response: string;
    let action: string | undefined;

    const planResponses = RESPONSES[effectivePlan] || RESPONSES.free;
    const plusResponses = RESPONSES.plus;
    const proResponses = RESPONSES.pro;

    // Ultra plan: try to apply config actions first
    if (effectivePlan === "ultra") {
      const isConfigureCmd = lower.includes("activa") || lower.includes("configura") || lower.includes("pon") || lower.includes("haz") || lower.includes("setup") || lower.includes("instala") || lower.includes("enable") || lower.includes("quiero");
      const configIntent = ["antiraid", "verification", "logs", "tickets"].includes(intent) ? intent : null;

      if (isConfigureCmd && configIntent) {
        try {
          const result = await applyConfig(guildId, configIntent);
          if (result) {
            action = result.action;
            response = result.steps;
            res.json({ response, action, plan: effectivePlan });
            return;
          }
        } catch { /* fallthrough to Groq */ }
      }
    }

    // Try Groq for all plans — build guild context for better responses
    let guildContext = "";
    try {
      const [[antiraid], [verification], [tickets], [logs]] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)),
        db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId)),
        db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId)),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)),
      ]);
      guildContext = [
        `Plan: ${effectivePlan}`,
        `AntiRaid: ${antiraid?.enabled ? "activo" : "inactivo"}`,
        `Verificacion: ${verification?.enabled ? "activa" : "inactiva"}`,
        `Tickets: ${tickets?.enabled ? "activos" : "inactivos"}`,
        `Logs: ${logs?.enabled ? "activos" : "inactivos"}`,
      ].join(", ");
    } catch { /* non-fatal */ }

    const groqResponse = await callGroq(message, guildContext);
    if (groqResponse) {
      res.json({ response: groqResponse, action, plan: effectivePlan });
      return;
    }

    // Fallback to static responses
    if (intent === "admin") {
      response = ADMIN_FALLBACK;
    } else {
      response = planResponses[intent] || plusResponses[intent] || RESPONSES.free[intent] || planResponses.default || ADMIN_FALLBACK;
    }

    res.json({ response, action, plan: effectivePlan });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error en el asistente IA" });
  }
});

export default router;
