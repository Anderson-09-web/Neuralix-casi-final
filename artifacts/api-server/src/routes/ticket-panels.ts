import { Router } from "express";
import { db, ticketPanelsTable, ticketModulesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import axios from "axios";

const router = Router();

router.get("/guilds/:guildId/tickets/panels", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const panels = await db.select().from(ticketPanelsTable)
      .where(eq(ticketPanelsTable.guildId, guildId))
      .orderBy(ticketPanelsTable.sortOrder);

    const moduleCounts = await db
      .select({ panelId: ticketModulesTable.panelId, cnt: count() })
      .from(ticketModulesTable)
      .where(eq(ticketModulesTable.guildId, guildId))
      .groupBy(ticketModulesTable.panelId);

    const countMap = new Map(moduleCounts.map((r) => [r.panelId, Number(r.cnt)]));
    const result = panels.map((p) => ({ ...p, _moduleCount: countMap.get(p.id) ?? 0 }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener paneles" });
  }
});

router.post("/guilds/:guildId/tickets/panels", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const { name, description, channelId, embedTitle, embedDescription, embedColor, embedImage, embedFooter, buttonLabel, buttonEmoji, buttonColor, useModules, sortOrder, moduleIds } = req.body;
    if (!name) { res.status(400).json({ error: "El nombre es obligatorio" }); return; }
    const [created] = await db.insert(ticketPanelsTable).values({
      guildId, name,
      description: description || null,
      channelId: channelId || null,
      embedTitle: embedTitle || null,
      embedDescription: embedDescription || null,
      embedColor: embedColor || "#5865F2",
      embedImage: embedImage || null,
      embedFooter: embedFooter || null,
      buttonLabel: buttonLabel || "Abrir Ticket",
      buttonEmoji: buttonEmoji || "🎫",
      buttonColor: buttonColor || "PRIMARY",
      useModules: useModules === true,
      sortOrder: Number(sortOrder) || 0,
    }).returning();
    // Assign selected modules to this panel
    if (Array.isArray(moduleIds) && moduleIds.length > 0) {
      const { inArray, isNull, or } = await import("drizzle-orm");
      // Clear panelId for previously unassigned modules of this guild (if any had this panel somehow)
      await db.update(ticketModulesTable).set({ panelId: null }).where(and(eq(ticketModulesTable.guildId, guildId), eq(ticketModulesTable.panelId, created.id)));
      // Assign selected module IDs to this panel
      await db.update(ticketModulesTable).set({ panelId: created.id }).where(and(eq(ticketModulesTable.guildId, guildId), inArray(ticketModulesTable.id, moduleIds)));
    }
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear panel" });
  }
});

router.put("/guilds/:guildId/tickets/panels/:panelId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const panelId = Number(req.params.panelId as string);
  if (isNaN(panelId)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    const { name, description, channelId, embedTitle, embedDescription, embedColor, embedImage, embedFooter, buttonLabel, buttonEmoji, buttonColor, useModules, sortOrder, moduleIds } = req.body;
    const [updated] = await db.update(ticketPanelsTable).set({
      name: name || undefined,
      description: description || null,
      channelId: channelId || null,
      embedTitle: embedTitle || null,
      embedDescription: embedDescription || null,
      embedColor: embedColor || "#5865F2",
      embedImage: embedImage || null,
      embedFooter: embedFooter || null,
      buttonLabel: buttonLabel || "Abrir Ticket",
      buttonEmoji: buttonEmoji || "🎫",
      buttonColor: buttonColor || "PRIMARY",
      useModules: useModules === true,
      sortOrder: Number(sortOrder) || 0,
      updatedAt: new Date(),
    }).where(and(eq(ticketPanelsTable.id, panelId), eq(ticketPanelsTable.guildId, guildId))).returning();
    if (!updated) { res.status(404).json({ error: "Panel no encontrado" }); return; }
    // Update module assignments
    if (Array.isArray(moduleIds)) {
      const { inArray } = await import("drizzle-orm");
      // Clear all modules assigned to this panel first
      await db.update(ticketModulesTable).set({ panelId: null }).where(and(eq(ticketModulesTable.guildId, guildId), eq(ticketModulesTable.panelId, panelId)));
      // Assign selected modules to this panel
      if (moduleIds.length > 0) {
        await db.update(ticketModulesTable).set({ panelId }).where(and(eq(ticketModulesTable.guildId, guildId), inArray(ticketModulesTable.id, moduleIds)));
      }
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al actualizar panel" });
  }
});

router.delete("/guilds/:guildId/tickets/panels/:panelId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const panelId = Number(req.params.panelId as string);
  if (isNaN(panelId)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    await db.delete(ticketPanelsTable).where(and(eq(ticketPanelsTable.id, panelId), eq(ticketPanelsTable.guildId, guildId)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar panel" });
  }
});

router.post("/guilds/:guildId/tickets/panels/:panelId/send", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const panelId = Number(req.params.panelId as string);
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" }); return; }
  if (isNaN(panelId)) { res.status(400).json({ error: "ID invalido" }); return; }

  try {
    const [panel] = await db.select().from(ticketPanelsTable).where(and(eq(ticketPanelsTable.id, panelId), eq(ticketPanelsTable.guildId, guildId)));
    if (!panel) { res.status(404).json({ ok: false, error: "Panel no encontrado" }); return; }

    const channelId = req.body.channelId || panel.channelId;
    if (!channelId) { res.status(400).json({ ok: false, error: "Canal del panel no configurado" }); return; }

    const buttonColors: Record<string, number> = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 };
    let components: any[] = [];

    if (panel.useModules) {
      const { isNull, or } = await import("drizzle-orm");
      const modules = await db.select().from(ticketModulesTable)
        .where(and(
          eq(ticketModulesTable.guildId, guildId),
          eq(ticketModulesTable.enabled, true),
          or(eq(ticketModulesTable.panelId, panelId), isNull(ticketModulesTable.panelId))
        ))
        .orderBy(ticketModulesTable.sortOrder);
      if (modules.length === 0) {
        res.status(400).json({ ok: false, error: "No hay modulos activos para este panel. Crea modulos en la pestana 'Modulos' y asignalos a este panel." });
        return;
      }
      if (modules.length <= 5) {
        components = [{ type: 1, components: modules.map((m) => ({ type: 2, style: buttonColors[m.buttonColor || "PRIMARY"] ?? 1, label: m.buttonLabel || m.name, emoji: m.emoji ? { name: m.emoji } : undefined, custom_id: `ticket_open_module_${m.id}` })) }];
      } else {
        components = [{ type: 1, components: [{ type: 3, custom_id: "ticket_select_module", placeholder: "Selecciona el tipo de ticket...", options: modules.map((m) => ({ label: m.name, value: String(m.id), description: m.description || undefined, emoji: m.emoji ? { name: m.emoji } : undefined })) }] }];
      }
    } else {
      components = [{ type: 1, components: [{ type: 2, style: buttonColors[panel.buttonColor || "PRIMARY"] ?? 1, label: panel.buttonLabel || "Abrir Ticket", emoji: panel.buttonEmoji ? { name: panel.buttonEmoji } : { name: "🎫" }, custom_id: `ticket_panel_${panel.id}` }] }];
    }

    const payload: Record<string, unknown> = { components };
    if (panel.embedTitle || panel.embedDescription) {
      payload.embeds = [{ title: panel.embedTitle || "Soporte", description: panel.embedDescription || "Haz click para abrir un ticket.", color: panel.embedColor ? parseInt(panel.embedColor.replace("#", ""), 16) : 0x5865F2, footer: panel.embedFooter ? { text: panel.embedFooter } : { text: "Neuralix Tickets" }, image: panel.embedImage ? { url: panel.embedImage } : undefined }];
    }

    const discordRes = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true });

    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Panel enviado al canal correctamente" });
    } else {
      res.status(400).json({ ok: false, error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
