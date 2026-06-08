import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildConfigsTable = pgTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  guildName: text("guild_name").notNull(),
  guildIcon: text("guild_icon"),
  memberCount: integer("member_count").notNull().default(0),
  botPresent: boolean("bot_present").notNull().default(false),
  premiumActive: boolean("premium_active").notNull().default(false),
  premiumPlan: text("premium_plan"),
  premiumExpiresAt: timestamp("premium_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigsTable).omit({ createdAt: true, updatedAt: true });
export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigsTable.$inferSelect;
