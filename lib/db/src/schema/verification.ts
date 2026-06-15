import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verificationConfigsTable = pgTable("verification_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  roleId: text("role_id"),
  logChannelId: text("log_channel_id"),
  minAccountAge: integer("min_account_age").notNull().default(0),
  antiVpn: boolean("anti_vpn").notNull().default(false),
  antiAlt: boolean("anti_alt").notNull().default(false),
  antiBot: boolean("anti_bot").notNull().default(false),
  customVerifyUrl: text("custom_verify_url"),
  successMessage: text("success_message"),
  rejectMessage: text("reject_message"),
  // Panel customization
  panelTitle: text("panel_title").default("Verificacion de Miembros"),
  panelDescription: text("panel_description").default("Para acceder al servidor, verifica tu identidad haciendo clic en el boton."),
  panelColor: text("panel_color").default("#5865F2"),
  panelButtonText: text("panel_button_text").default("Verificarme"),
  panelImageUrl: text("panel_image_url"),
  panelThumbnailUrl: text("panel_thumbnail_url"),
  panelChannelId: text("panel_channel_id"),
  panelMessageId: text("panel_message_id"),
  useCustomBotPersona: boolean("use_custom_bot_persona").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const verifiedUsersTable = pgTable("verified_users", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  discordId: text("discord_id").notNull(),
  username: text("username"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  ipHash: text("ip_hash"),
});

// ── Roblox Verification ────────────────────────────────────────────────────────
export const robloxConfigsTable = pgTable("roblox_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  roleId: text("role_id"),
  logChannelId: text("log_channel_id"),
  autoNickname: boolean("auto_nickname").notNull().default(true),
  nicknameFormat: text("nickname_format").notNull().default("{discord} | {roblox}"),
  welcomeIntegration: boolean("welcome_integration").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const robloxVerificationsTable = pgTable("roblox_verifications", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  discordId: text("discord_id").notNull(),
  discordUsername: text("discord_username"),
  robloxId: text("roblox_id").notNull(),
  robloxUsername: text("roblox_username").notNull(),
  robloxDisplayName: text("roblox_display_name"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
});

export const robloxPendingTable = pgTable("roblox_pending", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  discordId: text("discord_id").notNull(),
  robloxId: text("roblox_id").notNull(),
  robloxUsername: text("roblox_username").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVerificationConfigSchema = createInsertSchema(verificationConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVerificationConfig = z.infer<typeof insertVerificationConfigSchema>;
export type VerificationConfig = typeof verificationConfigsTable.$inferSelect;

export const insertVerifiedUserSchema = createInsertSchema(verifiedUsersTable).omit({ id: true, verifiedAt: true });
export type InsertVerifiedUser = z.infer<typeof insertVerifiedUserSchema>;
export type VerifiedUser = typeof verifiedUsersTable.$inferSelect;

export const insertRobloxConfigSchema = createInsertSchema(robloxConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRobloxConfig = z.infer<typeof insertRobloxConfigSchema>;
export type RobloxConfig = typeof robloxConfigsTable.$inferSelect;
