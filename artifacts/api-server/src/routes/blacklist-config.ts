import { Router } from "express";
import { db, guildConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import axios from "axios";

const DISCORD_API = "https://discord.com/api/v10";
function hasAdminPerms(permissions: string | number): boolean {
  const ADMINISTRATOR = BigInt(0x8);
  const MANAGE_GUILD   = BigInt(0x20);
  const perms = BigInt(String(permissions));
  return (perms & ADMINISTRATOR) !== BigInt(0) || (perms & MANAGE_GUILD) !== BigInt(0);
}

async function verifyGuildAdmin(user: any, guildId: string): Promise<boolean> {
  if (user.isOwner) return true;
  try {
    const guildsRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      validateStatus: () => true,
    });
    if (guildsRes.status !== 200) return false;
    return guildsRes.data.some((g: any) => g.id === guildId && hasAdminPerms(g.permissions));
  } catch {
    return false;
  }
}

const router = Router();

router.get("/guilds/:guildId/blacklist-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const user = (req as any).user;
  const allowed = await verifyGuildAdmin(user, guildId);
  if (!allowed) { res.status(403).json({ error: "No tienes permisos de administrador en este servidor" }); return; }
  try {
    const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    res.json({ guildId, blacklistAction: cfg?.blacklistAction || "ban" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.put("/guilds/:guildId/blacklist-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const user = (req as any).user;
  const allowed = await verifyGuildAdmin(user, guildId);
  if (!allowed) { res.status(403).json({ error: "No tienes permisos de administrador en este servidor" }); return; }
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
