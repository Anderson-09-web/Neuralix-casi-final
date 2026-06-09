import { Router } from "express";
import { db, ticketConfigsTable, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const ALLOWED_FIELDS = new Set([
  "enabled", "categoryId", "supportRoleId", "additionalRoles",
  "transcriptChannelId", "logsChannelId",
  "maxTicketsPerUser",
  "panelChannelId", "panelMessage", "panelTitle", "panelDescription",
  "panelColor", "panelImage", "panelFooter",
  "buttonLabel", "buttonEmoji", "buttonColor",
  "ticketNameFormat", "openMessage", "mentionSupport",
  "autoClose", "satisfactionSurvey", "autoTranscript",
]);

function whitelistBody(body: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) safe[k] = v;
  }
  return safe;
}

router.get("/guilds/:guildId/tickets/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(ticketConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de tickets" });
  }
});

router.put("/guilds/:guildId/tickets/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const safeBody = whitelistBody(req.body);

    const [existing] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(ticketConfigsTable)
        .set(safeBody as any)
        .where(eq(ticketConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(ticketConfigsTable)
        .values({ guildId, ...safeBody } as any)
        .returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de tickets" });
  }
});

router.get("/guilds/:guildId/tickets", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const tickets = await db.select().from(ticketsTable).where(eq(ticketsTable.guildId, guildId));
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener tickets" });
  }
});

router.post("/guilds/:guildId/tickets/:ticketId/close", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  try {
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "ID de ticket invalido" });
      return;
    }
    await db.update(ticketsTable)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(ticketsTable.id, ticketId));
    res.json({ ok: true, message: "Ticket cerrado correctamente" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al cerrar ticket" });
  }
});

router.post("/guilds/:guildId/tickets/:ticketId/reopen", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  try {
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "ID de ticket invalido" });
      return;
    }
    await db.update(ticketsTable)
      .set({ status: "open", closedAt: null })
      .where(eq(ticketsTable.id, ticketId));
    res.json({ ok: true, message: "Ticket reabierto correctamente" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al reabrir ticket" });
  }
});

export default router;
