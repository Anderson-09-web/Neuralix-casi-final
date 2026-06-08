import { Router } from "express";
import { db, ticketConfigsTable, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/guilds/:guildId/tickets/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
  if (!cfg) {
    const [created] = await db.insert(ticketConfigsTable).values({ guildId }).returning();
    cfg = created;
  }
  res.json(cfg);
});

router.put("/guilds/:guildId/tickets/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const existing = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
  let cfg;
  const body = { ...req.body };
  delete body.id; delete body.createdAt; delete body.updatedAt; delete body.guildId;
  if (existing.length > 0) {
    const [updated] = await db.update(ticketConfigsTable).set(body).where(eq(ticketConfigsTable.guildId, guildId)).returning();
    cfg = updated;
  } else {
    const [created] = await db.insert(ticketConfigsTable).values({ guildId, ...body }).returning();
    cfg = created;
  }
  res.json(cfg);
});

router.get("/guilds/:guildId/tickets", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const tickets = await db.select().from(ticketsTable).where(eq(ticketsTable.guildId, guildId));
  res.json(tickets);
});

router.post("/guilds/:guildId/tickets/:ticketId/close", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  await db.update(ticketsTable).set({ status: "closed", closedAt: new Date() }).where(eq(ticketsTable.id, ticketId));
  res.json({ ok: true });
});

router.post("/guilds/:guildId/tickets/:ticketId/reopen", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  await db.update(ticketsTable).set({ status: "open", closedAt: null }).where(eq(ticketsTable.id, ticketId));
  res.json({ ok: true });
});

export default router;
