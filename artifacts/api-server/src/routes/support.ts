import { Router } from "express";
import { db, supportTicketsTable, supportMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// ─── AI auto-reply logic ─────────────────────────────────────────────────────
const REPORT_KEYWORDS = [
  "report", "reporte", "reportar", "abuse", "abuso", "acoso", "spam",
  "blacklist", "banear", "ban", "hack", "hackeo", "fraude", "estafa",
  "denuncia", "scam", "ilegal", "amenaza", "threat", "insulto", "ofensa",
  "contenido inapropiado", "menor", "grooming",
];

function isReportTicket(subject: string, message: string): boolean {
  const text = `${subject} ${message}`.toLowerCase();
  return REPORT_KEYWORDS.some((kw) => text.includes(kw));
}

function generateAiReply(subject: string, message: string): { content: string; priority: string } {
  const text = `${subject} ${message}`.toLowerCase();

  if (isReportTicket(subject, message)) {
    return {
      content: "⚠️ Tu ticket ha sido marcado como **reporte**. Nuestro equipo de moderacion lo revisara con urgencia. Por favor incluye toda la evidencia posible (capturas de pantalla, IDs de usuario, fechas y descripcion detallada). El usuario reportado podria ser anadido a la blacklist global de Neuralix.",
      priority: "urgent",
    };
  }

  if (text.includes("premium") || text.includes("licencia") || text.includes("plan") || text.includes("pago") || text.includes("precio")) {
    return {
      content: "Hola! Para activar Premium necesitas un codigo de licencia. Ve a la seccion **Premium** del dashboard de tu servidor e ingresa el codigo. Si aun no tienes un codigo, puedes obtenerlo en nuestro Discord: discord.gg/wukr8apdQq\n\nEn unos instantes alguien del soporte te ayudara con mas detalles.",
      priority: "normal",
    };
  }

  if (text.includes("antiraid") || text.includes("raid") || text.includes("ataque")) {
    return {
      content: "Hola! Para configurar AntiRaid ve al panel **AntiRaid** en el menu lateral del dashboard. Activa el modulo principal y configura los sub-modulos segun tu necesidad. Si el raid ya esta ocurriendo, activa el modo de emergencia desde el panel.\n\nEn unos instantes alguien del soporte te ayudara.",
      priority: "normal",
    };
  }

  if (text.includes("bot") || text.includes("offline") || text.includes("sin conexion") || text.includes("no funciona") || text.includes("caido")) {
    return {
      content: "Hola! Verificamos el estado del bot. Asegurate de que Neuralix tenga los permisos necesarios en tu servidor (Administrador o permisos especificos). Si el problema persiste, nuestro equipo tecnico lo revisara.\n\nEn unos instantes alguien del soporte te ayudara a resolver esto.",
      priority: "normal",
    };
  }

  if (text.includes("verificacion") || text.includes("verif") || text.includes("captcha") || text.includes("vpn")) {
    return {
      content: "Hola! Para la configuracion de Verificacion, ve al panel **Verificacion** del dashboard. Asegurate de haber configurado el ID del rol verificado y tener el sistema activo. El portal de verificacion lo encuentras al final de la pagina.\n\nEn unos instantes alguien del soporte te ayudara.",
      priority: "normal",
    };
  }

  if (text.includes("ticket") || text.includes("soporte") || text.includes("panel")) {
    return {
      content: "Hola! Hemos recibido tu consulta sobre el sistema de tickets/soporte. Puedes configurarlo en el panel **Tickets** del dashboard. Si tienes dudas especificas sobre la configuracion, describe el problema con mas detalle.\n\nEn unos instantes alguien del soporte te ayudara.",
      priority: "normal",
    };
  }

  // Generic
  return {
    content: "Hola! Hemos recibido tu ticket correctamente y esta siendo revisado por nuestro equipo. Puedes consultar la documentacion del dashboard para resolver dudas comunes mientras tanto.\n\nEn unos instantes alguien del soporte te ayudara. 🤖",
    priority: "normal",
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/support/tickets", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const secondaryAdmin = (req as any).secondaryAdmin;
  const isStaff = user.isOwner || (secondaryAdmin && (secondaryAdmin.permissions as string[]).includes("manage_support"));
  const tickets = isStaff
    ? await db.select().from(supportTicketsTable).orderBy(desc(supportTicketsTable.createdAt))
    : await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.userId, user.id)).orderBy(desc(supportTicketsTable.createdAt));
  res.json(tickets);
});

router.post("/support/tickets", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { subject, message } = req.body;

  if (!subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Asunto y mensaje son obligatorios" });
    return;
  }

  const aiReply = generateAiReply(subject, message);

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId: user.id,
    username: user.username,
    subject: subject.trim(),
    priority: aiReply.priority,
  }).returning();

  // User's initial message
  await db.insert(supportMessagesTable).values({
    ticketId: ticket.id,
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    content: message.trim(),
    isStaff: false,
  });

  // AI auto-reply
  await db.insert(supportMessagesTable).values({
    ticketId: ticket.id,
    userId: "neuralix-ai",
    username: "Neuralix AI",
    avatar: null,
    content: aiReply.content,
    isStaff: true,
  });

  res.status(201).json(ticket);
});

router.get("/support/tickets/:id/messages", requireAuth, async (req, res) => {
  const id = Number(req.params.id as string);
  const messages = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.ticketId, id)).orderBy(supportMessagesTable.createdAt);
  res.json(messages);
});

router.post("/support/tickets/:id/messages", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const secondaryAdmin = (req as any).secondaryAdmin;
  const { content, fromUserPage } = req.body;
  // When fromUserPage is true the sender is explicitly acting as a regular user,
  // not as staff — this prevents owner accounts from showing messages on the staff side.
  const isStaff = !fromUserPage && (user.isOwner || (secondaryAdmin && (secondaryAdmin.permissions as string[]).includes("manage_support")));
  const id = Number(req.params.id as string);

  if (!content?.trim()) {
    res.status(400).json({ error: "El mensaje no puede estar vacio" });
    return;
  }

  const [msg] = await db.insert(supportMessagesTable).values({
    ticketId: id,
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    content: content.trim(),
    isStaff,
  }).returning();

  // AI auto-reply only for non-staff messages
  if (!isStaff) {
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
    const aiReply = generateAiReply(ticket?.subject || "", content);

    // Only auto-reply if not a report (report tickets get escalated directly)
    if (aiReply.priority !== "urgent") {
      const followUps = [
        "Gracias por los detalles adicionales. Nuestro equipo revisara tu mensaje y te respondera en breve.",
        "Entendido. El equipo de soporte esta revisando tu caso. En unos instantes alguien te ayudara.",
        "Hemos recibido tu mensaje. Mientras esperas, puedes revisar la documentacion del dashboard para informacion adicional.",
      ];
      const randomFollowUp = followUps[Math.floor(Math.random() * followUps.length)];

      await db.insert(supportMessagesTable).values({
        ticketId: id,
        userId: "neuralix-ai",
        username: "Neuralix AI",
        avatar: null,
        content: randomFollowUp,
        isStaff: true,
      });
    }
  }

  res.status(201).json(msg);
});

router.patch("/support/tickets/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const secondaryAdmin = (req as any).secondaryAdmin;
  const isStaff = user.isOwner || (secondaryAdmin && (secondaryAdmin.permissions as string[]).includes("manage_support"));
  const id = Number(req.params.id as string);
  const { status, priority } = req.body as { status?: string; priority?: string };
  if (!isStaff) { res.status(403).json({ error: "Forbidden" }); return; }

  const updateData: Record<string, any> = {};
  if (status) updateData.status = status;
  if (priority) updateData.priority = priority;

  const [ticket] = await db.update(supportTicketsTable)
    .set(updateData)
    .where(eq(supportTicketsTable.id, id))
    .returning();
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }
  res.json(ticket);
});

export default router;
