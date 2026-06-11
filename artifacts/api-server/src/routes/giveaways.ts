import { Router } from "express";
import { db, giveawaysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getBotClient } from "../bot-state";

const router = Router();

// ─── List giveaways for a guild ───────────────────────────────────────────────
router.get("/guilds/:guildId/giveaways", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const rows = await db.select().from(giveawaysTable).where(eq(giveawaysTable.guildId, guildId));
  res.json(rows);
});

// ─── Create giveaway ──────────────────────────────────────────────────────────
router.post("/guilds/:guildId/giveaways", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const actor = (req as any).user;
  const { channelId, title, prize, winnerCount, durationMinutes, requirements } = req.body;

  if (!channelId || !title || !prize || !durationMinutes) {
    res.status(400).json({ error: "channelId, title, prize y durationMinutes son requeridos" });
    return;
  }

  const endsAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000);

  const [giveaway] = await db.insert(giveawaysTable).values({
    guildId, channelId, title, prize,
    winnerCount: Number(winnerCount ?? 1),
    endsAt,
    status: "active",
    hostedBy: actor.discordId,
    hostedByUsername: actor.username,
    requirements: requirements ?? {},
  }).returning();

  // Announce in Discord channel
  const client = getBotClient();
  if (client?.isReady()) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && "send" in channel) {
        const endTs = Math.floor(endsAt.getTime() / 1000);
        const msg = await (channel as any).send({
          embeds: [{
            title: `SORTEO — ${prize}`,
            description: `**${title}**\n\nReacciona con 🎉 para participar.\n\n**Ganadores:** ${winnerCount ?? 1}\n**Finaliza:** <t:${endTs}:R> (<t:${endTs}:f>)\n**Organiza:** ${actor.username}`,
            color: 0xF1C40F,
            footer: { text: `ID: ${giveaway.id} | Finaliza` },
            timestamp: endsAt.toISOString(),
          }],
        });
        await msg.react("🎉");
        await db.update(giveawaysTable).set({ messageId: msg.id }).where(eq(giveawaysTable.id, giveaway.id));
        giveaway.messageId = msg.id;
      }
    } catch (e) {
      console.error("Error al crear sorteo en Discord:", e);
    }
  }

  res.status(201).json(giveaway);
});

// ─── End giveaway & pick winners ─────────────────────────────────────────────
router.post("/guilds/:guildId/giveaways/:id/end", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [giveaway] = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, id));
  if (!giveaway) { res.status(404).json({ error: "Sorteo no encontrado" }); return; }
  if (giveaway.status !== "active") { res.status(400).json({ error: "El sorteo no está activo" }); return; }

  const entrants = giveaway.entrants ?? [];
  const winnerCount = Math.min(giveaway.winnerCount, entrants.length);
  const shuffled = [...entrants].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, winnerCount);

  const [updated] = await db.update(giveawaysTable)
    .set({ status: "ended", winners, updatedAt: new Date() })
    .where(eq(giveawaysTable.id, id))
    .returning();

  // Announce winners
  const client = getBotClient();
  if (client?.isReady() && giveaway.channelId) {
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      if (channel && "send" in channel) {
        const winnerMentions = winners.length > 0 ? winners.map((w) => `<@${w}>`).join(", ") : "Nadie participó";
        await (channel as any).send({
          embeds: [{
            title: `SORTEO FINALIZADO — ${giveaway.prize}`,
            description: `**Ganador(es):** ${winnerMentions}\n**Premio:** ${giveaway.prize}\n**Participantes:** ${entrants.length}`,
            color: 0x57F287,
            footer: { text: `Organizado por ${giveaway.hostedByUsername}` },
          }],
        });
      }
    } catch {}
  }

  res.json(updated);
});

// ─── Reroll giveaway ─────────────────────────────────────────────────────────
router.post("/guilds/:guildId/giveaways/:id/reroll", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [giveaway] = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, id));
  if (!giveaway) { res.status(404).json({ error: "Sorteo no encontrado" }); return; }

  const entrants = giveaway.entrants ?? [];
  const shuffled = [...entrants].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, giveaway.winnerCount);

  const [updated] = await db.update(giveawaysTable).set({ winners, updatedAt: new Date() }).where(eq(giveawaysTable.id, id)).returning();

  const client = getBotClient();
  if (client?.isReady() && giveaway.channelId) {
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      if (channel && "send" in channel) {
        const winnerMentions = winners.length > 0 ? winners.map((w) => `<@${w}>`).join(", ") : "Nadie";
        await (channel as any).send({ content: `Nuevo ganador del sorteo **${giveaway.prize}**: ${winnerMentions}` });
      }
    } catch {}
  }

  res.json(updated);
});

// ─── Cancel giveaway ─────────────────────────────────────────────────────────
router.delete("/guilds/:guildId/giveaways/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.update(giveawaysTable).set({ status: "cancelled" }).where(eq(giveawaysTable.id, id));
  res.status(204).send();
});

export default router;
