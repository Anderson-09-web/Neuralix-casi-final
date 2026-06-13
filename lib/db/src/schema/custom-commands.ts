import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customCommandsTable = pgTable("custom_commands", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default("Comando personalizado"),
  response: text("response").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  premiumOnly: boolean("premium_only").notNull().default(false),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
  restrictedRoleId: text("restricted_role_id"),
  discordCommandId: text("discord_command_id"),
  useEmbed: boolean("use_embed").notNull().default(false),
  embedTitle: text("embed_title"),
  embedColor: text("embed_color").default("#5865F2"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomCommandSchema = createInsertSchema(customCommandsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomCommand = z.infer<typeof insertCustomCommandSchema>;
export type CustomCommand = typeof customCommandsTable.$inferSelect;
