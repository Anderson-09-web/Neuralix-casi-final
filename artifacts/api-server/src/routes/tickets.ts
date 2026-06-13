import { Router } from "express";
import { db, ticketConfigsTable, ticketsTable, ticketModulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import axios from "axios";

const router = Router();

const ALLOWED_FIELDS = new Set([
  "enabled", "categoryId", "supportRoleId", "supportRoleIds", "additionalRoles",
  "transcriptChannelId", "logsChannelId", "maxTicketsPerUser",
  "panelChannelId", "panelMessage", "panelTitle", "panelDescription",
  "panelColor", "panelImage", "panelFooter",
  "buttonLabel", "buttonEmoji", "buttonColor",
  "ticketNameFormat", "openMessage", "mentionSupport",
  "autoClose", "satisfactionSurvey", "satisfactionLogChannelId", "autoTranscript",
  "claimEnabled", "deleteEnabled", "useModules",
  "queueEnabled", "maxConcurrentTickets",
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
    const tickets = await db.select().from(ticketsTable)
      .where(eq(ticketsTable.guildId, guildId))
      .orderBy(ticketsTable.createdAt);
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener tickets" });
  }
});

router.post("/guilds/:guildId/tickets/:ticketId/close", requireAuth, async (req, res) => {
  const ticketId = Number(req.params.ticketId as string);
  if (isNaN(ticketId)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
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
  if (isNaN(ticketId)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    await db.update(ticketsTable)
      .set({ status: "open", closedAt: null })
      .where(eq(ticketsTable.id, ticketId));
    res.json({ ok: true, message: "Ticket reabierto correctamente" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al reabrir ticket" });
  }
});

// ─── Ticket Modules ────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/tickets/modules", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const modules = await db.select().from(ticketModulesTable)
      .where(eq(ticketModulesTable.guildId, guildId))
      .orderBy(ticketModulesTable.sortOrder);
    res.json(modules);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener modulos de tickets" });
  }
});

router.post("/guilds/:guildId/tickets/modules", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const { name, description, emoji, welcomeMessage, welcomeEmbedEnabled, welcomeEmbedTitle, welcomeEmbedDescription, welcomeEmbedColor, supportRoleIds, categoryId, buttonLabel, buttonColor, buttonStyle, sortOrder } = req.body;
    if (!name) { res.status(400).json({ error: "El nombre es obligatorio" }); return; }
    const [created] = await db.insert(ticketModulesTable).values({
      guildId, name,
      description: description || null,
      emoji: emoji || null,
      welcomeMessage: welcomeMessage || null,
      welcomeEmbedEnabled: welcomeEmbedEnabled === true,
      welcomeEmbedTitle: welcomeEmbedTitle || null,
      welcomeEmbedDescription: welcomeEmbedDescription || null,
      welcomeEmbedColor: welcomeEmbedColor || null,
      supportRoleIds: Array.isArray(supportRoleIds) ? supportRoleIds : [],
      categoryId: categoryId || null,
      buttonLabel: buttonLabel || null,
      buttonColor: buttonColor || "PRIMARY",
      buttonStyle: buttonStyle || "button",
      sortOrder: Number(sortOrder) || 0,
      enabled: true,
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear modulo" });
  }
});

router.put("/guilds/:guildId/tickets/modules/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    const { name, description, emoji, welcomeMessage, welcomeEmbedEnabled, welcomeEmbedTitle, welcomeEmbedDescription, welcomeEmbedColor, supportRoleIds, categoryId, buttonLabel, buttonColor, buttonStyle, sortOrder, enabled } = req.body;
    const [updated] = await db.update(ticketModulesTable).set({
      name,
      description: description || null,
      emoji: emoji || null,
      welcomeMessage: welcomeMessage || null,
      welcomeEmbedEnabled: welcomeEmbedEnabled === true,
      welcomeEmbedTitle: welcomeEmbedTitle || null,
      welcomeEmbedDescription: welcomeEmbedDescription || null,
      welcomeEmbedColor: welcomeEmbedColor || null,
      supportRoleIds: Array.isArray(supportRoleIds) ? supportRoleIds : [],
      categoryId: categoryId || null,
      buttonLabel: buttonLabel || null,
      buttonColor: buttonColor || "PRIMARY",
      buttonStyle: buttonStyle || "button",
      sortOrder: Number(sortOrder) || 0,
      enabled: enabled !== false,
    }).where(and(eq(ticketModulesTable.id, id), eq(ticketModulesTable.guildId, guildId))).returning();
    if (!updated) { res.status(404).json({ error: "Modulo no encontrado" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al actualizar modulo" });
  }
});

router.delete("/guilds/:guildId/tickets/modules/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    await db.delete(ticketModulesTable)
      .where(and(eq(ticketModulesTable.id, id), eq(ticketModulesTable.guildId, guildId)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar modulo" });
  }
});

// ─── Send Panel ─────────────────────────────────────────────────────────────

router.post("/guilds/:guildId/tickets/send-panel", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" }); return; }
  try {
    const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    const channelId = req.body.channelId || cfg?.panelChannelId;
    if (!channelId) {
      res.status(400).json({ ok: false, error: "Canal del panel no configurado" });
      return;
    }

    const buttonColors: Record<string, number> = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 };

    let components: any[] = [];

    if (cfg?.useModules) {
      const modules = await db.select().from(ticketModulesTable)
        .where(and(eq(ticketModulesTable.guildId, guildId), eq(ticketModulesTable.enabled, true)))
        .orderBy(ticketModulesTable.sortOrder);
      if (modules.length === 0) {
        res.status(400).json({ ok: false, error: "No hay modulos activos. Crea al menos un modulo primero." });
        return;
      }
      if (modules.length <= 5) {
        components = [{
          type: 1,
          components: modules.map((m) => ({
            type: 2,
            style: buttonColors[m.buttonColor || "PRIMARY"] ?? 1,
            label: m.buttonLabel || m.name,
            emoji: m.emoji ? { name: m.emoji } : undefined,
            custom_id: `ticket_open_module_${m.id}`,
          })),
        }];
      } else {
        components = [{
          type: 1,
          components: [{
            type: 3,
            custom_id: "ticket_select_module",
            placeholder: "Selecciona el tipo de ticket...",
            options: modules.map((m) => ({
              label: m.name,
              value: String(m.id),
              description: m.description || undefined,
              emoji: m.emoji ? { name: m.emoji } : undefined,
            })),
          }],
        }];
      }
    } else {
      components = [{
        type: 1,
        components: [{
          type: 2,
          style: buttonColors[cfg?.buttonColor || "PRIMARY"] ?? 1,
          label: cfg?.buttonLabel || "Abrir Ticket",
          emoji: cfg?.buttonEmoji ? { name: cfg.buttonEmoji } : undefined,
          custom_id: "ticket_open",
        }],
      }];
    }

    const payload: Record<string, unknown> = { components };
    if (cfg?.panelTitle || cfg?.panelDescription || cfg?.panelMessage) {
      payload.embeds = [{
        title: cfg.panelTitle || "Soporte",
        description: cfg.panelDescription || cfg.panelMessage || "Haz click para abrir un ticket.",
        color: cfg.panelColor ? parseInt(cfg.panelColor.replace("#", ""), 16) : 0x5865F2,
        footer: cfg.panelFooter ? { text: cfg.panelFooter } : { text: "Neuralix Tickets" },
        image: cfg.panelImage ? { url: cfg.panelImage } : undefined,
      }];
    }

    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );

    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Panel enviado al canal correctamente" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos en el canal" : discordRes.status === 404 ? "Canal no encontrado" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/guilds/:guildId/tickets/test", requireAuth, async (req, res) => {
  req.body.channelId = undefined;
  const guildId = req.params.guildId as string;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" }); return; }
  try {
    const [cfg] = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, guildId));
    if (!cfg?.panelChannelId) {
      res.status(400).json({ ok: false, error: "Canal del panel de tickets no configurado. Guarda el ID del canal primero." });
      return;
    }
    const buttonColors: Record<string, number> = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 };
    const payload: Record<string, unknown> = {
      components: [{ type: 1, components: [{ type: 2, style: buttonColors[cfg.buttonColor || "PRIMARY"] ?? 1, label: cfg.buttonLabel || "Abrir Ticket", emoji: cfg.buttonEmoji ? { name: cfg.buttonEmoji } : undefined, custom_id: "ticket_open" }] }],
    };
    if (cfg.panelTitle || cfg.panelDescription || cfg.panelMessage) {
      payload.embeds = [{ title: cfg.panelTitle || "Soporte", description: cfg.panelDescription || cfg.panelMessage || "Haz click en el boton.", color: cfg.panelColor ? parseInt(cfg.panelColor.replace("#", ""), 16) : 0x5865F2, footer: cfg.panelFooter ? { text: cfg.panelFooter } : { text: "Neuralix Tickets · Prueba" }, image: cfg.panelImage ? { url: cfg.panelImage } : undefined }];
    } else {
      payload.content = "**" + (cfg.panelTitle || "Soporte") + "** *(Prueba)*";
    }
    const discordRes = await axios.post(`https://discord.com/api/v10/channels/${cfg.panelChannelId}/messages`, payload, { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true });
    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Panel enviado al canal" });
    } else {
      res.status(400).json({ ok: false, error: discordRes.data?.message || `Discord status ${discordRes.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
