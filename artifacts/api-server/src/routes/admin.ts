import { Router } from "express";
import { db, usersTable, guildConfigsTable, ticketsTable, licensesTable, blacklistTable, backupsTable, supportTicketsTable, secondaryAdminsTable, adminActivityLogsTable, logsConfigsTable, giveawaysTable, logEntriesTable, announcementsTable } from "@workspace/db";
import { eq, and, count, desc, sql } from "drizzle-orm";
import { requireOwner, requireAdminAccess } from "../lib/auth";
import type { AdminPermission } from "@workspace/db";

const router = Router();

async function log(actor: any, action: string, target?: string, details?: Record<string, any>) {
  try {
    await db.insert(adminActivityLogsTable).values({
      actorId: actor.discordId || actor.id || "unknown",
      actorUsername: actor.username || "Desconocido",
      action,
      target: target || null,
      details: details || null,
    });
  } catch {}
}

// ─── Stats ─────────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAdminAccess("view_stats"), async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    [guilds], [users], [tickets], [premiumGuilds], [blacklistCount], [backupsCount],
    [adminsCount], [openSupport], [totalLogs], [monthlyActions], [weeklyNewUsers],
    [activeGiveaways], [totalGiveaways], [totalLogEntries], [totalAnnouncements], [activeBlacklistExpiring],
  ] = await Promise.all([
    db.select({ count: count() }).from(guildConfigsTable),
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(ticketsTable),
    db.select({ count: count() }).from(guildConfigsTable).where(eq(guildConfigsTable.premiumActive, true)),
    db.select({ count: count() }).from(blacklistTable),
    db.select({ count: count() }).from(backupsTable),
    db.select({ count: count() }).from(secondaryAdminsTable).where(eq(secondaryAdminsTable.active, true)),
    db.select({ count: count() }).from(supportTicketsTable).where(eq(supportTicketsTable.status, "open")),
    db.select({ count: count() }).from(adminActivityLogsTable),
    db.select({ count: count() }).from(adminActivityLogsTable).where(sql`${adminActivityLogsTable.createdAt} >= ${monthStart}`),
    db.select({ count: count() }).from(usersTable).where(sql`${usersTable.createdAt} >= ${weekStart}`),
    db.select({ count: count() }).from(giveawaysTable).where(eq(giveawaysTable.status, "active")),
    db.select({ count: count() }).from(giveawaysTable),
    db.select({ count: count() }).from(logEntriesTable),
    db.select({ count: count() }).from(announcementsTable).where(eq(announcementsTable.published, true)),
    db.select({ count: count() }).from(blacklistTable).where(sql`${blacklistTable.expiresAt} IS NOT NULL AND ${blacklistTable.expiresAt} > NOW()`),
  ]);

  // Use bot cache for real-time guild count (includes ALL servers, not just DB entries)
  const { getBotClient } = await import("../bot-state");
  const botClient = getBotClient();
  const botGuildCount = botClient?.guilds.cache.size ?? 0;

  const totalGuildsNum = guilds?.count || 0;
  const premiumGuildsNum = premiumGuilds?.count || 0;
  const premiumPct = botGuildCount > 0 ? Math.round((premiumGuildsNum / botGuildCount) * 100) : 0;

  res.json({
    totalGuilds: botGuildCount,
    totalGuildsDb: totalGuildsNum,
    totalUsers: users?.count || 0,
    totalTickets: tickets?.count || 0,
    premiumGuilds: premiumGuildsNum,
    premiumPct,
    activeBlacklist: blacklistCount?.count || 0,
    activeBlacklistExpiring: activeBlacklistExpiring?.count || 0,
    totalBackups: backupsCount?.count || 0,
    totalAdmins: adminsCount?.count || 0,
    openSupport: openSupport?.count || 0,
    totalActivityLogs: totalLogs?.count || 0,
    monthlyActions: monthlyActions?.count || 0,
    weeklyNewUsers: weeklyNewUsers?.count || 0,
    activeGiveaways: activeGiveaways?.count || 0,
    totalGiveaways: totalGiveaways?.count || 0,
    totalLogEntries: totalLogEntries?.count || 0,
    totalAnnouncements: totalAnnouncements?.count || 0,
  });
});

// ─── Activity Logs ──────────────────────────────────────────────────────────
router.get("/admin/activity-logs", requireOwner, async (req, res) => {
  const limit = Math.min(Number((req.query as any).limit) || 50, 200);
  const logs = await db
    .select()
    .from(adminActivityLogsTable)
    .orderBy(desc(adminActivityLogsTable.createdAt))
    .limit(limit);
  res.json(logs);
});

// ─── Licenses ──────────────────────────────────────────────────────────────
router.get("/admin/licenses", requireAdminAccess("manage_licenses"), async (_req, res) => {
  const licenses = await db.select().from(licensesTable).orderBy(desc(licensesTable.createdAt));
  res.json(licenses);
});

router.post("/admin/licenses", requireAdminAccess("manage_licenses"), async (req, res) => {
  const actor = (req as any).user;
  const { plan, guildId, expiresAt } = req.body;
  const plans: Record<string, string> = { plus: "PLUS", pro: "PRO", ultra: "ULTRA" };
  const prefix = plans[plan] || "PLUS";
  const key = `NRX-${prefix}-${Array.from({ length: 16 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("")}`;
  const [license] = await db.insert(licensesTable).values({
    key, plan, guildId: guildId || null, active: true,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  await log(actor, "create_license", key, { plan, guildId: guildId || null });
  res.status(201).json(license);
});

router.delete("/admin/licenses/:id", requireAdminAccess("manage_licenses"), async (req, res) => {
  const actor = (req as any).user;
  const id = Number(req.params.id as string);
  const [lic] = await db.select().from(licensesTable).where(eq(licensesTable.id, id));
  await db.update(licensesTable).set({ active: false }).where(eq(licensesTable.id, id));
  await log(actor, "revoke_license", lic?.key || `#${id}`, { plan: lic?.plan });
  res.status(204).end();
});

// ─── Secondary Admins ──────────────────────────────────────────────────────
router.get("/admin/admins", requireOwner, async (_req, res) => {
  const admins = await db.select().from(secondaryAdminsTable).orderBy(secondaryAdminsTable.createdAt);
  res.json(admins);
});

router.post("/admin/admins", requireOwner, async (req, res) => {
  const actor = (req as any).user;
  const { discordId, username, permissions } = req.body as { discordId: string; username: string; permissions: AdminPermission[] };
  if (!discordId || !username) { res.status(400).json({ error: "discordId y username son requeridos" }); return; }

  const existing = await db.select().from(secondaryAdminsTable).where(eq(secondaryAdminsTable.discordId, discordId));
  if (existing.length > 0) {
    const [updated] = await db.update(secondaryAdminsTable)
      .set({ username, permissions: permissions || [], active: true, grantedBy: actor.discordId })
      .where(eq(secondaryAdminsTable.discordId, discordId))
      .returning();
    await log(actor, "update_admin", username, { discordId, permissions });
    res.json(updated);
    return;
  }
  const [admin] = await db.insert(secondaryAdminsTable).values({
    userId: `user_${discordId}`, discordId, username,
    permissions: permissions || [], active: true, grantedBy: actor.discordId,
  }).returning();
  await log(actor, "grant_admin", username, { discordId, permissions });
  res.json(admin);
});

router.patch("/admin/admins/:id", requireOwner, async (req, res) => {
  const actor = (req as any).user;
  const id = Number(req.params.id as string);
  const { permissions, active } = req.body;
  const [target] = await db.select().from(secondaryAdminsTable).where(eq(secondaryAdminsTable.id, id));
  const [updated] = await db.update(secondaryAdminsTable)
    .set({ ...(permissions !== undefined && { permissions }), ...(active !== undefined && { active }) })
    .where(eq(secondaryAdminsTable.id, id))
    .returning();
  if (active !== undefined) {
    await log(actor, active ? "activate_admin" : "suspend_admin", target?.username, { discordId: target?.discordId });
  } else {
    await log(actor, "update_admin_perms", target?.username, { permissions });
  }
  res.json(updated);
});

router.delete("/admin/admins/:id", requireOwner, async (req, res) => {
  const actor = (req as any).user;
  const id = Number(req.params.id as string);
  const [target] = await db.select().from(secondaryAdminsTable).where(eq(secondaryAdminsTable.id, id));
  await db.delete(secondaryAdminsTable).where(eq(secondaryAdminsTable.id, id));
  await log(actor, "delete_admin", target?.username, { discordId: target?.discordId });
  res.status(204).end();
});

// ─── Guilds list ────────────────────────────────────────────────────────────
router.get("/admin/guilds", requireOwner, async (_req, res) => {
  const rows = await db
    .select({
      guildId: guildConfigsTable.guildId,
      premiumActive: guildConfigsTable.premiumActive,
      premiumPlan: guildConfigsTable.premiumPlan,
      premiumExpiresAt: guildConfigsTable.premiumExpiresAt,
      blacklistAction: guildConfigsTable.blacklistAction,
      tickets: sql<number>`(SELECT COUNT(*) FROM ${ticketsTable} WHERE ${ticketsTable.guildId} = ${guildConfigsTable.guildId})`.mapWith(Number),
    })
    .from(guildConfigsTable)
    .orderBy(desc(guildConfigsTable.premiumActive));

  const { getBotClient } = await import("../bot-state");
  const client = getBotClient();

  const guilds = rows.map((r) => {
    const discordGuild = client?.guilds.cache.get(r.guildId);
    return {
      ...r,
      name: discordGuild?.name ?? null,
      iconURL: discordGuild?.iconURL() ?? null,
      memberCount: discordGuild?.memberCount ?? null,
      botJoinedAt: discordGuild?.joinedAt?.toISOString() ?? null,
    };
  });

  res.json(guilds);
});

// ─── Mass actions ────────────────────────────────────────────────────────────
router.post("/admin/broadcast", requireOwner, async (req, res) => {
  const { message, embedTitle, embedColor } = req.body as { message?: string; embedTitle?: string; embedColor?: string };
  if (!message?.trim() && !embedTitle?.trim()) { res.status(400).json({ error: "message o embedTitle requerido" }); return; }
  try {
    const { getBotClient } = await import("../bot-state");
    const client = getBotClient();
    if (!client) { res.status(503).json({ error: "Bot no conectado" }); return; }

    const guilds = await db.select({ guildId: guildConfigsTable.guildId }).from(guildConfigsTable);
    const logConfigs = await db.select({ guildId: logsConfigsTable.guildId, channelId: logsConfigsTable.channelId }).from(logsConfigsTable);
    const logChannelMap = new Map(logConfigs.map((c) => [c.guildId, c.channelId]));

    let sent = 0;
    let failed = 0;

    const hexColor = embedColor ? parseInt(embedColor.replace("#", ""), 16) : 0x5865F2;
    const payload: any = {};
    if (message?.trim() && !embedTitle?.trim()) {
      payload.content = message;
    } else {
      payload.embeds = [{
        title: embedTitle || undefined,
        description: message || undefined,
        color: hexColor,
      }];
    }

    await Promise.allSettled(
      guilds.map(async ({ guildId }) => {
        try {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) { failed++; return; }
          const logChannelId = logChannelMap.get(guildId);
          const targetChannel = (logChannelId ? guild.channels.cache.get(logChannelId) : null)
            || guild.systemChannel
            || guild.channels.cache.find(
              (c: any) => c.isTextBased() && c.permissionsFor(guild.members.me!)?.has("SendMessages")
            );
          if (!targetChannel || !("send" in targetChannel)) { failed++; return; }
          await (targetChannel as any).send(payload);
          sent++;
        } catch { failed++; }
      })
    );

    res.json({ ok: true, sent, failed, total: guilds.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error interno" });
  }
});

// ─── Global blacklist sweep ──────────────────────────────────────────────────
router.post("/admin/blacklist/sweep", requireOwner, async (_req, res) => {
  try {
    const { getBotClient } = await import("../bot-state");
    const client = getBotClient();
    if (!client) { res.status(503).json({ error: "Bot no conectado" }); return; }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) { res.status(503).json({ error: "Token del bot no configurado" }); return; }

    const DISCORD_API = "https://discord.com/api/v10";
    const axios = (await import("axios")).default;

    const blacklisted = await db.select().from(blacklistTable);
    const active = blacklisted.filter((e) => !e.expiresAt || new Date(e.expiresAt) > new Date());
    if (!active.length) { res.json({ ok: true, actioned: 0, guilds: 0 }); return; }

    const configs = await db.select({ guildId: guildConfigsTable.guildId, blacklistAction: guildConfigsTable.blacklistAction }).from(guildConfigsTable);

    let actioned = 0;
    const guildsProcessed = new Set<string>();

    // Blacklist-first approach: iterate by user → per guild → ban via REST (no full member fetch)
    for (const entry of active) {
      for (const { guildId, blacklistAction } of configs) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        guildsProcessed.add(guildId);
        const action = blacklistAction || "ban";
        if (action === "none") continue;

        try {
          if (action === "ban") {
            // Direct REST ban — works even if member is not cached, and is idempotent
            const r = await axios.put(
              `${DISCORD_API}/guilds/${guildId}/bans/${entry.userId}`,
              { delete_message_seconds: 0, reason: `Blacklist Global Sweep: ${entry.reason}` },
              { headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" }, validateStatus: () => true }
            );
            if (r.status === 200 || r.status === 204) actioned++;
          } else {
            // For kick/timeout we need the member object
            const member = guild.members.cache.get(entry.userId)
              || await guild.members.fetch(entry.userId).catch(() => null);
            if (!member) continue;
            if (action === "kick") { await member.kick(`Blacklist Global Sweep: ${entry.reason}`); actioned++; }
            else if (action === "timeout") { await member.timeout(3600000, `Blacklist Global Sweep: ${entry.reason}`); actioned++; }
          }
        } catch {}
      }
    }

    res.json({ ok: true, actioned, guilds: guildsProcessed.size });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error interno" });
  }
});

// ─── Links / Platform URL ────────────────────────────────────────────────────
router.get("/admin/links", requireOwner, async (_req, res) => {
  const { getCustomBaseUrl, getSupportServerInvite, getAppealServerId, getAppealServerInvite } = await import("../app-config");
  const { db: dbI, botSettingsTable } = await import("@workspace/db");
  const [settings] = await dbI.select().from(botSettingsTable).limit(1);
  const custom = getCustomBaseUrl();

  function getAutoAppDomain(): string | null {
    if (process.env.REPLIT_APP_URL) return process.env.REPLIT_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean);
    if (domains?.length) return domains[0];
    if (process.env.REPLIT_DEV_DOMAIN) return process.env.REPLIT_DEV_DOMAIN;
    return null;
  }
  const domain = custom ? custom.replace(/^https?:\/\//, "").replace(/\/$/, "") : getAutoAppDomain();
  const base = domain ? `https://${domain}` : null;
  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const redirectUri = base ? `${base}/api/auth/discord/callback` : null;
  const params = redirectUri ? new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "identify email guilds" }).toString() : null;

  res.json({
    domain: domain || "(no detectado)",
    customBaseUrl: settings?.customBaseUrl || null,
    redirectUri,
    oauthUrl: params ? `https://discord.com/api/oauth2/authorize?${params}` : null,
    botInvite: clientId ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands` : null,
    clientIdConfigured: !!process.env.DISCORD_CLIENT_ID,
    clientSecretConfigured: !!process.env.DISCORD_CLIENT_SECRET,
    botTokenConfigured: !!process.env.DISCORD_BOT_TOKEN,
    groqKeyConfigured: !!process.env.GROQ_API_KEY,
    supportServerInvite: settings?.supportServerInvite || getSupportServerInvite(),
    appealServerId: settings?.appealServerId || getAppealServerId(),
    appealServerInvite: settings?.appealServerInvite || getAppealServerInvite(),
  });
});

router.put("/admin/links", requireOwner, async (req, res) => {
  const actor = (req as any).user!;
  const { customBaseUrl, supportServerInvite, appealServerId, appealServerInvite } = req.body as {
    customBaseUrl?: string;
    supportServerInvite?: string;
    appealServerId?: string;
    appealServerInvite?: string;
  };
  const { db: dbI, botSettingsTable } = await import("@workspace/db");
  const { setCustomBaseUrl, setPlatformLinks } = await import("../app-config");
  try {
    const url = customBaseUrl?.trim() || null;
    const values: Record<string, string | null> = { customBaseUrl: url };
    if (supportServerInvite !== undefined) values.supportServerInvite = supportServerInvite.trim() || null;
    if (appealServerId !== undefined) values.appealServerId = appealServerId.trim() || null;
    if (appealServerInvite !== undefined) values.appealServerInvite = appealServerInvite.trim() || null;

    const [existing] = await dbI.select().from(botSettingsTable).limit(1);
    if (existing) {
      await dbI.update(botSettingsTable).set(values as any);
    } else {
      await dbI.insert(botSettingsTable).values(values as any);
    }
    setCustomBaseUrl(url);
    setPlatformLinks({
      supportServerInvite: values.supportServerInvite,
      appealServerId: values.appealServerId,
      appealServerInvite: values.appealServerInvite,
    });
    await log(actor, "update_platform_links", url || "(cleared)", values);
    res.json({ ok: true, ...values });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error interno" });
  }
});

// ─── Bulk license revoke ────────────────────────────────────────────────────
router.post("/admin/licenses/bulk-revoke", requireOwner, async (req, res) => {
  const actor = (req as any).user!;
  const { plan } = req.body as { plan: string };
  if (!plan?.trim()) { res.status(400).json({ error: "plan requerido" }); return; }
  try {
    const result = await db
      .update(licensesTable)
      .set({ active: false })
      .where(and(eq(licensesTable.plan, plan), eq(licensesTable.active, true)));
    const revoked = result.rowCount ?? 0;
    await log(actor, "revoke_license", `bulk:${plan}`, { plan, revoked });
    res.json({ ok: true, revoked });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error interno" });
  }
});

export default router;
