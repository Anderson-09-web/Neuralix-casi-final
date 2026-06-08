import { pgTable, text, serial, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type AdminPermission =
  | "manage_licenses"
  | "manage_blacklist"
  | "manage_announcements"
  | "view_stats"
  | "manage_support"
  | "manage_admins";

export const secondaryAdminsTable = pgTable("secondary_admins", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  username: text("username").notNull(),
  discordId: text("discord_id").notNull().unique(),
  avatarHash: text("avatar_hash"),
  permissions: jsonb("permissions").$type<AdminPermission[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  grantedBy: text("granted_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSecondaryAdminSchema = createInsertSchema(secondaryAdminsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSecondaryAdmin = z.infer<typeof insertSecondaryAdminSchema>;
export type SecondaryAdmin = typeof secondaryAdminsTable.$inferSelect;
