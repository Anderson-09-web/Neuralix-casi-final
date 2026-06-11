import { pgTable, text, boolean, integer, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const giveawaysTable = pgTable("giveaways", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  title: text("title").notNull(),
  prize: text("prize").notNull(),
  winnerCount: integer("winner_count").notNull().default(1),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"),
  entrants: text("entrants").array().notNull().default([]),
  winners: text("winners").array().notNull().default([]),
  requirements: jsonb("requirements").$type<{ minMessages?: number; minAccountAge?: number; requiredRole?: string }>().default({}),
  hostedBy: text("hosted_by").notNull(),
  hostedByUsername: text("hosted_by_username").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGiveawaySchema = createInsertSchema(giveawaysTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type Giveaway = typeof giveawaysTable.$inferSelect;
