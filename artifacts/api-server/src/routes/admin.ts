import { Router } from "express";
import { db, usersTable, guildConfigsTable, ticketsTable, licensesTable, blacklistTable, backupsTable, supportTicketsTable, secondaryAdminsTable, adminActivityLogsTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";
import { requireOwner, requireAdminAccess } from "../lib/auth";
import type { AdminPermission } from "@workspace/db";

const router = Router();

async function log(actor: any, action: string, target?: string, details?: Record<string, any>) {
  try {
    await db.insert(adminActivityLogsTable).values({
      actorId: actor.discordId || actor.id || "unknown",
      actorUsername: actor.username || "Desconocido",
      action,
      target: target || null,
      details: details || null,
    });
  } catch {}
}

// ─── Stats ─────────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAdminAccess("view_stats"), async (_req, res) => {
  const [guilds] = await db.select({ count: count() }).from(guildConfigsTable);
  const [users] = await db.select({ count: count() }).from(usersTable);
  const [tickets] = await db.select({ count: count() }).from(ticketsTable);
  const [premiumGuilds] = await db.select({ count: count() }).from(guildConfigsTable).where(eq(guildConfigsTable.premiumActive, true));
  const [blacklistCount] = await db.select({ count: count() }).from(blacklistTable);
  const [backupsCount] = await db.select({ count: count() }).from(backupsTable);
  const [adminsCount] = await db.select({ count: count() }).from(secondaryAdminsTable).where(eq(secondaryAdminsTable.active, true));
  const [openSupport] = await db.select({ count: count() }).from(supportTicketsTable).where(eq(supportTicketsTable.status, "open"));
  const [totalLogs] = await db.select({ count: count() }).from(adminActivityLogsTable);

  res.json({
    totalGuilds: guilds?.count || 0,
    totalUsers: users?.count || 0,
    totalTickets: tickets?.count || 0,
    premiumGuilds: premiumGuilds?.count || 0,
    activeBlacklist: blacklistCount?.count || 0,
    totalBackups: backupsCount?.count || 0,
    totalAdmins: adminsCount?.count || 0,
    openSupport: openSupport?.count || 0,
    totalActivityLogs: totalLogs?.count || 0,
  });
});

// ─── Activity Logs ──────────────────────────────────────────────────────────
router.get("/admin/activity-logs", requireOwner, async (req, res) => {
  const limit = Math.min(Number((req.query as any).limit) || 50, 200);
  const logs = await db
    .select()
    .from(adminActivityLogsTable)
    .orderBy(desc(adminActivityLogsTable.createdAt))
    .limit(limit);
  res.json(logs);
});

// ─── Licenses ──────────────────────────────────────────────────────────────
router.get("/admin/licenses", requireAdminAccess("manage_licenses"), async (_req, res) => {
  const licenses = await db.select().from(licensesTable).orderBy(desc(licensesTable.createdAt));
  res.json(licenses);
});

router.post("/admin/licenses", requireAdminAccess("manage_licenses"), async (req, res) => {
  const actor = (req as any).user;
  const { plan, guildId, expiresAt } = req.body;
  const plans: Record<string, string> = { plus: "PLUS", pro: "PRO", ultra: "ULTRA" };
  const prefix = plans[plan] || "PLUS";
  const key = `NRX-${prefix}-${Array.from({ length: 16 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("")}`;
  const [license] = await db.insert(licensesTable).values({
    key, plan, guildId: guildId || null, active: true,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  await log(actor, "create_license", key, { plan, guildId: guildId || null });
  res.status(201).json(license);
});

router.delete("/admin/licenses/:id", requireAdminAccess("manage_licenses"), async (req, res) => {
  const actor = (req as any).user;
  const id = Number(req.params.id as string);
  const [lic] = await db.select().from(licensesTable).where(eq(licensesTable.id, id));
  await db.update(licensesTable).set({ active: false }).where(eq(licensesTable.id, id));
  await log(actor, "revoke_license", lic?.key || `#${id}`, { plan: lic?.plan });
  res.status(204).end();
});

// ─── Secondary Admins ──────────────────────────────────────────────────────
router.get("/admin/admins", requireOwner, async (_req, res) => {
  const admins = await db.select().from(secondaryAdminsTable).orderBy(secondaryAdminsTable.createdAt);
  res.json(admins);
});

router.post("/admin/admins", requireOwner, async (req, res) => {
  const actor = (req as any).user;
  const { discordId, username, permissions } = req.body as { discordId: string; username: string; permissions: AdminPermission[] };
  if (!discordId || !username) { res.status(400).json({ error: "discordId y username son requeridos" }); return; }

  const existing = await db.select().from(secondaryAdminsTable).where(eq(secondaryAdminsTable.discordId, discordId));
  if (existing.length > 0) {
    const [updated] = await db.update(secondaryAdminsTable)
      .set({ username, permissions: permissions || [], active: true, grantedBy: actor.discordId })
      .where(eq(secondaryAdminsTable.discordId, discordId))
      .returning();
    await log(actor, "update_admin", username, { discordId, permissions });
    res.json(updated);
    return;
  }
  const [admin] = await db.insert(secondaryAdminsTable).values({
    userId: `user_${discordId}`, discordId, username,
    permissions: permissions || [], active: true, grantedBy: actor.discordId,
  }).returning();
  await log(actor, "grant_admin", username, { discordId, permissions });
  res.json(admin);
});

router.patch("/admin/admins/:id", requireOwner, async (req, res) => {
  const actor = (req as any).user;
  const id = Number(req.params.id as string);
  const { permissions, active } = req.body;
  const [target] = await db.select().from(secondaryAdminsTable).where(eq(secondaryAdminsTable.id, id));
  const [updated] = await db.update(secondaryAdminsTable)
    .set({ ...(permissions !== undefined && { permissions }), ...(active !== undefined && { active }) })
    .where(eq(secondaryAdminsTable.id, id))
    .returning();
  if (active !== undefined) {
    await log(actor, active ? "activate_admin" : "suspend_admin", target?.username, { discordId: target?.discordId });
  } else {
    await log(actor, "update_admin_perms", target?.username, { permissions });
  }
  res.json(updated);
});

router.delete("/admin/admins/:id", requireOwner, async (req, res) => {
  const actor = (req as any).user;
  const id = Number(req.params.id as string);
  const [target] = await db.select().from(secondaryAdminsTable).where(eq(secondaryAdminsTable.id, id));
  await db.delete(secondaryAdminsTable).where(eq(secondaryAdminsTable.id, id));
  await log(actor, "delete_admin", target?.username, { discordId: target?.discordId });
  res.status(204).end();
});

export default router;
