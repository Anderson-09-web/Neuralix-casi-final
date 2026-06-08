import { Router } from "express";
import axios from "axios";
import { db, guildConfigsTable, antiraidStatsTable, ticketsTable, verifiedUsersTable, logEntriesTable, backupsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";
const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

function hasAdminPerms(permissions: string): boolean {
  const perms = BigInt(permissions);
  return (perms & BigInt(ADMINISTRATOR)) !== 0n || (perms & BigInt(MANAGE_GUILD)) !== 0n;
}

async function ensureGuildConfig(guildId: string, guildName: string, guildIcon: string | null) {
  const existing = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  if (existing.length === 0) {
    await db.insert(guildConfigsTable).values({ guildId, guildName, guildIcon: guildIcon || null, memberCount: 0, botPresent: false }).onConflictDoNothing();
  }
}

router.get("/guilds", requireAuth, async (req, res) => {
  const user = (req as any).user;
  try {
    const guildsRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    const adminGuilds = guildsRes.data.filter((g: any) => hasAdminPerms(g.permissions));

    const guildConfigs = await db.select().from(guildConfigsTable);
    const configMap = new Map(guildConfigs.map((c) => [c.guildId, c]));

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const botPresenceMap = new Map<string, boolean>();
    const memberCountMap = new Map<string, number>();
    if (botToken) {
      await Promise.all(adminGuilds.map(async (g: any) => {
        try {
          const r = await axios.get(`${DISCORD_API}/guilds/${g.id}?with_counts=true`, {
            headers: { Authorization: `Bot ${botToken}` },
            validateStatus: () => true,
          });
          botPresenceMap.set(g.id, r.status === 200);
          if (r.status === 200) {
            const mc = r.data.approximate_member_count ?? r.data.member_count ?? 0;
            memberCountMap.set(g.id, mc);
          }
        } catch {
          botPresenceMap.set(g.id, configMap.get(g.id)?.botPresent || false);
        }
      }));
    }

    const result = adminGuilds.map((g: any) => {
      const cfg = configMap.get(g.id);
      const botPresent = botToken ? (botPresenceMap.get(g.id) ?? false) : (cfg?.botPresent || false);
      const memberCount = memberCountMap.get(g.id) ?? cfg?.memberCount ?? 0;
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        memberCount,
        botPresent,
        premiumTier: g.premium_tier || 0,
        permissions: g.permissions,
      };
    });

    for (const g of adminGuilds) {
      const present = botPresenceMap.get(g.id) ?? false;
      const memberCount = memberCountMap.get(g.id) ?? 0;
      if (botToken) {
        ensureGuildConfig(g.id, g.name, g.icon)
          .then(() =>
            db.update(guildConfigsTable)
              .set({ botPresent: present, ...(memberCount > 0 ? { memberCount } : {}) })
              .where(eq(guildConfigsTable.guildId, g.id))
          )
          .catch(() => {});
      } else {
        ensureGuildConfig(g.id, g.name, g.icon).catch(() => {});
      }
    }

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch guilds");
    res.status(500).json({ error: "Failed to fetch guilds from Discord. Tu sesion puede haber expirado — vuelve a iniciar sesion." });
  }
});

router.get("/guilds/:guildId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));

  const [openTicketsResult] = await db.select({ count: count() }).from(ticketsTable).where(eq(ticketsTable.guildId, guildId));
  const [verifiedResult] = await db.select({ count: count() }).from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));

  res.json({
    id: guildId,
    name: cfg?.guildName || "Servidor",
    icon: cfg?.guildIcon || null,
    memberCount: cfg?.memberCount || 0,
    onlineMemberCount: Math.floor((cfg?.memberCount || 0) * 0.3),
    botPresent: cfg?.botPresent || false,
    premiumTier: 0,
    openTickets: openTicketsResult?.count || 0,
    verifiedMembers: verifiedResult?.count || 0,
    antiraidEnabled: false,
    premiumActive: cfg?.premiumActive || false,
  });
});

router.get("/guilds/:guildId/stats", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const [cfg, stats, openTickets, closedTickets, verifiedMembers, backupsCount, recentLogs] = await Promise.all([
      db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then((r) => r[0]),
      db.select().from(antiraidStatsTable).where(eq(antiraidStatsTable.guildId, guildId)).then((r) => r[0]),
      db.select({ count: count() }).from(ticketsTable).where(eq(ticketsTable.guildId, guildId)).then((r) => r[0]),
      db.select({ count: count() }).from(ticketsTable).where(eq(ticketsTable.guildId, guildId)).then((r) => r[0]),
      db.select({ count: count() }).from(verifiedUsersTable).where(eq(verifiedUsersTable.guildId, guildId)).then((r) => r[0]),
      db.select({ count: count() }).from(backupsTable).where(eq(backupsTable.guildId, guildId)).then((r) => r[0]),
      db.select({ count: count() }).from(logEntriesTable).where(eq(logEntriesTable.guildId, guildId)).then((r) => r[0]),
    ]);

    let memberCount = cfg?.memberCount || 0;

    if (botToken) {
      try {
        const r = await axios.get(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
          headers: { Authorization: `Bot ${botToken}` },
          validateStatus: () => true,
        });
        if (r.status === 200) {
          memberCount = r.data.approximate_member_count ?? r.data.member_count ?? memberCount;
          await db.update(guildConfigsTable).set({ memberCount, botPresent: true }).where(eq(guildConfigsTable.guildId, guildId)).catch(() => {});
        }
      } catch { /* use cached value */ }
    }

    res.json({
      guildId,
      memberCount,
      onlineCount: Math.floor(memberCount * 0.3),
      openTickets: openTickets?.count || 0,
      closedTickets: closedTickets?.count || 0,
      verifiedMembers: verifiedMembers?.count || 0,
      antiraidDetections: stats?.totalDetections || 0,
      recentLogs: recentLogs?.count || 0,
      backupsCount: backupsCount?.count || 0,
    });
  } catch (err: any) {
    console.error("Failed to fetch guild stats:", err?.message ?? err);
    res.json({ guildId, memberCount: 0, onlineCount: 0, openTickets: 0, closedTickets: 0, verifiedMembers: 0, antiraidDetections: 0, recentLogs: 0, backupsCount: 0 });
  }
});

router.get("/guilds/:guildId/bot-status", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const addBotUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}`;

  let present = false;
  if (botToken) {
    try {
      const guildRes = await axios.get(`${DISCORD_API}/guilds/${guildId}`, {
        headers: { Authorization: `Bot ${botToken}` },
        validateStatus: () => true,
      });
      present = guildRes.status === 200;
      if (present) {
        await db.update(guildConfigsTable)
          .set({ botPresent: true, memberCount: guildRes.data.approximate_member_count || guildRes.data.member_count || 0 })
          .where(eq(guildConfigsTable.guildId, guildId))
          .catch(() => {});
      } else {
        await db.update(guildConfigsTable)
          .set({ botPresent: false })
          .where(eq(guildConfigsTable.guildId, guildId))
          .catch(() => {});
      }
    } catch {
      const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
      present = cfg?.botPresent || false;
    }
  } else {
    const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    present = cfg?.botPresent || false;
  }

  res.json({ present, addBotUrl });
});

export default router;
