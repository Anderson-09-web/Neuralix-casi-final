import { Router } from "express";
import { db, verificationConfigsTable, verifiedUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const ALLOWED_FIELDS = new Set([
  "enabled", "roleId", "logChannelId", "minAccountAge",
  "antiVpn", "antiAlt", "antiBot", "customVerifyUrl",
  "successMessage", "rejectMessage",
]);

function whitelistBody(body: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) safe[k] = v;
  }
  return safe;
}

// ─── Verification config ──────────────────────────────────────────────────────
router.get("/guilds/:guildId/verification", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(verificationConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de verificacion" });
  }
});

router.put("/guilds/:guildId/verification", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const safeBody = whitelistBody(req.body);

    const [existing] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(verificationConfigsTable)
        .set(safeBody as any)
        .where(eq(verificationConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(verificationConfigsTable)
        .values({ guildId, ...safeBody })
        .returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de verificacion" });
  }
});

// ─── Public verify endpoint (used by portal) ─────────────────────────────────
router.post("/verify/:guildId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const user = (req as any).user;
    const [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    if (!cfg || !cfg.enabled) {
      res.json({ success: false, message: "La verificacion no esta habilitada en este servidor.", roleAssigned: false });
      return;
    }

    // AntiAlt check
    if (cfg.antiAlt && cfg.minAccountAge > 0) {
      const discordEpoch = 1420070400000;
      const accountCreatedAt = new Date(Number((BigInt(user.discordId) >> 22n) + BigInt(discordEpoch)));
      const ageInDays = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < cfg.minAccountAge) {
        res.json({
          success: false,
          message: `Tu cuenta debe tener al menos ${cfg.minAccountAge} dias de antiguedad para poder verificarse.`,
          roleAssigned: false,
        });
        return;
      }
    }

    const existing = await db.select().from(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.discordId, user.discordId)));

    if (existing.length === 0) {
      await db.insert(verifiedUsersTable).values({
        guildId,
        discordId: user.discordId,
        username: user.username,
      });
    }

    res.json({
      success: true,
      message: cfg.successMessage || "¡Verificacion exitosa! Se te asignara el rol verificado en breve.",
      roleAssigned: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error en el proceso de verificacion" });
  }
});

// ─── Verified users list (admin) ─────────────────────────────────────────────
router.get("/guilds/:guildId/verification/verified-users", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const users = await db.select().from(verifiedUsersTable).where(eq(verifiedUsersTable.guildId, guildId));
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener usuarios verificados" });
  }
});

// ─── Reset a user's verification (admin only) ─────────────────────────────────
router.delete("/guilds/:guildId/verification/verified-users/:discordId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const discordId = req.params.discordId as string;
  try {
    await db.delete(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.discordId, discordId)));
    res.json({ success: true, message: `Verificacion de usuario ${discordId} reseteada.` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al resetear verificacion" });
  }
});

/**
 * POST /api/guilds/:guildId/verification/test
 * Sends a test verification log message to the configured logChannelId.
 */
router.post("/guilds/:guildId/verification/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no esta configurado" });
    return;
  }
  try {
    const [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    if (!cfg?.logChannelId) {
      res.status(400).json({ ok: false, error: "Canal de logs de verificacion no configurado. Escribe el ID del canal de logs y guarda primero." });
      return;
    }
    const axios = (await import("axios")).default;
    const payload = {
      embeds: [{
        title: "Verificacion Completada (Prueba)",
        description: "**UsuarioDePrueba** ha completado la verificacion correctamente.",
        color: 0x57F287,
        fields: [
          { name: "Usuario", value: "UsuarioDePrueba#0000 (`123456789012345678`)", inline: true },
          { name: "Metodo", value: cfg.antiVpn ? "AntiVPN + Captcha" : "Captcha", inline: true },
          { name: "Rol asignado", value: cfg.roleId ? `<@&${cfg.roleId}>` : "Sin configurar", inline: true },
        ],
        footer: { text: "Neuralix Verificacion · Mensaje de prueba" },
        timestamp: new Date().toISOString(),
      }],
    };
    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${cfg.logChannelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Log de verificacion enviado al canal" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos en el canal de logs" : discordRes.status === 404 ? "Canal de logs no encontrado. Verifica el ID" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
