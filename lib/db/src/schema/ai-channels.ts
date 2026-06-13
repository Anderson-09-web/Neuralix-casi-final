import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiChannelsTable = pgTable("ai_channels", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  name: text("name").notNull().default("Canal IA"),
  systemPrompt: text("system_prompt"),
  model: text("model").notNull().default("llama-3.1-8b-instant"),
  enabled: boolean("enabled").notNull().default(true),
  replyToAll: boolean("reply_to_all").notNull().default(true),
  mentionOnly: boolean("mention_only").notNull().default(false),
  maxTokens: integer("max_tokens").notNull().default(500),
  temperature: integer("temperature").notNull().default(70),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAiChannelSchema = createInsertSchema(aiChannelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiChannel = z.infer<typeof insertAiChannelSchema>;
export type AiChannel = typeof aiChannelsTable.$inferSelect;
