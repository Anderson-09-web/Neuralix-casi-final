import { Router } from "express";
import { db, guildConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/guilds/:guildId/blacklist-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    res.json({ guildId, blacklistAction: cfg?.blacklistAction || "ban" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.put("/guilds/:guildId/blacklist-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const validActions = ["ban", "kick", "timeout", "none"];
    const action = validActions.includes(req.body.blacklistAction) ? req.body.blacklistAction : "ban";
    const [existing] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    if (existing) {
      await db.update(guildConfigsTable).set({ blacklistAction: action }).where(eq(guildConfigsTable.guildId, guildId));
    } else {
      await db.insert(guildConfigsTable).values({
        guildId,
        guildName: "Desconocido",
        memberCount: 0,
        blacklistAction: action,
      }).onConflictDoUpdate({ target: guildConfigsTable.guildId, set: { blacklistAction: action } });
    }
    res.json({ guildId, blacklistAction: action });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
