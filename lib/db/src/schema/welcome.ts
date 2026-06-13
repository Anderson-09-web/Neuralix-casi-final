import { pgTable, text, boolean, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const welcomeConfigsTable = pgTable("welcome_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  channelId: text("channel_id"),
  message: text("message"),
  embedEnabled: boolean("embed_enabled").notNull().default(false),
  embedColor: text("embed_color"),
  embedTitle: text("embed_title"),
  embedDescription: text("embed_description"),
  embedFooter: text("embed_footer"),
  embedImage: text("embed_image"),
  imageEnabled: boolean("image_enabled").notNull().default(false),
  autoRoleIds: text("auto_role_ids").array().notNull().default([]),
  dmEnabled: boolean("dm_enabled").notNull().default(false),
  dmMessage: text("dm_message"),
  cardEnabled: boolean("card_enabled").notNull().default(false),
  cardBackground: text("card_background"),
  cardBackgroundUrl: text("card_background_url"),
  cardTextColor: text("card_text_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const goodbyeConfigsTable = pgTable("goodbye_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  channelId: text("channel_id"),
  message: text("message"),
  embedEnabled: boolean("embed_enabled").notNull().default(false),
  embedColor: text("embed_color"),
  embedTitle: text("embed_title"),
  embedDescription: text("embed_description"),
  embedFooter: text("embed_footer"),
  imageEnabled: boolean("image_enabled").notNull().default(false),
  cardEnabled: boolean("card_enabled").notNull().default(false),
  cardBackground: text("card_background"),
  cardBackgroundUrl: text("card_background_url"),
  cardTextColor: text("card_text_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWelcomeConfigSchema = createInsertSchema(welcomeConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWelcomeConfig = z.infer<typeof insertWelcomeConfigSchema>;
export type WelcomeConfig = typeof welcomeConfigsTable.$inferSelect;

export const insertGoodbyeConfigSchema = createInsertSchema(goodbyeConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoodbyeConfig = z.infer<typeof insertGoodbyeConfigSchema>;
export type GoodbyeConfig = typeof goodbyeConfigsTable.$inferSelect;
