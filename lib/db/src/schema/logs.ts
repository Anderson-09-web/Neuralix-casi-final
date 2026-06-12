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
  logVerifications: boolean("log_verifications").notNull().default(true),
  logTickets: boolean("log_tickets").notNull().default(true),
  logGiveaways: boolean("log_giveaways").notNull().default(true),
  logVoice: boolean("log_voice").notNull().default(false),
  logNicknames: boolean("log_nicknames").notNull().default(true),
  logInvites: boolean("log_invites").notNull().default(false),

  memberChannelId: text("member_channel_id"),
  messageChannelId: text("message_channel_id"),
  roleChannelId: text("role_channel_id"),
  channelLogsChannelId: text("channel_logs_channel_id"),
  moderationChannelId: text("moderation_channel_id"),
  securityChannelId: text("security_channel_id"),
  ticketChannelId: text("ticket_channel_id"),
  verificationChannelId: text("verification_channel_id"),
  giveawayChannelId: text("giveaway_channel_id"),
  logBackups: boolean("log_backups").notNull().default(false),

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
  targetId: text("target_id"),
  targetName: text("target_name"),
  channelId: text("channel_id"),
  channelName: text("channel_name"),
  reason: text("reason"),
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
