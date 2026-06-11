import { Router } from "express";
import { requireAuth } from "../lib/auth";
import axios from "axios";

const router = Router();

router.post("/guilds/:guildId/messages/send", requireAuth, async (req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(400).json({ ok: false, error: "DISCORD_BOT_TOKEN no configurado" });
    return;
  }
  try {
    const { channelId, content, embeds, embedTitle, embedDescription, embedColor, embedImage, embedFooter, tts } = req.body;
    if (!channelId) {
      res.status(400).json({ ok: false, error: "Canal requerido" });
      return;
    }

    const payload: any = {};

    if (content) payload.content = content;
    if (tts) payload.tts = true;

    let embedsToSend = embeds;
    if (!embedsToSend && (embedTitle || embedDescription)) {
      const embed: any = {};
      if (embedTitle) embed.title = embedTitle;
      if (embedDescription) embed.description = embedDescription;
      if (embedColor) embed.color = typeof embedColor === "string" ? parseInt(embedColor.replace("#", ""), 16) : embedColor;
      if (embedImage) embed.image = { url: embedImage };
      if (embedFooter) embed.footer = { text: embedFooter };
      embedsToSend = [embed];
    }
    if (embedsToSend) payload.embeds = embedsToSend;

    if (!payload.content && !payload.embeds) {
      res.status(400).json({ ok: false, error: "Se requiere contenido o embed" });
      return;
    }

    const discordRes = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken.trim()}`, "Content-Type": "application/json" }, validateStatus: () => true },
    );

    if (discordRes.status === 200 || discordRes.status === 201) {
      res.json({ ok: true, message: "Mensaje enviado correctamente", messageId: discordRes.data?.id });
    } else {
      res.status(400).json({
        ok: false,
        error: discordRes.data?.message || `Discord respondio con status ${discordRes.status}`,
        hint: discordRes.status === 403 ? "El bot no tiene permisos en ese canal" : discordRes.status === 404 ? "Canal no encontrado" : undefined,
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
