import { Router } from "express";
import { db, robloxConfigsTable, robloxVerificationsTable, robloxPendingTable, guildConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();
const ROBLOX_API = "https://users.roblox.com/v1";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getRobloxUserByName(username: string): Promise<{ id: number; name: string; displayName: string } | null> {
  try {
    const res = await fetch(`${ROBLOX_API}/usernames/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.data?.[0] ?? null;
  } catch { return null; }
}

async function getRobloxUserById(userId: string): Promise<{ id: number; name: string; displayName: string; description: string } | null> {
  try {
    const res = await fetch(`${ROBLOX_API}/users/${userId}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return await res.json() as { id: number; name: string; displayName: string; description: string };
  } catch { return null; }
}

function generateCode(): string {
  return `neuralix-${Math.random().toString(36).slice(2, 10)}`;
}

function formatNickname(format: string, discord: string, roblox: string): string {
  return format
    .replace("{discord}", discord)
    .replace("{roblox}", roblox)
    .slice(0, 32);
}

// ── Roblox Config ─────────────────────────────────────────────────────────────

router.get("/guilds/:guildId/roblox-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(robloxConfigsTable).where(eq(robloxConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(robloxConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al obtener configuracion Roblox" });
  }
});

router.put("/guilds/:guildId/roblox-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const ALLOWED = new Set(["enabled", "roleId", "logChannelId", "autoNickname", "nicknameFormat", "welcomeIntegration"]);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (ALLOWED.has(k)) safe[k] = v;
  }
  try {
    const existing = await db.select().from(robloxConfigsTable).where(eq(robloxConfigsTable.guildId, guildId));
    let result;
    if (existing.length === 0) {
      [result] = await db.insert(robloxConfigsTable).values({ guildId, ...safe }).returning();
    } else {
      [result] = await db.update(robloxConfigsTable).set(safe).where(eq(robloxConfigsTable.guildId, guildId)).returning();
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error al guardar configuracion Roblox" });
  }
});

// ── Roblox Verified Users ─────────────────────────────────────────────────────

router.get("/guilds/:guildId/roblox-verifications", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    const users = await db.select().from(robloxVerificationsTable)
      .where(eq(robloxVerificationsTable.guildId, guildId));
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.delete("/guilds/:guildId/roblox-verifications/:discordId", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const discordId = req.params.discordId as string;
  try {
    await db.delete(robloxVerificationsTable)
      .where(and(
        eq(robloxVerificationsTable.guildId, guildId),
        eq(robloxVerificationsTable.discordId, discordId),
      ));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Roblox Info (public — no auth) ───────────────────────────────────────────

router.get("/roblox-verify-info/:guildId", async (req, res) => {
  const guildId = req.params.guildId as string;
  try {
    let [cfg] = await db.select().from(robloxConfigsTable).where(eq(robloxConfigsTable.guildId, guildId));
    if (!cfg) {
      const [created] = await db.insert(robloxConfigsTable).values({ guildId }).returning();
      cfg = created;
    }
    res.json({
      guildId,
      enabled: cfg.enabled,
      autoNickname: cfg.autoNickname,
      nicknameFormat: cfg.nicknameFormat,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Initiate Roblox verification (lookup user + generate code) ────────────────

router.post("/guilds/:guildId/roblox-initiate", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const { robloxUsername } = req.body;
  const discordId = (req as any).user?.discordId;
  const discordUsername = (req as any).user?.username;

  if (!robloxUsername) { res.status(400).json({ error: "robloxUsername requerido" }); return; }
  if (!discordId) { res.status(401).json({ error: "No autenticado" }); return; }

  try {
    const robloxUser = await getRobloxUserByName(robloxUsername.trim());
    if (!robloxUser) { res.status(404).json({ error: "Usuario de Roblox no encontrado" }); return; }

    const existing = await db.select().from(robloxVerificationsTable)
      .where(and(
        eq(robloxVerificationsTable.guildId, guildId),
        eq(robloxVerificationsTable.discordId, discordId),
      ));
    if (existing.length > 0) {
      res.status(409).json({ error: "Ya estas verificado con Roblox en este servidor", alreadyVerified: true, robloxUsername: existing[0].robloxUsername });
      return;
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.delete(robloxPendingTable)
      .where(and(
        eq(robloxPendingTable.guildId, guildId),
        eq(robloxPendingTable.discordId, discordId),
      ));

    await db.insert(robloxPendingTable).values({
      guildId,
      discordId,
      robloxId: String(robloxUser.id),
      robloxUsername: robloxUser.name,
      code,
      expiresAt,
    });

    res.json({
      code,
      robloxId: String(robloxUser.id),
      robloxUsername: robloxUser.name,
      robloxDisplayName: robloxUser.displayName,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    logger.error({ err }, "Error en roblox-initiate");
    res.status(500).json({ error: err?.message || "Error al iniciar verificacion" });
  }
});

// ── Confirm Roblox verification (check bio code) ──────────────────────────────

router.post("/guilds/:guildId/roblox-confirm", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const discordId = (req as any).user?.discordId;
  const discordUsername = (req as any).user?.username;

  if (!discordId) { res.status(401).json({ error: "No autenticado" }); return; }

  try {
    const [pending] = await db.select().from(robloxPendingTable)
      .where(and(
        eq(robloxPendingTable.guildId, guildId),
        eq(robloxPendingTable.discordId, discordId),
      ));

    if (!pending) { res.status(404).json({ error: "No hay verificacion pendiente. Inicia el proceso de nuevo." }); return; }
    if (new Date() > pending.expiresAt) {
      await db.delete(robloxPendingTable).where(eq(robloxPendingTable.id, pending.id));
      res.status(410).json({ error: "El codigo ha expirado. Inicia el proceso de nuevo." });
      return;
    }

    const robloxProfile = await getRobloxUserById(pending.robloxId);
    if (!robloxProfile) { res.status(502).json({ error: "No se pudo obtener el perfil de Roblox. Intenta de nuevo." }); return; }

    const descriptionContainsCode = robloxProfile.description?.includes(pending.code);
    if (!descriptionContainsCode) {
      res.status(400).json({
        error: `El codigo no se encontro en tu descripcion de Roblox. Asegurate de haber guardado el perfil.`,
        code: pending.code,
        found: false,
      });
      return;
    }

    const [cfg] = await db.select().from(robloxConfigsTable).where(eq(robloxConfigsTable.guildId, guildId));

    await db.delete(robloxVerificationsTable)
      .where(and(
        eq(robloxVerificationsTable.guildId, guildId),
        eq(robloxVerificationsTable.discordId, discordId),
      ));

    await db.insert(robloxVerificationsTable).values({
      guildId,
      discordId,
      discordUsername,
      robloxId: pending.robloxId,
      robloxUsername: robloxProfile.name,
      robloxDisplayName: robloxProfile.displayName,
    });

    await db.delete(robloxPendingTable).where(eq(robloxPendingTable.id, pending.id));

    if (cfg?.enabled && cfg.roleId) {
      try {
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${cfg.roleId}`, {
          method: "PUT",
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
      } catch (e) {
        logger.error({ e }, "Error asignando rol Roblox");
      }
    }

    if (cfg?.autoNickname && cfg.nicknameFormat) {
      try {
        const nick = formatNickname(cfg.nicknameFormat, discordUsername || "User", robloxProfile.name);
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
          method: "PATCH",
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ nick }),
        });
      } catch (e) {
        logger.error({ e }, "Error cambiando nickname Roblox");
      }
    }

    res.json({
      success: true,
      robloxUsername: robloxProfile.name,
      robloxDisplayName: robloxProfile.displayName,
      nicknameSet: !!(cfg?.autoNickname && cfg.nicknameFormat),
      roleSet: !!(cfg?.roleId),
    });
  } catch (err: any) {
    logger.error({ err }, "Error en roblox-confirm");
    res.status(500).json({ error: err?.message || "Error al confirmar verificacion" });
  }
});

export default router;
