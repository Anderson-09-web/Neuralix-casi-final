import { Router } from "express";
import axios from "axios";
import { db, welcomeConfigsTable, goodbyeConfigsTable, guildConfigsTable, guildWebhooksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();
const DISCORD_API = "https://discord.com/api/v10";

const WELCOME_ALLOWED = new Set([
  "enabled", "channelId", "message",
  "embedEnabled", "embedColor", "embedTitle", "embedDescription", "embedFooter", "embedImage",
  "imageEnabled", "dmEnabled", "dmMessage", "autoRoleIds",
  "cardEnabled", "cardBackground", "cardTextColor",
]);

const GOODBYE_ALLOWED = new Set([
  "enabled", "channelId", "message",
  "embedEnabled", "embedColor", "embedTitle", "embedDescription", "embedFooter", "embedImage", "imageEnabled",
  "cardEnabled", "cardBackground", "cardTextColor",
]);

function whitelistBody(body: Record<string, unknown>, allowed: Set<string>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) safe[k] = v;
  }
  return safe;
}

/** Replace {user}, {username}, {server}, {membercount}, {date}, {tag} variables */
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

/** Send a Discord message via webhook (custom name/avatar) or fall back to Bot token */
async function sendDiscordMessage(
  channelId: string,
  guildId: string,
  payload: Record<string, unknown>,
  botToken: string,
): Promise<void> {
  const [guildCfg, webhookRow] = await Promise.all([
    db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId)).then(([r]) => r),
    db.select().from(guildWebhooksTable).where(and(eq(guildWebhooksTable.guildId, guildId), eq(guildWebhooksTable.channelId, channelId))).then(([r]) => r),
  ]);
  const hasCustom = guildCfg?.webhookBotName || guildCfg?.webhookBotAvatar;
  if (hasCustom && webhookRow?.webhookId && webhookRow?.webhookToken) {
    const webhookPayload = {
      ...payload,
      username: guildCfg?.webhookBotName || undefined,
      avatar_url: guildCfg?.webhookBotAvatar || undefined,
    };
    const res = await axios.post(
      `${DISCORD_API}/webhooks/${webhookRow.webhookId}/${webhookRow.webhookToken}`,
      webhookPayload,
      { headers: { "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (res.status === 200 || res.status === 204 || res.status === 201) return;
  }
  await axios.post(`${DISCORD_API}/channels/${channelId}/messages`, payload, {
    headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
    validateStatus: () => true,
  });
}

/** Convert hex color (#5865F2) to Discord int, default indigo */
function hexToDiscordColor(hex?: string | null): number {
  if (!hex) return 0x5865f2;
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return isNaN(num) ? 0x5865f2 : num;
}

/** Build a Discord API message payload from welcome config + user info */
function buildDiscordPayload(cfg: typeof welcomeConfigsTable.$inferSelect, opts: {
  guildName: string; mention: string; username: string; tag: string; memberCount: number;
}) {
  const payload: Record<string, unknown> = {};

  if (cfg.message) {
    payload.content = processTemplate(cfg.message, opts);
  }

  if (cfg.embedEnabled) {
    const embed: Record<string, unknown> = {
      color: hexToDiscordColor(cfg.embedColor),
    };
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

// ─── Welcome ──────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/welcome", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(welcomeConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json({ ...cfg, autoRoleIds: cfg.autoRoleIds || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de bienvenidas" });
  }
});

router.put("/guilds/:guildId/welcome", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const body = req.body as Record<string, unknown>;
    const autoRoleIds: string[] = Array.isArray(body.autoRoleIds)
      ? (body.autoRoleIds as string[])
      : typeof body.autoRoleIds === "string" && body.autoRoleIds
        ? [body.autoRoleIds as string]
        : [];

    const safeFields: Record<string, unknown> = { ...whitelistBody(body, WELCOME_ALLOWED), autoRoleIds };

    const [existing] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(welcomeConfigsTable)
        .set(safeFields as any)
        .where(eq(welcomeConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(welcomeConfigsTable)
        .values({ guildId, ...safeFields } as any)
        .returning();
      cfg = created;
    }
    res.json({ ...cfg, autoRoleIds: cfg.autoRoleIds || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de bienvenidas" });
  }
});

/**
 * POST /api/guilds/:guildId/welcome/test
 * Sends a test welcome message to the configured Discord channel.
 * Requires bot to be in the server and DISCORD_BOT_TOKEN to be set.
 */
router.post("/guilds/:guildId/welcome/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no esta configurado en el servidor" });
    return;
  }

  try {
    const [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));

    if (!cfg?.channelId) {
      res.status(400).json({ ok: false, error: "Canal de bienvenida no configurado. Escribe el ID del canal y guarda primero." });
      return;
    }

    const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    const guildName = guildCfg?.guildName || "Servidor";

    const testOpts = {
      guildName,
      mention: "<@123456789012345678>",
      username: "UsuarioDePrueba",
      tag: "UsuarioDePrueba#0000",
      memberCount: guildCfg?.memberCount || 100,
    };

    const payload = buildDiscordPayload(
      cfg,
      testOpts,
    );

    // If neither content nor embed, send a default fallback
    if (!payload.content && !payload.embeds) {
      (payload as any).content = `Bienvenido <@123456789012345678> a **${guildName}**! (mensaje de prueba)`;
    }

    try {
      await sendDiscordMessage(cfg.channelId, guildId, payload, botToken);
      res.json({ ok: true, message: "Mensaje de prueba enviado al canal correctamente" });
    } catch (discordErr: any) {
      res.status(400).json({ ok: false, error: discordErr?.message || "Error al enviar a Discord" });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "Error interno al enviar mensaje de prueba" });
  }
});

/**
 * GET /api/guilds/:guildId/welcome/preview
 * Returns the processed welcome message with example variable values replaced.
 * Use this to show a live preview of what the message will look like.
 */
router.get("/guilds/:guildId/welcome/preview", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    if (!cfg) {
      res.json({ content: null, embed: null });
      return;
    }

    const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    const guildName = guildCfg?.guildName || "Servidor";

    const testOpts = {
      guildName,
      mention: "@UsuarioPrueba",
      username: "UsuarioPrueba",
      tag: "UsuarioPrueba#0000",
      memberCount: guildCfg?.memberCount || 100,
    };

    res.json({
      channelId: cfg.channelId,
      enabled: cfg.enabled,
      content: cfg.message ? processTemplate(cfg.message, testOpts) : null,
      embed: cfg.embedEnabled ? {
        title: cfg.embedTitle ? processTemplate(cfg.embedTitle, testOpts) : null,
        description: cfg.embedDescription ? processTemplate(cfg.embedDescription, testOpts) : null,
        color: cfg.embedColor || "#5865F2",
        footer: cfg.embedFooter ? processTemplate(cfg.embedFooter, testOpts) : null,
        image: cfg.embedImage || null,
      } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * POST /api/bot/member-join/:guildId
 * Called by the Discord bot when a new member joins.
 * The API fetches the welcome config, processes the template, and sends the message.
 *
 * Body (JSON):
 *   {
 *     "userId":        "123456789",     // Discord user ID
 *     "username":      "NombreUsuario", // Discord username
 *     "discriminator": "0",             // discriminator (usually "0" for new accounts)
 *     "memberCount":   250              // optional current member count
 *   }
 *
 * Python example:
 *   import requests
 *   TOKEN = "your_jwt_token"
 *   resp = requests.post(
 *       "https://tu-dominio.replit.app/api/bot/member-join/GUILD_ID",
 *       headers={"Authorization": f"Bearer {TOKEN}"},
 *       json={
 *           "userId": "123456789",
 *           "username": "NuevoMiembro",
 *           "discriminator": "0",
 *           "memberCount": 250
 *       }
 *   )
 *   print(resp.json())
 */
router.post("/bot/member-join/:guildId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no esta configurado" });
    return;
  }

  const { userId, username, discriminator, memberCount } = req.body as {
    userId?: string;
    username?: string;
    discriminator?: string;
    memberCount?: number;
  };

  if (!userId || !username) {
    res.status(400).json({ ok: false, error: "Faltan campos requeridos: userId, username" });
    return;
  }

  try {
    const [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));

    if (!cfg?.enabled || !cfg?.channelId) {
      res.json({ ok: false, skipped: true, reason: "Bienvenidas desactivadas o canal no configurado" });
      return;
    }

    const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    const guildName = guildCfg?.guildName || "Servidor";

    const opts = {
      guildName,
      mention: `<@${userId}>`,
      username,
      tag: discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username,
      memberCount: memberCount ?? guildCfg?.memberCount ?? 0,
    };

    const payload = buildDiscordPayload(cfg, opts);
    if (!payload.content && !payload.embeds) {
      (payload as any).content = `Bienvenido <@${userId}> a **${guildName}**!`;
    }

    const discordRes = await axios.post(
      `${DISCORD_API}/channels/${cfg.channelId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bot ${botToken.trim()}`,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      },
    );

    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Mensaje de bienvenida enviado", channelId: cfg.channelId });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        discordCode: discordRes.data?.code,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// ─── Goodbye ──────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/goodbye", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(goodbyeConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de despedidas" });
  }
});

router.put("/guilds/:guildId/goodbye", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const safeBody = whitelistBody(req.body as Record<string, unknown>, GOODBYE_ALLOWED);

    const [existing] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(goodbyeConfigsTable)
        .set(safeBody as any)
        .where(eq(goodbyeConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(goodbyeConfigsTable)
        .values({ ...safeBody, guildId } as any)
        .returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de despedidas" });
  }
});

router.post("/guilds/:guildId/goodbye/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no esta configurado" });
    return;
  }

  try {
    const [cfg] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));

    if (!cfg?.channelId) {
      res.status(400).json({ ok: false, error: "Canal de despedida no configurado" });
      return;
    }

    const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    const guildName = guildCfg?.guildName || "Servidor";

    const testOpts = {
      guildName,
      mention: "<@123456789012345678>",
      username: "UsuarioDePrueba",
      tag: "UsuarioDePrueba#0000",
      memberCount: guildCfg?.memberCount || 100,
    };

    const payload: Record<string, unknown> = {};

    if (cfg.message) {
      payload.content = processTemplate(cfg.message, testOpts);
    }

    if (cfg.embedEnabled) {
      const embed: Record<string, unknown> = { color: hexToDiscordColor(cfg.embedColor) };
      if (cfg.embedTitle) embed.title = processTemplate(cfg.embedTitle, testOpts);
      if (cfg.embedDescription) embed.description = processTemplate(cfg.embedDescription, testOpts);
      payload.embeds = [embed];
    }

    if (!payload.content && !payload.embeds) {
      (payload as any).content = `**UsuarioDePrueba** ha abandonado **${guildName}**. (mensaje de prueba)`;
    }

    const discordRes = await axios.post(
      `${DISCORD_API}/channels/${cfg.channelId}/messages`,
      payload,
      {
        headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" },
        validateStatus: () => true,
      },
    );

    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Mensaje de despedida de prueba enviado" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
