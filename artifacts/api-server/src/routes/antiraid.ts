import { Router } from "express";
import { db, antiraidConfigsTable, antiraidStatsTable, antiraidWhitelistTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const ALLOWED_FIELDS = new Set([
  "enabled",
  "antiJoin", "antiJoinThreshold", "antiJoinInterval", "antiJoinAction",
  "antiAlt", "antiAltMinAge",
  "antiBot", "antiBotWhitelist",
  "antiSpam", "antiSpamLimit", "antiSpamInterval", "antiSpamAction",
  "antiLinks", "antiLinksAction", "antiDiscordInvites", "allowedDomains", "blockedDomains",
  "antiMassMention", "massMentionLimit",
  "antiVpn", "antiVpnAction", "antiProxy", "antiTor", "vpnCheckLevel",
  "antiWebhook", "webhookSpamThreshold", "webhookSpamInterval",
  "antiChannelCreate", "antiChannelDelete", "antiChannelUpdate",
  "antiRoleCreate", "antiRoleDelete", "antiRoleUpdate",
  "antiEmojiCreate", "antiEmojiDelete",
  "antiBanMass", "antiKickMass",
  "antiNuke", "nukeThreshold", "nukeAction",
  "antiFlood", "floodLimit", "floodInterval", "floodAction", "deleteOnTrigger",
]);

const DEFAULT_CONFIG = {
  enabled: false,
  antiJoin: false, antiJoinThreshold: 5, antiJoinInterval: 10, antiJoinAction: "ban",
  antiAlt: false, antiAltMinAge: 7,
  antiBot: false, antiBotWhitelist: [] as string[],
  antiSpam: false, antiSpamLimit: 5, antiSpamInterval: 5, antiSpamAction: "mute",
  antiLinks: false, antiLinksAction: "delete", antiDiscordInvites: true, allowedDomains: [] as string[], blockedDomains: [] as string[],
  antiMassMention: false, massMentionLimit: 5,
  antiVpn: false, antiVpnAction: "ban", antiProxy: false, antiTor: false, vpnCheckLevel: "standard",
  antiWebhook: false, webhookSpamThreshold: 3, webhookSpamInterval: 60,
  antiChannelCreate: false, antiChannelDelete: false, antiChannelUpdate: false,
  antiRoleCreate: false, antiRoleDelete: false, antiRoleUpdate: false,
  antiEmojiCreate: false, antiEmojiDelete: false,
  antiBanMass: false, antiKickMass: false,
  antiNuke: false, nukeThreshold: 10, nukeAction: "strip_permissions",
  antiFlood: false, floodLimit: 5, floodInterval: 3, floodAction: "mute", deleteOnTrigger: true,
};

function sanitize(cfg: any) {
  return {
    ...cfg,
    antiBotWhitelist: Array.isArray(cfg?.antiBotWhitelist) ? cfg.antiBotWhitelist : [],
    allowedDomains: Array.isArray(cfg?.allowedDomains) ? cfg.allowedDomains : [],
    blockedDomains: Array.isArray(cfg?.blockedDomains) ? cfg.blockedDomains : [],
  };
}

function whitelistBody(body: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) safe[k] = v;
  }
  return safe;
}

router.get("/guilds/:guildId/antiraid", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(antiraidConfigsTable).values({ guildId, ...DEFAULT_CONFIG }).returning();
      cfg = created;
    }
    res.json(sanitize(cfg));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion AntiRaid" });
  }
});

router.put("/guilds/:guildId/antiraid", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const safeBody = whitelistBody(req.body);
    const [existing] = await db.select().from(antiraidConfigsTable).where(eq(antiraidConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(antiraidConfigsTable)
        .set(safeBody as any)
        .where(eq(antiraidConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(antiraidConfigsTable)
        .values({ guildId, ...DEFAULT_CONFIG, ...safeBody })
        .returning();
      cfg = created;
    }
    res.json(sanitize(cfg));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion AntiRaid" });
  }
});

router.get("/guilds/:guildId/antiraid/stats", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [stats] = await db.select().from(antiraidStatsTable).where(eq(antiraidStatsTable.guildId, guildId));
    if (!stats) {
      const [created] = await db.insert(antiraidStatsTable).values({ guildId }).returning();
      stats = created;
    }
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener estadisticas AntiRaid" });
  }
});

// ─── Whitelist ─────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/antiraid/whitelist", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const entries = await db.select().from(antiraidWhitelistTable)
      .where(eq(antiraidWhitelistTable.guildId, guildId))
      .orderBy(antiraidWhitelistTable.createdAt);
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener whitelist" });
  }
});

router.post("/guilds/:guildId/antiraid/whitelist", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const user = (req as any).user;
  try {
    const { entityId, entityType, name, reason } = req.body;
    if (!entityId) { res.status(400).json({ error: "ID de entidad requerido" }); return; }
    const [existing] = await db.select().from(antiraidWhitelistTable)
      .where(and(eq(antiraidWhitelistTable.guildId, guildId), eq(antiraidWhitelistTable.entityId, entityId)));
    if (existing) { res.status(409).json({ error: "Esta entidad ya esta en la whitelist" }); return; }
    const [created] = await db.insert(antiraidWhitelistTable).values({
      guildId, entityId,
      entityType: entityType || "user",
      name: name || null,
      reason: reason || null,
      addedBy: user?.discordId || null,
      addedByUsername: user?.username || null,
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al agregar a whitelist" });
  }
});

router.delete("/guilds/:guildId/antiraid/whitelist/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    await db.delete(antiraidWhitelistTable)
      .where(and(eq(antiraidWhitelistTable.id, id), eq(antiraidWhitelistTable.guildId, guildId)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar de whitelist" });
  }
});

// ─── Test Alert ────────────────────────────────────────────────────────────────

router.post("/guilds/:guildId/antiraid/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" }); return; }
  try {
    const { logsConfigsTable } = await import("@workspace/db");
    const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
    const channelId = logCfg?.channelId;
    if (!channelId) { res.status(400).json({ ok: false, error: "Canal de logs no configurado. Configura el canal en Logs primero." }); return; }
    const { default: axios } = await import("axios");
    const payload = {
      embeds: [{ title: "Alerta AntiRaid (Prueba)", description: "Simulacion de deteccion AntiRaid.\n\n**Modulo:** AntiJoin\n**Accion:** ban\n**Usuario:** UsuarioDePrueba#0000", color: 0xED4245, footer: { text: "Neuralix AntiRaid · Prueba" }, timestamp: new Date().toISOString() }],
    };
    const discordRes = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true });
    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Alerta de prueba enviada" });
    } else {
      res.status(400).json({ ok: false, error: discordRes.data?.message || `Discord status ${discordRes.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
