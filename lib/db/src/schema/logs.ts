import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logsConfigsTable = pgTable("logs_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  channelId: text("channel_id"),
  logMembers: boolean("log_members").notNull().default(true),
  logMessages: boolean("log_messages").notNull().default(true),
  logRoles: boolean("log_roles").notNull().default(true),
  logChannels: boolean("log_channels").notNull().default(true),
  logModeration: boolean("log_moderation").notNull().default(true),
  logSecurity: boolean("log_security").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const logEntriesTable = pgTable("log_entries", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id"),
  username: text("username"),
  action: text("action").notNull(),
  category: text("category").notNull(),
  details: text("details"),
  moderatorId: text("moderator_id"),
  moderatorName: text("moderator_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLogEntrySchema = createInsertSchema(logEntriesTable).omit({ id: true, createdAt: true });
export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntriesTable.$inferSelect;

export const insertLogsConfigSchema = createInsertSchema(logsConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLogsConfig = z.infer<typeof insertLogsConfigSchema>;
export type LogsConfig = typeof logsConfigsTable.$inferSelect;

export const moderationLogsTable = pgTable("moderation_logs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  moderatorId: text("moderator_id").notNull(),
  moderatorName: text("moderator_name").notNull(),
  duration: integer("duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
