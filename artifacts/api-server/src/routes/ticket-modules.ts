import { Router } from "express";
import { db, ticketModulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/guilds/:guildId/tickets/modules", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const modules = await db.select().from(ticketModulesTable)
      .where(eq(ticketModulesTable.guildId, guildId))
      .orderBy(ticketModulesTable.sortOrder);
    res.json(modules);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener modulos" });
  }
});

router.post("/guilds/:guildId/tickets/modules", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const { name, description, emoji, buttonLabel, buttonColor, categoryId, staffRoleId, enabled, sortOrder, panelId } = req.body;
    if (!name) { res.status(400).json({ error: "El nombre es obligatorio" }); return; }
    const [created] = await db.insert(ticketModulesTable).values({
      guildId, name,
      description: description || null,
      emoji: emoji || null,
      buttonLabel: buttonLabel || name,
      buttonColor: buttonColor || "PRIMARY",
      categoryId: categoryId || null,
      staffRoleId: staffRoleId || null,
      enabled: enabled !== false,
      sortOrder: Number(sortOrder) || 0,
      panelId: panelId ? Number(panelId) : null,
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
    const { name, description, emoji, buttonLabel, buttonColor, categoryId, staffRoleId, enabled, sortOrder, panelId } = req.body;
    const [updated] = await db.update(ticketModulesTable).set({
      name: name || undefined,
      description: description || null,
      emoji: emoji || null,
      buttonLabel: buttonLabel || name,
      buttonColor: buttonColor || "PRIMARY",
      categoryId: categoryId || null,
      staffRoleId: staffRoleId || null,
      enabled: enabled !== false,
      sortOrder: Number(sortOrder) || 0,
      panelId: panelId ? Number(panelId) : null,
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
    await db.delete(ticketModulesTable).where(and(eq(ticketModulesTable.id, id), eq(ticketModulesTable.guildId, guildId)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar modulo" });
  }
});

export default router;
