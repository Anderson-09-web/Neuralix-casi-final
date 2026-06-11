import { Router } from "express";
import { db, warningsTable, automodConfigsTable, moderationLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// ─── Warnings ─────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/moderation/warnings", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const rows = await db.select().from(warningsTable)
    .where(eq(warningsTable.guildId, guildId))
    .orderBy(desc(warningsTable.createdAt));
  res.json(rows);
});

router.get("/guilds/:guildId/moderation/warnings/:userId", requireAuth, async (req, res) => {
  const { guildId, userId } = req.params as { guildId: string; userId: string };
  const rows = await db.select().from(warningsTable)
    .where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId)))
    .orderBy(desc(warningsTable.createdAt));
  res.json(rows);
});

router.post("/guilds/:guildId/moderation/warnings", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const actor = (req as any).user;
  const { userId, username, reason, severity = "low" } = req.body;
  if (!userId || !username || !reason) {
    res.status(400).json({ error: "userId, username y reason son requeridos" });
    return;
  }
  const [warning] = await db.insert(warningsTable).values({
    guildId, userId, username, reason, severity,
    moderatorId: actor.discordId,
    moderatorUsername: actor.username,
  }).returning();
  res.status(201).json(warning);
});

router.delete("/guilds/:guildId/moderation/warnings/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.delete(warningsTable).where(eq(warningsTable.id, id));
  res.status(204).send();
});

router.patch("/guilds/:guildId/moderation/warnings/:id/deactivate", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [updated] = await db.update(warningsTable).set({ active: false }).where(eq(warningsTable.id, id)).returning();
  res.json(updated);
});

// ─── Moderation Logs ──────────────────────────────────────────────────────────

router.get("/guilds/:guildId/moderation/logs", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const rows = await db.select().from(moderationLogsTable)
    .where(eq(moderationLogsTable.guildId, guildId))
    .orderBy(desc(moderationLogsTable.createdAt));
  res.json(rows);
});

// ─── AutoMod Config ───────────────────────────────────────────────────────────

router.get("/guilds/:guildId/automod", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [cfg] = await db.select().from(automodConfigsTable).where(eq(automodConfigsTable.guildId, guildId));
  res.json(cfg ?? { guildId, enabled: false });
});

router.put("/guilds/:guildId/automod", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const data = { ...req.body, guildId };

  const [existing] = await db.select().from(automodConfigsTable).where(eq(automodConfigsTable.guildId, guildId));
  if (existing) {
    const [updated] = await db.update(automodConfigsTable).set(data).where(eq(automodConfigsTable.guildId, guildId)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(automodConfigsTable).values(data).returning();
    res.status(201).json(created);
  }
});

export default router;
