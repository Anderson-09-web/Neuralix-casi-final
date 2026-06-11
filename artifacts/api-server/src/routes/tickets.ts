import { Router } from "express";
import { db, ticketConfigsTable, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const ALLOWED_FIELDS = new Set([
  "enabled", "categoryId", "supportRoleId", "additionalRoles",
  "transcriptChannelId", "logsChannelId",
  "maxTicketsPerUser",
  "panelChannelId", "panelMessage", "panelTitle", "panelDescription",
  "panelColor", "panelImage", "panelFooter",
  "buttonLabel", "buttonEmoji", "buttonColor",
  "ticketNameFormat", "openMessage", "mentionSupport",
  "autoClose", "satisfactionSurvey", "autoTranscript",
]);

function whitelistBody(body: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) safe[k] = v;
  }
  return safe;
}

router.get("/guilds/:guildId/tickets/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(ticketConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de tickets" });
  }
});

router.put("/guilds/:guildId/tickets/config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const safeBody = whitelistBody(req.body);

    const [existing] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(ticketConfigsTable)
        .set(safeBody as any)
        .where(eq(ticketConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(ticketConfigsTable)
        .values({ guildId, ...safeBody } as any)
        .returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de tickets" });
  }
});

router.get("/guilds/:guildId/tickets", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const tickets = await db.select().from(ticketsTable).where(eq(ticketsTable.guildId, guildId));
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener tickets" });
  }
});

router.post("/guilds/:guildId/tickets/:ticketId/close", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  try {
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "ID de ticket invalido" });
      return;
    }
    await db.update(ticketsTable)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(ticketsTable.id, ticketId));
    res.json({ ok: true, message: "Ticket cerrado correctamente" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al cerrar ticket" });
  }
});

router.post("/guilds/:guildId/tickets/:ticketId/reopen", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  try {
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "ID de ticket invalido" });
      return;
    }
    await db.update(ticketsTable)
      .set({ status: "open", closedAt: null })
      .where(eq(ticketsTable.id, ticketId));
    res.json({ ok: true, message: "Ticket reabierto correctamente" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al reabrir ticket" });
  }
});

/**
 * POST /api/guilds/:guildId/tickets/test
 * Sends the ticket panel embed to the configured panelChannelId.
 */
router.post("/guilds/:guildId/tickets/test", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no esta configurado" });
    return;
  }
  try {
    const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    if (!cfg?.panelChannelId) {
      res.status(400).json({ ok: false, error: "Canal del panel de tickets no configurado. Escribe el ID del canal del panel y guarda primero." });
      return;
    }
    const axios = (await import("axios")).default;
    const buttonColors: Record<string, number> = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 };
    const buttonStyle = buttonColors[cfg.buttonColor || "PRIMARY"] ?? 1;
    const payload: Record<string, unknown> = {
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: buttonStyle,
          label: cfg.buttonLabel || "Abrir Ticket",
          emoji: cfg.buttonEmoji ? { name: cfg.buttonEmoji } : undefined,
          custom_id: "ticket_open_test",
        }],
      }],
    };
    if (cfg.panelTitle || cfg.panelDescription || cfg.panelMessage) {
      payload.embeds = [{
        title: cfg.panelTitle || "Soporte",
        description: cfg.panelDescription || cfg.panelMessage || "Haz click en el boton para abrir un ticket.",
        color: cfg.panelColor ? parseInt(cfg.panelColor.replace("#", ""), 16) : 0x5865F2,
        footer: cfg.panelFooter ? { text: cfg.panelFooter } : { text: "Neuralix Tickets · Mensaje de prueba" },
        image: cfg.panelImage ? { url: cfg.panelImage } : undefined,
      }];
    } else {
      payload.content = "**" + (cfg.panelTitle || "Sistema de Soporte") + "**\nHaz click en el boton para abrir un ticket. *(Mensaje de prueba)*";
    }
    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${cfg.panelChannelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Panel de tickets enviado al canal" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos en el canal del panel" : discordRes.status === 404 ? "Canal del panel no encontrado. Verifica el ID" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
