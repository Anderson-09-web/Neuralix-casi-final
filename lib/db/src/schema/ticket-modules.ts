import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ticketModulesTable = pgTable("ticket_modules", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  emoji: text("emoji"),
  welcomeMessage: text("welcome_message"),
  welcomeEmbedEnabled: boolean("welcome_embed_enabled").notNull().default(false),
  welcomeEmbedTitle: text("welcome_embed_title"),
  welcomeEmbedDescription: text("welcome_embed_description"),
  welcomeEmbedColor: text("welcome_embed_color"),
  supportRoleIds: text("support_role_ids").array().notNull().default([]),
  categoryId: text("category_id"),
  buttonLabel: text("button_label"),
  buttonColor: text("button_color").notNull().default("PRIMARY"),
  buttonStyle: text("button_style").notNull().default("button"),
  panelId: integer("panel_id"),
  staffRoleId: text("staff_role_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTicketModuleSchema = createInsertSchema(ticketModulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicketModule = z.infer<typeof insertTicketModuleSchema>;
export type TicketModule = typeof ticketModulesTable.$inferSelect;
