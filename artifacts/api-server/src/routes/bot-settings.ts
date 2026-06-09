import { Router } from "express";
import { db, botSettingsTable } from "@workspace/db";
import { requireAuth, requireOwner } from "../lib/auth";

const router = Router();

function maskToken(t: string | null | undefined): string {
  if (!t) return "";
  if (t.length <= 8) return "****";
  return t.slice(0, 4) + "****" + t.slice(-4);
}

// GET - obtener configuracion del bot (valores enmascarados para seguridad)
router.get("/admin/bot-settings", requireOwner, async (_req, res) => {
  try {
    const [settings] = await db.select().from(botSettingsTable);
    if (!settings) {
      res.json({
        botTokenConfigured: !!process.env.DISCORD_BOT_TOKEN,
        clientIdConfigured: !!process.env.DISCORD_CLIENT_ID,
        clientSecretConfigured: !!process.env.DISCORD_CLIENT_SECRET,
        sessionSecretConfigured: !!process.env.SESSION_SECRET,
        ownerDiscordIds: process.env.OWNER_DISCORD_IDS || "",
        botTokenMask: maskToken(process.env.DISCORD_BOT_TOKEN),
        clientIdMask: maskToken(process.env.DISCORD_CLIENT_ID),
        fromEnv: true,
      });
      return;
    }
    res.json({
      botTokenConfigured: !!(settings.botToken || process.env.DISCORD_BOT_TOKEN),
      clientIdConfigured: !!(settings.clientId || process.env.DISCORD_CLIENT_ID),
      clientSecretConfigured: !!(settings.clientSecret || process.env.DISCORD_CLIENT_SECRET),
      sessionSecretConfigured: !!(settings.sessionSecret || process.env.SESSION_SECRET),
      ownerDiscordIds: settings.ownerDiscordIds ?? process.env.OWNER_DISCORD_IDS ?? "",
      botTokenMask: maskToken(settings.botToken || process.env.DISCORD_BOT_TOKEN),
      clientIdMask: maskToken(settings.clientId || process.env.DISCORD_CLIENT_ID),
      fromEnv: false,
      updatedAt: settings.updatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion del bot" });
  }
});

// PUT - actualizar configuracion del bot
router.put("/admin/bot-settings", requireOwner, async (req, res) => {
  try {
    const { botToken, clientId, clientSecret, sessionSecret, ownerDiscordIds } = req.body as {
      botToken?: string;
      clientId?: string;
      clientSecret?: string;
      sessionSecret?: string;
      ownerDiscordIds?: string;
    };

    const values: Record<string, string | null> = {};
    if (botToken !== undefined) values.botToken = botToken || null;
    if (clientId !== undefined) values.clientId = clientId || null;
    if (clientSecret !== undefined) values.clientSecret = clientSecret || null;
    if (sessionSecret !== undefined) values.sessionSecret = sessionSecret || null;
    if (ownerDiscordIds !== undefined) values.ownerDiscordIds = ownerDiscordIds || null;

    const [existing] = await db.select().from(botSettingsTable);
    if (existing) {
      await db.update(botSettingsTable).set(values as any);
    } else {
      await db.insert(botSettingsTable).values(values as any);
    }

    res.json({
      ok: true,
      message: "Configuracion del bot actualizada correctamente. Los cambios se aplican en el proximo reinicio del servidor.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion del bot" });
  }
});

// GET public - solo muestra si los valores estan configurados (sin owner)
router.get("/settings/bot-status", requireAuth, async (_req, res) => {
  try {
    const [settings] = await db.select().from(botSettingsTable);
    res.json({
      botTokenConfigured: !!(settings?.botToken || process.env.DISCORD_BOT_TOKEN),
      clientIdConfigured: !!(settings?.clientId || process.env.DISCORD_CLIENT_ID),
      clientSecretConfigured: !!(settings?.clientSecret || process.env.DISCORD_CLIENT_SECRET),
      sessionSecretConfigured: !!(settings?.sessionSecret || process.env.SESSION_SECRET),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al verificar estado" });
  }
});

export default router;
