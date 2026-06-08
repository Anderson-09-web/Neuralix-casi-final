import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blacklistTable = pgTable("blacklist", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  username: text("username").notNull(),
  avatarHash: text("avatar_hash"),
  reason: text("reason").notNull(),
  addedBy: text("added_by").notNull(),
  addedByUsername: text("added_by_username"),
  addedByAvatar: text("added_by_avatar"),
  evidence: jsonb("evidence").$type<string[]>().default([]),
  sanctionHistory: jsonb("sanction_history").$type<{ action: string; reason: string; by: string; at: string }[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBlacklistSchema = createInsertSchema(blacklistTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBlacklist = z.infer<typeof insertBlacklistSchema>;
export type BlacklistEntry = typeof blacklistTable.$inferSelect;
