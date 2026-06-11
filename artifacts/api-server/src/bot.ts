import {
  Client,
  GatewayIntentBits,
  Events,
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits,
  type GuildMember,
  type PartialGuildMember,
  type Message,
  type Interaction,
} from "discord.js";
import axios from "axios";
import {
  db,
  welcomeConfigsTable,
  goodbyeConfigsTable,
  antiraidConfigsTable,
  antiraidStatsTable,
  guildConfigsTable,
  ticketConfigsTable,
  ticketsTable,
  verificationConfigsTable,
  logsConfigsTable,
  blacklistTable,
  warningsTable,
  automodConfigsTable,
} from "@workspace/db";
import { eq, sql, and, count } from "drizzle-orm";
import { logger } from "./lib/logger";
import { setBotClient } from "./bot-state";

const DISCORD_API = "https://discord.com/api/v10";

// ─── In-memory rate trackers ──────────────────────────────────────────────────
const joinTracker  = new Map<string, number[]>();         // guildId → timestamps
const spamTracker  = new Map<string, number[]>();         // `guildId:userId` → timestamps
const nukeTracker  = new Map<string, { count: number; resetAt: number }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function processTemplate(
  template: string,
  opts: { guildName: string; mention: string; username: string; tag: string; memberCount: number },
): string {
  return template
    .replace(/\{user\}/gi, opts.mention)
    .replace(/\{username\}/gi, opts.username)
    .replace(/\{tag\}/gi, opts.tag)
    .replace(/\{server\}/gi, opts.guildName)
    .replace(/\{membercount\}/gi, opts.memberCount.toString())
    .replace(/\{date\}/gi, new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }));
}

function hexColor(hex?: string | null): number {
  if (!hex) return 0x5865f2;
  const n = parseInt(hex.replace("#", ""), 16);
  return isNaN(n) ? 0x5865f2 : n;
}

function buildWelcomePayload(
  cfg: { message?: string | null; embedEnabled: boolean; embedColor?: string | null; embedTitle?: string | null; embedDescription?: string | null; embedFooter?: string | null; embedImage?: string | null },
  opts: { guildName: string; mention: string; username: string; tag: string; memberCount: number },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (cfg.message) payload.content = processTemplate(cfg.message, opts);
  if (cfg.embedEnabled) {
    const embed: Record<string, unknown> = { color: hexColor(cfg.embedColor) };
    if (cfg.embedTitle) embed.title = processTemplate(cfg.embedTitle, opts);
    if (cfg.embedDescription) embed.description = processTemplate(cfg.embedDescription, opts);
    if (cfg.embedFooter) embed.footer = { text: processTemplate(cfg.embedFooter, opts) };
    if (cfg.embedImage) embed.image = { url: cfg.embedImage };
    if (embed.title || embed.description || embed.footer || embed.image) payload.embeds = [embed];
  }
  return payload;
}

async function sendToChannel(channelId: string, payload: Record<string, unknown>, botToken: string) {
  return axios.post(`${DISCORD_API}/channels/${channelId}/messages`, payload, {
    headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
    validateStatus: () => true,
  });
}

async function openDmChannel(userId: string, botToken: string): Promise<string | null> {
  const res = await axios.post(`${DISCORD_API}/users/@me/channels`, { recipient_id: userId }, {
    headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
    validateStatus: () => true,
  });
  return res.data?.id ?? null;
}

async function sendLog(channelId: string, embed: Record<string, unknown>, botToken: string) {
  try { await sendToChannel(channelId, { embeds: [embed] }, botToken); } catch {}
}

async function bumpStats(guildId: string, field: "blockedBot" | "blockedAlt" | "blockedSpam" | "blockedVpn") {
  try {
    const colMap: Record<string, string> = {
      blockedBot: "blocked_bot", blockedAlt: "blocked_alt",
      blockedSpam: "blocked_spam", blockedVpn: "blocked_vpn",
    };
    await db.update(antiraidStatsTable)
      .set({ [field]: sql`${sql.raw(colMap[field])} + 1`, totalDetections: sql`total_detections + 1`, detectedToday: sql`detected_today + 1` })
      .where(eq(antiraidStatsTable.guildId, guildId));
  } catch {}
}

function trackNukeAction(guildId: string, userId: string, threshold: number): boolean {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const entry = nukeTracker.get(key);
  if (!entry || now > entry.resetAt) {
    nukeTracker.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count >= threshold;
}

async function addWarning(guildId: string, userId: string, username: string, reason: string, severity: string, botToken: string, logChannel?: string | null) {
  try {
    await db.insert(warningsTable).values({
      guildId, userId, username, reason, severity,
      moderatorId: "bot", moderatorUsername: "Neuralix AutoMod",
    });

    // Count active warnings
    const [{ value: warnCount }] = await db.select({ value: count() }).from(warningsTable)
      .where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId), eq(warningsTable.active, true)));

    if (logChannel) {
      await sendLog(logChannel, {
        title: "AutoMod — Advertencia",
        description: `**Usuario:** <@${userId}> (\`${username}\`)\n**Razon:** ${reason}\n**Advertencias activas:** ${warnCount}`,
        color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AutoMod" },
      }, botToken);
    }

    return Number(warnCount);
  } catch { return 0; }
}

// ─── Bot factory ──────────────────────────────────────────────────────────────
export function startBot(): Client | undefined {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    logger.warn("DISCORD_BOT_TOKEN no configurado — bot deshabilitado");
    return undefined;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,    // privileged
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,  // privileged
    ],
  });

  // ─── Ready ────────────────────────────────────────────────────────────────
  client.on(Events.ClientReady, (c) => {
    setBotClient(client);
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "Bot de Discord listo");
  });

  // ─── Member Join ──────────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member: GuildMember | PartialGuildMember) => {
    const guildId   = member.guild.id;
    const userId    = member.user?.id ?? member.id;
    const username  = member.user?.username ?? "Desconocido";
    const discriminator = member.user?.discriminator ?? "0";
    const isBot     = member.user?.bot ?? false;

    logger.info({ guildId, userId, username, isBot }, "Nuevo miembro");

    try {
      const [antiraid, welcomeCfg, verifCfg, guildCfg, logCfg, blacklistEntry] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(blacklistTable).where(eq(blacklistTable.userId, userId)).then(([r]) => r),
      ]);

      const guildName   = member.guild.name ?? guildCfg?.guildName ?? "Servidor";
      const memberCount = member.guild.memberCount ?? guildCfg?.memberCount ?? 0;
      const logChannel  = logCfg?.enabled ? logCfg.channelId : null;

      // ── Global Blacklist ─────────────────────────────────────────────────
      if (blacklistEntry && (!blacklistEntry.expiresAt || new Date() < new Date(blacklistEntry.expiresAt))) {
        try {
          await (member as GuildMember).ban({ reason: `Blacklist Global: ${blacklistEntry.reason}` });
          logger.info({ guildId, userId, reason: blacklistEntry.reason }, "Usuario baneado (blacklist global)");
          if (logChannel) {
            await sendLog(logChannel, {
              title: "Blacklist Global — Usuario Baneado",
              description: `**Usuario:** \`${blacklistEntry.username}\` (\`${userId}\`)\n**Razon:** ${blacklistEntry.reason}\n**Baneado por:** ${blacklistEntry.addedByUsername ?? "Sistema"}\n**Fecha sancion:** ${new Date(blacklistEntry.createdAt).toLocaleDateString("es-ES")}`,
              color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Blacklist Global" },
            }, botToken);
          }
        } catch (e) { logger.error({ e }, "Error al banear usuario de blacklist"); }
        return;
      }

      // ── AntiRaid ─────────────────────────────────────────────────────────
      if (antiraid?.enabled) {
        // AntiBot
        if (antiraid.antiBot && isBot) {
          const whitelist = antiraid.antiBotWhitelist ?? [];
          if (!whitelist.includes(userId)) {
            try {
              await (member as GuildMember).kick("AntiRaid: Bot no autorizado");
              await bumpStats(guildId, "blockedBot");
              if (logChannel && logCfg?.logSecurity) {
                await sendLog(logChannel, { title: "AntiBot — Bot Bloqueado", description: `**Bot expulsado:** \`${username}\` (\`${userId}\`)`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
              }
            } catch (e) { logger.error({ e }, "Error al expulsar bot"); }
            return;
          }
        }

        // AntiAlt
        if (antiraid.antiAlt && !isBot && member.user?.createdTimestamp) {
          const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
          if (ageDays < (antiraid.antiAltMinAge ?? 7)) {
            try {
              await (member as GuildMember).kick(`AntiRaid: Cuenta nueva (${Math.floor(ageDays)} dias)`);
              await bumpStats(guildId, "blockedAlt");
              if (logChannel && logCfg?.logSecurity) {
                await sendLog(logChannel, { title: "AntiAlt — Cuenta Nueva", description: `**Expulsado:** \`${username}\` (\`${userId}\`)\n**Edad:** ${Math.floor(ageDays)} dias (min: ${antiraid.antiAltMinAge})`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
              }
            } catch (e) { logger.error({ e }, "Error al expulsar alt"); }
            return;
          }
        }

        // AntiJoin
        if (antiraid.antiJoin) {
          const now = Date.now();
          const windowMs  = (antiraid.antiJoinInterval ?? 10) * 1000;
          const threshold = antiraid.antiJoinThreshold ?? 5;
          const joins = (joinTracker.get(guildId) ?? []).filter((t) => now - t < windowMs);
          joins.push(now);
          joinTracker.set(guildId, joins);
          if (joins.length >= threshold) {
            const action = antiraid.antiJoinAction ?? "ban";
            try {
              if (action === "ban") await (member as GuildMember).ban({ reason: `AntiRaid: ${joins.length} joins en ${antiraid.antiJoinInterval}s` });
              else if (action === "kick") await (member as GuildMember).kick("AntiRaid: AntiJoin");
              else await (member as GuildMember).timeout(5 * 60_000, "AntiRaid: AntiJoin");
              if (logChannel && logCfg?.logSecurity) {
                await sendLog(logChannel, { title: "AntiJoin — Raid Detectado", description: `**Accion:** ${action}\n**Joins:** ${joins.length} en ${antiraid.antiJoinInterval}s\n**Usuario:** \`${username}\``, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
              }
            } catch (e) { logger.error({ e }, "Error en AntiJoin"); }
            return;
          }
        }
      }

      // ── Verificacion DM ───────────────────────────────────────────────────
      if (!isBot && verifCfg?.enabled) {
        try {
          const host = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://neuralix.replit.app";
          const dmId = await openDmChannel(userId, botToken);
          if (dmId) {
            await sendToChannel(dmId, { embeds: [{ title: `Verificacion — ${guildName}`, description: `Para acceder a **${guildName}** debes verificarte.\n\n[Verificarme ahora](${host}/verify?guild=${guildId}&user=${userId})`, color: 0x5865F2, footer: { text: "Neuralix Verificacion" } }] }, botToken);
          }
        } catch {}
      }

      // ── Welcome ───────────────────────────────────────────────────────────
      if (welcomeCfg?.enabled && welcomeCfg.channelId) {
        const opts = {
          guildName, mention: `<@${userId}>`, username,
          tag: discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username,
          memberCount,
        };
        const payload = buildWelcomePayload(welcomeCfg, opts);
        if (!payload.content && !payload.embeds) payload.content = `Bienvenido <@${userId}> a **${guildName}**!`;
        await sendToChannel(welcomeCfg.channelId, payload, botToken);

        if (!isBot && welcomeCfg.autoRoleIds?.length) {
          for (const roleId of welcomeCfg.autoRoleIds) {
            try { await (member as GuildMember).roles.add(roleId); } catch {}
          }
        }
        if (!isBot && welcomeCfg.dmEnabled && welcomeCfg.dmMessage) {
          try {
            const dmId = await openDmChannel(userId, botToken);
            if (dmId) await sendToChannel(dmId, { content: processTemplate(welcomeCfg.dmMessage, opts) }, botToken);
          } catch {}
        }
      }

      // ── Log member join ───────────────────────────────────────────────────
      if (logChannel && logCfg?.logMembers) {
        await sendLog(logChannel, {
          title: "Miembro Unido",
          description: `**Usuario:** \`${username}\` (<@${userId}>)\n**ID:** \`${userId}\`\n**Cuenta creada:** ${member.user?.createdAt?.toLocaleDateString("es-ES") ?? "Desconocido"}`,
          color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: `Miembros: ${memberCount}` },
        }, botToken);
      }

    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberAdd");
    }
  });

  // ─── Member Leave ─────────────────────────────────────────────────────────
  client.on(Events.GuildMemberRemove, async (member) => {
    const guildId  = member.guild.id;
    const userId   = member.user?.id ?? member.id;
    const username = member.user?.username ?? "Desconocido";

    try {
      const [goodbyeCfg, guildCfg, logCfg] = await Promise.all([
        db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const guildName   = member.guild.name ?? guildCfg?.guildName ?? "Servidor";
      const memberCount = member.guild.memberCount ?? guildCfg?.memberCount ?? 0;
      const logChannel  = logCfg?.enabled ? logCfg.channelId : null;

      if (goodbyeCfg?.enabled && goodbyeCfg.channelId) {
        const opts = { guildName, mention: `<@${userId}>`, username, tag: username, memberCount };
        const payload = buildWelcomePayload(goodbyeCfg, opts);
        if (!payload.content && !payload.embeds) payload.content = `**${username}** ha abandonado **${guildName}**.`;
        await sendToChannel(goodbyeCfg.channelId, payload, botToken);
      }

      if (logChannel && logCfg?.logMembers) {
        await sendLog(logChannel, {
          title: "Miembro Salido",
          description: `**Usuario:** \`${username}\` (<@${userId}>)\n**ID:** \`${userId}\``,
          color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: `Miembros: ${memberCount}` },
        }, botToken);
      }
    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberRemove");
    }
  });

  // ─── Message Create — AntiSpam, AntiLinks, AntiMassMention, AutoMod ───────
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot) return;
    const guildId  = message.guild.id;
    const userId   = message.author.id;
    const username = message.author.username;
    const content  = message.content ?? "";
    const now      = Date.now();

    try {
      const [antiraid, automod, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(automodConfigsTable).where(eq(automodConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);

      const logChannel    = logCfg?.enabled ? logCfg.channelId : null;
      const automodLog    = automod?.logChannelId ?? logChannel;

      // ── AntiSpam (antiraid module) ────────────────────────────────────────
      if (antiraid?.enabled && antiraid.antiSpam) {
        const windowMs = (antiraid.antiSpamInterval ?? 5) * 1000;
        const limit    = antiraid.antiSpamLimit ?? 5;
        const key      = `${guildId}:${userId}`;
        const msgs     = (spamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
        msgs.push(now);
        spamTracker.set(key, msgs);
        if (msgs.length >= limit) {
          spamTracker.delete(key);
          try {
            await message.delete().catch(() => {});
            const action = antiraid.antiSpamAction ?? "mute";
            if (action === "ban") await message.member?.ban({ reason: "AntiRaid: Spam" });
            else if (action === "kick") await message.member?.kick("AntiRaid: Spam");
            else await message.member?.timeout(10 * 60_000, "AntiRaid: Spam");
            await bumpStats(guildId, "blockedSpam");
            if (logChannel && logCfg?.logSecurity) {
              await sendLog(logChannel, { title: "AntiSpam Activado", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Accion:** ${action}\n**Mensajes:** ${msgs.length} en ${antiraid.antiSpamInterval}s`, color: 0xFF6B35, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
            }
          } catch {}
          return;
        }
      }

      // ── AntiLinks ─────────────────────────────────────────────────────────
      if (antiraid?.enabled && antiraid.antiLinks && content) {
        const urlRx = /https?:\/\/[^\s]+|discord\.gg\/[^\s]+/gi;
        const links = content.match(urlRx);
        if (links) {
          const allowed  = antiraid.allowedDomains ?? [];
          const blocked  = antiraid.blockedDomains ?? [];
          const hasBlocked = links.some((link) => {
            try {
              const hn = new URL(link.startsWith("discord.gg") ? `https://${link}` : link).hostname;
              if (allowed.some((d) => hn.includes(d))) return false;
              if (blocked.length > 0 && !blocked.some((d) => hn.includes(d))) return false;
              return true;
            } catch { return true; }
          });
          if (hasBlocked) {
            await message.delete().catch(() => {});
            if (logChannel && logCfg?.logMessages) {
              await sendLog(logChannel, { title: "AntiLinks — Enlace Bloqueado", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Mensaje:** ${content.substring(0, 120)}`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
            }
            return;
          }
        }
      }

      // ── AntiMassMention ───────────────────────────────────────────────────
      if (antiraid?.enabled && antiraid.antiMassMention) {
        const limit = antiraid.massMentionLimit ?? 5;
        const mc    = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
        if (mc >= limit) {
          await message.delete().catch(() => {});
          await message.member?.timeout(5 * 60_000, "AntiRaid: Mass mention").catch(() => {});
          if (logChannel && logCfg?.logSecurity) {
            await sendLog(logChannel, { title: "AntiMassMention", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Menciones:** ${mc}`, color: 0xFF6B35, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
          }
          return;
        }
      }

      // ── AutoMod ───────────────────────────────────────────────────────────
      if (automod?.enabled && content) {
        const exemptRoles    = automod.exemptRoles ?? [];
        const exemptChannels = automod.exemptChannels ?? [];

        // Check if exempt
        const memberRoles = message.member?.roles.cache.map((r) => r.id) ?? [];
        if (exemptChannels.includes(message.channelId) || exemptRoles.some((r) => memberRoles.includes(r))) {
          return;
        }

        // Bad words
        if (automod.badWordsEnabled && automod.badWords?.length) {
          const lower = content.toLowerCase();
          const hasBad = automod.badWords.some((w) => lower.includes(w.toLowerCase()));
          if (hasBad) {
            await message.delete().catch(() => {});
            const warnCount = await addWarning(guildId, userId, username, "Palabra prohibida detectada", "medium", botToken, automodLog);
            if (warnCount >= (automod.warnThreshold ?? 3)) {
              const action = automod.warnAction ?? "mute";
              if (action === "ban") await message.member?.ban({ reason: "AutoMod: Limite de advertencias" }).catch(() => {});
              else if (action === "kick") await message.member?.kick("AutoMod: Limite de advertencias").catch(() => {});
              else await message.member?.timeout((automod.warnDuration ?? 10) * 60_000, "AutoMod: Limite de advertencias").catch(() => {});
            }
            return;
          }
        }

        // Caps detection
        if (automod.capsEnabled && content.length >= (automod.capsMinLength ?? 10)) {
          const upper = content.replace(/[^a-zA-Z]/g, "").toUpperCase();
          const all   = content.replace(/[^a-zA-Z]/g, "");
          if (all.length > 0 && (upper.length / all.length) * 100 >= (automod.capsThreshold ?? 70)) {
            await message.delete().catch(() => {});
            if (automodLog) {
              await sendLog(automodLog, { title: "AutoMod — Mayusculas Excesivas", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Mensaje eliminado**`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AutoMod" } }, botToken);
            }
            return;
          }
        }

        // Discord invite detection
        if (automod.invitesEnabled) {
          const inviteRx = /discord\.gg\/|discord\.com\/invite\//i;
          if (inviteRx.test(content)) {
            await message.delete().catch(() => {});
            const warnCount = await addWarning(guildId, userId, username, "Invitacion no autorizada", "low", botToken, automodLog);
            if (warnCount >= (automod.warnThreshold ?? 3)) {
              await message.member?.timeout((automod.warnDuration ?? 10) * 60_000, "AutoMod: Invitaciones").catch(() => {});
            }
            return;
          }
        }

        // Zalgo detection
        if (automod.zalgoEnabled) {
          const zalgoRx = /[\u0300-\u036f\u0489\u1dc0-\u1dff\u20d0-\u20ff]{3,}/;
          if (zalgoRx.test(content)) {
            await message.delete().catch(() => {});
            if (automodLog) {
              await sendLog(automodLog, { title: "AutoMod — Texto Zalgo Detectado", description: `**Usuario:** \`${username}\` (<@${userId}>)`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AutoMod" } }, botToken);
            }
            return;
          }
        }
      }

    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en messageCreate");
    }
  });

  // ─── Message Update — log edits ───────────────────────────────────────────
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!newMsg.guild || newMsg.author?.bot) return;
    const guildId = newMsg.guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      if (!logCfg?.enabled || !logCfg.logMessages || !logCfg.channelId) return;
      if (!oldMsg.content || !newMsg.content || oldMsg.content === newMsg.content) return;
      await sendLog(logCfg.channelId, {
        title: "Mensaje Editado",
        description: `**Usuario:** <@${newMsg.author?.id}>\n**Canal:** <#${newMsg.channelId}>\n**Antes:** ${oldMsg.content?.substring(0, 200) ?? "Desconocido"}\n**Despues:** ${newMsg.content?.substring(0, 200)}`,
        color: 0x5865F2, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
      }, botToken);
    } catch {}
  });

  // ─── Message Delete — log deletions ──────────────────────────────────────
  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return;
    const guildId = message.guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      if (!logCfg?.enabled || !logCfg.logMessages || !logCfg.channelId) return;
      if (!message.content) return;
      await sendLog(logCfg.channelId, {
        title: "Mensaje Eliminado",
        description: `**Usuario:** <@${message.author?.id}>\n**Canal:** <#${message.channelId}>\n**Contenido:** ${message.content.substring(0, 300)}`,
        color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
      }, botToken);
    } catch {}
  });

  // ─── Channel Create — antiChannelCreate + logs ────────────────────────────
  client.on(Events.ChannelCreate, async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const guildId = channel.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      let executorTag: string | undefined;
      try {
        const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) {
          executorId = entry.executor?.id;
          executorTag = entry.executor?.username;
        }
      } catch {}

      if (logChannel && logCfg?.logChannels) {
        await sendLog(logChannel, {
          title: "Canal Creado",
          description: `**Canal:** <#${channel.id}> (#${(channel as any).name})\n**Tipo:** ${channel.type}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`,
          color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (antiraid?.enabled && antiraid.antiChannelCreate && executorId) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          try {
            const member = channel.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Creacion masiva de canales" });
              else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke");
              else await member.roles.set([], "AntiNuke: Permisos revocados");
            }
          } catch {}
        }
      }
    } catch {}
  });

  // ─── Channel Delete — antiChannelDelete + logs ────────────────────────────
  client.on(Events.ChannelDelete, async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const guildId = channel.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      let executorTag: string | undefined;
      try {
        const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) {
          executorId = entry.executor?.id;
          executorTag = entry.executor?.username;
        }
      } catch {}

      if (logChannel && logCfg?.logChannels) {
        await sendLog(logChannel, {
          title: "Canal Eliminado",
          description: `**Canal:** #${(channel as any).name ?? "desconocido"}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`,
          color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (antiraid?.enabled && executorId && (antiraid.antiNuke || antiraid.antiChannelDelete)) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          try {
            const member = channel.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Destruccion masiva" });
              else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke");
              else await member.roles.set([], "AntiNuke: Permisos revocados");
            }
            if (logChannel) {
              await sendLog(logChannel, { title: "AntiNuke — Ataque Detectado", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken);
            }
          } catch {}
        }
      }
    } catch {}
  });

  // ─── Role Create — antiRoleCreate + logs ─────────────────────────────────
  client.on(Events.GuildRoleCreate, async (role) => {
    const guildId = role.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      let executorTag: string | undefined;
      try {
        const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) {
          executorId = entry.executor?.id;
          executorTag = entry.executor?.username;
        }
      } catch {}

      if (logChannel && logCfg?.logRoles) {
        await sendLog(logChannel, {
          title: "Rol Creado",
          description: `**Rol:** @${role.name}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`,
          color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (antiraid?.enabled && antiraid.antiRoleCreate && executorId) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          const member = role.guild.members.cache.get(executorId);
          if (member) {
            if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Creacion masiva de roles" }).catch(() => {});
            else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke").catch(() => {});
            else await member.roles.set([], "AntiNuke").catch(() => {});
          }
        }
      }
    } catch {}
  });

  // ─── Role Delete — antiRoleDelete + logs ─────────────────────────────────
  client.on(Events.GuildRoleDelete, async (role) => {
    const guildId = role.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      let executorTag: string | undefined;
      try {
        const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) {
          executorId = entry.executor?.id;
          executorTag = entry.executor?.username;
        }
      } catch {}

      if (logChannel && logCfg?.logRoles) {
        await sendLog(logChannel, {
          title: "Rol Eliminado",
          description: `**Rol:** @${role.name}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`,
          color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (antiraid?.enabled && executorId && (antiraid.antiNuke || antiraid.antiRoleDelete)) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          const member = role.guild.members.cache.get(executorId);
          if (member) {
            if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Destruccion masiva de roles" }).catch(() => {});
            else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke").catch(() => {});
            else await member.roles.set([], "AntiNuke").catch(() => {});
          }
        }
      }
    } catch {}
  });

  // ─── Ban Add — antiBanMass + logs ────────────────────────────────────────
  client.on(Events.GuildBanAdd, async (ban) => {
    const guildId = ban.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      try {
        const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) executorId = entry.executor?.id;
      } catch {}

      if (logChannel && logCfg?.logModeration) {
        await sendLog(logChannel, {
          title: "Miembro Baneado",
          description: `**Usuario:** \`${ban.user.username}\` (\`${ban.user.id}\`)\n**Razon:** ${ban.reason ?? "Sin razon"}`,
          color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (antiraid?.enabled && executorId && (antiraid.antiNuke || antiraid.antiBanMass)) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          const member = ban.guild.members.cache.get(executorId);
          if (member) {
            if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Bans masivos" }).catch(() => {});
            else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke").catch(() => {});
            else await member.roles.set([], "AntiNuke").catch(() => {});
          }
          if (logChannel) {
            await sendLog(logChannel, { title: "AntiNuke — Bans Masivos", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken);
          }
        }
      }
    } catch {}
  });

  // ─── Giveaway reaction handler ─────────────────────────────────────────────
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== "🎉") return;
    try {
      const messageId = reaction.message.id;
      const [giveaway] = await db.select().from(giveawaysTable).where(
        and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.status, "active")),
      );
      if (!giveaway) return;
      const entrants = giveaway.entrants ?? [];
      if (!entrants.includes(user.id)) {
        entrants.push(user.id);
        await db.update(giveawaysTable).set({ entrants, updatedAt: new Date() }).where(eq(giveawaysTable.messageId, messageId));
      }
    } catch {}
  });

  // ─── Ticket interaction ───────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("ticket_open")) return;
    if (!interaction.guild) return;

    const guildId  = interaction.guild.id;
    const userId   = interaction.user.id;
    const username = interaction.user.username;

    try {
      await interaction.deferReply({ ephemeral: true });

      const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
      if (!cfg?.enabled) {
        await interaction.editReply({ content: "El sistema de tickets no esta activo." });
        return;
      }

      const openTickets = await db.select().from(ticketsTable).where(
        and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId), eq(ticketsTable.status, "open")),
      );
      if (openTickets.length >= (cfg.maxTicketsPerUser ?? 1)) {
        await interaction.editReply({ content: `Ya tienes ${openTickets.length} ticket(s) abierto(s). Maximo: ${cfg.maxTicketsPerUser}.` });
        return;
      }

      const safeUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "").substring(0, 20) || "usuario";
      const channelName = (cfg.ticketNameFormat ?? "ticket-{username}").replace("{username}", safeUsername).replace("{userid}", userId).substring(0, 100);

      const overwrites: any[] = [
        { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      if (cfg.supportRoleId) {
        overwrites.push({ id: cfg.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: channelName, type: ChannelType.GuildText,
        parent: cfg.categoryId ?? undefined, permissionOverwrites: overwrites,
        reason: `Ticket de ${username}`,
      });

      const [ticket] = await db.insert(ticketsTable).values({
        guildId, channelId: ticketChannel.id, userId, username,
        subject: `Ticket de ${username}`, status: "open",
      }).returning();

      const openMsg = (cfg.openMessage ?? "Hola <@{user}>, tu ticket fue creado. Pronto te atendemos.")
        .replace("{user}", userId).replace("{username}", username);

      await ticketChannel.send({
        content: cfg.mentionSupport && cfg.supportRoleId ? `<@&${cfg.supportRoleId}> ${openMsg}` : openMsg,
      } as any);

      if (cfg.logsChannelId) {
        await sendToChannel(cfg.logsChannelId, { embeds: [{ title: "Nuevo Ticket", description: `**Usuario:** <@${userId}>\n**Canal:** <#${ticketChannel.id}>\n**ID:** #${ticket.id}`, color: 0x5865F2, timestamp: new Date().toISOString(), footer: { text: "Neuralix Tickets" } }] }, botToken);
      }

      await interaction.editReply({ content: `Tu ticket fue creado: <#${ticketChannel.id}>` });
      logger.info({ guildId, userId, ticketId: ticket.id }, "Ticket creado");

    } catch (err: any) {
      logger.error({ err, guildId, userId }, "Error al crear ticket");
      await interaction.editReply({ content: "Error al crear el ticket." }).catch(() => {});
    }
  });

  client.login(botToken).catch((err) => {
    logger.error({ err }, "Error al conectar bot");
  });

  return client;
}
