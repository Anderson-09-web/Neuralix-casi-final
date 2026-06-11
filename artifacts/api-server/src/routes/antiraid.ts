import { Router } from "express";
import { db, antiraidConfigsTable, antiraidStatsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const ALLOWED_FIELDS = new Set([
  "enabled",
  "antiJoin", "antiJoinThreshold", "antiJoinInterval", "antiJoinAction",
  "antiAlt", "antiAltMinAge",
  "antiBot", "antiBotWhitelist",
  "antiSpam", "antiSpamLimit", "antiSpamInterval", "antiSpamAction",
  "antiLinks", "allowedDomains", "blockedDomains",
  "antiMassMention", "massMentionLimit",
  "antiVpn", "antiVpnAction", "antiProxy", "antiTor", "vpnCheckLevel",
  "antiWebhook",
  "antiChannelCreate", "antiChannelDelete", "antiChannelUpdate",
  "antiRoleCreate", "antiRoleDelete", "antiRoleUpdate",
  "antiEmojiCreate", "antiEmojiDelete",
  "antiBanMass", "antiKickMass",
  "antiNuke", "nukeThreshold", "nukeAction",
]);

const DEFAULT_CONFIG = {
  enabled: false,
  antiJoin: false, antiJoinThreshold: 5, antiJoinInterval: 10, antiJoinAction: "ban",
  antiAlt: false, antiAltMinAge: 7,
  antiBot: false, antiBotWhitelist: [] as string[],
  antiSpam: false, antiSpamLimit: 5, antiSpamInterval: 5, antiSpamAction: "mute",
  antiLinks: false, allowedDomains: [] as string[], blockedDomains: [] as string[],
  antiMassMention: false, massMentionLimit: 5,
  antiVpn: false, antiVpnAction: "ban", antiProxy: false, antiTor: false, vpnCheckLevel: "standard",
  antiWebhook: false,
  antiChannelCreate: false, antiChannelDelete: false, antiChannelUpdate: false,
  antiRoleCreate: false, antiRoleDelete: false, antiRoleUpdate: false,
  antiEmojiCreate: false, antiEmojiDelete: false,
  antiBanMass: false, antiKickMass: false,
  antiNuke: false, nukeThreshold: 10, nukeAction: "strip_permissions",
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

/**
 * POST /api/guilds/:guildId/antiraid/test
 * Sends a simulated AntiRaid detection alert to the configured logs channel.
 */
router.post("/guilds/:guildId/antiraid/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no esta configurado" });
    return;
  }
  try {
    const { logsConfigsTable } = await import("@workspace/db");
    const [logCfg] = await db.select().from(logsConfigsTable).where(eq(logsConfigsTable.guildId, guildId));
    const channelId = logCfg?.channelId;
    if (!channelId) {
      res.status(400).json({ ok: false, error: "Canal de logs no configurado. Configura el canal en la seccion Logs primero." });
      return;
    }
    const payload = {
      embeds: [{
        title: "Alerta AntiRaid (Prueba)",
        description: "Esto es una simulacion de deteccion AntiRaid.\n\n**Modulo:** AntiJoin\n**Accion tomada:** ban\n**Usuario:** UsuarioDePrueba#0000\n**ID:** 123456789012345678",
        color: 0xED4245,
        footer: { text: "Neuralix AntiRaid · Mensaje de prueba" },
        timestamp: new Date().toISOString(),
      }],
    };
    const axios = (await import("axios")).default;
    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Alerta de prueba enviada al canal de logs" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos para enviar mensajes en el canal de logs" : discordRes.status === 404 ? "Canal no encontrado" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
