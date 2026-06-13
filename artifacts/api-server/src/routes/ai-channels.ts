import { Router } from "express";
import { db, aiChannelsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/guilds/:guildId/ai-channels", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const channels = await db.select().from(aiChannelsTable)
      .where(eq(aiChannelsTable.guildId, guildId))
      .orderBy(aiChannelsTable.createdAt);
    res.json(channels);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener canales IA" });
  }
});

router.post("/guilds/:guildId/ai-channels", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const { channelId, name, systemPrompt, model, enabled, replyToAll, mentionOnly, maxTokens, temperature, cooldownSeconds } = req.body;
    if (!channelId) { res.status(400).json({ error: "El ID del canal es obligatorio" }); return; }
    const [created] = await db.insert(aiChannelsTable).values({
      guildId, channelId,
      name: name || "Canal IA",
      systemPrompt: systemPrompt || null,
      model: model || "llama-3.1-8b-instant",
      enabled: enabled !== false,
      replyToAll: replyToAll !== false,
      mentionOnly: !!mentionOnly,
      maxTokens: Number(maxTokens) || 500,
      temperature: Number(temperature) || 70,
      cooldownSeconds: Number(cooldownSeconds) || 3,
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear canal IA" });
  }
});

router.put("/guilds/:guildId/ai-channels/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    const { channelId, name, systemPrompt, model, enabled, replyToAll, mentionOnly, maxTokens, temperature, cooldownSeconds } = req.body;
    const [updated] = await db.update(aiChannelsTable).set({
      channelId: channelId || undefined,
      name: name || "Canal IA",
      systemPrompt: systemPrompt || null,
      model: model || "llama-3.1-8b-instant",
      enabled: enabled !== false,
      replyToAll: replyToAll !== false,
      mentionOnly: !!mentionOnly,
      maxTokens: Number(maxTokens) || 500,
      temperature: Number(temperature) || 70,
      cooldownSeconds: Number(cooldownSeconds) || 3,
    }).where(and(eq(aiChannelsTable.id, id), eq(aiChannelsTable.guildId, guildId))).returning();
    if (!updated) { res.status(404).json({ error: "Canal IA no encontrado" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al actualizar canal IA" });
  }
});

router.delete("/guilds/:guildId/ai-channels/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "ID invalido" }); return; }
  try {
    await db.delete(aiChannelsTable).where(and(eq(aiChannelsTable.id, id), eq(aiChannelsTable.guildId, guildId)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar canal IA" });
  }
});

export default router;
