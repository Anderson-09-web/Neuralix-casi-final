import { Router } from "express";
import { db, verificationConfigsTable, verifiedUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// ─── Verification config ──────────────────────────────────────────────────────
router.get("/guilds/:guildId/verification", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  let [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
  if (!cfg) {
    const [created] = await db.insert(verificationConfigsTable).values({ guildId }).returning();
    cfg = created;
  }
  res.json(cfg);
});

router.put("/guilds/:guildId/verification", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const body = req.body;
  // Strip readonly fields
  delete body.id; delete body.createdAt; delete body.updatedAt; delete body.guildId;

  const existing = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
  let cfg;
  if (existing.length > 0) {
    const [updated] = await db.update(verificationConfigsTable).set(body).where(eq(verificationConfigsTable.guildId, guildId)).returning();
    cfg = updated;
  } else {
    const [created] = await db.insert(verificationConfigsTable).values({ guildId, ...body }).returning();
    cfg = created;
  }
  res.json(cfg);
});

// ─── Public verify endpoint (used by portal) ─────────────────────────────────
router.post("/verify/:guildId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const user = (req as any).user;
  const [cfg] = await db.select().from(verificationConfigsTable).where(eq(verificationConfigsTable.guildId, guildId));
  if (!cfg || !cfg.enabled) {
    res.json({ success: false, message: "La verificacion no esta habilitada en este servidor.", roleAssigned: false });
    return;
  }

  // AntiAlt check
  if (cfg.antiAlt && cfg.minAccountAge > 0) {
    const discordEpoch = 1420070400000;
    const accountCreatedAt = new Date((BigInt(user.discordId) >> 22n) + BigInt(discordEpoch));
    const ageInDays = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < cfg.minAccountAge) {
      res.json({
        success: false,
        message: `Tu cuenta debe tener al menos ${cfg.minAccountAge} dias de antiguedad para poder verificarse.`,
        roleAssigned: false,
      });
      return;
    }
  }

  // Guardar usuario verificado (upsert)
  const existing = await db.select().from(verifiedUsersTable)
    .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.discordId, user.discordId)));

  if (existing.length === 0) {
    await db.insert(verifiedUsersTable).values({
      guildId,
      discordId: user.discordId,
      username: user.username,
    });
  }

  res.json({
    success: true,
    message: cfg.successMessage || `¡Verificacion exitosa! Se te asignara el rol verificado en breve.`,
    roleAssigned: true,
  });
});

// ─── Verified users list (admin) ─────────────────────────────────────────────
router.get("/guilds/:guildId/verification/verified-users", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const users = await db.select().from(verifiedUsersTable).where(eq(verifiedUsersTable.guildId, guildId));
  res.json(users);
});

// ─── Reset a user's verification (admin only) ─────────────────────────────────
router.delete("/guilds/:guildId/verification/verified-users/:discordId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const discordId = req.params.discordId as string;
  const user = (req as any).user;

  // Solo el owner o admins con permiso pueden resetear verificaciones
  if (!user.isOwner) {
    res.status(403).json({ error: "Solo el propietario del servidor puede resetear verificaciones" });
    return;
  }

  await db.delete(verifiedUsersTable)
    .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.discordId, discordId)));

  res.json({ success: true, message: `Verificacion de usuario ${discordId} reseteada. Puede volver a verificarse.` });
});

export default router;
