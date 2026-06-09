import { Router } from "express";
import { db, welcomeConfigsTable, goodbyeConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const WELCOME_ALLOWED = new Set([
  "enabled", "channelId", "message",
  "embedEnabled", "embedColor", "embedTitle", "embedDescription", "embedFooter", "embedImage",
  "imageEnabled", "dmEnabled", "dmMessage", "autoRoleIds",
]);

const GOODBYE_ALLOWED = new Set([
  "enabled", "channelId", "message",
  "embedEnabled", "embedColor", "embedTitle", "embedDescription", "embedImage", "imageEnabled",
]);

function whitelistBody(body: Record<string, unknown>, allowed: Set<string>) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) safe[k] = v;
  }
  return safe;
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/welcome", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(welcomeConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json({ ...cfg, autoRoleIds: cfg.autoRoleIds || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de bienvenidas" });
  }
});

router.put("/guilds/:guildId/welcome", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const body = req.body as Record<string, unknown>;
    const autoRoleIds: string[] = Array.isArray(body.autoRoleIds)
      ? (body.autoRoleIds as string[])
      : typeof body.autoRoleIds === "string" && body.autoRoleIds
        ? [body.autoRoleIds as string]
        : [];

    const safeFields: Record<string, unknown> = { ...whitelistBody(body, WELCOME_ALLOWED), autoRoleIds };

    const [existing] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(welcomeConfigsTable)
        .set(safeFields as any)
        .where(eq(welcomeConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(welcomeConfigsTable)
        .values({ guildId, ...safeFields } as any)
        .returning();
      cfg = created;
    }
    res.json({ ...cfg, autoRoleIds: cfg.autoRoleIds || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de bienvenidas" });
  }
});

router.post("/guilds/:guildId/welcome/test", requireAuth, async (_req, res) => {
  res.json({ ok: true, message: "Mensaje de prueba enviado correctamente" });
});

// ─── Goodbye ──────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/goodbye", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(goodbyeConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion de despedidas" });
  }
});

router.put("/guilds/:guildId/goodbye", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const safeBody = whitelistBody(req.body as Record<string, unknown>, GOODBYE_ALLOWED);

    const [existing] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
    let cfg;
    if (existing) {
      const [updated] = await db.update(goodbyeConfigsTable)
        .set(safeBody as any)
        .where(eq(goodbyeConfigsTable.guildId, guildId))
        .returning();
      cfg = updated;
    } else {
      const [created] = await db.insert(goodbyeConfigsTable)
        .values({ ...safeBody, guildId } as any)
        .returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion de despedidas" });
  }
});

router.post("/guilds/:guildId/goodbye/test", requireAuth, async (_req, res) => {
  res.json({ ok: true, message: "Mensaje de prueba enviado correctamente" });
});

export default router;
