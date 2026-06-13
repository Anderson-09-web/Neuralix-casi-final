import { Router } from "express";
import axios from "axios";
import { db, verificationConfigsTable, verifiedUsersTable, guildConfigsTable, guildWebhooksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";

const ALLOWED_FIELDS = new Set([
  "enabled", "roleId", "logChannelId", "minAccountAge",
  "antiVpn", "antiAlt", "antiBot", "customVerifyUrl",
  "successMessage", "rejectMessage",
  "panelTitle", "panelDescription", "panelColor", "panelButtonText",
  "panelImageUrl", "panelThumbnailUrl", "panelChannelId", "panelMessageId",
  "useCustomBotPersona",
]);

function whitelistBody(body: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) safe[k] = v;
  }
  return safe;
}

function getAppDomain(): string | null {
  if (process.env.REPLIT_APP_URL) return process.env.REPLIT_APP_URL.replace(/\/$/, "");
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean);
  if (domains?.length) return `https://${domains[0]}`;
  return null;
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

// ─── Send verification panel to a Discord channel ─────────────────────────────
router.post("/guilds/:guildId/verification/send-panel", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" });
    return;
  }
  try {
    const [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    if (!cfg) { res.status(404).json({ ok: false, error: "Configuracion de verificacion no encontrada" }); return; }

    const channelId = req.body.channelId || cfg.panelChannelId;
    if (!channelId) { res.status(400).json({ ok: false, error: "Selecciona un canal donde enviar el panel" }); return; }

    const appDomain = getAppDomain() || "https://tu-dominio.com";
    const verifyUrl = cfg.customVerifyUrl || `${appDomain}/verify?guild=${guildId}`;

    const hexToInt = (hex: string) => parseInt((hex || "#5865F2").replace("#", ""), 16);

    const embed: Record<string, unknown> = {
      title: cfg.panelTitle || "Verificacion de Miembros",
      description: cfg.panelDescription || "Para acceder al servidor, verifica tu identidad haciendo clic en el boton.",
      color: hexToInt(cfg.panelColor || "#5865F2"),
      footer: { text: "Neuralix Verificacion · Seguro y privado" },
      timestamp: new Date().toISOString(),
    };
    if (cfg.panelImageUrl) embed.image = { url: cfg.panelImageUrl };
    if (cfg.panelThumbnailUrl) embed.thumbnail = { url: cfg.panelThumbnailUrl };

    const components = [{
      type: 1,
      components: [{
        type: 2,
        style: 5,
        label: cfg.panelButtonText || "Verificarme",
        url: verifyUrl,
        emoji: { name: "✅" },
      }],
    }];

    // Check for custom bot persona (webhook)
    const [guildCfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
    const isPremium = guildCfg?.premiumActive && (guildCfg.premiumPlan === "pro" || guildCfg.premiumPlan === "ultra");
    const usePersona = cfg.useCustomBotPersona && isPremium && (guildCfg?.webhookBotName || guildCfg?.webhookBotAvatar);

    let discordRes: any;
    if (usePersona) {
      const [webhookRow] = await db.select().from(guildWebhooksTable)
        .where(and(eq(guildWebhooksTable.guildId, guildId), eq(guildWebhooksTable.channelId, channelId)));
      if (webhookRow?.webhookId && webhookRow?.webhookToken) {
        discordRes = await axios.post(
          `${DISCORD_API}/webhooks/${webhookRow.webhookId}/${webhookRow.webhookToken}?wait=true`,
          { embeds: [embed], components, username: guildCfg?.webhookBotName || undefined, avatar_url: guildCfg?.webhookBotAvatar || undefined },
          { headers: { "Content-Type": "application/json" }, validateStatus: () => true },
        );
      }
    }

    if (!discordRes || (discordRes.status !== 200 && discordRes.status !== 201)) {
      discordRes = await axios.post(
        `${DISCORD_API}/channels/${channelId}/messages`,
        { embeds: [embed], components },
        { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
      );
    }

    if (discordRes.status === 200 || discordRes.status === 201) {
      const messageId = discordRes.data?.id;
      await db.update(verificationConfigsTable)
        .set({ panelChannelId: channelId, panelMessageId: messageId || null })
        .where(eq(verificationConfigsTable.guildId, guildId));
      res.json({ ok: true, message: "Panel de verificacion enviado correctamente", messageId });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos para enviar mensajes en ese canal" : discordRes.status === 404 ? "Canal no encontrado" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// ─── Public verify endpoint (used by portal) ─────────────────────────────────
router.post("/verify/:guildId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
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
          message: cfg.rejectMessage?.replace("{days}", String(cfg.minAccountAge)) ||
            `Tu cuenta debe tener al menos ${cfg.minAccountAge} dias de antiguedad para verificarse.`,
          roleAssigned: false,
        });
        return;
      }
    }

    // Check if already verified in this guild
    const [existingInGuild] = await db.select().from(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.discordId, user.discordId)));

    if (!existingInGuild) {
      await db.insert(verifiedUsersTable).values({
        guildId,
        discordId: user.discordId,
        username: user.username,
      });
    }

    // Assign role via bot token
    let roleAssigned = false;
    if (cfg.roleId && botToken) {
      try {
        const roleRes = await axios.put(
          `${DISCORD_API}/guilds/${guildId}/members/${user.discordId}/roles/${cfg.roleId}`,
          {},
          { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
        );
        roleAssigned = roleRes.status === 204 || roleRes.status === 200;
      } catch {}
    }

    // Log verification
    if (cfg.logChannelId && botToken) {
      try {
        const accountAge = (() => {
          try {
            const discordEpoch = 1420070400000;
            const created = new Date(Number((BigInt(user.discordId) >> 22n) + BigInt(discordEpoch)));
            return Math.floor((Date.now() - created.getTime()) / 86_400_000);
          } catch { return null; }
        })();
        await axios.post(`${DISCORD_API}/channels/${cfg.logChannelId}/messages`, {
          embeds: [{
            title: "Verificacion Completada",
            description: `**Usuario:** \`${user.username}\` (<@${user.discordId}>)\n**ID:** \`${user.discordId}\`\n**Rol asignado:** ${roleAssigned ? `<@&${cfg.roleId}>` : "No (sin permisos)"}\n**Edad de cuenta:** ${accountAge !== null ? `${accountAge} dias` : "Desconocida"}`,
            color: 0x57F287,
            fields: [
              { name: "Estado", value: roleAssigned ? "Rol asignado correctamente" : "Verificado (sin rol)", inline: true },
              { name: "Metodo", value: cfg.antiVpn ? "Portal + AntiVPN" : "Portal Web", inline: true },
            ],
            footer: { text: "Neuralix Verificacion" },
            timestamp: new Date().toISOString(),
          }],
        }, { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true });
      } catch {}
    }

    res.json({
      success: true,
      message: cfg.successMessage || "Verificacion exitosa. Ya puedes acceder al servidor.",
      roleAssigned,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error en el proceso de verificacion" });
  }
});

// ─── Public guild info for verify portal (no auth required) ───────────────────
router.get("/verify-info/:guildId", async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  try {
    let [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(verificationConfigsTable).values({ guildId }).returning();
      cfg = created;
    }

    let guildName = "Servidor de Discord";
    let guildIcon: string | null = null;
    if (botToken) {
      try {
        const r = await axios.get(`${DISCORD_API}/guilds/${guildId}`, {
          headers: { Authorization: `Bot ${botToken.trim()}` },
          validateStatus: () => true,
        });
        if (r.status === 200) {
          guildName = r.data.name;
          guildIcon = r.data.icon ? `https://cdn.discordapp.com/icons/${guildId}/${r.data.icon}.png?size=128` : null;
        }
      } catch {}
    }

    res.json({
      guildId,
      guildName,
      guildIcon,
      enabled: cfg.enabled ?? false,
      minAccountAge: cfg.minAccountAge,
      antiVpn: cfg.antiVpn,
      antiAlt: cfg.antiAlt,
      antiBot: cfg.antiBot,
      panelTitle: cfg.panelTitle,
      panelDescription: cfg.panelDescription,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
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

// ─── Reset a user's verification ─────────────────────────────────────────────
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

// ─── Test verification log ────────────────────────────────────────────────────
router.post("/guilds/:guildId/verification/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" });
    return;
  }
  try {
    const [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
    if (!cfg?.logChannelId) {
      res.status(400).json({ ok: false, error: "Canal de logs no configurado. Configura un canal de logs y guarda primero." });
      return;
    }
    const payload = {
      embeds: [{
        title: "Verificacion Completada (Prueba)",
        description: "**UsuarioDePrueba** ha completado la verificacion correctamente.",
        color: 0x57F287,
        fields: [
          { name: "Usuario", value: "UsuarioDePrueba#0000 (`123456789012345678`)", inline: true },
          { name: "Metodo", value: cfg.antiVpn ? "Portal + AntiVPN" : "Portal Web", inline: true },
          { name: "Rol asignado", value: cfg.roleId ? `<@&${cfg.roleId}>` : "Sin configurar", inline: true },
        ],
        footer: { text: "Neuralix Verificacion · Mensaje de prueba" },
        timestamp: new Date().toISOString(),
      }],
    };
    const discordRes = await axios.post(
      `${DISCORD_API}/channels/${cfg.logChannelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Log de verificacion enviado al canal" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos en el canal de logs" : discordRes.status === 404 ? "Canal de logs no encontrado" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
