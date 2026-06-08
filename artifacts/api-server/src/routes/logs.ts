import { Router } from "express";
import { db, logsConfigsTable, logEntriesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/guilds/:guildId/logs/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [cfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
  if (!cfg) {
    const [created] = await db.insert(logsConfigsTable).values({ guildId }).returning();
    cfg = created;
  }
  res.json(cfg);
});

router.put("/guilds/:guildId/logs/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const existing = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
  let cfg;
  const body = { ...req.body };
  delete body.id; delete body.createdAt; delete body.updatedAt; delete body.guildId;
  if (existing.length > 0) {
    const [updated] = await db.update(logsConfigsTable).set(body).where(eq(logsConfigsTable.guildId, guildId)).returning();
    cfg = updated;
  } else {
    const [created] = await db.insert(logsConfigsTable).values({ guildId, ...body }).returning();
    cfg = created;
  }
  res.json(cfg);
});

router.get("/guilds/:guildId/logs", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const entries = await db.select().from(logEntriesTable).where(eq(logEntriesTable.guildId, guildId)).orderBy(desc(logEntriesTable.createdAt)).limit(100);
  res.json(entries);
});

export default router;
