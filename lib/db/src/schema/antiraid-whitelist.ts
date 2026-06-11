import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const antiraidWhitelistTable = pgTable("antiraid_whitelist", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull().default("user"),
  name: text("name"),
  reason: text("reason"),
  addedBy: text("added_by"),
  addedByUsername: text("added_by_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAntiraidWhitelistSchema = createInsertSchema(antiraidWhitelistTable).omit({ id: true, createdAt: true });
export type InsertAntiraidWhitelist = z.infer<typeof insertAntiraidWhitelistSchema>;
export type AntiraidWhitelist = typeof antiraidWhitelistTable.$inferSelect;
