import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminAccess } from "../lib/auth";

const router = Router();

router.get("/announcements", async (_req, res) => {
  const announcements = await db
    .select()
    .from(announcementsTable)
    .orderBy(announcementsTable.createdAt);
  res.json(announcements);
});

router.post("/announcements", requireAdminAccess("manage_announcements"), async (req, res) => {
  const { title, content, type, published, scheduledAt } = req.body;
  const [ann] = await db
    .insert(announcementsTable)
    .values({ title, content, type: type || "info", published: published ?? false, scheduledAt: scheduledAt ? new Date(scheduledAt) : null })
    .returning();
  res.status(201).json(ann);
});

router.patch("/announcements/:id", requireAdminAccess("manage_announcements"), async (req, res) => {
  const id = Number(req.params.id as string);
  const { title, content, type, published, scheduledAt } = req.body;
  const [updated] = await db
    .update(announcementsTable)
    .set({ title, content, type, published, scheduledAt: scheduledAt ? new Date(scheduledAt) : null })
    .where(eq(announcementsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/announcements/:id", requireAdminAccess("manage_announcements"), async (req, res) => {
  const id = Number(req.params.id as string);
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.status(204).send();
});

export default router;
