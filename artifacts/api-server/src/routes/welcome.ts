import { Router } from "express";
import { db, welcomeConfigsTable, goodbyeConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// ─── Welcome ──────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/welcome", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [cfg] = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
  if (!cfg) {
    const [created] = await db.insert(welcomeConfigsTable).values({ guildId }).returning();
    cfg = created;
  }
  res.json({ ...cfg, autoRoleIds: cfg.autoRoleIds || [] });
});

router.put("/guilds/:guildId/welcome", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const body = req.body as Record<string, unknown>;
  const autoRoleIds: string[] = Array.isArray(body.autoRoleIds)
    ? (body.autoRoleIds as string[])
    : typeof body.autoRoleIds === "string" && body.autoRoleIds
      ? [body.autoRoleIds as string]
      : [];

  const safeFields = {
    enabled: body.enabled as boolean | undefined,
    channelId: body.channelId as string | null | undefined,
    message: body.message as string | null | undefined,
    embedEnabled: body.embedEnabled as boolean | undefined,
    embedColor: body.embedColor as string | null | undefined,
    embedTitle: body.embedTitle as string | null | undefined,
    embedDescription: body.embedDescription as string | null | undefined,
    embedFooter: body.embedFooter as string | null | undefined,
    embedImage: body.embedImage as string | null | undefined,
    imageEnabled: body.imageEnabled as boolean | undefined,
    dmEnabled: body.dmEnabled as boolean | undefined,
    dmMessage: body.dmMessage as string | null | undefined,
    autoRoleIds,
  };

  Object.keys(safeFields).forEach((k) => {
    if ((safeFields as any)[k] === undefined) delete (safeFields as any)[k];
  });

  const existing = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
  let cfg;
  if (existing.length > 0) {
    const [updated] = await db.update(welcomeConfigsTable)
      .set(safeFields)
      .where(eq(welcomeConfigsTable.guildId, guildId))
      .returning();
    cfg = updated;
  } else {
    const [created] = await db.insert(welcomeConfigsTable)
      .values({ guildId, ...safeFields })
      .returning();
    cfg = created;
  }
  res.json({ ...cfg, autoRoleIds: cfg.autoRoleIds || [] });
});

router.post("/guilds/:guildId/welcome/test", requireAuth, async (_req, res) => {
  res.json({ ok: true, message: "Test welcome message sent" });
});

// ─── Goodbye ──────────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/goodbye", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [cfg] = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
  if (!cfg) {
    const [created] = await db.insert(goodbyeConfigsTable).values({ guildId }).returning();
    cfg = created;
  }
  res.json(cfg);
});

router.put("/guilds/:guildId/goodbye", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const body = { ...req.body };
  delete body.id; delete body.createdAt; delete body.updatedAt; delete body.guildId;
  const existing = await db.select().from(goodbyeConfigsTable).where(eq(goodbyeConfigsTable.guildId, guildId));
  let cfg;
  if (existing.length > 0) {
    const [updated] = await db.update(goodbyeConfigsTable)
      .set(body as any)
      .where(eq(goodbyeConfigsTable.guildId, guildId))
      .returning();
    cfg = updated;
  } else {
    const [created] = await db.insert(goodbyeConfigsTable)
      .values({ ...body, guildId } as any)
      .returning();
    cfg = created;
  }
  res.json(cfg);
});

router.post("/guilds/:guildId/goodbye/test", requireAuth, async (_req, res) => {
  res.json({ ok: true, message: "Test goodbye message sent" });
});

export default router;
