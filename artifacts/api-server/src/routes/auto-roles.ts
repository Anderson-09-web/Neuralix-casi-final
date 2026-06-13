import { Router } from "express";
import { db, autoRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import axios from "axios";

const router = Router();

router.get("/guilds/:guildId/auto-roles", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const roles = await db.select().from(autoRolesTable)
      .where(eq(autoRolesTable.guildId, guildId))
      .orderBy(autoRolesTable.createdAt);
    res.json(roles);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener auto-roles" });
  }
});

router.post("/guilds/:guildId/auto-roles", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const { name, type, roleIds, buttonLabel, buttonEmoji, buttonColor, channelId, description, temporary, durationMinutes } = req.body;
    if (!name) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }
    const [created] = await db.insert(autoRolesTable).values({
      guildId, name, type: type || "join",
      roleIds: Array.isArray(roleIds) ? roleIds : [],
      buttonLabel: buttonLabel || null,
      buttonEmoji: buttonEmoji || null,
      buttonColor: buttonColor || "PRIMARY",
      channelId: channelId || null,
      description: description || null,
      temporary: !!temporary,
      durationMinutes: Number(durationMinutes) || 0,
      enabled: true,
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al crear auto-role" });
  }
});

router.put("/guilds/:guildId/auto-roles/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  try {
    if (isNaN(id)) {
      res.status(400).json({ error: "ID invalido" });
      return;
    }
    const { name, type, roleIds, buttonLabel, buttonEmoji, buttonColor, channelId, description, temporary, durationMinutes, enabled } = req.body;
    const [updated] = await db.update(autoRolesTable).set({
      name, type, roleIds: Array.isArray(roleIds) ? roleIds : [],
      buttonLabel: buttonLabel || null,
      buttonEmoji: buttonEmoji || null,
      buttonColor: buttonColor || "PRIMARY",
      channelId: channelId || null,
      description: description || null,
      temporary: !!temporary,
      durationMinutes: Number(durationMinutes) || 0,
      enabled: enabled !== false,
    }).where(and(eq(autoRolesTable.id, id), eq(autoRolesTable.guildId, guildId))).returning();
    if (!updated) {
      res.status(404).json({ error: "Auto-role no encontrado" });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al actualizar auto-role" });
  }
});

router.delete("/guilds/:guildId/auto-roles/:id", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  try {
    if (isNaN(id)) {
      res.status(400).json({ error: "ID invalido" });
      return;
    }
    await db.delete(autoRolesTable).where(and(eq(autoRolesTable.id, id), eq(autoRolesTable.guildId, guildId)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al eliminar auto-role" });
  }
});

router.post("/guilds/:guildId/auto-roles/:id/send", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const id = Number(req.params.id as string);
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" });
    return;
  }
  try {
    const [role] = await db.select().from(autoRolesTable)
      .where(and(eq(autoRolesTable.id, id), eq(autoRolesTable.guildId, guildId)));
    if (!role) {
      res.status(404).json({ ok: false, error: "Auto-role no encontrado" });
      return;
    }
    if (role.type === "reaction") {
      res.status(400).json({ ok: false, error: "Los roles de reaccion no requieren enviar panel. Configura el ID del mensaje y el emoji directamente." });
      return;
    }
    if (!role.channelId) {
      res.status(400).json({ ok: false, error: "Canal no configurado para este auto-role" });
      return;
    }

    const buttonColors: Record<string, number> = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 };
    let components: any[];

    if (role.type === "select") {
      // Build select menu with ALL select-type auto-roles for this guild
      const allSelectRoles = await db.select().from(autoRolesTable)
        .where(and(eq(autoRolesTable.guildId, guildId), eq(autoRolesTable.type, "select"), eq(autoRolesTable.enabled, true)));
      if (allSelectRoles.length === 0) {
        res.status(400).json({ ok: false, error: "No hay auto-roles de tipo menu activos para construir el selector." });
        return;
      }
      components = [{
        type: 1,
        components: [{
          type: 3,
          custom_id: "autorole_select",
          placeholder: "Selecciona un rol...",
          min_values: 0,
          max_values: 1,
          options: allSelectRoles.map((ar) => ({
            label: ar.buttonLabel || ar.name,
            value: String(ar.id),
            description: ar.description || undefined,
            emoji: ar.buttonEmoji ? { name: ar.buttonEmoji } : undefined,
          })),
        }],
      }];
    } else {
      const style = buttonColors[role.buttonColor || "PRIMARY"] ?? 1;
      components = [{
        type: 1,
        components: [{
          type: 2,
          style,
          label: role.buttonLabel || role.name,
          emoji: role.buttonEmoji ? { name: role.buttonEmoji } : undefined,
          custom_id: `autorole_${role.id}`,
        }],
      }];
    }

    const payload: any = {
      embeds: [{
        title: role.name,
        description: role.description || "Haz click para obtener o quitar un rol.",
        color: 0x5865F2,
        footer: { text: "Neuralix Auto-Roles" },
      }],
      components,
    };

    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${role.channelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );
    if (discordRes.status === 200 || discordRes.status === 201) {
      const messageId = discordRes.data?.id;
      if (messageId) {
        await db.update(autoRolesTable).set({ messageId }).where(eq(autoRolesTable.id, id));
      }
      res.json({ ok: true, message: role.type === "select" ? "Menu de auto-roles enviado al canal" : "Panel de auto-roles enviado al canal" });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
