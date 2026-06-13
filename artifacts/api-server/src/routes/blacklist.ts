import { Router } from "express";
import { db, blacklistTable, adminActivityLogsTable, guildConfigsTable, logsConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminAccess } from "../lib/auth";
import { getBotClient } from "../bot-state";
import axios from "axios";

const router = Router();

const APPEAL_SERVER_ID = "1493023527887048724";
const APPEAL_INVITE = `https://discord.gg/wukr8apdQq`;
const DISCORD_API = "https://discord.com/api/v10";

async function log(actor: any, action: string, target?: string, details?: Record<string, any>) {
  try {
    await db.insert(adminActivityLogsTable).values({
      actorId: actor.discordId || "unknown",
      actorUsername: actor.username || "Desconocido",
      action, target: target || null, details: details || null,
    });
  } catch {}
}

async function sendLog(channelId: string, embed: Record<string, unknown>, botToken: string) {
  try {
    await axios.post(`${DISCORD_API}/channels/${channelId}/messages`, { embeds: [embed] }, {
      headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
      validateStatus: () => true,
    });
  } catch {}
}

function getLogChannel(logCfg: any): string | null {
  if (!logCfg?.enabled) return null;
  return logCfg.securityChannelId || logCfg.channelId || null;
}

function isImageUrl(url: string): boolean {
  return /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url);
}

async function sweepUserFromAllGuilds(userId: string, reason: string, evidence?: string[]): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return;
  const client = getBotClient();
  if (!client) return;

  // Build evidence section for DM
  const evidenceList = (evidence ?? []).filter(Boolean);
  const evidenceText = evidenceList.length
    ? `\n\n**Pruebas registradas:**\n${evidenceList.map((e, i) => `[${i + 1}] ${e}`).join("\n")}`
    : "";
  const firstImage = evidenceList.find(isImageUrl);

  // Send DM to the user before sweeping
  try {
    const dmRes = await axios.post(`${DISCORD_API}/users/@me/channels`, { recipient_id: userId }, {
      headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
      validateStatus: () => true,
    });
    if (dmRes.data?.id) {
      const embed: Record<string, any> = {
        title: "Has sido incluido en la Blacklist Global de Neuralix",
        description: `Fuiste baneado/expulsado de todos los servidores protegidos por **Neuralix**.\n\n**Razon:** ${reason}${evidenceText}\n\n**¿Crees que es un error?**\nPuedes apelar uniendote a nuestro servidor de apelaciones:\n${APPEAL_INVITE}\n\n**ID Servidor de Apelaciones:** \`${APPEAL_SERVER_ID}\``,
        color: 0xED4245,
        footer: { text: "Neuralix Blacklist Global" },
        timestamp: new Date().toISOString(),
      };
      if (firstImage) embed.image = { url: firstImage };
      await axios.post(`${DISCORD_API}/channels/${dmRes.data.id}/messages`, { embeds: [embed] }, {
        headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
        validateStatus: () => true,
      });
    }
  } catch {}

  // Sweep from all guilds
  for (const [, guild] of client.guilds.cache) {
    try {
      const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guild.id));
      const action = guildCfg?.blacklistAction || "ban";

      const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        // If not in cache, try direct ban via API (works even if member not cached)
        if (action === "ban") {
          await axios.put(`${DISCORD_API}/guilds/${guild.id}/bans/${userId}`, { reason: `Blacklist Global: ${reason}` }, {
            headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
            validateStatus: () => true,
          });
        }
        continue;
      }

      if (action === "kick") {
        await member.kick(`Blacklist Global: ${reason}`);
      } else {
        await member.ban({ reason: `Blacklist Global: ${reason}` });
      }

      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guild.id));
      const logChannel = getLogChannel(logCfg);
      if (logChannel) {
        await sendLog(logChannel, {
          title: `Blacklist Global — Usuario ${action === "kick" ? "Expulsado" : "Baneado"} (Inmediato)`,
          description: `**Usuario:** \`${userId}\`\n**Razon:** ${reason}\n**Accion:** ${action}\n**Sistema:** Blacklist instantanea`,
          color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Blacklist Global" },
        }, botToken);
      }
    } catch {}
  }
}

// Endpoint publico para que el bot verifique usuarios al unirse al servidor
router.get("/blacklist/check/:discordId", async (req, res) => {
  const discordId = req.params.discordId as string;
  if (!discordId) { res.status(400).json({ error: "discordId requerido" }); return; }
  const [entry] = await db.select().from(blacklistTable).where(eq(blacklistTable.userId, discordId));
  if (!entry) {
    // Even if not blacklisted, return basic Discord user info if possible
    const botToken = process.env.DISCORD_BOT_TOKEN;
    let discordUser: any = null;
    if (botToken) {
      const r = await axios.get(`${DISCORD_API}/users/${discordId}`, {
        headers: { Authorization: `Bot ${botToken}` }, validateStatus: () => true,
      });
      if (r.status === 200) discordUser = r.data;
    }
    res.json({
      blacklisted: false,
      discordId,
      discordUsername: discordUser?.global_name || discordUser?.username || null,
      discordAvatar: discordUser?.avatar
        ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.${discordUser.avatar.startsWith("a_") ? "gif" : "png"}`
        : null,
    });
    return;
  }

  if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) {
    await db.delete(blacklistTable).where(eq(blacklistTable.userId, discordId));
    res.json({ blacklisted: false, expired: true });
    return;
  }

  // Fetch live Discord user info to enrich the response
  const botToken = process.env.DISCORD_BOT_TOKEN;
  let discordUser: any = null;
  if (botToken) {
    const r = await axios.get(`${DISCORD_API}/users/${discordId}`, {
      headers: { Authorization: `Bot ${botToken}` }, validateStatus: () => true,
    });
    if (r.status === 200) discordUser = r.data;
  }

  res.json({
    blacklisted: true,
    userId: entry.userId,
    username: entry.username,
    reason: entry.reason,
    evidence: entry.evidence || [],
    addedAt: entry.createdAt,
    addedBy: entry.addedByUsername,
    durationDays: entry.durationDays ?? null,
    expiresAt: entry.expiresAt ?? null,
    permanent: !entry.expiresAt,
    appealServerId: APPEAL_SERVER_ID,
    appealInvite: APPEAL_INVITE,
    // Live Discord user info
    discordUsername: discordUser?.global_name || discordUser?.username || entry.username,
    discordGlobalName: discordUser?.global_name || null,
    discordAvatar: discordUser?.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.${discordUser.avatar.startsWith("a_") ? "gif" : "png"}`
      : (entry.avatarHash
        ? `https://cdn.discordapp.com/avatars/${discordId}/${entry.avatarHash}.png`
        : null),
  });
});

router.get("/blacklist/appeal-server", async (_req, res) => {
  res.json({ serverId: APPEAL_SERVER_ID, invite: APPEAL_INVITE });
});

router.get("/blacklist", requireAdminAccess("manage_blacklist"), async (_req, res) => {
  const entries = await db.select().from(blacklistTable).orderBy(blacklistTable.createdAt);
  res.json(entries);
});

router.post("/blacklist", requireAdminAccess("manage_blacklist"), async (req, res) => {
  const { userId, username, avatarHash, reason, evidence, durationDays } = req.body;
  const actor = (req as any).user;

  const parsedDuration = durationDays && Number(durationDays) > 0 ? Number(durationDays) : null;
  const expiresAt = parsedDuration
    ? new Date(Date.now() + parsedDuration * 24 * 60 * 60 * 1000)
    : null;

  const existing = await db.select().from(blacklistTable).where(eq(blacklistTable.userId, userId as string));
  if (existing.length > 0) {
    const prev = existing[0];
    const history = [...(prev.sanctionHistory || []), { action: "update", reason, by: actor.username, at: new Date().toISOString() }];
    const [updated] = await db.update(blacklistTable)
      .set({
        username, avatarHash: avatarHash || null, reason, evidence: evidence || [],
        sanctionHistory: history, addedByUsername: actor.username,
        durationDays: parsedDuration, expiresAt,
      })
      .where(eq(blacklistTable.userId, userId as string)).returning();
    await log(actor, "update_blacklist", username, { userId, reason, durationDays: parsedDuration });

    // Trigger immediate sweep for updated entry
    sweepUserFromAllGuilds(userId as string, reason, evidence || []).catch(() => {});

    res.json(updated);
    return;
  }

  const [entry] = await db.insert(blacklistTable).values({
    userId: userId as string, username, avatarHash: avatarHash || null, reason,
    addedBy: actor.discordId, addedByUsername: actor.username,
    evidence: evidence || [],
    durationDays: parsedDuration,
    expiresAt,
    sanctionHistory: [{ action: "blacklist", reason, by: actor.username, at: new Date().toISOString() }],
  }).returning();
  await log(actor, "add_blacklist", username, { userId, reason, durationDays: parsedDuration });

  // Trigger immediate sweep for new entry
  sweepUserFromAllGuilds(userId as string, reason, evidence || []).catch(() => {});

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

export { APPEAL_SERVER_ID, APPEAL_INVITE };
export default router;
