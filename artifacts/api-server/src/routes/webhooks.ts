import { Router } from "express";
import { db, guildWebhooksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import axios from "axios";

const router = Router();

router.get("/guilds/:guildId/webhooks", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const hooks = await db.select({
      id: guildWebhooksTable.id,
      guildId: guildWebhooksTable.guildId,
      name: guildWebhooksTable.name,
      channelId: guildWebhooksTable.channelId,
      webhookId: guildWebhooksTable.webhookId,
      avatarUrl: guildWebhooksTable.avatarUrl,
      description: guildWebhooksTable.description,
      createdById: guildWebhooksTable.createdById,
      createdByUsername: guildWebhooksTable.createdByUsername,
      createdAt: guildWebhooksTable.createdAt,
      updatedAt: guildWebhooksTable.updatedAt,
    }).from(guildWebhooksTable).where(eq(guildWebhooksTable.guildId, guildId));
    res.json(hooks);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener webhooks" });
  }
});

router.post("/guilds/:guildId/webhooks", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const user = (req as any).user;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ error: "DISCORD_BOT_TOKEN no configurado" });
    return;
  }
  try {
    const { name, channelId, avatarUrl, description } = req.body;
    if (!name || !channelId) {
      res.status(400).json({ error: "Nombre y canal son obligatorios" });
      return;
    }
    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/webhooks`,
      { name, avatar: avatarUrl || undefined },
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status !== 200 && discordRes.status !== 201) {
      res.status(400).json({
        error: discordRes.data?.message || `Error de Discord: ${discordRes.status}`,
      });
      return;
    }
    const webhook = discordRes.data;
    const [created] = await db.insert(guildWebhooksTable).values({
      guildId,
      name,
      channelId,
      webhookId: webhook.id,
      webhookToken: webhook.token,
      avatarUrl: avatarUrl || null,
      description: description || null,
      createdById: user?.discordId || null,
      createdByUsername: user?.username || null,
    }).returning();
    const { webhookToken: _t, ...safe } = created;
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear webhook" });
  }
});

router.put("/guilds/:guildId/webhooks/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID invalido" });
    return;
  }
  try {
    const { name, avatarUrl, description } = req.body;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const [existing] = await db.select().from(guildWebhooksTable)
      .where(and(eq(guildWebhooksTable.id, id), eq(guildWebhooksTable.guildId, guildId)));
    if (!existing) {
      res.status(404).json({ error: "Webhook no encontrado" });
      return;
    }
    if (botToken && name) {
      await axios.patch(
        `https://discord.com/api/v10/webhooks/${existing.webhookId}/${existing.webhookToken}`,
        { name, avatar: avatarUrl || undefined },
        { headers: { "Content-Type": "application/json" }, validateStatus: () => true },
      ).catch(() => {});
    }
    const [updated] = await db.update(guildWebhooksTable).set({
      name: name || existing.name,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : existing.avatarUrl,
      description: description !== undefined ? description : existing.description,
    }).where(eq(guildWebhooksTable.id, id)).returning();
    const { webhookToken: _t, ...safe } = updated;
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al actualizar webhook" });
  }
});

router.delete("/guilds/:guildId/webhooks/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID invalido" });
    return;
  }
  try {
    const [existing] = await db.select().from(guildWebhooksTable)
      .where(and(eq(guildWebhooksTable.id, id), eq(guildWebhooksTable.guildId, guildId)));
    if (!existing) {
      res.status(404).json({ error: "Webhook no encontrado" });
      return;
    }
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      await axios.delete(
        `https://discord.com/api/v10/webhooks/${existing.webhookId}/${existing.webhookToken}`,
        { headers: { "Content-Type": "application/json" }, validateStatus: () => true },
      ).catch(() => {});
    }
    await db.delete(guildWebhooksTable).where(eq(guildWebhooksTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar webhook" });
  }
});

router.post("/guilds/:guildId/webhooks/:id/send", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID invalido" });
    return;
  }
  try {
    const { content, embeds, username, avatarUrl } = req.body;
    const [existing] = await db.select().from(guildWebhooksTable)
      .where(and(eq(guildWebhooksTable.id, id), eq(guildWebhooksTable.guildId, guildId)));
    if (!existing) {
      res.status(404).json({ error: "Webhook no encontrado" });
      return;
    }
    const payload: any = {};
    if (content) payload.content = content;
    if (embeds) payload.embeds = embeds;
    if (username) payload.username = username;
    if (avatarUrl) payload.avatar_url = avatarUrl;
    const discordRes = await axios.post(
      `https://discord.com/api/v10/webhooks/${existing.webhookId}/${existing.webhookToken}`,
      payload,
      { headers: { "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status === 200 || discordRes.status === 204) {
      res.json({ ok: true, message: "Mensaje enviado via webhook" });
    } else {
      res.status(400).json({ ok: false, error: discordRes.data?.message || `Discord status ${discordRes.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
