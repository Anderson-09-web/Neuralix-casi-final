import { Router } from "express";
import axios from "axios";
import { db, guildConfigsTable, antiraidStatsTable, ticketsTable, verifiedUsersTable, logEntriesTable, backupsTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
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

router.get("/guilds/debug-bot", requireAuth, async (req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.json({ error: "DISCORD_BOT_TOKEN not set", tokenPresent: false }); return; }
  try {
    const r = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bot ${botToken.trim()}` },
      validateStatus: () => true,
    });
    res.json({
      tokenPresent: true,
      tokenLength: botToken.trim().length,
      discordStatus: r.status,
      discordGuildCount: Array.isArray(r.data) ? r.data.length : null,
      discordGuildIds: Array.isArray(r.data) ? r.data.map((g: any) => ({ id: g.id, name: g.name })) : null,
      discordError: r.status !== 200 ? r.data : null,
    });
  } catch (err: any) {
    res.json({ tokenPresent: true, error: err?.message });
  }
});

router.get("/guilds", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
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
      try {
        const botGuildsRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
          headers: { Authorization: `Bot ${botToken.trim()}` },
          validateStatus: () => true,
        });
        if (botGuildsRes.status === 200 && Array.isArray(botGuildsRes.data)) {
          const botGuildIds = new Set(botGuildsRes.data.map((g: any) => g.id));
          for (const g of adminGuilds) {
            botPresenceMap.set(g.id, botGuildIds.has(g.id));
          }
          const presentGuilds = adminGuilds.filter((g: any) => botGuildIds.has(g.id));
          await Promise.all(presentGuilds.map(async (g: any) => {
            try {
              const r = await axios.get(`${DISCORD_API}/guilds/${g.id}?with_counts=true`, {
                headers: { Authorization: `Bot ${botToken.trim()}` },
                validateStatus: () => true,
              });
              if (r.status === 200) {
                memberCountMap.set(g.id, r.data.approximate_member_count ?? r.data.member_count ?? 0);
              }
            } catch { /* ignore */ }
          }));
        } else {
          for (const g of adminGuilds) {
            botPresenceMap.set(g.id, configMap.get(g.id)?.botPresent || false);
          }
        }
      } catch {
        for (const g of adminGuilds) {
          botPresenceMap.set(g.id, configMap.get(g.id)?.botPresent || false);
        }
      }
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
  res.set("Cache-Control", "no-store");
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  const [[cfg], [openTicketsResult], [verifiedResult]] = await Promise.all([
    db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)),
    db.select({ count: count() }).from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.status, "open"))),
    db.select({ count: count() }).from(verifiedUsersTable).where(eq(verifiedUsersTable.guildId, guildId)),
  ]);

  let memberCount = cfg?.memberCount || 0;
  let botPresent = cfg?.botPresent || false;
  let guildName = cfg?.guildName || null;
  let guildIcon = cfg?.guildIcon || null;

  if (botToken) {
    try {
      const r = await axios.get(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
        headers: { Authorization: `Bot ${botToken.trim()}` },
        validateStatus: () => true,
      });
      if (r.status === 200) {
        botPresent = true;
        memberCount = r.data.approximate_member_count ?? r.data.member_count ?? memberCount;
        guildName = r.data.name || guildName;
        guildIcon = r.data.icon || guildIcon;
        ensureGuildConfig(guildId, guildName || guildId, guildIcon)
          .then(() => db.update(guildConfigsTable)
            .set({ botPresent: true, memberCount, guildName: guildName || undefined, guildIcon })
            .where(eq(guildConfigsTable.guildId, guildId)))
          .catch(() => {});
      } else {
        botPresent = false;
        db.update(guildConfigsTable).set({ botPresent: false }).where(eq(guildConfigsTable.guildId, guildId)).catch(() => {});
      }
    } catch { /* use cached value */ }
  }

  res.json({
    id: guildId,
    name: guildName || "Servidor",
    icon: guildIcon,
    memberCount,
    onlineMemberCount: Math.floor(memberCount * 0.3),
    botPresent,
    premiumTier: 0,
    openTickets: openTicketsResult?.count || 0,
    verifiedMembers: verifiedResult?.count || 0,
    antiraidEnabled: false,
    premiumActive: cfg?.premiumActive || false,
  });
});

router.get("/guilds/:guildId/stats", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const guildId = req.params.guildId as string;
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const [cfg, stats, openTickets, closedTickets, verifiedMembers, backupsCount, recentLogs] = await Promise.all([
      db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then((r) => r[0]),
      db.select().from(antiraidStatsTable).where(eq(antiraidStatsTable.guildId, guildId)).then((r) => r[0]),
      db.select({ count: count() }).from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.status, "open"))).then((r) => r[0]),
      db.select({ count: count() }).from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.status, "closed"))).then((r) => r[0]),
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

// ─── Guild channels (for smart selectors in dashboard) ────────────────────────
router.get("/guilds/:guildId/channels", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.json([]); return; }
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken.trim()}` },
      validateStatus: () => true,
    });
    if (r.status === 200 && Array.isArray(r.data)) {
      res.json(
        r.data
          .map((c: any) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parent_id ?? null, position: c.position ?? 0 }))
          .sort((a: any, b: any) => a.position - b.position),
      );
    } else {
      res.json([]);
    }
  } catch { res.json([]); }
});

// ─── Guild roles (for smart selectors in dashboard) ────────────────────────────
router.get("/guilds/:guildId/roles", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.json([]); return; }
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken.trim()}` },
      validateStatus: () => true,
    });
    if (r.status === 200 && Array.isArray(r.data)) {
      res.json(
        r.data
          .filter((role: any) => role.name !== "@everyone")
          .map((role: any) => ({ id: role.id, name: role.name, color: role.color, position: role.position }))
          .sort((a: any, b: any) => b.position - a.position),
      );
    } else {
      res.json([]);
    }
  } catch { res.json([]); }
});

export default router;
