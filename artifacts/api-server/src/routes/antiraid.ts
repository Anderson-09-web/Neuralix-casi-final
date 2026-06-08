import { Router } from "express";
import { db, antiraidConfigsTable, antiraidStatsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const defaultConfig = {
  enabled: false,
  antiJoin: false, antiJoinThreshold: 5, antiJoinInterval: 10, antiJoinAction: "ban",
  antiAlt: false, antiAltMinAge: 7,
  antiBot: false, antiBotWhitelist: [],
  antiSpam: false, antiSpamLimit: 5, antiSpamInterval: 5, antiSpamAction: "mute",
  antiLinks: false, allowedDomains: [], blockedDomains: [],
  antiMassMention: false, massMentionLimit: 5,
  antiVpn: false, antiVpnAction: "ban", antiProxy: false, antiTor: false, vpnCheckLevel: "standard",
  antiWebhook: false, antiChannelCreate: false, antiChannelDelete: false, antiChannelUpdate: false,
  antiRoleCreate: false, antiRoleDelete: false, antiRoleUpdate: false,
  antiEmojiCreate: false, antiEmojiDelete: false,
  antiBanMass: false, antiKickMass: false,
  antiNuke: false, nukeThreshold: 10, nukeAction: "strip_permissions",
};

router.get("/guilds/:guildId/antiraid", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [cfg] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
  if (!cfg) {
    const [created] = await db.insert(antiraidConfigsTable).values({ guildId, ...defaultConfig }).returning();
    cfg = created;
  }
  res.json({ ...cfg, antiBotWhitelist: cfg.antiBotWhitelist || [], allowedDomains: cfg.allowedDomains || [], blockedDomains: cfg.blockedDomains || [] });
});

router.put("/guilds/:guildId/antiraid", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const body = { ...req.body };
  // Strip DB-managed fields to avoid Drizzle timestamp type errors
  delete body.id; delete body.createdAt; delete body.updatedAt; delete body.guildId;

  const existing = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
  let cfg;
  if (existing.length > 0) {
    const [updated] = await db.update(antiraidConfigsTable).set(body).where(eq(antiraidConfigsTable.guildId, guildId)).returning();
    cfg = updated;
  } else {
    const [created] = await db.insert(antiraidConfigsTable).values({ guildId, ...defaultConfig, ...body }).returning();
    cfg = created;
  }
  res.json({ ...cfg, antiBotWhitelist: cfg.antiBotWhitelist || [], allowedDomains: cfg.allowedDomains || [], blockedDomains: cfg.blockedDomains || [] });
});

router.get("/guilds/:guildId/antiraid/stats", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [stats] = await db.select().from(antiraidStatsTable).where(eq(antiraidStatsTable.guildId, guildId));
  if (!stats) {
    const [created] = await db.insert(antiraidStatsTable).values({ guildId }).returning();
    stats = created;
  }
  res.json(stats);
});

export default router;
