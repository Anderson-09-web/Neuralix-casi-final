import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const warningsTable = pgTable("warnings", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  reason: text("reason").notNull(),
  moderatorId: text("moderator_id").notNull(),
  moderatorUsername: text("moderator_username").notNull(),
  severity: text("severity").notNull().default("low"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automodConfigsTable = pgTable("automod_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  badWordsEnabled: boolean("bad_words_enabled").notNull().default(false),
  badWords: text("bad_words").array().notNull().default([]),
  badWordsAction: text("bad_words_action").notNull().default("delete"),
  capsEnabled: boolean("caps_enabled").notNull().default(false),
  capsThreshold: integer("caps_threshold").notNull().default(70),
  capsMinLength: integer("caps_min_length").notNull().default(10),
  capsAction: text("caps_action").notNull().default("delete"),
  invitesEnabled: boolean("invites_enabled").notNull().default(false),
  invitesAction: text("invites_action").notNull().default("delete"),
  floodEnabled: boolean("flood_enabled").notNull().default(false),
  floodLimit: integer("flood_limit").notNull().default(5),
  floodInterval: integer("flood_interval").notNull().default(5),
  zalgoEnabled: boolean("zalgo_enabled").notNull().default(false),
  warnThreshold: integer("warn_threshold").notNull().default(3),
  warnAction: text("warn_action").notNull().default("mute"),
  warnDuration: integer("warn_duration").notNull().default(10),
  logChannelId: text("log_channel_id"),
  exemptRoles: text("exempt_roles").array().notNull().default([]),
  exemptChannels: text("exempt_channels").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWarningSchema = createInsertSchema(warningsTable).omit({ id: true, createdAt: true });
export type InsertWarning = z.infer<typeof insertWarningSchema>;
export type Warning = typeof warningsTable.$inferSelect;

export const insertAutomodConfigSchema = createInsertSchema(automodConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutomodConfig = z.infer<typeof insertAutomodConfigSchema>;
export type AutomodConfig = typeof automodConfigsTable.$inferSelect;
