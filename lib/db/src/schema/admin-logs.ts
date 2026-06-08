import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export const adminActivityLogsTable = pgTable("admin_activity_logs", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorUsername: text("actor_username").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details").$type<Record<string, any>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminActivityLog = typeof adminActivityLogsTable.$inferSelect;
