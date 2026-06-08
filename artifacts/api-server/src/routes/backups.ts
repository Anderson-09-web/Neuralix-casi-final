import { Router } from "express";
import { db, backupsTable, welcomeConfigsTable, goodbyeConfigsTable, antiraidConfigsTable, ticketConfigsTable, verificationConfigsTable, logsConfigsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/guilds/:guildId/backups", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const backups = await db.select().from(backupsTable).where(eq(backupsTable.guildId, guildId)).orderBy(desc(backupsTable.createdAt));
  res.json(backups);
});

router.post("/guilds/:guildId/backups", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [welcome] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
  const [goodbye] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
  const [antiraid] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
  const [tickets] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
  const [verification] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
  const [logs] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));

  const data = { welcome, goodbye, antiraid, tickets, verification, logs };
  const dataStr = JSON.stringify(data);
  const existingCount = (await db.select().from(backupsTable).where(eq(backupsTable.guildId, guildId))).length;

  const [backup] = await db.insert(backupsTable).values({
    guildId,
    label: `Backup #${existingCount + 1} - ${new Date().toLocaleDateString()}`,
    size: dataStr.length,
    version: existingCount + 1,
    data,
  }).returning();
  res.status(201).json(backup);
});

router.post("/guilds/:guildId/backups/:backupId/restore", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const backupId = Number(req.params.backupId as string);
  const [backup] = await db.select().from(backupsTable).where(eq(backupsTable.id, backupId));
  if (!backup) { res.status(404).json({ error: "Backup not found" }); return; }

  const data = backup.data as any;
  if (data?.welcome) {
    const existing = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    if (existing.length > 0) await db.update(welcomeConfigsTable).set(data.welcome).where(eq(welcomeConfigsTable.guildId, guildId));
    else await db.insert(welcomeConfigsTable).values({ ...data.welcome, guildId });
  }
  if (data?.antiraid) {
    const existing = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
    if (existing.length > 0) await db.update(antiraidConfigsTable).set(data.antiraid).where(eq(antiraidConfigsTable.guildId, guildId));
    else await db.insert(antiraidConfigsTable).values({ ...data.antiraid, guildId });
  }

  res.json({ ok: true, message: "Backup restored successfully" });
});

export default router;
