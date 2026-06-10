/**
 * Bot integration routes — called by Discord bots to read all guild configuration.
 *
 * GET  /api/bot/guild-config/:guildId  — returns ALL config for a guild in one call
 *
 * Python example:
 *   import requests
 *   TOKEN = "your_jwt_token"
 *   resp = requests.get(
 *       "https://tu-dominio.replit.app/api/bot/guild-config/GUILD_ID",
 *       headers={"Authorization": f"Bearer {TOKEN}"}
 *   )
 *   config = resp.json()
 *
 *   # Access welcome config
 *   if config["welcome"]["enabled"]:
 *       channel_id = config["welcome"]["channelId"]
 *       message    = config["welcome"]["message"]
 *
 *   # Access antiraid config
 *   if config["antiraid"]["antiSpam"]:
 *       print("AntiSpam is enabled!")
 *
 *   # Access verification config
 *   if config["verification"]["enabled"]:
 *       role_id = config["verification"]["verifiedRoleId"]
 */

import { Router } from "express";
import { db, guildConfigsTable, welcomeConfigsTable, goodbyeConfigsTable, antiraidConfigsTable, verificationConfigsTable, ticketConfigsTable, logsConfigsTable, botSettingsTable, antiraidStatsTable, ticketsTable, backupsTable, logEntriesTable, verifiedUsersTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

/**
 * GET /api/bot/guild-config/:guildId
 *
 * Returns ALL configuration for a guild in a single JSON response.
 * Ideal for bots to read on startup or poll every few seconds.
 *
 * Response shape:
 * {
 *   guild:        { id, name, memberCount, botPresent, premiumActive, premiumPlan }
 *   welcome:      { enabled, channelId, message, embedEnabled, ... }
 *   goodbye:      { enabled, channelId, message, embedEnabled, ... }
 *   antiraid:     { antiSpam, antiFlood, antiLinks, ... all 20+ modules }
 *   verification: { enabled, verifiedRoleId, antiVPN, antiAlt, antiBot, ... }
 *   tickets:      { enabled, panelChannelId, categoryId, ... }
 *   logs:         { enabled, channelId, logMember, logModeration, ... }
 *   stats:        { memberCount, openTickets, antiraidDetections, backupsCount, verifiedMembers }
 *   updatedAt:    ISO timestamp of when this response was generated
 * }
 */
router.get("/bot/guild-config/:guildId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;

  try {
    // Run all DB queries in parallel for maximum speed
    const [
      guild,
      welcome,
      goodbye,
      antiraid,
      verification,
      ticketConfig,
      logsConfig,
      antiraidStats,
      openTickets,
      backupsCount,
      verifiedMembers,
    ] = await Promise.all([
      db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select().from(antiraidStatsTable).where(eq(antiraidStatsTable.guildId, guildId)).then((r) => r[0] ?? null),
      db.select({ count: count() }).from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.status, "open"))).then((r) => r[0]?.count ?? 0),
      db.select({ count: count() }).from(backupsTable).where(eq(backupsTable.guildId, guildId)).then((r) => r[0]?.count ?? 0),
      db.select({ count: count() }).from(verifiedUsersTable).where(eq(verifiedUsersTable.guildId, guildId)).then((r) => r[0]?.count ?? 0),
    ]);

    res.set("Cache-Control", "no-store");
    res.json({
      guild: {
        id: guildId,
        name: guild?.guildName ?? null,
        icon: guild?.guildIcon ?? null,
        memberCount: guild?.memberCount ?? 0,
        botPresent: guild?.botPresent ?? false,
        premiumActive: guild?.premiumActive ?? false,
        premiumPlan: guild?.premiumPlan ?? null,
      },
      welcome: welcome ?? {
        enabled: false, channelId: null, message: null,
        embedEnabled: false, dmEnabled: false, autoRoleIds: [],
      },
      goodbye: goodbye ?? {
        enabled: false, channelId: null, message: null, embedEnabled: false,
      },
      antiraid: antiraid ?? { guildId },
      verification: verification ?? {
        enabled: false, verifiedRoleId: null, unverifiedRoleId: null,
        antiVPN: false, antiAlt: false, antiBot: false,
      },
      tickets: ticketConfig ?? {
        enabled: false, panelChannelId: null,
      },
      logs: logsConfig ?? {
        enabled: false, channelId: null,
      },
      stats: {
        memberCount: guild?.memberCount ?? 0,
        openTickets,
        antiraidDetections: antiraidStats?.totalDetections ?? 0,
        backupsCount,
        verifiedMembers,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion del guild" });
  }
});

export default router;
