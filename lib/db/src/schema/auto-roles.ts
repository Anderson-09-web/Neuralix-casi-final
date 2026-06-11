import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const autoRolesTable = pgTable("auto_roles", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("join"),
  roleIds: text("role_ids").array().notNull().default([]),
  buttonLabel: text("button_label"),
  buttonEmoji: text("button_emoji"),
  buttonColor: text("button_color").notNull().default("PRIMARY"),
  channelId: text("channel_id"),
  messageId: text("message_id"),
  description: text("description"),
  temporary: boolean("temporary").notNull().default(false),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAutoRoleSchema = createInsertSchema(autoRolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutoRole = z.infer<typeof insertAutoRoleSchema>;
export type AutoRole = typeof autoRolesTable.$inferSelect;
