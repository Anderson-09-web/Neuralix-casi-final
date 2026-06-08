import { Router } from "express";
import { db, blacklistTable, adminActivityLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminAccess } from "../lib/auth";

const router = Router();

async function log(actor: any, action: string, target?: string, details?: Record<string, any>) {
  try {
    await db.insert(adminActivityLogsTable).values({
      actorId: actor.discordId || "unknown",
      actorUsername: actor.username || "Desconocido",
      action, target: target || null, details: details || null,
    });
  } catch {}
}

// Endpoint publico para que el bot verifique usuarios al unirse al servidor
// El bot llama: GET /api/blacklist/check/:discordId con Authorization: Bearer <token>
router.get("/blacklist/check/:discordId", async (req, res) => {
  const discordId = req.params.discordId as string;
  if (!discordId) { res.status(400).json({ error: "discordId requerido" }); return; }
  const [entry] = await db.select().from(blacklistTable).where(eq(blacklistTable.userId, discordId));
  if (!entry) {
    res.json({ blacklisted: false });
    return;
  }
  res.json({
    blacklisted: true,
    userId: entry.userId,
    username: entry.username,
    reason: entry.reason,
    evidence: entry.evidence || [],
    addedAt: entry.createdAt,
    addedBy: entry.addedByUsername,
  });
});

router.get("/blacklist", requireAdminAccess("manage_blacklist"), async (_req, res) => {
  const entries = await db.select().from(blacklistTable).orderBy(blacklistTable.createdAt);
  res.json(entries);
});

router.post("/blacklist", requireAdminAccess("manage_blacklist"), async (req, res) => {
  const { userId, username, avatarHash, reason, evidence } = req.body;
  const actor = (req as any).user;

  const existing = await db.select().from(blacklistTable).where(eq(blacklistTable.userId, userId as string));
  if (existing.length > 0) {
    const prev = existing[0];
    const history = [...(prev.sanctionHistory || []), { action: "update", reason, by: actor.username, at: new Date().toISOString() }];
    const [updated] = await db.update(blacklistTable)
      .set({ username, avatarHash: avatarHash || null, reason, evidence: evidence || [], sanctionHistory: history, addedByUsername: actor.username })
      .where(eq(blacklistTable.userId, userId as string)).returning();
    await log(actor, "update_blacklist", username, { userId, reason });
    res.json(updated);
    return;
  }

  const [entry] = await db.insert(blacklistTable).values({
    userId: userId as string, username, avatarHash: avatarHash || null, reason,
    addedBy: actor.discordId, addedByUsername: actor.username,
    evidence: evidence || [],
    sanctionHistory: [{ action: "blacklist", reason, by: actor.username, at: new Date().toISOString() }],
  }).returning();
  await log(actor, "add_blacklist", username, { userId, reason });
  res.status(201).json(entry);
});

router.patch("/blacklist/:userId", requireAdminAccess("manage_blacklist"), async (req, res) => {
  const userId = req.params.userId as string;
  const { evidence, reason } = req.body;
  const actor = (req as any).user;
  const existing = await db.select().from(blacklistTable).where(eq(blacklistTable.userId, userId));
  if (!existing.length) { res.status(404).json({ error: "No encontrado" }); return; }
  const prev = existing[0];
  const history = [...(prev.sanctionHistory || []), { action: "update", reason: reason || "Actualizacion", by: actor.username, at: new Date().toISOString() }];
  const [updated] = await db.update(blacklistTable)
    .set({ ...(evidence !== undefined && { evidence }), ...(reason && { reason }), sanctionHistory: history })
    .where(eq(blacklistTable.userId, userId)).returning();
  await log(actor, "update_blacklist", prev.username, { userId, reason });
  res.json(updated);
});

router.delete("/blacklist/:userId", requireAdminAccess("manage_blacklist"), async (req, res) => {
  const userId = req.params.userId as string;
  const actor = (req as any).user;
  const [entry] = await db.select().from(blacklistTable).where(eq(blacklistTable.userId, userId));
  await db.delete(blacklistTable).where(eq(blacklistTable.userId, userId));
  await log(actor, "remove_blacklist", entry?.username, { userId });
  res.status(204).send();
});

export default router;
