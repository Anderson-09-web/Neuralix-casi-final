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
} from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "./lib/logger";

const DISCORD_API = "https://discord.com/api/v10";

// ─── In-memory rate trackers ──────────────────────────────────────────────────
// joinTracker:  guildId → timestamps of recent joins
const joinTracker = new Map<string, number[]>();
// spamTracker:  `${guildId}:${userId}` → timestamps of recent messages
const spamTracker = new Map<string, number[]>();
// nukeTracker:  `${guildId}:${userId}` → { count, resetAt }
const nukeTracker = new Map<string, { count: number; resetAt: number }>();

// ─── Template helpers ─────────────────────────────────────────────────────────
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

// ─── Discord REST helpers ─────────────────────────────────────────────────────
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

async function sendLog(
  channelId: string,
  embed: Record<string, unknown>,
  botToken: string,
) {
  try {
    await sendToChannel(channelId, { embeds: [embed] }, botToken);
  } catch {}
}

async function bumpStats(
  guildId: string,
  field: "blockedBot" | "blockedAlt" | "blockedSpam" | "blockedVpn",
) {
  try {
    const colMap: Record<string, string> = {
      blockedBot: "blocked_bot", blockedAlt: "blocked_alt",
      blockedSpam: "blocked_spam", blockedVpn: "blocked_vpn",
    };
    await db.update(antiraidStatsTable)
      .set({
        [field]: sql`${sql.raw(colMap[field])} + 1`,
        totalDetections: sql`total_detections + 1`,
        detectedToday: sql`detected_today + 1`,
      })
      .where(eq(antiraidStatsTable.guildId, guildId));
  } catch {}
}

// Returns true if the user exceeded the nuke threshold (destructive actions in 60 s window)
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

// ─── Bot factory ──────────────────────────────────────────────────────────────
export function startBot(): Client | undefined {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    logger.warn("DISCORD_BOT_TOKEN no configurado — bot deshabilitado");
    return undefined;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,          // canal/rol events + interacciones
      GatewayIntentBits.GuildMembers,    // member add/remove  (PRIVILEGED)
      GatewayIntentBits.GuildModeration, // ban/unban events
      GatewayIntentBits.GuildMessages,   // message events para antiSpam
      GatewayIntentBits.MessageContent,  // leer contenido de mensajes (PRIVILEGED)
    ],
  });

  // ──────────────────────────────────────────────────────────────────────────
  // READY
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "Bot de Discord listo");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MEMBER JOIN — welcome, autoRoles, DM, verificacion, antiBot, antiAlt, antiJoin, logs
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member: GuildMember | PartialGuildMember) => {
    const guildId = member.guild.id;
    const userId  = member.user?.id ?? member.id;
    const username = member.user?.username ?? "Desconocido";
    const discriminator = member.user?.discriminator ?? "0";
    const isBot = member.user?.bot ?? false;

    logger.info({ guildId, userId, username, isBot }, "Nuevo miembro");

    try {
      // Load all configs in parallel
      const [antiraid, welcomeCfg, verifCfg, guildCfg, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);

      const guildName   = member.guild.name ?? guildCfg?.guildName ?? "Servidor";
      const memberCount = member.guild.memberCount ?? guildCfg?.memberCount ?? 0;
      const logChannel  = logCfg?.enabled ? logCfg.channelId : null;

      // ── AntiRaid checks ──────────────────────────────────────────────────
      if (antiraid?.enabled) {

        // AntiBot
        if (antiraid.antiBot && isBot) {
          const whitelist = antiraid.antiBotWhitelist ?? [];
          if (!whitelist.includes(userId)) {
            try {
              await (member as GuildMember).kick("AntiRaid: Bot no autorizado");
              await bumpStats(guildId, "blockedBot");
              logger.info({ guildId, userId }, "Bot expulsado (antiBot)");
              if (logChannel && logCfg?.logSecurity) {
                await sendLog(logChannel, {
                  title: "AntiBot — Bot Bloqueado",
                  description: `**Bot expulsado:** \`${username}\` (\`${userId}\`)`,
                  color: 0xED4245, timestamp: new Date().toISOString(),
                  footer: { text: "Neuralix AntiRaid" },
                }, botToken);
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
              logger.info({ guildId, userId, ageDays }, "Alt expulsado (antiAlt)");
              if (logChannel && logCfg?.logSecurity) {
                await sendLog(logChannel, {
                  title: "AntiAlt — Cuenta Nueva Bloqueada",
                  description: `**Expulsado:** \`${username}\` (\`${userId}\`)\n**Edad:** ${Math.floor(ageDays)} dias (min: ${antiraid.antiAltMinAge})`,
                  color: 0xFEE75C, timestamp: new Date().toISOString(),
                  footer: { text: "Neuralix AntiRaid" },
                }, botToken);
              }
            } catch (e) { logger.error({ e }, "Error al expulsar alt"); }
            return;
          }
        }

        // AntiJoin (rate limiting)
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
              if (action === "ban")      await (member as GuildMember).ban({ reason: `AntiRaid: ${joins.length} joins en ${antiraid.antiJoinInterval}s` });
              else if (action === "kick") await (member as GuildMember).kick("AntiRaid: AntiJoin");
              else if (action === "timeout") await (member as GuildMember).timeout(5 * 60_000, "AntiRaid: AntiJoin");
              logger.warn({ guildId, userId, action, count: joins.length }, "AntiJoin activado");
              if (logChannel && logCfg?.logSecurity) {
                await sendLog(logChannel, {
                  title: "AntiJoin — Raid Detectado",
                  description: `**Accion:** ${action}\n**Joins:** ${joins.length} en ${antiraid.antiJoinInterval}s\n**Usuario:** \`${username}\` (\`${userId}\`)`,
                  color: 0xED4245, timestamp: new Date().toISOString(),
                  footer: { text: "Neuralix AntiRaid" },
                }, botToken);
              }
            } catch (e) { logger.error({ e }, "Error en AntiJoin"); }
            return;
          }
        }
      }

      // ── Verificacion — DM de verificacion al unirse ──────────────────────
      if (!isBot && verifCfg?.enabled) {
        try {
          const host = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "https://neuralix.replit.app";
          const verifyUrl = `${host}/verify?guild=${guildId}&user=${userId}`;
          const dmId = await openDmChannel(userId, botToken);
          if (dmId) {
            await sendToChannel(dmId, {
              embeds: [{
                title: `Verificacion requerida — ${guildName}`,
                description: `Para acceder a **${guildName}** debes completar la verificacion.\n\n[Verificarme ahora](${verifyUrl})`,
                color: 0x5865F2,
                footer: { text: "Neuralix Verificacion" },
              }],
            }, botToken);
          }
        } catch (e) { logger.error({ e }, "Error al enviar DM de verificacion"); }
      }

      // ── Welcome message ───────────────────────────────────────────────────
      if (welcomeCfg?.enabled && welcomeCfg.channelId) {
        const opts = {
          guildName, mention: `<@${userId}>`, username,
          tag: discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username,
          memberCount,
        };
        const payload = buildWelcomePayload(welcomeCfg, opts);
        if (!payload.content && !payload.embeds) {
          payload.content = `Bienvenido <@${userId}> a **${guildName}**!`;
        }
        const result = await sendToChannel(welcomeCfg.channelId, payload, botToken);
        if (result.status === 200 || result.status === 201) {
          logger.info({ guildId, userId, channelId: welcomeCfg.channelId }, "Bienvenida enviada");
        } else {
          logger.error({ guildId, status: result.status, data: result.data }, "Error al enviar bienvenida");
        }

        // Auto-roles
        if (!isBot && welcomeCfg.autoRoleIds?.length) {
          for (const roleId of welcomeCfg.autoRoleIds) {
            try { await (member as GuildMember).roles.add(roleId); }
            catch (e) { logger.error({ e, roleId }, "Error al asignar rol"); }
          }
        }

        // DM de bienvenida
        if (!isBot && welcomeCfg.dmEnabled && welcomeCfg.dmMessage) {
          try {
            const dmId = await openDmChannel(userId, botToken);
            if (dmId) await sendToChannel(dmId, { content: processTemplate(welcomeCfg.dmMessage, opts) }, botToken);
          } catch (e) { logger.error({ e }, "Error al enviar DM bienvenida"); }
        }
      }

      // ── Log member join ───────────────────────────────────────────────────
      if (logChannel && logCfg?.logMembers) {
        await sendLog(logChannel, {
          title: "Miembro Unido",
          description: `**Usuario:** \`${username}\` (<@${userId}>)\n**ID:** \`${userId}\`\n**Cuenta creada:** ${member.user?.createdAt?.toLocaleDateString("es-ES") ?? "Desconocido"}`,
          color: 0x57F287, timestamp: new Date().toISOString(),
          footer: { text: `Miembros: ${memberCount}` },
        }, botToken);
      }

    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberAdd");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MEMBER LEAVE — goodbye, logs
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberRemove, async (member) => {
    const guildId = member.guild.id;
    const userId  = member.user?.id ?? member.id;
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
        if (!payload.content && !payload.embeds) {
          payload.content = `**${username}** ha abandonado **${guildName}**.`;
        }
        await sendToChannel(goodbyeCfg.channelId, payload, botToken);
        logger.info({ guildId, userId }, "Despedida enviada");
      }

      if (logChannel && logCfg?.logMembers) {
        await sendLog(logChannel, {
          title: "Miembro Salido",
          description: `**Usuario:** \`${username}\` (<@${userId}>)\n**ID:** \`${userId}\``,
          color: 0xED4245, timestamp: new Date().toISOString(),
          footer: { text: `Miembros: ${memberCount}` },
        }, botToken);
      }
    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberRemove");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MESSAGE CREATE — antiSpam, antiLinks, antiMassMention
  // Requires: GuildMessages + MessageContent (privileged) intents
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot) return;
    const guildId  = message.guild.id;
    const userId   = message.author.id;
    const username = message.author.username;

    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      if (!antiraid?.enabled) return;

      const content    = message.content ?? "";
      const now        = Date.now();
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      // AntiSpam
      if (antiraid.antiSpam) {
        const windowMs  = (antiraid.antiSpamInterval ?? 5) * 1000;
        const limit     = antiraid.antiSpamLimit ?? 5;
        const key       = `${guildId}:${userId}`;
        const msgs      = (spamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
        msgs.push(now);
        spamTracker.set(key, msgs);
        if (msgs.length >= limit) {
          spamTracker.delete(key);
          try {
            await message.delete().catch(() => {});
            const action = antiraid.antiSpamAction ?? "mute";
            if (action === "ban")      await message.member?.ban({ reason: "AntiRaid: Spam detectado" });
            else if (action === "kick") await message.member?.kick("AntiRaid: Spam detectado");
            else                        await message.member?.timeout(10 * 60_000, "AntiRaid: Spam");
            await bumpStats(guildId, "blockedSpam");
            logger.info({ guildId, userId, action }, "AntiSpam activado");
            if (logChannel && logCfg?.logSecurity) {
              await sendLog(logChannel, {
                title: "AntiSpam — Spam Detectado",
                description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Accion:** ${action}\n**Mensajes:** ${msgs.length} en ${antiraid.antiSpamInterval}s`,
                color: 0xFF6B35, timestamp: new Date().toISOString(),
                footer: { text: "Neuralix AntiRaid" },
              }, botToken);
            }
          } catch (e) { logger.error({ e }, "Error en antiSpam"); }
          return;
        }
      }

      // AntiLinks
      if (antiraid.antiLinks && content) {
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
            try {
              await message.delete().catch(() => {});
              logger.info({ guildId, userId }, "Link bloqueado (antiLinks)");
              if (logChannel && logCfg?.logMessages) {
                await sendLog(logChannel, {
                  title: "AntiLinks — Enlace Bloqueado",
                  description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Mensaje:** ${content.substring(0, 120)}`,
                  color: 0xFEE75C, timestamp: new Date().toISOString(),
                  footer: { text: "Neuralix AntiRaid" },
                }, botToken);
              }
            } catch (e) { logger.error({ e }, "Error en antiLinks"); }
          }
        }
      }

      // AntiMassMention
      if (antiraid.antiMassMention) {
        const limit   = antiraid.massMentionLimit ?? 5;
        const count   = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
        if (count >= limit) {
          try {
            await message.delete().catch(() => {});
            await message.member?.timeout(5 * 60_000, "AntiRaid: Mass mention");
            logger.info({ guildId, userId, count }, "AntiMassMention activado");
            if (logChannel && logCfg?.logSecurity) {
              await sendLog(logChannel, {
                title: "AntiMassMention — Menciones Masivas",
                description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Menciones:** ${count} (limite: ${limit})`,
                color: 0xFF6B35, timestamp: new Date().toISOString(),
                footer: { text: "Neuralix AntiRaid" },
              }, botToken);
            }
          } catch (e) { logger.error({ e }, "Error en antiMassMention"); }
        }
      }
    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en messageCreate");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CHANNEL DELETE — antiChannelDelete, antiNuke, logs
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.ChannelDelete, async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const guildId = channel.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      if (!antiraid?.enabled) return;
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      let executorTag: string | undefined;
      try {
        const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) {
          executorId = entry.executor?.id;
          executorTag = entry.executor?.username ?? entry.executor?.tag;
        }
      } catch {}

      if (logChannel && logCfg?.logChannels) {
        await sendLog(logChannel, {
          title: "Canal Eliminado",
          description: `**Canal:** #${(channel as any).name ?? "desconocido"}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`,
          color: 0xED4245, timestamp: new Date().toISOString(),
          footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (executorId && (antiraid.antiNuke || antiraid.antiChannelDelete)) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          try {
            const member = channel.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban")        await member.ban({ reason: "AntiNuke: Destruccion masiva" });
              else if (antiraid.nukeAction === "kick")  await member.kick("AntiNuke");
              else                                      await member.roles.set([], "AntiNuke: Permisos revocados");
            }
            logger.warn({ guildId, executorId }, "AntiNuke activado (channelDelete)");
            if (logChannel) {
              await sendLog(logChannel, {
                title: "AntiNuke — Ataque Detectado",
                description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}\n**Detonante:** Eliminacion masiva de canales`,
                color: 0xED4245, timestamp: new Date().toISOString(),
                footer: { text: "Neuralix AntiNuke" },
              }, botToken);
            }
          } catch (e) { logger.error({ e }, "Error en AntiNuke channelDelete"); }
        }
      }
    } catch (err) {
      logger.error({ err, guildId }, "Error en channelDelete");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ROLE DELETE — antiRoleDelete, antiNuke, logs
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.GuildRoleDelete, async (role) => {
    const guildId = role.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      if (!antiraid?.enabled) return;
      const logChannel = logCfg?.enabled ? logCfg.channelId : null;

      let executorId: string | undefined;
      let executorTag: string | undefined;
      try {
        const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) {
          executorId = entry.executor?.id;
          executorTag = entry.executor?.username ?? entry.executor?.tag;
        }
      } catch {}

      if (logChannel && logCfg?.logRoles) {
        await sendLog(logChannel, {
          title: "Rol Eliminado",
          description: `**Rol:** @${role.name}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`,
          color: 0xED4245, timestamp: new Date().toISOString(),
          footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (executorId && (antiraid.antiNuke || antiraid.antiRoleDelete)) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          try {
            const member = role.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban")        await member.ban({ reason: "AntiNuke: Destruccion masiva" });
              else if (antiraid.nukeAction === "kick")  await member.kick("AntiNuke");
              else                                      await member.roles.set([], "AntiNuke: Permisos revocados");
            }
            logger.warn({ guildId, executorId }, "AntiNuke activado (roleDelete)");
          } catch (e) { logger.error({ e }, "Error en AntiNuke roleDelete"); }
        }
      }
    } catch (err) {
      logger.error({ err, guildId }, "Error en guildRoleDelete");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BAN ADD — antiBanMass, antiNuke, logs
  // Requires: GuildModeration intent
  // ──────────────────────────────────────────────────────────────────────────
  client.on(Events.GuildBanAdd, async (ban) => {
    const guildId = ban.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      if (!antiraid?.enabled) return;
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
          color: 0xED4245, timestamp: new Date().toISOString(),
          footer: { text: "Neuralix Logs" },
        }, botToken);
      }

      if (executorId && (antiraid.antiNuke || antiraid.antiBanMass)) {
        const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
        if (exceeded && antiraid.antiNuke) {
          try {
            const member = ban.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban")        await member.ban({ reason: "AntiNuke: Bans masivos" });
              else if (antiraid.nukeAction === "kick")  await member.kick("AntiNuke");
              else                                      await member.roles.set([], "AntiNuke: Permisos revocados");
            }
            logger.warn({ guildId, executorId }, "AntiNuke activado (banMass)");
            if (logChannel) {
              await sendLog(logChannel, {
                title: "AntiNuke — Bans Masivos Detectados",
                description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`,
                color: 0xED4245, timestamp: new Date().toISOString(),
                footer: { text: "Neuralix AntiNuke" },
              }, botToken);
            }
          } catch (e) { logger.error({ e }, "Error en AntiNuke banMass"); }
        }
      }
    } catch (err) {
      logger.error({ err, guildId }, "Error en guildBanAdd");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INTERACTION CREATE — sistema de tickets (boton "Abrir Ticket")
  // ──────────────────────────────────────────────────────────────────────────
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
        await interaction.editReply({ content: "El sistema de tickets no esta activo en este servidor." });
        return;
      }

      // Check max tickets per user
      const openTickets = await db.select().from(ticketsTable).where(
        and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId), eq(ticketsTable.status, "open")),
      );
      const maxPerUser = cfg.maxTicketsPerUser ?? 1;
      if (openTickets.length >= maxPerUser) {
        await interaction.editReply({ content: `Ya tienes ${openTickets.length} ticket(s) abierto(s). Maximo: ${maxPerUser}.` });
        return;
      }

      // Create ticket channel
      const safeUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "").substring(0, 20) || "usuario";
      const channelName = (cfg.ticketNameFormat ?? "ticket-{username}")
        .replace("{username}", safeUsername)
        .replace("{userid}", userId)
        .substring(0, 100);

      const overwrites: any[] = [
        { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      if (cfg.supportRoleId) {
        overwrites.push({
          id: cfg.supportRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
        });
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: cfg.categoryId ?? undefined,
        permissionOverwrites: overwrites,
        reason: `Ticket abierto por ${username}`,
      });

      // Record in DB
      const [ticket] = await db.insert(ticketsTable).values({
        guildId,
        channelId: ticketChannel.id,
        userId,
        username,
        subject: `Ticket de ${username}`,
        status: "open",
      }).returning();

      // Send open message in ticket channel
      const openMsg = (cfg.openMessage ?? "Hola <@{user}>, tu ticket ha sido creado. Pronto te atendemos.")
        .replace("{user}", userId)
        .replace("{username}", username);

      const msgContent = cfg.mentionSupport && cfg.supportRoleId
        ? `<@&${cfg.supportRoleId}> ${openMsg}`
        : openMsg;

      await ticketChannel.send({ content: msgContent });

      // Log ticket creation
      if (cfg.logsChannelId) {
        await sendToChannel(cfg.logsChannelId, {
          embeds: [{
            title: "Nuevo Ticket Abierto",
            description: `**Usuario:** <@${userId}> (\`${username}\`)\n**Canal:** <#${ticketChannel.id}>\n**ID Ticket:** #${ticket.id}`,
            color: 0x5865F2, timestamp: new Date().toISOString(),
            footer: { text: "Neuralix Tickets" },
          }],
        }, botToken);
      }

      await interaction.editReply({ content: `Tu ticket ha sido creado: <#${ticketChannel.id}>` });
      logger.info({ guildId, userId, channelId: ticketChannel.id, ticketId: ticket.id }, "Ticket creado");

    } catch (err: any) {
      logger.error({ err, guildId, userId }, "Error al crear ticket");
      await interaction.editReply({ content: "Error al crear el ticket. Intenta de nuevo." }).catch(() => {});
    }
  });

  client.login(botToken).catch((err) => {
    logger.error({ err }, "Error al conectar bot a Discord");
  });

  return client;
}
