import { Router } from "express";
import {
  db, backupsTable,
  welcomeConfigsTable, goodbyeConfigsTable, antiraidConfigsTable,
  ticketConfigsTable, verificationConfigsTable, logsConfigsTable, guildConfigsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getBotClient } from "../bot-state";

async function snapshotDiscordStructure(guildId: string): Promise<Record<string, unknown> | null> {
  try {
    const client = getBotClient();
    if (!client) return null;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;

    await guild.channels.fetch().catch(() => {});
    await guild.roles.fetch().catch(() => {});

    const categories = guild.channels.cache
      .filter((c: any) => c.type === 4)
      .map((c: any) => ({ id: c.id, name: c.name, position: c.position }));

    const channels = guild.channels.cache
      .filter((c: any) => c.type !== 4)
      .map((c: any) => ({
        id: c.id, name: c.name, type: c.type, position: c.position,
        parentId: c.parentId || null,
        topic: (c as any).topic || null,
        nsfw: (c as any).nsfw || false,
        bitrate: (c as any).bitrate || null,
        userLimit: (c as any).userLimit || null,
      }));

    const roles = guild.roles.cache
      .filter((r: any) => !r.managed && r.id !== guild.id)
      .map((r: any) => ({
        id: r.id, name: r.name, color: r.color,
        hoist: r.hoist, mentionable: r.mentionable,
        position: r.position, permissions: r.permissions.bitfield.toString(),
      }));

    return {
      guildId, guildName: guild.name,
      memberCount: guild.memberCount,
      icon: guild.icon,
      snapshotAt: new Date().toISOString(),
      categories, channels, roles,
      channelCount: channels.length,
      roleCount: roles.length,
    };
  } catch { return null; }
}

const router = Router();

const SAFE_WELCOME = ["enabled","channelId","message","embedEnabled","embedColor","embedTitle","embedDescription","embedFooter","embedImage","imageEnabled","autoRoleIds","dmEnabled","dmMessage"];
const SAFE_GOODBYE = ["enabled","channelId","message","embedEnabled","embedColor","embedTitle","embedDescription","imageEnabled"];
const SAFE_ANTIRAID = ["enabled","antiJoin","antiJoinThreshold","antiJoinInterval","antiJoinAction","antiAlt","antiAltMinAge","antiBot","antiBotWhitelist","antiSpam","antiSpamLimit","antiSpamInterval","antiSpamAction","antiLinks","allowedDomains","blockedDomains","antiMassMention","massMentionLimit","antiVpn","antiVpnAction","antiProxy","antiTor","vpnCheckLevel","antiWebhook","antiChannelCreate","antiChannelDelete","antiChannelUpdate","antiRoleCreate","antiRoleDelete","antiRoleUpdate","antiEmojiCreate","antiEmojiDelete","antiBanMass","antiKickMass","antiNuke","nukeThreshold","nukeAction"];
const SAFE_TICKETS = ["enabled","categoryId","supportRoleId","additionalRoles","transcriptChannelId","logsChannelId","maxTicketsPerUser","panelChannelId","panelMessage","panelTitle","panelDescription","panelColor","panelImage","panelFooter","buttonLabel","buttonEmoji","buttonColor","ticketNameFormat","openMessage","mentionSupport","autoClose","satisfactionSurvey","autoTranscript"];
const SAFE_VERIFICATION = ["enabled","roleId","logChannelId","minAccountAge","antiVpn","antiAlt","antiBot","customVerifyUrl","successMessage","rejectMessage"];
const SAFE_LOGS = ["enabled","channelId","logMembers","logMessages","logRoles","logChannels","logModeration","logSecurity"];

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): Record<string, unknown> {
  if (!obj) return {};
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

async function upsert<T extends { guildId: string }>(
  table: any, guildId: string, data: Record<string, unknown>,
): Promise<void> {
  const [existing] = await db.select().from(table).where(eq(table.guildId, guildId));
  if (existing) {
    await db.update(table).set(data as any).where(eq(table.guildId, guildId));
  } else {
    await db.insert(table).values({ ...data, guildId } as any);
  }
}

router.get("/guilds/:guildId/backups", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const backups = await db.select().from(backupsTable)
      .where(eq(backupsTable.guildId, guildId))
      .orderBy(desc(backupsTable.createdAt));
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener backups" });
  }
});

router.post("/guilds/:guildId/backups", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const [welcome] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    const [goodbye] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
    const [antiraid] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
    const [tickets] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    const [verification] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    const [logs] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
    const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));

    const discordSnapshot = await snapshotDiscordStructure(guildId);
    const data = { welcome, goodbye, antiraid, tickets, verification, logs, guildConfig: guildCfg, discordSnapshot };
    const dataStr = JSON.stringify(data);
    const existingCount = (await db.select().from(backupsTable).where(eq(backupsTable.guildId, guildId))).length;

    const [backup] = await db.insert(backupsTable).values({
      guildId,
      label: `Backup #${existingCount + 1} — ${new Date().toLocaleDateString("es-ES")}`,
      size: dataStr.length,
      version: existingCount + 1,
      data,
    }).returning();

    res.status(201).json(backup);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear backup" });
  }
});

router.post("/guilds/:guildId/backups/:backupId/restore", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const backupId = Number(req.params.backupId as string);
  try {
    const [backup] = await db.select().from(backupsTable).where(eq(backupsTable.id, backupId));
    if (!backup) { res.status(404).json({ error: "Backup no encontrado" }); return; }

    const data = backup.data as any;
    const restored: string[] = [];

    if (data?.welcome) {
      await upsert(welcomeConfigsTable, guildId, pick(data.welcome, SAFE_WELCOME));
      restored.push("bienvenidas");
    }
    if (data?.goodbye) {
      await upsert(goodbyeConfigsTable, guildId, pick(data.goodbye, SAFE_GOODBYE));
      restored.push("despedidas");
    }
    if (data?.antiraid) {
      await upsert(antiraidConfigsTable, guildId, pick(data.antiraid, SAFE_ANTIRAID));
      restored.push("antiraid");
    }
    if (data?.tickets) {
      await upsert(ticketConfigsTable, guildId, pick(data.tickets, SAFE_TICKETS));
      restored.push("tickets");
    }
    if (data?.verification) {
      await upsert(verificationConfigsTable, guildId, pick(data.verification, SAFE_VERIFICATION));
      restored.push("verificacion");
    }
    if (data?.logs) {
      await upsert(logsConfigsTable, guildId, pick(data.logs, SAFE_LOGS));
      restored.push("logs");
    }

    res.json({ ok: true, message: `Backup restaurado: ${restored.join(", ")}`, restored });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al restaurar backup" });
  }
});

router.delete("/guilds/:guildId/backups/:backupId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const backupId = Number(req.params.backupId as string);
  try {
    const [backup] = await db.select().from(backupsTable).where(eq(backupsTable.id, backupId));
    if (!backup) { res.status(404).json({ error: "Backup no encontrado" }); return; }
    if (backup.guildId !== guildId) { res.status(403).json({ error: "Sin permisos para eliminar este backup" }); return; }

    await db.delete(backupsTable).where(eq(backupsTable.id, backupId));
    res.json({ ok: true, message: "Backup eliminado" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar backup" });
  }
});

export default router;
