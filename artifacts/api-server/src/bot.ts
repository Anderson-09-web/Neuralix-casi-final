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
  type VoiceState,
} from "discord.js";
import axios from "axios";
import {
  db,
  welcomeConfigsTable,
  goodbyeConfigsTable,
  antiraidConfigsTable,
  antiraidStatsTable,
  antiraidWhitelistTable,
  guildConfigsTable,
  ticketConfigsTable,
  ticketModulesTable,
  ticketPanelsTable,
  ticketsTable,
  verificationConfigsTable,
  logsConfigsTable,
  blacklistTable,
  warningsTable,
  automodConfigsTable,
  giveawaysTable,
  autoRolesTable,
  logEntriesTable,
  aiChannelsTable,
  guildWebhooksTable,
} from "@workspace/db";
import { eq, sql, and, count } from "drizzle-orm";
import { logger } from "./lib/logger";
import { setBotClient } from "./bot-state";
import { generateWelcomeCard } from "./welcome-card";

const DISCORD_API = "https://discord.com/api/v10";

// ─── In-memory trackers ───────────────────────────────────────────────────────
const joinTracker   = new Map<string, number[]>();
const spamTracker   = new Map<string, number[]>();
const floodTracker  = new Map<string, Map<string, number[]>>();
const nukeTracker   = new Map<string, { count: number; resetAt: number }>();
const tempRoleTimers    = new Map<string, NodeJS.Timeout>();
const webhookSpamTracker = new Map<string, number[]>();    // `${guildId}:${userId}` → timestamps
const suspiciousTracker  = new Map<string, { actions: string[]; resetAt: number }>(); // same key
const aiCooldowns        = new Map<string, number>();      // `ai:${guildId}:${channelId}:${userId}` → timestamp
const aiConversations    = new Map<string, { role: "user" | "assistant"; content: string }[]>(); // `ai:${guildId}:${channelId}` → history

// ─── Helpers ──────────────────────────────────────────────────────────────────

function processTemplate(
  template: string,
  opts: { guildName: string; mention: string; username: string; tag: string; memberCount: number; accountCreatedAt?: Date | null },
): string {
  const now = new Date();
  const accountAgeDays = opts.accountCreatedAt
    ? Math.floor((Date.now() - opts.accountCreatedAt.getTime()) / 86_400_000)
    : null;
  return template
    .replace(/\{user\}/gi, opts.mention)
    .replace(/\{username\}/gi, opts.username)
    .replace(/\{usertag\}/gi, opts.tag)
    .replace(/\{tag\}/gi, opts.tag)
    .replace(/\{server\}/gi, opts.guildName)
    .replace(/\{membercount\}/gi, opts.memberCount.toString())
    .replace(/\{date\}/gi, now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }))
    .replace(/\{time\}/gi, now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }))
    .replace(/\{accountage\}/gi, accountAgeDays !== null ? `${accountAgeDays}` : "Desconocido")
    .replace(/\{ordinal\}/gi, `${opts.memberCount}º`);
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

async function sendToChannelWithFile(channelId: string, formData: FormData, botToken: string) {
  return axios.post(`${DISCORD_API}/channels/${channelId}/messages`, formData, {
    headers: { Authorization: `Bot ${botToken.trim()}` },
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

async function logToDb(guildId: string, entry: {
  userId?: string | null;
  username?: string | null;
  action: string;
  category: string;
  details?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  reason?: string | null;
  moderatorId?: string | null;
  moderatorName?: string | null;
}) {
  try {
    await db.insert(logEntriesTable).values({ guildId, ...entry });
  } catch {}
}

function getLogChannel(logCfg: any, category: "members" | "messages" | "roles" | "channels" | "moderation" | "security" | "tickets" | "verification" | "giveaway"): string | null {
  if (!logCfg?.enabled) return null;
  const overrides: Record<string, string | null> = {
    members: logCfg.memberChannelId || null,
    messages: logCfg.messageChannelId || null,
    roles: logCfg.roleChannelId || null,
    channels: logCfg.channelLogsChannelId || null,
    moderation: logCfg.moderationChannelId || null,
    security: logCfg.securityChannelId || null,
    tickets: logCfg.ticketChannelId || null,
    verification: logCfg.verificationChannelId || null,
    giveaway: logCfg.giveawayChannelId || null,
  };
  return overrides[category] || logCfg.channelId || null;
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

async function isWhitelisted(guildId: string, userId: string, memberRoleIds?: string[]): Promise<boolean> {
  try {
    const entries = await db.select().from(antiraidWhitelistTable).where(eq(antiraidWhitelistTable.guildId, guildId));
    for (const entry of entries) {
      if (entry.entityType === "user" && entry.entityId === userId) return true;
      if (entry.entityType === "role" && memberRoleIds?.includes(entry.entityId)) return true;
    }
    return false;
  } catch { return false; }
}

async function addWarning(guildId: string, userId: string, username: string, reason: string, severity: string, botToken: string, logChannel?: string | null) {
  try {
    await db.insert(warningsTable).values({
      guildId, userId, username, reason, severity,
      moderatorId: "bot", moderatorUsername: "Neuralix AutoMod",
    });
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

function generateHtmlTranscript(messages: any[], ticketId: number, username: string): string {
  const rows = messages.map((m: any) => {
    const ts = new Date(m.timestamp).toLocaleString("es-ES");
    const author = m.author?.username || "Desconocido";
    const avatar = m.author?.avatar
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png?size=32`
      : `https://cdn.discordapp.com/embed/avatars/${Number(m.author?.discriminator || 0) % 5}.png`;
    const content = m.content
      ? m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")
      : m.embeds?.length
        ? `<em>[Embed: ${m.embeds[0]?.title || "sin titulo"}]</em>`
        : m.attachments?.length
          ? `<em>[Adjunto]</em>`
          : "";
    return `<div class="msg"><img class="av" src="${avatar}" /><div class="body"><span class="author">${author}</span><span class="ts">${ts}</span><div class="content">${content}</div></div></div>`;
  }).join("\n");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Transcript — Ticket #${ticketId}</title><style>
body{background:#1e1f2e;color:#dcddde;font-family:Whitney,Helvetica Neue,Helvetica,Arial,sans-serif;margin:0;padding:20px}
h1{color:#fff;border-bottom:2px solid #5865F2;padding-bottom:10px}
.meta{color:#72767d;margin-bottom:20px;font-size:14px}
.msg{display:flex;gap:12px;margin-bottom:12px;padding:8px;border-radius:6px}
.msg:hover{background:rgba(255,255,255,0.04)}
.av{width:40px;height:40px;border-radius:50%;flex-shrink:0}
.body{flex:1}
.author{font-weight:700;color:#fff;margin-right:8px}
.ts{color:#72767d;font-size:12px}
.content{margin-top:4px;word-break:break-word;line-height:1.4}
</style></head><body>
<h1>Transcript — Ticket #${ticketId}</h1>
<div class="meta">Usuario: ${username} · Total mensajes: ${messages.length} · Generado: ${new Date().toLocaleString("es-ES")}</div>
${rows}
</body></html>`;
}

async function generateTranscript(channelId: string, botToken: string, ticketId: number, username: string): Promise<{ text: string; html: string }> {
  try {
    const res = await axios.get(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, {
      headers: { Authorization: `Bot ${botToken.trim()}` },
      validateStatus: () => true,
    });
    if (res.status !== 200 || !Array.isArray(res.data)) return { text: "", html: "" };
    const messages = (res.data as any[]).reverse();
    const text = messages.map((m: any) => {
      const ts = new Date(m.timestamp).toLocaleString("es-ES");
      const author = m.author?.username || "Desconocido";
      const content = m.content || (m.embeds?.length ? "[Embed]" : m.attachments?.length ? "[Adjunto]" : "");
      return `[${ts}] ${author}: ${content}`;
    }).join("\n");
    const html = generateHtmlTranscript(messages, ticketId, username);
    return { text, html };
  } catch { return { text: "", html: "" }; }
}

async function buildTicketComponents(ticketId: number, cfg: any): Promise<any[]> {
  const row1Buttons: any[] = [
    { type: 2, style: 4, label: "Cerrar Ticket", emoji: { name: "🔒" }, custom_id: `ticket_close_${ticketId}` },
  ];
  if (cfg?.claimEnabled !== false) {
    row1Buttons.push({ type: 2, style: 1, label: "Reclamar", emoji: { name: "✋" }, custom_id: `ticket_claim_${ticketId}` });
  }
  if (cfg?.deleteEnabled !== false) {
    row1Buttons.push({ type: 2, style: 4, label: "Eliminar", emoji: { name: "🗑️" }, custom_id: `ticket_delete_${ticketId}` });
  }
  return [{ type: 1, components: row1Buttons }];
}

// ─── Global Blacklist Sweep ────────────────────────────────────────────────────

const BLACKLIST_APPEAL_SERVER_ID = "1493023527887048724";
const BLACKLIST_APPEAL_INVITE    = "https://discord.gg/neuralix-appeal";

async function dmUserBlacklistNotice(userId: string, reason: string, botToken: string) {
  try {
    const dmRes = await axios.post(`${DISCORD_API}/users/@me/channels`, { recipient_id: userId }, {
      headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
      validateStatus: () => true,
    });
    if (!dmRes.data?.id) return;
    await axios.post(`${DISCORD_API}/channels/${dmRes.data.id}/messages`, {
      embeds: [{
        title: "Has sido incluido en la Blacklist Global de Neuralix",
        description: `Fuiste expulsado/baneado de todos los servidores protegidos por **Neuralix**.\n\n**Razon:** ${reason}\n\n**¿Crees que es un error?**\nPuedes apelar uniendote a nuestro servidor:\n${BLACKLIST_APPEAL_INVITE}\n\n**ID del servidor de apelaciones:** \`${BLACKLIST_APPEAL_SERVER_ID}\``,
        color: 0xED4245,
        footer: { text: "Neuralix Blacklist Global" },
        timestamp: new Date().toISOString(),
      }],
    }, {
      headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
      validateStatus: () => true,
    });
  } catch {}
}

async function runBlacklistSweep(client: Client, botToken: string) {
  try {
    const blacklistEntries = await db.select().from(blacklistTable);
    const active = blacklistEntries.filter((e) => !e.expiresAt || new Date() < new Date(e.expiresAt));
    if (!active.length) return;

    for (const entry of active) {
      for (const [, guild] of client.guilds.cache) {
        try {
          const member = guild.members.cache.get(entry.userId) || await guild.members.fetch(entry.userId).catch(() => null);
          if (!member) continue;

          const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guild.id));
          const action = guildCfg?.blacklistAction || "ban";

          if (action === "kick") {
            await member.kick(`Blacklist Global: ${entry.reason}`);
          } else {
            await member.ban({ reason: `Blacklist Global: ${entry.reason} | Apelaciones: ${BLACKLIST_APPEAL_INVITE}` });
          }

          const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guild.id));
          const logChannel = getLogChannel(logCfg, "security");
          if (logChannel) {
            await sendLog(logChannel, {
              title: `Blacklist Global — Usuario ${action === "kick" ? "Expulsado" : "Baneado"} (Sincronizacion)`,
              description: `**Usuario:** \`${entry.username}\` (\`${entry.userId}\`)\n**Razon:** ${entry.reason}\n**Accion:** ${action}\n**Servidor de apelaciones:** \`${BLACKLIST_APPEAL_SERVER_ID}\``,
              color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Blacklist Global" },
            }, botToken);
          }
        } catch {}
      }
    }
  } catch (err) {
    logger.error({ err }, "Error en blacklist sweep");
  }
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
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on(Events.ClientReady, (c) => {
    setBotClient(client);
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "Bot de Discord listo");
    setTimeout(() => runBlacklistSweep(client, botToken), 5000);
    setInterval(() => runBlacklistSweep(client, botToken), 10 * 60_000);

    // ── Auto-end expired giveaways every minute ────────────────────────────
    setInterval(async () => {
      try {
        const now = new Date();
        const expired = await db.select().from(giveawaysTable)
          .where(and(eq(giveawaysTable.status, "active"), sql`ends_at <= ${now}`));
        for (const giveaway of expired) {
          const entrants = giveaway.entrants ?? [];
          const wc = Math.min(giveaway.winnerCount, entrants.length);
          const winners = [...entrants].sort(() => Math.random() - 0.5).slice(0, wc);
          await db.update(giveawaysTable).set({ status: "ended", winners, updatedAt: new Date() }).where(eq(giveawaysTable.id, giveaway.id));
          try {
            const ch = await client.channels.fetch(giveaway.channelId);
            if (ch && "send" in ch) {
              const wm = winners.length > 0 ? winners.map((w) => `<@${w}>`).join(", ") : "Nadie participó";
              await (ch as any).send({ embeds: [{ title: `SORTEO FINALIZADO — ${giveaway.prize}`, description: `**Ganador(es):** ${wm}\n**Premio:** ${giveaway.prize}\n**Participantes:** ${entrants.length}`, color: 0x57F287, footer: { text: `Organizado por ${giveaway.hostedByUsername}` } }] });
            }
          } catch {}
        }
      } catch {}
    }, 60_000);
  });

  // ─── Member Join ──────────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member: GuildMember | PartialGuildMember) => {
    const guildId   = member.guild.id;
    const userId    = member.user?.id ?? member.id;
    const username  = member.user?.username ?? "Desconocido";
    const discriminator = member.user?.discriminator ?? "0";
    const isBot     = member.user?.bot ?? false;

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
      const logChannel  = getLogChannel(logCfg, "members");
      const secChannel  = getLogChannel(logCfg, "security");
      const blacklistAction = guildCfg?.blacklistAction || "ban";

      // ── Global Blacklist ─────────────────────────────────────────────────
      if (blacklistEntry && (!blacklistEntry.expiresAt || new Date() < new Date(blacklistEntry.expiresAt))) {
        try {
          // DM the user before applying the action
          await dmUserBlacklistNotice(userId, blacklistEntry.reason, botToken);

          if (blacklistAction === "kick") {
            await (member as GuildMember).kick(`Blacklist Global: ${blacklistEntry.reason}`);
          } else {
            await (member as GuildMember).ban({ reason: `Blacklist Global: ${blacklistEntry.reason} | Apelaciones: ${BLACKLIST_APPEAL_INVITE}` });
          }
          if (secChannel || logChannel) {
            await sendLog((secChannel || logChannel)!, {
              title: `Blacklist Global — Usuario ${blacklistAction === "kick" ? "Expulsado" : "Baneado"}`,
              description: `**Usuario:** \`${blacklistEntry.username}\` (\`${userId}\`)\n**Razon:** ${blacklistEntry.reason}\n**Accion:** ${blacklistAction}\n**Moderador original:** ${blacklistEntry.addedByUsername ?? "Sistema"}\n**Servidor de apelaciones:** \`${BLACKLIST_APPEAL_SERVER_ID}\``,
              color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Blacklist Global" },
            }, botToken);
          }
        } catch (e) { logger.error({ e }, "Error al aplicar blacklist"); }
        return;
      }

      // ── AntiRaid ─────────────────────────────────────────────────────────
      if (antiraid?.enabled) {
        const whitelisted = await isWhitelisted(guildId, userId);
        if (!whitelisted) {
          if (antiraid.antiBot && isBot) {
            const legacyWl = antiraid.antiBotWhitelist ?? [];
            if (!legacyWl.includes(userId)) {
              try {
                await (member as GuildMember).kick("AntiRaid: Bot no autorizado");
                await bumpStats(guildId, "blockedBot");
                if (secChannel && logCfg?.logSecurity) {
                  await sendLog(secChannel, { title: "AntiBot — Bot Bloqueado", description: `**Bot expulsado:** \`${username}\` (\`${userId}\`)`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
                }
              } catch {}
              return;
            }
          }

          if (antiraid.antiAlt && !isBot && member.user?.createdTimestamp) {
            const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
            if (ageDays < (antiraid.antiAltMinAge ?? 7)) {
              try {
                await (member as GuildMember).kick(`AntiRaid: Cuenta nueva (${Math.floor(ageDays)} dias)`);
                await bumpStats(guildId, "blockedAlt");
                if (secChannel && logCfg?.logSecurity) {
                  await sendLog(secChannel, { title: "AntiAlt — Cuenta Nueva", description: `**Expulsado:** \`${username}\` (\`${userId}\`)\n**Edad:** ${Math.floor(ageDays)} dias (min: ${antiraid.antiAltMinAge})`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
                }
              } catch {}
              return;
            }
          }

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
                if (secChannel && logCfg?.logSecurity) {
                  await sendLog(secChannel, { title: "AntiJoin — Raid Detectado", description: `**Accion:** ${action}\n**Joins:** ${joins.length} en ${antiraid.antiJoinInterval}s\n**Usuario:** \`${username}\``, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
                }
              } catch {}
              return;
            }
          }
        }
      }

      if (!isBot && verifCfg?.enabled) {
        try {
          const host = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://neuralix.replit.app";
          const dmId = await openDmChannel(userId, botToken);
          if (dmId) {
            await sendToChannel(dmId, { embeds: [{ title: `Verificacion — ${guildName}`, description: `Para acceder a **${guildName}** debes verificarte.\n\n[Verificarme ahora](${host}/verify?guild=${guildId}&user=${userId})`, color: 0x5865F2, footer: { text: "Neuralix Verificacion" } }] }, botToken);
          }
        } catch {}
      }

      if (!isBot) {
        try {
          const joinRoles = await db.select().from(autoRolesTable)
            .where(and(eq(autoRolesTable.guildId, guildId), eq(autoRolesTable.type, "join"), eq(autoRolesTable.enabled, true)));
          for (const ar of joinRoles) {
            for (const roleId of (ar.roleIds ?? [])) {
              try {
                await (member as GuildMember).roles.add(roleId);
                if (ar.temporary && ar.durationMinutes > 0) {
                  const key = `${guildId}:${userId}:${roleId}`;
                  const timer = setTimeout(async () => {
                    try { const m = await member.guild.members.fetch(userId); await m.roles.remove(roleId); } catch {}
                    tempRoleTimers.delete(key);
                  }, ar.durationMinutes * 60_000);
                  tempRoleTimers.set(key, timer);
                }
              } catch {}
            }
          }
        } catch {}
      }

      if (welcomeCfg?.enabled && welcomeCfg.channelId) {
        const opts = {
          guildName, mention: `<@${userId}>`, username,
          tag: discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username,
          memberCount,
        };
        const payload = buildWelcomePayload(welcomeCfg, opts);
        if (!payload.content && !payload.embeds) payload.content = `Bienvenido <@${userId}> a **${guildName}**!`;

        // Premium webhook customization: override username/avatar if set
        const [webhookRow] = await db.select().from(guildWebhooksTable)
          .where(and(eq(guildWebhooksTable.guildId, guildId), eq(guildWebhooksTable.channelId, welcomeCfg.channelId)));
        const hasCustom = guildCfg?.webhookBotName || guildCfg?.webhookBotAvatar;
        const useWebhook = hasCustom && webhookRow?.webhookId && webhookRow?.webhookToken;

        const sendPayload = async (p: Record<string, unknown>) => {
          if (useWebhook) {
            const wp = { ...p, username: guildCfg!.webhookBotName || undefined, avatar_url: guildCfg!.webhookBotAvatar || undefined };
            const r = await axios.post(`${DISCORD_API}/webhooks/${webhookRow!.webhookId}/${webhookRow!.webhookToken}`, wp, { headers: { "Content-Type": "application/json" }, validateStatus: () => true });
            if (r.status >= 200 && r.status < 300) return;
          }
          await sendToChannel(welcomeCfg.channelId!, p, botToken);
        };

        if ((welcomeCfg as any).cardEnabled) {
          try {
            const avatarUrl = member.user?.avatar
              ? `https://cdn.discordapp.com/avatars/${userId}/${member.user.avatar}.png?size=128`
              : null;
            const cardBuf = await generateWelcomeCard({
              username, tag: opts.tag, guildName, memberCount,
              avatarUrl,
              background: (welcomeCfg as any).cardBackground || null,
              backgroundUrl: (welcomeCfg as any).cardBackgroundUrl || null,
              textColor: (welcomeCfg as any).cardTextColor || null,
              avatarBorderColor: (welcomeCfg as any).cardAvatarBorderColor || null,
              welcomeText: (welcomeCfg as any).cardWelcomeText || null,
            });
            if (cardBuf) {
              const hasEmbed = payload.embeds && Array.isArray(payload.embeds) && (payload.embeds as any[]).length > 0;
              const webhookHdr = useWebhook
                ? { "Content-Type": "multipart/form-data" }
                : { Authorization: `Bot ${botToken.trim()}` };
              const cardUrl = useWebhook
                ? `${DISCORD_API}/webhooks/${webhookRow!.webhookId}/${webhookRow!.webhookToken}`
                : `${DISCORD_API}/channels/${welcomeCfg.channelId}/messages`;
              const extraFields = useWebhook
                ? { username: guildCfg!.webhookBotName || undefined, avatar_url: guildCfg!.webhookBotAvatar || undefined }
                : {};
              if (hasEmbed) {
                const embeds = (payload.embeds as any[]).map((e, i) =>
                  i === 0 ? { ...e, image: { url: "attachment://welcome-card.png" } } : e
                );
                const form = new FormData();
                form.append("payload_json", JSON.stringify({ ...payload, ...extraFields, embeds }));
                form.append("files[0]", new Blob([cardBuf], { type: "image/png" }), "welcome-card.png");
                await axios.post(cardUrl, form, { headers: webhookHdr, validateStatus: () => true });
              } else {
                const cardForm = new FormData();
                cardForm.append("payload_json", JSON.stringify(extraFields));
                cardForm.append("files[0]", new Blob([cardBuf], { type: "image/png" }), "welcome-card.png");
                await axios.post(cardUrl, cardForm, { headers: webhookHdr, validateStatus: () => true });
                if (payload.content) await sendPayload(payload);
              }
            } else {
              await sendPayload(payload);
            }
          } catch {
            await sendPayload(payload);
          }
        } else {
          await sendPayload(payload);
        }

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

      if (logChannel && logCfg?.logMembers) {
        await sendLog(logChannel, {
          title: "Miembro Unido",
          description: `**Usuario:** \`${username}\` (<@${userId}>)\n**ID:** \`${userId}\`\n**Cuenta creada:** ${member.user?.createdAt?.toLocaleDateString("es-ES") ?? "Desconocido"}\n**Bot:** ${isBot ? "Si" : "No"}`,
          color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: `Miembros: ${memberCount}` },
        }, botToken);
        await logToDb(guildId, { userId, username, action: "member_join", category: "member", details: `Bot: ${isBot ? "Si" : "No"} | Cuenta: ${member.user?.createdAt?.toLocaleDateString("es-ES") ?? "Desconocido"}` });
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
      const logChannel  = getLogChannel(logCfg, "members");

      if (goodbyeCfg?.enabled && goodbyeCfg.channelId) {
        const opts = { guildName, mention: `<@${userId}>`, username, tag: username, memberCount };
        const payload = buildWelcomePayload(goodbyeCfg, opts);
        if (!payload.content && !payload.embeds) payload.content = `**${username}** ha abandonado **${guildName}**.`;

        // Premium webhook customization for goodbye
        const [goodbyeWebhookRow] = await db.select().from(guildWebhooksTable)
          .where(and(eq(guildWebhooksTable.guildId, guildId), eq(guildWebhooksTable.channelId, goodbyeCfg.channelId)));
        const hasCustom = guildCfg?.webhookBotName || guildCfg?.webhookBotAvatar;
        const useGoodbyeWebhook = hasCustom && goodbyeWebhookRow?.webhookId && goodbyeWebhookRow?.webhookToken;

        if (useGoodbyeWebhook) {
          const wp = { ...payload, username: guildCfg!.webhookBotName || undefined, avatar_url: guildCfg!.webhookBotAvatar || undefined };
          const r = await axios.post(`${DISCORD_API}/webhooks/${goodbyeWebhookRow!.webhookId}/${goodbyeWebhookRow!.webhookToken}`, wp, {
            headers: { "Content-Type": "application/json" }, validateStatus: () => true,
          });
          if (r.status < 200 || r.status >= 300) {
            await sendToChannel(goodbyeCfg.channelId, payload, botToken);
          }
        } else {
          await sendToChannel(goodbyeCfg.channelId, payload, botToken);
        }
      }

      if (logChannel && logCfg?.logMembers) {
        await sendLog(logChannel, {
          title: "Miembro Salido",
          description: `**Usuario:** \`${username}\` (<@${userId}>)\n**ID:** \`${userId}\``,
          color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: `Miembros: ${memberCount}` },
        }, botToken);
        await logToDb(guildId, { userId, username, action: "member_leave", category: "member" });
      }
    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en guildMemberRemove");
    }
  });

  // ─── Member Update ────────────────────────────────────────────────────────
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const guildId = newMember.guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      if (!logCfg?.enabled) return;
      const logChannel = getLogChannel(logCfg, "members");
      if (!logChannel) return;

      if (logCfg.logNicknames && oldMember.nickname !== newMember.nickname) {
        await sendLog(logChannel, {
          title: "Apodo Cambiado",
          description: `**Usuario:** <@${newMember.id}> (\`${newMember.user.username}\`)\n**Antes:** ${oldMember.nickname || "*(sin apodo)*"}\n**Despues:** ${newMember.nickname || "*(sin apodo)*"}`,
          color: 0x5865F2, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
        }, botToken);
        await logToDb(guildId, { userId: newMember.id, username: newMember.user.username, action: "nickname_change", category: "member", details: `${oldMember.nickname || "(sin apodo)"} → ${newMember.nickname || "(sin apodo)"}` });
      }

      if (logCfg.logMembers) {
        const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
        const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
        if (addedRoles.size > 0 || removedRoles.size > 0) {
          const lines: string[] = [`**Usuario:** <@${newMember.id}>`];
          if (addedRoles.size) lines.push(`**Roles agregados:** ${addedRoles.map((r) => `<@&${r.id}>`).join(", ")}`);
          if (removedRoles.size) lines.push(`**Roles eliminados:** ${removedRoles.map((r) => `<@&${r.id}>`).join(", ")}`);
          await sendLog(logChannel, {
            title: "Roles de Miembro Actualizados",
            description: lines.join("\n"),
            color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
          }, botToken);
        }
      }
    } catch {}
  });

  // ─── Message Create — AntiSpam, AntiFlood, AntiLinks, AntiMassMention, AutoMod ──
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot) return;
    const guildId  = message.guild.id;
    const userId   = message.author.id;
    const username = message.author.username;
    const content  = message.content ?? "";
    const now      = Date.now();
    const memberRoleIds = message.member?.roles.cache.map((r) => r.id) ?? [];

    try {
      const [antiraid, automod, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(automodConfigsTable).where(eq(automodConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);

      const logChannel  = getLogChannel(logCfg, "messages");
      const secChannel  = getLogChannel(logCfg, "security");
      const automodLog  = logCfg?.enabled ? (logCfg.moderationChannelId || logCfg.channelId || null) : null;
      const whitelisted = antiraid?.enabled ? await isWhitelisted(guildId, userId, memberRoleIds) : true;

      // ── AntiFlood ─────────────────────────────────────────────────────────
      if (!whitelisted && antiraid?.enabled && antiraid.antiFlood) {
        if (!floodTracker.has(guildId)) floodTracker.set(guildId, new Map());
        const guildFlood = floodTracker.get(guildId)!;
        const windowMs = (antiraid.floodInterval ?? 3) * 1000;
        const limit = antiraid.floodLimit ?? 5;
        const userMsgs = (guildFlood.get(userId) ?? []).filter((t) => now - t < windowMs);
        userMsgs.push(now);
        guildFlood.set(userId, userMsgs);

        if (userMsgs.length >= limit) {
          guildFlood.set(userId, []);
          const action = antiraid.floodAction ?? "mute";
          try {
            if (antiraid.deleteOnTrigger) {
              try {
                const msgs = await message.channel.messages.fetch({ limit: 10 });
                const userMsgsList = msgs.filter((m) => m.author.id === userId);
                for (const [, m] of userMsgsList) { await m.delete().catch(() => {}); }
              } catch {}
            }
            if (action === "ban") await message.member?.ban({ reason: "AntiRaid: Flood detectado" });
            else if (action === "kick") await message.member?.kick("AntiRaid: Flood detectado");
            else await message.member?.timeout(10 * 60_000, "AntiRaid: Flood");
            await bumpStats(guildId, "blockedSpam");
            if (secChannel && logCfg?.logSecurity) {
              await sendLog(secChannel, {
                title: "AntiFlood — Flood Detectado",
                description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Mensajes:** ${userMsgs.length} en ${antiraid.floodInterval}s\n**Accion:** ${action}\n**Canal:** <#${message.channelId}>`,
                color: 0xFF6B35, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" },
              }, botToken);
            }
          } catch {}
          return;
        }
      }

      // ── AntiSpam ──────────────────────────────────────────────────────────
      if (!whitelisted && antiraid?.enabled && antiraid.antiSpam) {
        const key = `${guildId}:${userId}`;
        const windowMs  = (antiraid.antiSpamInterval ?? 5) * 1000;
        const threshold = antiraid.antiSpamLimit ?? 5;
        const msgs = (spamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
        msgs.push(now);
        spamTracker.set(key, msgs);
        if (msgs.length >= threshold) {
          spamTracker.set(key, []);
          try {
            if (antiraid.deleteOnTrigger) { await message.delete().catch(() => {}); }
            const action = antiraid.antiSpamAction ?? "mute";
            if (action === "ban") await message.member?.ban({ reason: "AntiRaid: Spam" });
            else if (action === "kick") await message.member?.kick("AntiRaid: Spam");
            else await message.member?.timeout(10 * 60_000, "AntiRaid: Spam");
            await bumpStats(guildId, "blockedSpam");
            if (secChannel && logCfg?.logSecurity) {
              await sendLog(secChannel, { title: "AntiSpam Activado", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Accion:** ${action}\n**Mensajes:** ${msgs.length} en ${antiraid.antiSpamInterval}s`, color: 0xFF6B35, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
            }
          } catch {}
          return;
        }
      }

      // ── AntiLinks ─────────────────────────────────────────────────────────
      if (!whitelisted && antiraid?.enabled && antiraid.antiLinks && content) {
        const inviteRx = /discord(?:\.gg|\.com\/invite)\/[a-zA-Z0-9-]+/gi;
        const urlRx = /https?:\/\/[^\s<>"]+/gi;
        const rawInvites = content.match(inviteRx) || [];
        const rawUrls = content.match(urlRx) || [];
        const allLinks = [...rawInvites.map((l) => `https://${l}`), ...rawUrls];

        if (allLinks.length > 0) {
          const allowed  = antiraid.allowedDomains ?? [];
          const blocked  = antiraid.blockedDomains ?? [];
          const antiDiscordInvites = (antiraid as any).antiDiscordInvites !== false;
          const nsfwPatterns = ["pornhub", "xvideos", "xhamster", "onlyfans", "redtube", "youporn"];
          const maliciousPatterns = ["grabify", "iplogger", "ipgrabber", "discord.gift/", "steamcommunity.ru", "discordapp.net"];

          let blockedReason = "";
          const hasBlocked = allLinks.some((link) => {
            try {
              const url = new URL(link);
              const hn = url.hostname.toLowerCase();
              if (allowed.some((d: string) => hn.includes(d))) return false;
              if (antiDiscordInvites && rawInvites.length > 0 && /discord\.(gg|com)/.test(hn)) { blockedReason = "Invitacion de Discord"; return true; }
              if (nsfwPatterns.some((p) => hn.includes(p))) { blockedReason = "Contenido NSFW"; return true; }
              if (maliciousPatterns.some((p) => link.toLowerCase().includes(p))) { blockedReason = "Enlace malicioso"; return true; }
              if (blocked.length > 0 && blocked.some((d: string) => hn.includes(d))) { blockedReason = "Dominio bloqueado"; return true; }
              if (blocked.length === 0) { blockedReason = "Enlace no permitido"; return true; }
              return false;
            } catch { blockedReason = "Enlace invalido"; return true; }
          });

          if (hasBlocked) {
            await message.delete().catch(() => {});
            const linksAction = (antiraid as any).antiLinksAction || "delete";
            if (linksAction === "ban") await (message.member as GuildMember)?.ban({ reason: `AntiRaid AntiLinks: ${blockedReason}` }).catch(() => {});
            else if (linksAction === "kick") await (message.member as GuildMember)?.kick(`AntiRaid AntiLinks: ${blockedReason}`).catch(() => {});
            else if (linksAction === "timeout") await (message.member as GuildMember)?.timeout(10 * 60_000, `AntiRaid AntiLinks: ${blockedReason}`).catch(() => {});
            if (logChannel && logCfg?.logMessages) {
              await sendLog(logChannel, { title: `AntiLinks — ${blockedReason}`, description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Canal:** <#${message.channelId}>\n**Accion:** ${linksAction === "delete" ? "Mensaje eliminado" : linksAction}\n**Mensaje:** ${content.substring(0, 200)}`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
              await logToDb(guildId, { userId, username, action: "antilinks_block", category: "security", details: `${blockedReason}: ${content.substring(0, 100)}` });
            }
            return;
          }
        }
      }

      // ── AntiMassMention ───────────────────────────────────────────────────
      if (!whitelisted && antiraid?.enabled && antiraid.antiMassMention) {
        const limit = antiraid.massMentionLimit ?? 5;
        const mc    = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
        if (mc >= limit) {
          await message.delete().catch(() => {});
          await message.member?.timeout(5 * 60_000, "AntiRaid: Mass mention").catch(() => {});
          if (secChannel && logCfg?.logSecurity) {
            await sendLog(secChannel, { title: "AntiMassMention", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Menciones:** ${mc}\n**Canal:** <#${message.channelId}>`, color: 0xFF6B35, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiRaid" } }, botToken);
          }
          return;
        }
      }

      // ── AutoMod ───────────────────────────────────────────────────────────
      if (automod?.enabled && content) {
        const exemptRoles    = automod.exemptRoles ?? [];
        const exemptChannels = automod.exemptChannels ?? [];
        if (exemptChannels.includes(message.channelId) || exemptRoles.some((r: string) => memberRoleIds.includes(r))) return;

        if (automod.badWordsEnabled && automod.badWords?.length) {
          const lower = content.toLowerCase();
          const hasBad = automod.badWords.some((w: string) => lower.includes(w.toLowerCase()));
          if (hasBad) {
            await message.delete().catch(() => {});
            const warnCount = await addWarning(guildId, userId, username, "Palabra prohibida detectada", "medium", botToken, automodLog);
            if (warnCount >= (automod.warnThreshold ?? 3)) {
              const action = automod.warnAction ?? "mute";
              if (action === "ban") await message.member?.ban({ reason: "AutoMod: Limite de advertencias" }).catch(() => {});
              else if (action === "kick") await message.member?.kick("AutoMod: Limite de advertencias").catch(() => {});
              else await message.member?.timeout((automod.warnDuration ?? 10) * 60_000, "AutoMod: Limite").catch(() => {});
            }
            return;
          }
        }

        if (automod.capsEnabled && content.length >= (automod.capsMinLength ?? 10)) {
          const upper = content.replace(/[^a-zA-Z]/g, "").toUpperCase();
          const all   = content.replace(/[^a-zA-Z]/g, "");
          if (all.length > 0 && (upper.length / all.length) * 100 >= (automod.capsThreshold ?? 70)) {
            await message.delete().catch(() => {});
            if (automodLog) {
              await sendLog(automodLog, { title: "AutoMod — Mayusculas Excesivas", description: `**Usuario:** \`${username}\` (<@${userId}>)\n**Canal:** <#${message.channelId}>`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AutoMod" } }, botToken);
            }
            return;
          }
        }

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

        if (automod.zalgoEnabled) {
          const zalgoRx = /[\u0300-\u036f\u0489\u1dc0-\u1dff\u20d0-\u20ff]{3,}/;
          if (zalgoRx.test(content)) {
            await message.delete().catch(() => {});
            if (automodLog) {
              await sendLog(automodLog, { title: "AutoMod — Texto Zalgo", description: `**Usuario:** \`${username}\` (<@${userId}>)`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix AutoMod" } }, botToken);
            }
            return;
          }
        }
      }

      // ── AI Channels ────────────────────────────────────────────────────────
      const aiGroqKey = process.env.GROQ_API_KEY;
      if (aiGroqKey && content) {
        const [aiChannel] = await db.select().from(aiChannelsTable)
          .where(and(eq(aiChannelsTable.guildId, guildId), eq(aiChannelsTable.channelId, message.channelId), eq(aiChannelsTable.enabled, true)));
        if (aiChannel) {
          const botMentioned = message.mentions.users.has(client.user?.id ?? "");
          if (!aiChannel.mentionOnly || botMentioned) {
            const cooldownKey = `ai:${guildId}:${message.channelId}:${userId}`;
            const lastUsed = aiCooldowns.get(cooldownKey) ?? 0;
            const cooldownMs = (aiChannel.cooldownSeconds ?? 3) * 1000;
            if (Date.now() - lastUsed >= cooldownMs) {
              aiCooldowns.set(cooldownKey, Date.now());
              try {
                await message.channel.sendTyping().catch(() => {});
                const systemPrompt = aiChannel.systemPrompt || "Eres un asistente util del servidor Discord. Responde de forma concisa y en el mismo idioma que el usuario.";

                // Build conversation history (up to last 10 messages per channel)
                const historyKey = `ai:${guildId}:${message.channelId}`;
                const history = aiConversations.get(historyKey) ?? [];
                history.push({ role: "user", content: content.substring(0, 1500) });
                // Keep max 10 pairs (20 messages) to avoid exceeding context
                const trimmedHistory = history.slice(-20);

                const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aiGroqKey}` },
                  body: JSON.stringify({
                    model: aiChannel.model || "llama-3.1-8b-instant",
                    messages: [{ role: "system", content: systemPrompt }, ...trimmedHistory],
                    max_tokens: aiChannel.maxTokens || 500,
                    temperature: (aiChannel.temperature || 70) / 100,
                  }),
                });
                if (resp.ok) {
                  const data = await resp.json() as any;
                  const reply = data?.choices?.[0]?.message?.content?.trim();
                  if (reply) {
                    // Save assistant response to history
                    trimmedHistory.push({ role: "assistant", content: reply.substring(0, 1500) });
                    aiConversations.set(historyKey, trimmedHistory.slice(-20));

                    // Try webhook response for Pro/Ultra guilds (custom name/avatar)
                    let sentViaWebhook = false;
                    const [gCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
                    const isPremiumPro = gCfg?.premiumActive && (gCfg.premiumPlan === "pro" || gCfg.premiumPlan === "ultra");
                    if (isPremiumPro && (gCfg.webhookBotName || gCfg.webhookBotAvatar)) {
                      try {
                        const botToken2 = process.env.DISCORD_BOT_TOKEN;
                        // Get or create webhook for this channel
                        const whRes = await fetch(`https://discord.com/api/v10/channels/${message.channelId}/webhooks`, {
                          headers: { "Authorization": `Bot ${botToken2}` },
                        });
                        if (whRes.ok) {
                          const webhooks = await whRes.json() as any[];
                          const existing = webhooks.find((w: any) => w.name === "Neuralix AI" || w.user?.id === client.user?.id);
                          let webhookUrl = existing ? `https://discord.com/api/webhooks/${existing.id}/${existing.token}` : null;
                          if (!webhookUrl) {
                            const createRes = await fetch(`https://discord.com/api/v10/channels/${message.channelId}/webhooks`, {
                              method: "POST",
                              headers: { "Authorization": `Bot ${botToken2}`, "Content-Type": "application/json" },
                              body: JSON.stringify({ name: "Neuralix AI" }),
                            });
                            if (createRes.ok) {
                              const wh = await createRes.json() as any;
                              webhookUrl = `https://discord.com/api/webhooks/${wh.id}/${wh.token}`;
                            }
                          }
                          if (webhookUrl) {
                            const sendRes = await fetch(webhookUrl, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                content: reply.substring(0, 1990),
                                username: gCfg.webhookBotName || "Neuralix AI",
                                avatar_url: gCfg.webhookBotAvatar || undefined,
                              }),
                            });
                            if (sendRes.ok) sentViaWebhook = true;
                          }
                        }
                      } catch {}
                    }
                    if (!sentViaWebhook) {
                      await message.reply({ content: reply.substring(0, 1990) }).catch(() => {});
                    }
                  }
                }
              } catch {}
            }
          }
        }
      }

      // ── AI Image Generation (Pro/Ultra) ────────────────────────────────────
      // Trigger: /imagen <prompt> in any channel (Premium guilds only)
      if (content && /^\/imagen\s+/i.test(content)) {
        try {
          const [gCfgImg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
          const isPremiumForImage = gCfgImg?.premiumActive && (gCfgImg.premiumPlan === "pro" || gCfgImg.premiumPlan === "ultra");
          if (isPremiumForImage) {
            const prompt = content.replace(/^\/imagen\s+/i, "").trim();
            if (prompt.length < 3) return;
            const cooldownKey2 = `img:${guildId}:${userId}`;
            const lastImg = aiCooldowns.get(cooldownKey2) ?? 0;
            if (Date.now() - lastImg < 10_000) {
              await message.reply({ content: "Espera 10 segundos entre generaciones de imagen." }).catch(() => {});
              return;
            }
            aiCooldowns.set(cooldownKey2, Date.now());
            await message.channel.sendTyping().catch(() => {});
            const encodedPrompt = encodeURIComponent(prompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&seed=${Date.now()}`;
            // Verify image is reachable before sending
            try {
              const checkImg = await fetch(imageUrl, { method: "HEAD" });
              if (checkImg.ok) {
                await message.reply({
                  embeds: [{
                    title: "Imagen generada",
                    description: `**Prompt:** ${prompt.substring(0, 200)}`,
                    image: { url: imageUrl },
                    color: 0x5865F2,
                    footer: { text: "Neuralix AI Image · Solo disponible en planes Pro/Ultra" },
                  }],
                } as any).catch(() => {});
              } else {
                await message.reply({ content: "No se pudo generar la imagen. Intenta con otro prompt." }).catch(() => {});
              }
            } catch {
              await message.reply({ content: "Error al generar la imagen." }).catch(() => {});
            }
          } else if (!gCfgImg?.premiumActive) {
            await message.reply({ content: "La generacion de imagenes con IA requiere plan Pro o Ultra." }).catch(() => {});
          }
        } catch {}
      }
    } catch (err) {
      logger.error({ err, guildId, userId }, "Error en messageCreate");
    }
  });

  // ─── Message Update ───────────────────────────────────────────────────────
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!newMsg.guild || newMsg.author?.bot) return;
    const guildId = newMsg.guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      const logChannel = getLogChannel(logCfg, "messages");
      if (!logChannel || !logCfg?.logMessages) return;
      if (!oldMsg.content || !newMsg.content || oldMsg.content === newMsg.content) return;
      await sendLog(logChannel, {
        title: "Mensaje Editado",
        description: `**Usuario:** <@${newMsg.author?.id}> (\`${newMsg.author?.username}\`)\n**Canal:** <#${newMsg.channelId}>\n**Antes:** ${oldMsg.content?.substring(0, 300) ?? "Desconocido"}\n**Despues:** ${newMsg.content?.substring(0, 300)}\n[Ver mensaje](${newMsg.url})`,
        color: 0x5865F2, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
      }, botToken);
      await logToDb(guildId, {
        userId: newMsg.author?.id, username: newMsg.author?.username,
        action: "message_edit", category: "message",
        channelId: newMsg.channelId, channelName: (newMsg.channel as any)?.name,
        details: `Antes: ${oldMsg.content?.substring(0, 200)}\nDespues: ${newMsg.content?.substring(0, 200)}`,
      });
    } catch {}
  });

  // ─── Message Delete ───────────────────────────────────────────────────────
  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return;
    const guildId = message.guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      const logChannel = getLogChannel(logCfg, "messages");
      if (!logChannel || !logCfg?.logMessages) return;
      if (!message.content && !message.attachments?.size) return;
      const desc = [`**Usuario:** <@${message.author?.id}> (\`${message.author?.username}\`)`, `**Canal:** <#${message.channelId}>`];
      if (message.content) desc.push(`**Contenido:** ${message.content.substring(0, 400)}`);
      if (message.attachments?.size) desc.push(`**Adjuntos:** ${message.attachments.size}`);
      await sendLog(logChannel, {
        title: "Mensaje Eliminado",
        description: desc.join("\n"),
        color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" },
      }, botToken);
      await logToDb(guildId, {
        userId: message.author?.id, username: message.author?.username,
        action: "message_delete", category: "message",
        channelId: message.channelId, channelName: (message.channel as any)?.name,
        details: message.content?.substring(0, 300) ?? null,
      });
    } catch {}
  });

  // ─── Voice State Update ───────────────────────────────────────────────────
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      const logChannel = getLogChannel(logCfg, "members");
      if (!logChannel || !logCfg?.logVoice) return;
      const userId = newState.id;
      const username = newState.member?.user.username || "Desconocido";

      if (!oldState.channelId && newState.channelId) {
        await sendLog(logChannel, { title: "Se unio a canal de voz", description: `**Usuario:** <@${userId}> (\`${username}\`)\n**Canal:** <#${newState.channelId}>`, color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId, username, action: "voice_join", category: "voice", channelId: newState.channelId });
      } else if (oldState.channelId && !newState.channelId) {
        await sendLog(logChannel, { title: "Salio del canal de voz", description: `**Usuario:** <@${userId}> (\`${username}\`)\n**Canal:** <#${oldState.channelId}>`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId, username, action: "voice_leave", category: "voice", channelId: oldState.channelId });
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        await sendLog(logChannel, { title: "Cambio de canal de voz", description: `**Usuario:** <@${userId}> (\`${username}\`)\n**Desde:** <#${oldState.channelId}>\n**Hacia:** <#${newState.channelId}>`, color: 0xFEE75C, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId, username, action: "voice_move", category: "voice", channelId: newState.channelId, details: `${oldState.channelId} → ${newState.channelId}` });
      }
    } catch {}
  });

  // ─── Guild Audit Log Entry — Enhanced Logging ─────────────────────────────
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    const guildId = guild.id;
    try {
      const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
      if (!logCfg?.enabled) return;

      const executor = entry.executor;
      const executorStr = executor ? `\`${executor.username}\` (<@${executor.id}>)` : "Desconocido";
      const ts = new Date().toISOString();

      switch (entry.action) {
        // Kicks
        case AuditLogEvent.MemberKick: {
          const ch = getLogChannel(logCfg, "moderation");
          if (ch && logCfg.logModeration) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Miembro Expulsado", description: `**Usuario:** \`${target?.username || "Desconocido"}\` (\`${target?.id}\`)\n**Responsable:** ${executorStr}\n**Razon:** ${entry.reason || "Sin razon"}`, color: 0xFEE75C, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: target?.id, username: target?.username, action: "member_kick", category: "moderation", reason: entry.reason ?? null, moderatorId: executor?.id, moderatorName: executor?.username });
          }
          break;
        }

        // Timeouts
        case AuditLogEvent.MemberUpdate: {
          const ch = getLogChannel(logCfg, "moderation");
          if (ch && logCfg.logModeration) {
            const timeoutChange = entry.changes?.find((c) => c.key === "communication_disabled_until");
            if (timeoutChange) {
              const target = entry.target as any;
              const action = timeoutChange.new ? "Silenciado" : "Silencio Levantado";
              await sendLog(ch, { title: `Miembro ${action}`, description: `**Usuario:** \`${target?.username || "Desconocido"}\` (\`${target?.id}\`)\n**Responsable:** ${executorStr}\n**Hasta:** ${timeoutChange.new ? new Date(timeoutChange.new as string).toLocaleString("es-ES") : "—"}`, color: timeoutChange.new ? 0xFEE75C : 0x57F287, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
              await logToDb(guildId, { userId: target?.id, username: target?.username, action: timeoutChange.new ? "member_timeout" : "timeout_lifted", category: "moderation", moderatorId: executor?.id, moderatorName: executor?.username });
            }
          }
          break;
        }

        // Unban
        case AuditLogEvent.MemberBanRemove: {
          const ch = getLogChannel(logCfg, "moderation");
          if (ch && logCfg.logModeration) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Baneo Levantado", description: `**Usuario:** \`${target?.username || "Desconocido"}\` (\`${target?.id}\`)\n**Responsable:** ${executorStr}`, color: 0x57F287, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: target?.id, username: target?.username, action: "member_unban", category: "moderation", moderatorId: executor?.id, moderatorName: executor?.username });
          }
          break;
        }

        // Role create / delete (via audit — adds DB log)
        case AuditLogEvent.RoleCreate: {
          const ch = getLogChannel(logCfg, "roles");
          if (ch && logCfg.logRoles) {
            const target = entry.target as any;
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "role_create", category: "role", targetId: target?.id, targetName: target?.name });
          }
          break;
        }
        case AuditLogEvent.RoleDelete: {
          const ch = getLogChannel(logCfg, "roles");
          if (ch && logCfg.logRoles) {
            const target = entry.target as any;
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "role_delete", category: "role", targetId: target?.id, targetName: target?.name });
          }
          break;
        }

        // Emoji create / delete
        case AuditLogEvent.EmojiCreate: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Emoji Creado", description: `**Nombre:** :${target?.name || "desconocido"}:\n**Responsable:** ${executorStr}`, color: 0x57F287, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "emoji_create", category: "server", targetName: target?.name });
          }
          break;
        }
        case AuditLogEvent.EmojiDelete: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Emoji Eliminado", description: `**Nombre:** :${target?.name || "desconocido"}:\n**Responsable:** ${executorStr}`, color: 0xED4245, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "emoji_delete", category: "server", targetName: target?.name });
          }
          break;
        }

        // Channel updates
        case AuditLogEvent.ChannelCreate: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "channel_create", category: "channel", targetId: target?.id, targetName: target?.name });
          }
          break;
        }
        case AuditLogEvent.ChannelDelete: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "channel_delete", category: "channel", targetName: target?.name });
          }
          break;
        }
        case AuditLogEvent.ChannelUpdate: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            const changes = entry.changes?.map((c) => `**${c.key}:** \`${String(c.old ?? "—")}\` → \`${String(c.new ?? "—")}\``).join("\n") || "Sin detalles";
            await sendLog(ch, { title: "Canal Actualizado", description: `**Canal:** ${target?.id ? `<#${target.id}>` : "Desconocido"}\n**Responsable:** ${executorStr}\n${changes}`, color: 0x5865F2, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "channel_update", category: "channel", targetId: target?.id, targetName: target?.name, details: changes });
          }
          break;
        }

        // Webhook spam detection
        case AuditLogEvent.WebhookCreate: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Webhook Creado", description: `**Nombre:** ${target?.name || "Desconocido"}\n**Responsable:** ${executorStr}\n**Canal:** ${target?.channelId ? `<#${target.channelId}>` : "Desconocido"}`, color: 0x57F287, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "webhook_create", category: "channel", targetName: target?.name });
          }
          // Webhook spam detection
          if (executor?.id) {
            const [raidCfg] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
            if (raidCfg?.enabled && raidCfg.antiWebhook) {
              const key = `${guildId}:${executor.id}`;
              const now = Date.now();
              const windowMs = ((raidCfg as any).webhookSpamInterval ?? 60) * 1000;
              const threshold = (raidCfg as any).webhookSpamThreshold ?? 3;
              const timestamps = (webhookSpamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
              timestamps.push(now);
              webhookSpamTracker.set(key, timestamps);
              if (timestamps.length >= threshold) {
                webhookSpamTracker.set(key, []);
                const secCh = getLogChannel(raidCfg as any, "security");
                const whitelisted = await isWhitelisted(guildId, executor.id);
                if (!whitelisted) {
                  try {
                    const member = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
                    if (member) {
                      if (raidCfg.nukeAction === "ban") await member.ban({ reason: "AntiRaid: Webhook spam" }).catch(() => {});
                      else if (raidCfg.nukeAction === "kick") await member.kick("AntiRaid: Webhook spam").catch(() => {});
                      else await member.roles.set([], "AntiRaid: Webhook spam").catch(() => {});
                    }
                    if (secCh) await sendLog(secCh, { title: "AntiWebhook — Webhook Spam", description: `**Responsable:** ${executorStr}\n**Webhooks:** ${timestamps.length} en ${raidCfg.webhookSpamInterval}s\n**Accion:** ${raidCfg.nukeAction}`, color: 0xED4245, timestamp: ts, footer: { text: "Neuralix AntiRaid" } }, botToken);
                  } catch {}
                }
              }
            }
          }
          break;
        }
        case AuditLogEvent.WebhookDelete: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Webhook Eliminado", description: `**Nombre:** ${target?.name || "Desconocido"}\n**Responsable:** ${executorStr}`, color: 0xED4245, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "webhook_delete", category: "channel", targetName: target?.name });
          }
          break;
        }
        case AuditLogEvent.WebhookUpdate: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            await sendLog(ch, { title: "Webhook Modificado", description: `**Responsable:** ${executorStr}`, color: 0xFEE75C, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
          }
          break;
        }

        // Guild settings (logToDb)
        case AuditLogEvent.GuildUpdate: {
          const ch = getLogChannel(logCfg, "moderation");
          if (ch && logCfg.logModeration) {
            const changes = entry.changes?.map((c) => `**${c.key}:** \`${String(c.old ?? "—")}\` → \`${String(c.new ?? "—")}\``).join("\n") || "Sin detalles";
            await sendLog(ch, { title: "Servidor Modificado", description: `**Responsable:** ${executorStr}\n${changes}`, color: 0x5865F2, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "guild_update", category: "server", details: changes });
          }
          break;
        }

        // Role updates (logToDb)
        case AuditLogEvent.RoleUpdate: {
          const ch = getLogChannel(logCfg, "roles");
          if (ch && logCfg.logRoles) {
            const target = entry.target as any;
            const changes = entry.changes?.map((c) => `**${c.key}:** \`${String(c.old ?? "—")}\` → \`${String(c.new ?? "—")}\``).join("\n") || "Sin detalles";
            await sendLog(ch, { title: "Rol Actualizado", description: `**Rol:** @${target?.name || "Desconocido"}\n**Responsable:** ${executorStr}\n${changes}`, color: 0xFEE75C, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "role_update", category: "role", targetId: target?.id, targetName: target?.name, details: changes });
          }
          break;
        }

        // Invites (logToDb)
        case AuditLogEvent.InviteCreate: {
          const ch = getLogChannel(logCfg, "members");
          if (ch && logCfg.logInvites) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Invitacion Creada", description: `**Codigo:** ${target?.code || "Desconocido"}\n**Creador:** ${executorStr}\n**Usos max:** ${target?.maxUses || "Ilimitado"}\n**Expira:** ${target?.maxAge ? `${target.maxAge / 3600}h` : "Nunca"}`, color: 0x57F287, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "invite_create", category: "member", details: `discord.gg/${target?.code}` });
          }
          break;
        }
        case AuditLogEvent.InviteDelete: {
          const ch = getLogChannel(logCfg, "members");
          if (ch && logCfg.logInvites) {
            const target = entry.target as any;
            await sendLog(ch, { title: "Invitacion Eliminada", description: `**Codigo:** ${target?.code || "Desconocido"}\n**Responsable:** ${executorStr}`, color: 0xED4245, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
            await logToDb(guildId, { userId: executor?.id, username: executor?.username, action: "invite_delete", category: "member", details: `discord.gg/${target?.code}` });
          }
          break;
        }

        // Channel permission overrides
        case AuditLogEvent.ChannelOverwriteCreate:
        case AuditLogEvent.ChannelOverwriteUpdate:
        case AuditLogEvent.ChannelOverwriteDelete: {
          const ch = getLogChannel(logCfg, "channels");
          if (ch && logCfg.logChannels) {
            const actionNames = { [AuditLogEvent.ChannelOverwriteCreate]: "Creado", [AuditLogEvent.ChannelOverwriteUpdate]: "Actualizado", [AuditLogEvent.ChannelOverwriteDelete]: "Eliminado" };
            const target = entry.target as any;
            await sendLog(ch, { title: `Permiso de Canal ${actionNames[entry.action]}`, description: `**Canal:** ${target?.id ? `<#${target.id}>` : "Desconocido"}\n**Responsable:** ${executorStr}`, color: 0xFEE75C, timestamp: ts, footer: { text: "Neuralix Logs" } }, botToken);
          }
          break;
        }
      }
    } catch {}
  });

  // ─── Channel Create ───────────────────────────────────────────────────────
  client.on(Events.ChannelCreate, async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const guildId = channel.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = getLogChannel(logCfg, "channels");
      let executorId: string | undefined; let executorTag: string | undefined;
      try {
        const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) { executorId = entry.executor?.id; executorTag = entry.executor?.username; }
      } catch {}

      if (logChannel && logCfg?.logChannels) {
        await sendLog(logChannel, { title: "Canal Creado", description: `**Canal:** <#${channel.id}> (#${(channel as any).name})\n**Tipo:** ${channel.type}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`, color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId: executorId, username: executorTag, action: "channel_create", category: "channel", targetId: channel.id, targetName: (channel as any).name ?? null });
      }

      if (antiraid?.enabled && antiraid.antiChannelCreate && executorId) {
        const secChannel = getLogChannel(logCfg, "security");
        const whitelisted = await isWhitelisted(guildId, executorId);
        if (!whitelisted) {
          const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
          if (exceeded && antiraid.antiNuke) {
            try {
              const member = channel.guild.members.cache.get(executorId);
              if (member) {
                if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Creacion masiva de canales" });
                else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke");
                else await member.roles.set([], "AntiNuke: Permisos revocados");
              }
              if (secChannel) { await sendLog(secChannel, { title: "AntiNuke — Canales Masivos", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken); }
            } catch {}
          }
        }
      }
    } catch {}
  });

  // ─── Channel Delete ───────────────────────────────────────────────────────
  client.on(Events.ChannelDelete, async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const guildId = channel.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = getLogChannel(logCfg, "channels");
      let executorId: string | undefined; let executorTag: string | undefined;
      try {
        const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) { executorId = entry.executor?.id; executorTag = entry.executor?.username; }
      } catch {}

      if (logChannel && logCfg?.logChannels) {
        await sendLog(logChannel, { title: "Canal Eliminado", description: `**Canal:** #${(channel as any).name ?? "desconocido"}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId: executorId, username: executorTag, action: "channel_delete", category: "channel", targetName: (channel as any).name ?? null });
      }

      if (antiraid?.enabled && executorId && (antiraid.antiNuke || antiraid.antiChannelDelete)) {
        const secChannel = getLogChannel(logCfg, "security");
        const whitelisted = await isWhitelisted(guildId, executorId);
        if (!whitelisted) {
          const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
          if (exceeded && antiraid.antiNuke) {
            try {
              const member = channel.guild.members.cache.get(executorId);
              if (member) {
                if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Destruccion masiva" });
                else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke");
                else await member.roles.set([], "AntiNuke: Permisos revocados");
              }
              if (secChannel) { await sendLog(secChannel, { title: "AntiNuke — Destruccion Masiva", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken); }
            } catch {}
          }
        }
      }
    } catch {}
  });

  // ─── Role Create ─────────────────────────────────────────────────────────
  client.on(Events.GuildRoleCreate, async (role) => {
    const guildId = role.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = getLogChannel(logCfg, "roles");
      const secChannel = getLogChannel(logCfg, "security");
      let executorId: string | undefined; let executorTag: string | undefined;
      try {
        const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) { executorId = entry.executor?.id; executorTag = entry.executor?.username; }
      } catch {}

      if (logChannel && logCfg?.logRoles) {
        await sendLog(logChannel, { title: "Rol Creado", description: `**Rol:** @${role.name}\n**ID:** \`${role.id}\`\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`, color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId: executorId, username: executorTag, action: "role_create", category: "role", targetId: role.id, targetName: role.name });
      }

      if (antiraid?.enabled && antiraid.antiRoleCreate && executorId) {
        const whitelisted = await isWhitelisted(guildId, executorId);
        if (!whitelisted) {
          const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
          if (exceeded && antiraid.antiNuke) {
            const member = role.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Roles masivos" }).catch(() => {});
              else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke").catch(() => {});
              else await member.roles.set([], "AntiNuke").catch(() => {});
            }
            if (secChannel) { await sendLog(secChannel, { title: "AntiNuke — Roles Masivos", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken); }
          }
        }
      }
    } catch {}
  });

  // ─── Role Delete ─────────────────────────────────────────────────────────
  client.on(Events.GuildRoleDelete, async (role) => {
    const guildId = role.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = getLogChannel(logCfg, "roles");
      const secChannel = getLogChannel(logCfg, "security");
      let executorId: string | undefined; let executorTag: string | undefined;
      try {
        const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) { executorId = entry.executor?.id; executorTag = entry.executor?.username; }
      } catch {}

      if (logChannel && logCfg?.logRoles) {
        await sendLog(logChannel, { title: "Rol Eliminado", description: `**Rol:** @${role.name}\n**Responsable:** ${executorTag ? `\`${executorTag}\`` : "Desconocido"}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId: executorId, username: executorTag, action: "role_delete", category: "role", targetId: role.id, targetName: role.name });
      }

      if (antiraid?.enabled && executorId && (antiraid.antiNuke || antiraid.antiRoleDelete)) {
        const whitelisted = await isWhitelisted(guildId, executorId);
        if (!whitelisted) {
          const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
          if (exceeded && antiraid.antiNuke) {
            const member = role.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Destruccion masiva de roles" }).catch(() => {});
              else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke").catch(() => {});
              else await member.roles.set([], "AntiNuke").catch(() => {});
            }
            if (secChannel) { await sendLog(secChannel, { title: "AntiNuke — Roles Eliminados", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken); }
          }
        }
      }
    } catch {}
  });

  // ─── Ban Add ─────────────────────────────────────────────────────────────
  client.on(Events.GuildBanAdd, async (ban) => {
    const guildId = ban.guild.id;
    try {
      const [antiraid, logCfg] = await Promise.all([
        db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId)).then(([r]) => r),
        db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId)).then(([r]) => r),
      ]);
      const logChannel = getLogChannel(logCfg, "moderation");
      const secChannel = getLogChannel(logCfg, "security");
      let executorId: string | undefined;
      try {
        const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
        const entry = audit.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000) executorId = entry.executor?.id;
      } catch {}

      if (logChannel && logCfg?.logModeration) {
        await sendLog(logChannel, { title: "Miembro Baneado", description: `**Usuario:** \`${ban.user.username}\` (\`${ban.user.id}\`)\n**Razon:** ${ban.reason ?? "Sin razon"}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Logs" } }, botToken);
        await logToDb(guildId, { userId: ban.user.id, username: ban.user.username, action: "member_ban", category: "moderation", reason: ban.reason ?? null, moderatorId: executorId });
      }

      if (antiraid?.enabled && executorId && (antiraid.antiNuke || antiraid.antiBanMass)) {
        const whitelisted = await isWhitelisted(guildId, executorId);
        if (!whitelisted) {
          const exceeded = trackNukeAction(guildId, executorId, antiraid.nukeThreshold ?? 10);
          if (exceeded && antiraid.antiNuke) {
            const member = ban.guild.members.cache.get(executorId);
            if (member) {
              if (antiraid.nukeAction === "ban") await member.ban({ reason: "AntiNuke: Bans masivos" }).catch(() => {});
              else if (antiraid.nukeAction === "kick") await member.kick("AntiNuke").catch(() => {});
              else await member.roles.set([], "AntiNuke").catch(() => {});
            }
            if (secChannel) { await sendLog(secChannel, { title: "AntiNuke — Bans Masivos", description: `**Responsable:** <@${executorId}>\n**Accion:** ${antiraid.nukeAction}`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix AntiNuke" } }, botToken); }
          }
        }
      }
    } catch {}
  });

  // ─── Giveaway reaction remove handler ─────────────────────────────────────
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if ((user as any).bot) return;
    if (reaction.emoji.name !== "🎉") return;
    try {
      const messageId = reaction.message.id;
      const [giveaway] = await db.select().from(giveawaysTable).where(
        and(eq(giveawaysTable.messageId, messageId), eq(giveawaysTable.status, "active")),
      );
      if (!giveaway) return;
      const entrants = (giveaway.entrants ?? []).filter((id) => id !== (user as any).id);
      await db.update(giveawaysTable).set({ entrants, updatedAt: new Date() }).where(eq(giveawaysTable.messageId, messageId));
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

  // ─── Ticket open helper ───────────────────────────────────────────────────
  // Safe defer helper — prevents "already acknowledged" crashes
  async function safeDefer(interaction: any) {
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply({ flags: 64 }); } catch {}
    }
  }

  async function handleTicketOpen(interaction: any, guildId: string, userId: string, username: string, moduleId: number | null, panelId?: number | null) {
    await safeDefer(interaction);
    try {
      const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
      if (!cfg?.enabled) { await interaction.editReply({ content: "El sistema de tickets no esta activo." }); return; }

      const openTickets = await db.select().from(ticketsTable).where(
        and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId), eq(ticketsTable.status, "open")),
      );
      if (openTickets.length >= (cfg.maxTicketsPerUser ?? 1)) {
        await interaction.editReply({ content: `Ya tienes ${openTickets.length} ticket(s) abierto(s). Maximo: ${cfg.maxTicketsPerUser}.` }); return;
      }

      let mod: any = null;
      if (moduleId) {
        const [m] = await db.select().from(ticketModulesTable).where(and(eq(ticketModulesTable.id, moduleId), eq(ticketModulesTable.guildId, guildId)));
        mod = m;
      }

      let panel: any = null;
      if (panelId) {
        const [p] = await db.select().from(ticketPanelsTable).where(and(eq(ticketPanelsTable.id, panelId), eq(ticketPanelsTable.guildId, guildId)));
        panel = p;
      }

      const safeUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "").substring(0, 20) || "usuario";
      const channelName = (cfg.ticketNameFormat ?? "ticket-{username}").replace("{username}", safeUsername).replace("{userid}", userId).substring(0, 100);

      const supportRoleIds: string[] = mod?.supportRoleIds?.length ? mod.supportRoleIds : (cfg.supportRoleIds?.length ? cfg.supportRoleIds : (cfg.supportRoleId ? [cfg.supportRoleId] : []));

      const overwrites: any[] = [
        { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      for (const roleId of supportRoleIds) {
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: mod?.categoryId ?? cfg.categoryId ?? undefined,
        permissionOverwrites: overwrites,
        reason: `Ticket de ${username}`,
      });

      const [ticket] = await db.insert(ticketsTable).values({
        guildId, channelId: ticketChannel.id, userId, username,
        subject: mod ? `[${mod.name}] Ticket de ${username}` : `Ticket de ${username}`,
        status: "open",
        moduleId: mod?.id ?? null,
        moduleName: mod?.name ?? null,
      }).returning();

      const standardOpener = cfg.openMessage || `Hola <@${userId}>, tu ticket fue creado. Pronto te atendemos.`;
      const openMsg = standardOpener.replace("{user}", userId).replace("{username}", username);
      const mentionParts: string[] = [];
      if (cfg.mentionSupport) { for (const rid of supportRoleIds) mentionParts.push(`<@&${rid}>`); }

      const components = await buildTicketComponents(ticket.id, cfg);

      await ticketChannel.send({ content: `${mentionParts.join(" ")} ${openMsg}`.trim(), components } as any);

      // Per-module welcome message as follow-up
      if (mod?.welcomeMessage) {
        const modMsg = mod.welcomeMessage.replace("{user}", `<@${userId}>`).replace("{username}", username);
        await ticketChannel.send({ content: modMsg } as any).catch(() => {});
      }

      // Per-module welcome embed as additional follow-up
      if (mod?.welcomeEmbedEnabled && (mod.welcomeEmbedTitle || mod.welcomeEmbedDescription)) {
        await ticketChannel.send({
          embeds: [{
            title: mod.welcomeEmbedTitle || null,
            description: (mod.welcomeEmbedDescription || "").replace("{user}", `<@${userId}>`).replace("{username}", username),
            color: hexColor(mod.welcomeEmbedColor),
            footer: { text: `Ticket #${ticket.id} · ${mod.name}` },
          }],
        } as any).catch(() => {});
      }

      if (cfg.logsChannelId) {
        await sendToChannel(cfg.logsChannelId, {
          embeds: [{ title: "Nuevo Ticket", description: `**Usuario:** <@${userId}>\n**Canal:** <#${ticketChannel.id}>\n**ID:** #${ticket.id}${mod ? `\n**Modulo:** ${mod.name}` : ""}${panel ? `\n**Panel:** ${panel.name}` : ""}`, color: 0x5865F2, timestamp: new Date().toISOString(), footer: { text: "Neuralix Tickets" } }],
        }, botToken);
      }

      await interaction.editReply({ content: `Tu ticket fue creado: <#${ticketChannel.id}>` });
    } catch (err: any) {
      logger.error({ err, guildId, userId }, "Error al crear ticket");
      await interaction.editReply({ content: "Error al crear el ticket. Contacta a un administrador." }).catch(() => {});
    }
  }

  // ─── Ticket close helper ──────────────────────────────────────────────────
  async function handleTicketClose(interaction: any, guildId: string, ticketId: number, userId: string, username: string) {
    await safeDefer(interaction);
    try {
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.guildId, guildId)));
      if (!ticket) { await interaction.editReply({ content: "Ticket no encontrado." }); return; }
      if (ticket.status === "closed") { await interaction.editReply({ content: "Este ticket ya esta cerrado." }); return; }

      const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
      const supportRoleIds = cfg?.supportRoleIds?.length ? cfg.supportRoleIds : (cfg?.supportRoleId ? [cfg.supportRoleId] : []);
      const member = interaction.guild?.members.cache.get(userId) || await interaction.guild?.members.fetch(userId).catch(() => null);
      const memberRoles = member?.roles?.cache?.map((r: any) => r.id) ?? [];
      const isSupport = supportRoleIds.some((rid: string) => memberRoles.includes(rid));
      const isOwnerOfTicket = ticket.userId === userId;
      if (!isSupport && !isOwnerOfTicket && !member?.permissions?.has?.("ManageChannels")) {
        await interaction.editReply({ content: "No tienes permisos para cerrar este ticket." }); return;
      }

      let transcriptText = "";
      let transcriptHtml = "";
      if (cfg?.autoTranscript) {
        const result = await generateTranscript(interaction.channelId, botToken, ticketId, ticket.username ?? username);
        transcriptText = result.text;
        transcriptHtml = result.html;
      }

      const transcriptToStore = transcriptHtml || transcriptText || null;
      await db.update(ticketsTable).set({ status: "closed", closedAt: new Date(), transcript: transcriptToStore }).where(eq(ticketsTable.id, ticketId));

      try {
        const ch = interaction.channel;
        if (ch) {
          await ch.permissionOverwrites.edit(ticket.userId, { SendMessages: false }).catch(() => {});
          const currentName: string = (ch as any).name || "";
          if (!currentName.startsWith("closed-")) {
            await (ch as any).setName(`closed-${currentName.substring(0, 90)}`).catch(() => {});
          }
          await ch.send({
            embeds: [{ title: "Ticket Cerrado", description: `Cerrado por <@${userId}>`, color: 0xED4245, timestamp: new Date().toISOString(), footer: { text: "Neuralix Tickets" } }],
            components: [{ type: 1, components: [{ type: 2, style: 3, label: "Reabrir Ticket", emoji: { name: "🔓" }, custom_id: `ticket_reopen_${ticketId}` }, { type: 2, style: 4, label: "Eliminar Canal", emoji: { name: "🗑️" }, custom_id: `ticket_delete_${ticketId}` }] }],
          } as any);
        }
      } catch {}

      if (cfg?.transcriptChannelId && (transcriptText || transcriptHtml)) {
        const msgCount = transcriptText ? transcriptText.split("\n").length : 0;
        const embedPayload = {
          embeds: [{
            title: `Transcript — Ticket #${ticketId}`,
            description: `**Usuario:** <@${ticket.userId}> (\`${ticket.username}\`)\n**Cerrado por:** <@${userId}>\n**Mensajes:** ${msgCount}\n**Modulo:** ${ticket.moduleName ?? "General"}`,
            color: 0x5865F2, timestamp: new Date().toISOString(),
            footer: { text: `Ticket #${ticketId} · ${ticket.username}` },
          }],
        };

        if (transcriptHtml) {
          try {
            const htmlBuf = Buffer.from(transcriptHtml, "utf8");
            const form = new FormData();
            form.append("payload_json", JSON.stringify(embedPayload));
            form.append("files[0]", new Blob([htmlBuf], { type: "text/html" }), `transcript-${ticketId}.html`);
            await axios.post(`${DISCORD_API}/channels/${cfg.transcriptChannelId}/messages`, form, {
              headers: { Authorization: `Bot ${botToken.trim()}` },
              validateStatus: () => true,
            });
          } catch {
            await sendToChannel(cfg.transcriptChannelId, embedPayload, botToken);
          }
        } else {
          await sendToChannel(cfg.transcriptChannelId, embedPayload, botToken);
        }
      }

      await interaction.editReply({ content: "Ticket cerrado correctamente." });
    } catch (err: any) {
      logger.error({ err }, "Error al cerrar ticket");
      await interaction.editReply({ content: "Error al cerrar el ticket." }).catch(() => {});
    }
  }

  async function handleTicketClaim(interaction: any, guildId: string, ticketId: number, userId: string, username: string) {
    await safeDefer(interaction);
    try {
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.guildId, guildId)));
      if (!ticket) { await interaction.editReply({ content: "Ticket no encontrado." }); return; }
      if (ticket.claimedBy) { await interaction.editReply({ content: `Este ticket ya fue reclamado por <@${ticket.claimedBy}>.` }); return; }
      await db.update(ticketsTable).set({ claimedBy: userId, claimedByUsername: username }).where(eq(ticketsTable.id, ticketId));
      await interaction.channel?.send({ embeds: [{ title: "Ticket Reclamado", description: `<@${userId}> esta atendiendo este ticket.`, color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Tickets" } }] } as any).catch(() => {});
      await interaction.editReply({ content: "Has reclamado este ticket." });
    } catch { await interaction.editReply({ content: "Error al reclamar el ticket." }).catch(() => {}); }
  }

  async function handleTicketDelete(interaction: any, guildId: string, ticketId: number, userId: string, username: string) {
    await safeDefer(interaction);
    try {
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.guildId, guildId)));
      if (!ticket) { await interaction.editReply({ content: "Ticket no encontrado." }); return; }
      const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
      const supportRoleIds = cfg?.supportRoleIds?.length ? cfg.supportRoleIds : (cfg?.supportRoleId ? [cfg.supportRoleId] : []);
      const member = interaction.guild?.members.cache.get(userId) || await interaction.guild?.members.fetch(userId).catch(() => null);
      const memberRoles = member?.roles?.cache?.map((r: any) => r.id) ?? [];
      const isSupport = supportRoleIds.some((rid: string) => memberRoles.includes(rid));
      if (!isSupport && !member?.permissions?.has?.("ManageChannels")) { await interaction.editReply({ content: "No tienes permisos para eliminar este ticket." }); return; }
      await interaction.editReply({ content: "Canal de ticket sera eliminado en 5 segundos..." });
      await db.update(ticketsTable).set({ status: "deleted", closedAt: new Date() }).where(eq(ticketsTable.id, ticketId));
      try {
        await interaction.channel?.send({ content: "Este canal sera eliminado en **5 segundos**..." }).catch(() => {});
        setTimeout(async () => { try { await interaction.channel?.delete("Ticket eliminado"); } catch {} }, 5000);
      } catch {}
    } catch { await interaction.editReply({ content: "Error al eliminar el ticket." }).catch(() => {}); }
  }

  async function handleTicketReopen(interaction: any, guildId: string, ticketId: number, userId: string, username: string) {
    await safeDefer(interaction);
    try {
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.guildId, guildId)));
      if (!ticket) { await interaction.editReply({ content: "Ticket no encontrado." }); return; }
      if (ticket.status === "open") { await interaction.editReply({ content: "El ticket ya esta abierto." }); return; }
      await db.update(ticketsTable).set({ status: "open", closedAt: null }).where(eq(ticketsTable.id, ticketId));
      try {
        await interaction.channel?.permissionOverwrites.edit(ticket.userId, { SendMessages: true }).catch(() => {});
        const currentName: string = (interaction.channel as any)?.name || "";
        if (currentName.startsWith("closed-")) { await (interaction.channel as any)?.setName(currentName.replace("closed-", "")).catch(() => {}); }
        const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
        const components = await buildTicketComponents(ticketId, cfg);
        await interaction.channel?.send({ embeds: [{ title: "Ticket Reabierto", description: `Reabierto por <@${userId}>`, color: 0x57F287, timestamp: new Date().toISOString(), footer: { text: "Neuralix Tickets" } }], components } as any).catch(() => {});
      } catch {}
      await interaction.editReply({ content: "Ticket reabierto correctamente." });
    } catch { await interaction.editReply({ content: "Error al reabrir el ticket." }).catch(() => {}); }
  }

  // ─── Interaction Create ───────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;
    const userId   = interaction.user.id;
    const username = interaction.user.username;

    // ── Auto-role button ──────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("autorole_")) {
      const roleId = Number(interaction.customId.replace("autorole_", ""));
      if (isNaN(roleId)) return;
      try {
        await safeDefer(interaction);
        const [ar] = await db.select().from(autoRolesTable).where(and(eq(autoRolesTable.id, roleId), eq(autoRolesTable.guildId, guildId)));
        if (!ar || !ar.enabled) { await interaction.editReply({ content: "Este auto-rol no esta disponible." }); return; }
        const member = interaction.guild?.members.cache.get(userId) || await interaction.guild?.members.fetch(userId).catch(() => null);
        if (!member) { await interaction.editReply({ content: "No se pudo obtener tu informacion de miembro." }); return; }
        const addedRoles: string[] = []; const removedRoles: string[] = [];
        for (const rid of (ar.roleIds ?? [])) {
          if (member.roles.cache.has(rid)) { await member.roles.remove(rid).catch(() => {}); removedRoles.push(`<@&${rid}>`); }
          else {
            await member.roles.add(rid).catch(() => {}); addedRoles.push(`<@&${rid}>`);
            if (ar.temporary && ar.durationMinutes > 0) {
              const key = `${guildId}:${userId}:${rid}`;
              const timer = setTimeout(async () => { try { await member.roles.remove(rid); } catch {} tempRoleTimers.delete(key); }, ar.durationMinutes * 60_000);
              tempRoleTimers.set(key, timer);
            }
          }
        }
        const lines: string[] = [];
        if (addedRoles.length) lines.push(`Roles asignados: ${addedRoles.join(", ")}`);
        if (removedRoles.length) lines.push(`Roles removidos: ${removedRoles.join(", ")}`);
        await interaction.editReply({ content: lines.join("\n") || "Sin cambios." });
      } catch { await interaction.editReply({ content: "Error al gestionar el rol." }).catch(() => {}); }
      return;
    }

    // ── Auto-role select menu ─────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "autorole_select") {
      try {
        await safeDefer(interaction);
        const selectedId = Number(interaction.values[0]);
        if (isNaN(selectedId)) { await interaction.editReply({ content: "Opcion invalida." }); return; }
        const [ar] = await db.select().from(autoRolesTable).where(and(eq(autoRolesTable.id, selectedId), eq(autoRolesTable.guildId, guildId)));
        if (!ar || !ar.enabled) { await interaction.editReply({ content: "Este auto-rol no esta disponible." }); return; }
        const member = interaction.guild?.members.cache.get(userId) || await interaction.guild?.members.fetch(userId).catch(() => null);
        if (!member) { await interaction.editReply({ content: "No se pudo obtener tu informacion de miembro." }); return; }
        const addedRoles: string[] = []; const removedRoles: string[] = [];
        for (const rid of (ar.roleIds ?? [])) {
          if (member.roles.cache.has(rid)) { await member.roles.remove(rid).catch(() => {}); removedRoles.push(`<@&${rid}>`); }
          else {
            await member.roles.add(rid).catch(() => {}); addedRoles.push(`<@&${rid}>`);
            if (ar.temporary && ar.durationMinutes > 0) {
              const key = `${guildId}:${userId}:${rid}`;
              const timer = setTimeout(async () => { try { await member.roles.remove(rid); } catch {} tempRoleTimers.delete(key); }, ar.durationMinutes * 60_000);
              tempRoleTimers.set(key, timer);
            }
          }
        }
        const lines: string[] = [];
        if (addedRoles.length) lines.push(`Roles asignados: ${addedRoles.join(", ")}`);
        if (removedRoles.length) lines.push(`Roles removidos: ${removedRoles.join(", ")}`);
        await interaction.editReply({ content: lines.join("\n") || "Sin cambios." });
      } catch { await interaction.editReply({ content: "Error al gestionar el rol." }).catch(() => {}); }
      return;
    }

    // ── Ticket select menu ────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select_module") {
      const moduleId = Number(interaction.values[0]);
      if (!isNaN(moduleId)) await handleTicketOpen(interaction, guildId, userId, username, moduleId);
      return;
    }

    if (!interaction.isButton()) return;
    const { customId } = interaction;

    // ── Open ticket (single panel) ────────────────────────────────────────
    if (customId === "ticket_open" || customId === "ticket_open_test") {
      await handleTicketOpen(interaction, guildId, userId, username, null);
      return;
    }

    // ── Open ticket (panel-specific) ──────────────────────────────────────
    if (customId.startsWith("ticket_panel_")) {
      const panelId = Number(customId.replace("ticket_panel_", ""));
      if (!isNaN(panelId)) await handleTicketOpen(interaction, guildId, userId, username, null, panelId);
      return;
    }

    if (customId.startsWith("ticket_open_module_")) {
      const moduleId = Number(customId.replace("ticket_open_module_", ""));
      if (!isNaN(moduleId)) await handleTicketOpen(interaction, guildId, userId, username, moduleId);
      return;
    }

    if (customId.startsWith("ticket_close_")) {
      const ticketId = Number(customId.replace("ticket_close_", ""));
      if (!isNaN(ticketId)) await handleTicketClose(interaction, guildId, ticketId, userId, username);
      return;
    }

    if (customId.startsWith("ticket_claim_")) {
      const ticketId = Number(customId.replace("ticket_claim_", ""));
      if (!isNaN(ticketId)) await handleTicketClaim(interaction, guildId, ticketId, userId, username);
      return;
    }

    if (customId.startsWith("ticket_delete_")) {
      const ticketId = Number(customId.replace("ticket_delete_", ""));
      if (!isNaN(ticketId)) await handleTicketDelete(interaction, guildId, ticketId, userId, username);
      return;
    }

    if (customId.startsWith("ticket_reopen_")) {
      const ticketId = Number(customId.replace("ticket_reopen_", ""));
      if (!isNaN(ticketId)) await handleTicketReopen(interaction, guildId, ticketId, userId, username);
      return;
    }
  });

  // ─── Reaction Roles ────────────────────────────────────────────────────────
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (!reaction.message.guild) return;
      const guildId = reaction.message.guild.id;
      const emoji = reaction.emoji.name ?? "";
      const messageId = reaction.message.id;
      const reactionRoles = await db.select().from(autoRolesTable).where(
        and(eq(autoRolesTable.guildId, guildId), eq(autoRolesTable.type, "reaction"), eq(autoRolesTable.enabled, true))
      );
      const matching = reactionRoles.filter((r) => r.messageId === messageId && r.buttonEmoji === emoji);
      if (!matching.length) return;
      const guild = reaction.message.guild;
      const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      for (const ar of matching) {
        for (const rid of (ar.roleIds ?? [])) {
          await member.roles.add(rid).catch(() => {});
          if (ar.temporary && ar.durationMinutes > 0) {
            const key = `${guildId}:${user.id}:${rid}`;
            const timer = setTimeout(async () => { try { await member.roles.remove(rid); } catch {} tempRoleTimers.delete(key); }, ar.durationMinutes * 60_000);
            tempRoleTimers.set(key, timer);
          }
        }
      }
    } catch {}
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (!reaction.message.guild) return;
      const guildId = reaction.message.guild.id;
      const emoji = reaction.emoji.name ?? "";
      const messageId = reaction.message.id;
      const reactionRoles = await db.select().from(autoRolesTable).where(
        and(eq(autoRolesTable.guildId, guildId), eq(autoRolesTable.type, "reaction"), eq(autoRolesTable.enabled, true))
      );
      const matching = reactionRoles.filter((r) => r.messageId === messageId && r.buttonEmoji === emoji);
      if (!matching.length) return;
      const guild = reaction.message.guild;
      const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      for (const ar of matching) {
        for (const rid of (ar.roleIds ?? [])) {
          const timerKey = `${guildId}:${user.id}:${rid}`;
          clearTimeout(tempRoleTimers.get(timerKey)); tempRoleTimers.delete(timerKey);
          await member.roles.remove(rid).catch(() => {});
        }
      }
    } catch {}
  });

  // Prevent unhandled Discord API errors from crashing the process
  client.on("error", (err) => logger.error({ err }, "Discord client error — handled"));

  client.login(botToken).catch((err) => {
    logger.error({ err }, "Error al conectar bot");
  });

  return client;
}
