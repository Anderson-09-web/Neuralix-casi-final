import { Router } from "express";
import axios from "axios";
import { db, customCommandsTable, guildConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();
const DISCORD_API = "https://discord.com/api/v10";

async function registerDiscordCommand(guildId: string, name: string, description: string): Promise<string | null> {
  const appId = process.env.DISCORD_CLIENT_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !botToken) return null;
  try {
    const res = await axios.post(
      `${DISCORD_API}/applications/${appId}/guilds/${guildId}/commands`,
      { name: name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").substring(0, 32), description: description.substring(0, 100), type: 1 },
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (res.status === 200 || res.status === 201) return res.data.id as string;
    return null;
  } catch { return null; }
}

async function unregisterDiscordCommand(guildId: string, discordCommandId: string): Promise<void> {
  const appId = process.env.DISCORD_CLIENT_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !botToken || !discordCommandId) return;
  try {
    await axios.delete(
      `${DISCORD_API}/applications/${appId}/guilds/${guildId}/commands/${discordCommandId}`,
      { headers: { Authorization: `Bot ${botToken.trim()}` }, validateStatus: () => true },
    );
  } catch {}
}

router.get("/guilds/:guildId/custom-commands", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const cmds = await db.select().from(customCommandsTable).where(eq(customCommandsTable.guildId, guildId));
    res.json(cmds);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener comandos" });
  }
});

router.post("/guilds/:guildId/custom-commands", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const { name, description, response, enabled, premiumOnly, cooldownSeconds, restrictedRoleId, useEmbed, embedTitle, embedColor } = req.body;
  if (!name || !response) { res.status(400).json({ error: "Nombre y respuesta son obligatorios" }); return; }
  const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").substring(0, 32);
  try {
    const discordCommandId = await registerDiscordCommand(guildId, cleanName, description || "Comando personalizado");
    const [cmd] = await db.insert(customCommandsTable).values({
      guildId, name: cleanName, description: description || "Comando personalizado",
      response, enabled: enabled !== false, premiumOnly: !!premiumOnly,
      cooldownSeconds: Number(cooldownSeconds) || 0, restrictedRoleId: restrictedRoleId || null,
      discordCommandId, useEmbed: !!useEmbed, embedTitle: embedTitle || null, embedColor: embedColor || "#5865F2",
    }).returning();
    res.json(cmd);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear comando" });
  }
});

router.put("/guilds/:guildId/custom-commands/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  const { name, description, response, enabled, premiumOnly, cooldownSeconds, restrictedRoleId, useEmbed, embedTitle, embedColor } = req.body;
  try {
    const [existing] = await db.select().from(customCommandsTable).where(and(eq(customCommandsTable.id, id), eq(customCommandsTable.guildId, guildId)));
    if (!existing) { res.status(404).json({ error: "Comando no encontrado" }); return; }
    const cleanName = (name || existing.name).toLowerCase().replace(/[^a-z0-9-_]/g, "-").substring(0, 32);
    let discordCommandId = existing.discordCommandId;
    if (cleanName !== existing.name) {
      if (existing.discordCommandId) await unregisterDiscordCommand(guildId, existing.discordCommandId);
      discordCommandId = await registerDiscordCommand(guildId, cleanName, description || existing.description);
    }
    const [updated] = await db.update(customCommandsTable).set({
      name: cleanName, description: description || existing.description, response: response || existing.response,
      enabled: enabled !== undefined ? enabled : existing.enabled, premiumOnly: premiumOnly !== undefined ? premiumOnly : existing.premiumOnly,
      cooldownSeconds: cooldownSeconds !== undefined ? Number(cooldownSeconds) : existing.cooldownSeconds,
      restrictedRoleId: restrictedRoleId !== undefined ? restrictedRoleId : existing.restrictedRoleId,
      discordCommandId, useEmbed: useEmbed !== undefined ? useEmbed : existing.useEmbed,
      embedTitle: embedTitle !== undefined ? embedTitle : existing.embedTitle,
      embedColor: embedColor || existing.embedColor,
    }).where(eq(customCommandsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al actualizar comando" });
  }
});

router.delete("/guilds/:guildId/custom-commands/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  try {
    const [existing] = await db.select().from(customCommandsTable).where(and(eq(customCommandsTable.id, id), eq(customCommandsTable.guildId, guildId)));
    if (!existing) { res.status(404).json({ error: "Comando no encontrado" }); return; }
    if (existing.discordCommandId) await unregisterDiscordCommand(guildId, existing.discordCommandId);
    await db.delete(customCommandsTable).where(eq(customCommandsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar comando" });
  }
});

export default router;
