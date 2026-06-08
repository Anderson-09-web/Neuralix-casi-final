import { Router } from "express";
import { db, antiraidConfigsTable, verificationConfigsTable, ticketConfigsTable, logsConfigsTable, guildConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// ─── Spanish responses by plan (step-by-step) ────────────────────────────────
const RESPONSES = {
  free: {
    soporte: "Para soporte tecnico puedes crear un ticket en el Centro de Soporte del dashboard o unirte a nuestro Discord: discord.gg/wukr8apdQq",
    premium: "Neuralix Premium ofrece IA avanzada, backups ilimitados y proteccion AntiNuke. Activa tu licencia en la seccion Premium del dashboard o contactanos en discord.gg/wukr8apdQq",
    ticket: "Puedes abrir un ticket de soporte desde el boton 'Soporte' en la barra superior del dashboard. Describe tu problema y el equipo te respondera.",
    dashboard: "El dashboard te permite gestionar todos los sistemas de tu servidor. Inicia sesion con Discord y selecciona tu servidor para comenzar.",
    default: "Soy el asistente de soporte de Neuralix (plan Free). Puedo ayudarte con preguntas basicas del dashboard. Para configuracion avanzada necesitas plan Plus o superior. Soporte en discord.gg/wukr8apdQq",
    restrict: "Esta funcion requiere plan Plus o superior. Para obtener Premium activa tu licencia en la seccion Premium del dashboard o contacta al equipo en discord.gg/wukr8apdQq",
  },
  plus: {
    antiraid: `Para activar AntiRaid paso a paso:

1. Ve al panel "AntiRaid" en el menu lateral izquierdo
2. Activa el interruptor principal "AntiRaid activo"
3. Configura AntiJoin: umbral de 5 usuarios en 10 segundos
4. Activa AntiAlt: minimo 7 dias de antiguedad de cuenta
5. Activa AntiBot para bloquear bots no autorizados
6. Activa AntiSpam en modo "estricto"
7. Haz clic en "Guardar" en la parte superior

Recomendado: activa tambien AntiNuke (plan Pro) para proteccion maxima contra administradores comprometidos.`,
    antijoin: `Para configurar AntiJoin:

1. Ve al panel "AntiRaid" en el sidebar
2. Activa el modulo "AntiJoin"
3. Umbral recomendado: 5 uniones en 10 segundos
4. Accion automatica: selecciona "Banear" para maxima seguridad
5. Guarda los cambios

Cuando se supere el umbral, se activara una alerta de raid automaticamente.`,
    verification: `Para configurar Verificacion paso a paso:

1. Ve al panel "Verificacion" en el menu lateral
2. Activa "Verificacion activa"
3. Ingresa el ID del rol que se asignara al verificarse
4. Activa "AntiVPN" para bloquear conexiones via proxy
5. Activa "AntiAlt" para bloquear cuentas nuevas
6. Establece edad minima de cuenta: 7 dias (recomendado)
7. Personaliza el mensaje de verificacion exitosa
8. Copia el enlace del Portal de Verificacion y compartelo con tus miembros
9. Guarda los cambios`,
    tickets: `Para configurar el sistema de Tickets:

1. Ve al panel "Tickets" en el sidebar
2. Activa el sistema de tickets
3. Configura el ID de la categoria de Discord donde se crearan los tickets
4. Asigna el ID del rol de soporte que podra ver los tickets
5. (Opcional) Configura el canal de transcripciones
6. En la tab "Panel": personaliza el embed y el boton del canal
7. En "Configuracion": ajusta nombre de canal, mensaje de bienvenida y limite de tickets
8. Guarda los cambios`,
    logs: `Para activar Logs paso a paso:

1. Ve al panel "Logs" en el sidebar
2. Activa el interruptor "Logs activos"
3. Ingresa el ID del canal de Discord para los logs
4. Selecciona que eventos registrar:
   - Mensajes (ediciones y eliminaciones)
   - Miembros (entradas y salidas)
   - Roles y canales
   - Moderacion (bans, kicks, mutes)
   - Invitaciones
5. Guarda los cambios`,
    backups: `Para crear y gestionar Backups:

1. Ve al panel "Backups" (tab "Mis Backups")
2. Haz clic en "Crear backup ahora"
3. El backup guarda: estructura de canales, roles y configuraciones
4. Para restaurar: selecciona el backup y haz clic en "Restaurar"
5. Para exportar como JSON: haz clic en el boton de exportar (plan Plus+)

Con plan Pro+ puedes programar backups automaticos en la tab "Programados".`,
    welcome: `Para configurar Bienvenidas:

1. Ve al panel "Bienvenidas" en el sidebar
2. Activa "Sistema de bienvenidas"
3. Ingresa el ID del canal donde se enviaran los mensajes
4. Personaliza el mensaje usando variables:
   - {user} → nombre del usuario
   - {server} → nombre del servidor
   - {membercount} → numero de miembros
5. (Opcional) Activa el embed personalizado y configura color y footer
6. (Opcional) Activa "Mensaje privado" para enviar un DM al nuevo miembro
7. Guarda los cambios`,
    goodbye: `Para configurar Despedidas:

1. Ve al panel "Despedidas" en el sidebar
2. Activa "Sistema de despedidas"
3. Ingresa el ID del canal
4. Personaliza el mensaje con variables: {user}, {server}, {membercount}
5. (Opcional) Configura el embed con color e imagen
6. Guarda los cambios`,
    premium: "Tienes plan Plus activo. Incluye: IA avanzada, configuracion completa de todos los sistemas, hasta 5 backups, exportar JSON, soporte prioritario y todas las funciones premium basicas. Para funciones avanzadas como AntiNuke o CAPTCHA, considera el plan Pro.",
    default: "Soy Neuralix AI (plan Plus). Puedo guiarte paso a paso para configurar cualquier sistema. Pregunta sobre: AntiRaid, Verificacion, Tickets, Logs, Backups, Bienvenidas o cualquier funcion del dashboard.",
  },
  pro: {
    antiraid: `Con plan Pro tienes AntiNuke completo y todos los modulos AntiRaid avanzados:

1. Ve al panel "AntiRaid" en el sidebar
2. Activa el modulo principal
3. Activa AntiNuke: protege contra borrado masivo de canales/roles
4. Activa AntiJoin: umbral recomendado 5 usuarios/10s
5. Activa AntiAlt con 14 dias de minimo de cuenta
6. Activa AntiBot y AntiSpam en modo "estricto"
7. Configura los umbrales avanzados segun el tamano de tu servidor
8. Guarda los cambios`,
    verification: `Con plan Pro tienes verificacion CAPTCHA avanzada:

1. Ve al panel "Verificacion"
2. Activa el sistema y configura el rol verificado
3. Activa "Verificacion CAPTCHA" para mayor seguridad
4. Configura AntiVPN y AntiProxy con deteccion mejorada
5. Establece edad minima de cuenta en 14 dias
6. Activa AntiAlt con historial de sanciones
7. Configura la URL personalizada del portal si tienes dominio propio
8. Guarda y comparte el enlace del portal`,
    backups: `Con plan Pro tienes hasta 25 backups y backups automaticos:

1. Ve al panel "Backups" tab "Mis Backups": crea backups manuales
2. Tab "Programados": configura backup automatico semanal
3. Selecciona el dia y hora del backup automatico
4. Los backups se guardan y puedes restaurarlos en cualquier momento
5. Con plan Ultra puedes transferir la config entre servidores`,
    default: "Soy Neuralix AI Pro. Tengo acceso a todas las funciones avanzadas: AntiRaid completo, verificacion CAPTCHA, multi-panel de tickets, analitica del servidor y mucho mas. Pregunta lo que necesites y te guio paso a paso.",
  },
  ultra: {
    default: "Soy Neuralix AI Ultra. Puedo configurar automaticamente los sistemas de tu servidor al instante. Escribe 'activa el antiraid', 'configura la verificacion', 'activa los logs' o 'activa los tickets' y lo aplico en segundos. Tambien puedo analizar tu servidor y darte recomendaciones.",
  }
};

// ─── Detect intent from message ─────────────────────────────────────────────
function detectIntent(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("antiraid") || lower.includes("raid") || lower.includes("ataque") || lower.includes("anti raid")) return "antiraid";
  if (lower.includes("antijoin") || lower.includes("anti join") || lower.includes("uniones masivas")) return "antijoin";
  if (lower.includes("verif") || lower.includes("vpn") || lower.includes("alt") || lower.includes("anti alt") || lower.includes("captcha")) return "verification";
  if (lower.includes("ticket") && !lower.includes("soport")) return "tickets";
  if (lower.includes("log") || lower.includes("auditoria") || lower.includes("registro")) return "logs";
  if (lower.includes("backup") || lower.includes("copia") || lower.includes("respaldo")) return "backups";
  if (lower.includes("bienvenid") || lower.includes("welcome")) return "welcome";
  if (lower.includes("despedid") || lower.includes("goodbye")) return "goodbye";
  if (lower.includes("premium") || lower.includes("plan") || lower.includes("licencia")) return "premium";
  if (lower.includes("soport") || lower.includes("ayuda") || lower.includes("problema")) return "soporte";
  if (lower.includes("ticket") && lower.includes("soport")) return "ticket";
  if (lower.includes("dashboard") || lower.includes("panel")) return "dashboard";
  return "default";
}

// ─── Upsert helper usando patron seguro (check-then-update) ──────────────────
async function upsertEnabled(table: any, guildId: string, extraFields: Record<string, any> = {}) {
  const existing = await db.select().from(table).where(eq(table.guildId, guildId));
  if (existing.length > 0) {
    await db.update(table).set({ enabled: true, ...extraFields }).where(eq(table.guildId, guildId));
  } else {
    await db.insert(table).values({ guildId, enabled: true, ...extraFields });
  }
}

// ─── Ultra: apply configuration to DB ───────────────────────────────────────
async function applyConfig(guildId: string, intent: string): Promise<{ action: string; steps: string } | null> {
  if (intent === "antiraid") {
    await upsertEnabled(antiraidConfigsTable, guildId, { antiJoin: true, antiBot: true, antiAlt: true });
    return {
      action: "AntiRaid activado automaticamente",
      steps: `✅ AntiRaid activado en la base de datos.\n\nPasos siguientes para completar la configuracion:\n1. Ve al panel "AntiRaid" en el sidebar (ya vera el modulo encendido)\n2. Ajusta el umbral de AntiJoin: recomendado 5 usuarios en 10 segundos\n3. Verifica AntiAlt: minimo 7 dias de antiguedad de cuenta\n4. Activa AntiNuke si quieres proteccion contra admins comprometidos\n5. Haz clic en "Guardar" para confirmar tus ajustes\n\nEl sistema ya esta registrando eventos de seguridad.`,
    };
  }
  if (intent === "verification") {
    await upsertEnabled(verificationConfigsTable, guildId, { antiVpn: true, antiAlt: true, minAccountAge: 7 });
    return {
      action: "Verificacion activada automaticamente",
      steps: `✅ Verificacion activada con AntiVPN, AntiAlt y edad minima 7 dias.\n\nPasos siguientes:\n1. Ve al panel "Verificacion" en el sidebar\n2. Ingresa el ID del rol que se asignara al verificarse (campo "ID del rol verificado")\n3. (Opcional) Ingresa el ID del canal de logs de verificacion\n4. Copia el enlace del Portal de Verificacion y compartelo en tu servidor\n5. Haz clic en "Guardar"\n\nLos miembros nuevos veran el portal y deben verificarse para acceder.`,
    };
  }
  if (intent === "logs") {
    await upsertEnabled(logsConfigsTable, guildId);
    return {
      action: "Logs activados automaticamente",
      steps: `✅ Logs activados.\n\nPasos siguientes:\n1. Ve al panel "Logs" en el sidebar\n2. Ingresa el ID del canal de Discord donde quieres recibir los logs\n3. Selecciona los eventos que quieres registrar (mensajes, miembros, roles, etc.)\n4. Haz clic en "Guardar"\n\nDesde ese momento, todos los eventos del servidor quedaran registrados en ese canal.`,
    };
  }
  if (intent === "tickets") {
    await upsertEnabled(ticketConfigsTable, guildId);
    return {
      action: "Sistema de tickets activado automaticamente",
      steps: `✅ Sistema de Tickets activado.\n\nPasos siguientes:\n1. Ve al panel "Tickets" en el sidebar\n2. Ingresa el ID de la categoria de Discord donde se crearan los tickets\n3. Ingresa el ID del rol de soporte que podra gestionar los tickets\n4. (Opcional) Configura el canal de transcripciones\n5. En la tab "Panel": personaliza el embed del canal publico y el boton\n6. Haz clic en "Guardar"\n\nTus miembros podran abrir tickets haciendo clic en el boton del canal configurado.`,
    };
  }
  return null;
}

// ─── Server Analysis ─────────────────────────────────────────────────────────
router.post("/guilds/:guildId/ai/analyze", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [antiraid] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
  const [verification] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
  const [tickets] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
  const [logs] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));

  const recommendations: { category: string; severity: string; title: string; description: string }[] = [];
  let score = 100;

  if (!antiraid?.enabled) {
    recommendations.push({ category: "AntiRaid", severity: "high", title: "AntiRaid desactivado", description: "Activa AntiRaid para proteger tu servidor de ataques masivos. Ve al panel AntiRaid y activa el modulo principal." });
    score -= 20;
  }
  if (!antiraid?.antiNuke) {
    recommendations.push({ category: "AntiRaid", severity: "medium", title: "AntiNuke no configurado", description: "AntiNuke evita danos catastroficos por admins comprometidos. Activa AntiNuke en el panel AntiRaid (requiere plan Pro)." });
    score -= 10;
  }
  if (!verification?.enabled) {
    recommendations.push({ category: "Verificacion", severity: "medium", title: "Verificacion desactivada", description: "Activa la verificacion en el panel Verificacion para filtrar bots y alts automaticamente." });
    score -= 10;
  }
  if (!verification?.antiVpn) {
    recommendations.push({ category: "Seguridad", severity: "low", title: "AntiVPN desactivado", description: "Activa AntiVPN en el panel Verificacion para bloquear usuarios que usen proxies o VPNs." });
    score -= 5;
  }
  if (!tickets?.enabled) {
    recommendations.push({ category: "Soporte", severity: "low", title: "Sistema de tickets desactivado", description: "Configura el sistema de tickets en el panel Tickets para gestionar solicitudes de tus miembros." });
    score -= 5;
  }
  if (!logs?.enabled) {
    recommendations.push({ category: "Logs", severity: "medium", title: "Logs desactivados", description: "Activa los logs en el panel Logs y configura el canal para registrar toda la actividad del servidor." });
    score -= 10;
  }
  if (recommendations.length === 0) {
    recommendations.push({ category: "General", severity: "info", title: "Servidor bien configurado", description: "La configuracion de seguridad se ve excelente. Sigue monitoreando regularmente con el analisis de IA." });
  }

  res.json({
    guildId,
    score: Math.max(0, score),
    recommendations,
    summary: `Puntuacion: ${Math.max(0, score)}/100. Se encontraron ${recommendations.length} recomendacion(es).`,
    analyzedAt: new Date().toISOString(),
  });
});

// ─── AI Chat ─────────────────────────────────────────────────────────────────
router.post("/guilds/:guildId/ai/chat", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const { message } = req.body as { message: string; plan?: string };

  // SIEMPRE leer el plan real desde la DB (no confiar en lo que manda el cliente)
  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  const effectivePlan: string = cfg?.premiumActive && cfg?.premiumPlan ? cfg.premiumPlan : "free";

  const intent = detectIntent(message);
  const lower = message.toLowerCase();

  let response: string;
  let action: string | undefined;

  if (effectivePlan === "ultra") {
    const isConfigureCmd = lower.includes("activa") || lower.includes("configura") || lower.includes("pon") || lower.includes("haz") || lower.includes("setup") || lower.includes("instala") || lower.includes("enable") || lower.includes("quiero");
    const configIntent = ["antiraid", "verification", "logs", "tickets"].includes(intent) ? intent : null;

    if (isConfigureCmd && configIntent) {
      try {
        const result = await applyConfig(guildId, configIntent);
        if (result) {
          action = result.action;
          response = result.steps;
        } else {
          response = RESPONSES.ultra.default;
        }
      } catch (err) {
        console.error("AI Ultra config error:", err);
        response = "Hubo un error al aplicar la configuracion. Intenta configurar manualmente desde el panel correspondiente en el sidebar.";
      }
    } else if (intent !== "default") {
      response = (RESPONSES.pro as any)[intent] || (RESPONSES.plus as any)[intent] || RESPONSES.plus.default;
      if (!isConfigureCmd) {
        response += `\n\nCon plan Ultra puedo hacer esto automaticamente. Escribe "activa el ${intent}" y lo configuro al instante.`;
      }
    } else {
      response = RESPONSES.ultra.default;
    }
  } else if (effectivePlan === "pro") {
    response = (RESPONSES.pro as any)[intent] || (RESPONSES.plus as any)[intent] || RESPONSES.pro.default;
  } else if (effectivePlan === "plus") {
    response = (RESPONSES.plus as any)[intent] || RESPONSES.plus.default;
  } else {
    // Free plan: only support questions
    const supportIntents = ["soporte", "ticket", "dashboard", "premium", "default"];
    if (supportIntents.includes(intent)) {
      response = (RESPONSES.free as any)[intent] || RESPONSES.free.default;
    } else {
      response = RESPONSES.free.restrict;
    }
  }

  res.json({ response, action, plan: effectivePlan });
});

export default router;
