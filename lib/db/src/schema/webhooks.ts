import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildWebhooksTable = pgTable("guild_webhooks", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  channelId: text("channel_id").notNull(),
  webhookId: text("webhook_id").notNull(),
  webhookToken: text("webhook_token").notNull(),
  avatarUrl: text("avatar_url"),
  description: text("description"),
  createdById: text("created_by_id"),
  createdByUsername: text("created_by_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGuildWebhookSchema = createInsertSchema(guildWebhooksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGuildWebhook = z.infer<typeof insertGuildWebhookSchema>;
export type GuildWebhook = typeof guildWebhooksTable.$inferSelect;
