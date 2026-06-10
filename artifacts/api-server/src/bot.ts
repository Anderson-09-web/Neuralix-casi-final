import { Client, GatewayIntentBits, Events, type GuildMember, type PartialGuildMember } from "discord.js";
import axios from "axios";
import {
  db,
  welcomeConfigsTable,
  goodbyeConfigsTable,
  antiraidConfigsTable,
  antiraidStatsTable,
  guildConfigsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./lib/logger";

const DISCORD_API = "https://discord.com/api/v10";

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

function hexToDiscordColor(hex?: string | null): number {
  if (!hex) return 0x5865f2;
  const num = parseInt(hex.replace("#", ""), 16);
  return isNaN(num) ? 0x5865f2 : num;
}

function buildPayload(
  cfg: { message?: string | null; embedEnabled: boolean; embedColor?: string | null; embedTitle?: string | null; embedDescription?: string | null; embedFooter?: string | null; embedImage?: string | null },
  opts: { guildName: string; mention: string; username: string; tag: string; memberCount: number },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (cfg.message) {
    payload.content = processTemplate(cfg.message, opts);
  }

  if (cfg.embedEnabled) {
    const embed: Record<string, unknown> = { color: hexToDiscordColor(cfg.embedColor) };
    if (cfg.embedTitle) embed.title = processTemplate(cfg.embedTitle, opts);
    if (cfg.embedDescription) embed.description = processTemplate(cfg.embedDescription, opts);
    if (cfg.embedFooter) embed.footer = { text: processTemplate(cfg.embedFooter, opts) };
    if (cfg.embedImage) embed.image = { url: cfg.embedImage };
    if (embed.title || embed.description || embed.footer || embed.image) {
      payload.embeds = [embed];
    }
  }

  return payload;
}

async function sendToChannel(channelId: string, payload: Record<string, unknown>, botToken: string) {
  return axios.post(
    `${DISCORD_API}/channels/${channelId}/messages`,
    payload,
    {
      headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
      validateStatus: () => true,
    },
  );
}

async function openDmChannel(userId: string, botToken: string): Promise<string | null> {
  const res = await axios.post(
    `${DISCORD_API}/users/@me/channels`,
    { recipient_id: userId },
    { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
  );
  return res.data?.id ?? null;
}

export function startBot(): Client | undefined {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    logger.warn("DISCORD_BOT_TOKEN no configurado — eventos de gateway deshabilitados");
    return undefined;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.on(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "Bot de Discord listo");
  });

  client.on(Events.GuildMemberAdd, async (member: GuildMember | PartialGuildMember) => {
    const guildId = member.guild.id;
    const userId = member.user?.id ?? member.id;
    const username = member.user?.username ?? "Desconocido";
    const discriminator = member.user?.discriminator ?? "0";
    const isBot = member.user?.bot ?? false;

    logger.info({ guildId, userId, username, isBot }, "Nuevo miembro");

    try {
      const [antiraid] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));

      if (antiraid?.enabled) {
        if (antiraid.antiBot && isBot) {
          try {
            await (member as GuildMember).kick("AntiRaid: Bot no autorizado");
            logger.info({ guildId, userId }, "Bot expulsado (antiBot)");
            await db.update(antiraidStatsTable)
              .set({
                blockedBot: sql`blocked_bot + 1`,
                totalDetections: sql`total_detections + 1`,
                detectedToday: sql`detected_today + 1`,
              })
              .where(eq(antiraidStatsTable.guildId, guildId));
          } catch (e) { logger.error({ e }, "Error al expulsar bot"); }
          return;
        }

        if (antiraid.antiAlt && !isBot && member.user?.createdTimestamp) {
          const ageInDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
          if (ageInDays < (antiraid.antiAltMinAge ?? 7)) {
            try {
              await (member as GuildMember).kick(`AntiRaid: Cuenta nueva (${Math.floor(ageInDays)} dias)`);
              logger.info({ guildId, userId, ageInDays }, "Alt expulsado (antiAlt)");
              await db.update(antiraidStatsTable)
                .set({
                  blockedAlt: sql`blocked_alt + 1`,
                  totalDetections: sql`total_detections + 1`,
                  detectedToday: sql`detected_today + 1`,
                })
                .where(eq(antiraidStatsTable.guildId, guildId));
            } catch (e) { logger.error({ e }, "Error al expulsar alt"); }
            return;
          }
        }
      }

      const [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
      if (!cfg?.enabled || !cfg?.channelId) return;

      const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
      const guildName = member.guild.name ?? guildCfg?.guildName ?? "Servidor";
      const memberCount = member.guild.memberCount ?? guildCfg?.memberCount ?? 0;

      const opts = {
        guildName,
        mention: `<@${userId}>`,
        username,
        tag: discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username,
        memberCount,
      };

      const payload = buildPayload(cfg, opts);
      if (!payload.content && !payload.embeds) {
        payload.content = `Bienvenido <@${userId}> a **${guildName}**!`;
      }

      const result = await sendToChannel(cfg.channelId, payload, botToken);
      if (result.status === 200 || result.status === 201) {
        logger.info({ guildId, userId, channelId: cfg.channelId }, "Mensaje de bienvenida enviado");
      } else {
        logger.error({ guildId, status: result.status, data: result.data }, "Error al enviar bienvenida");
      }

      if (!isBot && cfg.autoRoleIds?.length) {
        for (const roleId of cfg.autoRoleIds) {
          try { await (member as GuildMember).roles.add(roleId); } catch (e) { logger.error({ e, roleId }, "Error al asignar rol"); }
        }
      }

      if (!isBot && cfg.dmEnabled && cfg.dmMessage) {
        try {
          const dmChannelId = await openDmChannel(userId, botToken);
          if (dmChannelId) {
            const dmPayload = { content: processTemplate(cfg.dmMessage, opts) };
            await sendToChannel(dmChannelId, dmPayload, botToken);
          }
        } catch (e) { logger.error({ e }, "Error al enviar DM"); }
      }

    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberAdd");
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const guildId = member.guild.id;
    const userId = member.user?.id ?? member.id;
    const username = member.user?.username ?? "Desconocido";

    try {
      const [cfg] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
      if (!cfg?.enabled || !cfg?.channelId) return;

      const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
      const guildName = member.guild.name ?? guildCfg?.guildName ?? "Servidor";
      const memberCount = member.guild.memberCount ?? guildCfg?.memberCount ?? 0;

      const opts = { guildName, mention: `<@${userId}>`, username, tag: username, memberCount };
      const payload = buildPayload(cfg, opts);
      if (!payload.content && !payload.embeds) {
        payload.content = `**${username}** ha abandonado **${guildName}**.`;
      }

      await sendToChannel(cfg.channelId, payload, botToken);
      logger.info({ guildId, userId }, "Mensaje de despedida enviado");
    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberRemove");
    }
  });

  client.login(botToken).catch((err) => {
    logger.error({ err }, "Error al conectar bot a Discord");
  });

  return client;
}
