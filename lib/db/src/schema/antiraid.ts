import { pgTable, text, boolean, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const antiraidConfigsTable = pgTable("antiraid_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  // AntiJoin: bloquea raids de union masiva
  antiJoin: boolean("anti_join").notNull().default(false),
  antiJoinThreshold: integer("anti_join_threshold").notNull().default(5),
  antiJoinInterval: integer("anti_join_interval").notNull().default(10),
  antiJoinAction: text("anti_join_action").notNull().default("ban"),
  // AntiAlt: bloquea cuentas nuevas
  antiAlt: boolean("anti_alt").notNull().default(false),
  antiAltMinAge: integer("anti_alt_min_age").notNull().default(7),
  // AntiBot: bloquea bots
  antiBot: boolean("anti_bot").notNull().default(false),
  antiBotWhitelist: text("anti_bot_whitelist").array().notNull().default([]),
  // AntiSpam: limita velocidad de mensajes
  antiSpam: boolean("anti_spam").notNull().default(false),
  antiSpamLimit: integer("anti_spam_limit").notNull().default(5),
  antiSpamInterval: integer("anti_spam_interval").notNull().default(5),
  antiSpamAction: text("anti_spam_action").notNull().default("mute"),
  // AntiLinks
  antiLinks: boolean("anti_links").notNull().default(false),
  antiLinksAction: text("anti_links_action").notNull().default("delete"),
  antiDiscordInvites: boolean("anti_discord_invites").notNull().default(true),
  allowedDomains: text("allowed_domains").array().notNull().default([]),
  blockedDomains: text("blocked_domains").array().notNull().default([]),
  // AntiMassMention
  antiMassMention: boolean("anti_mass_mention").notNull().default(false),
  massMentionLimit: integer("mass_mention_limit").notNull().default(5),
  // AntiVPN (deteccion potente de VPN/Proxy)
  antiVpn: boolean("anti_vpn").notNull().default(false),
  antiVpnAction: text("anti_vpn_action").notNull().default("ban"),
  antiProxy: boolean("anti_proxy").notNull().default(false),
  antiTor: boolean("anti_tor").notNull().default(false),
  vpnCheckLevel: text("vpn_check_level").notNull().default("standard"),
  // AntiNuke y acciones de admins
  antiWebhook: boolean("anti_webhook").notNull().default(false),
  antiChannelCreate: boolean("anti_channel_create").notNull().default(false),
  antiChannelDelete: boolean("anti_channel_delete").notNull().default(false),
  antiChannelUpdate: boolean("anti_channel_update").notNull().default(false),
  antiRoleCreate: boolean("anti_role_create").notNull().default(false),
  antiRoleDelete: boolean("anti_role_delete").notNull().default(false),
  antiRoleUpdate: boolean("anti_role_update").notNull().default(false),
  antiEmojiCreate: boolean("anti_emoji_create").notNull().default(false),
  antiEmojiDelete: boolean("anti_emoji_delete").notNull().default(false),
  antiBanMass: boolean("anti_ban_mass").notNull().default(false),
  antiKickMass: boolean("anti_kick_mass").notNull().default(false),
  antiNuke: boolean("anti_nuke").notNull().default(false),
  nukeThreshold: integer("nuke_threshold").notNull().default(10),
  nukeAction: text("nuke_action").notNull().default("strip_permissions"),
  antiFlood: boolean("anti_flood").notNull().default(false),
  floodLimit: integer("flood_limit").notNull().default(5),
  floodInterval: integer("flood_interval").notNull().default(3),
  floodAction: text("flood_action").notNull().default("mute"),
  deleteOnTrigger: boolean("delete_on_trigger").notNull().default(true),
  // AntiWebhookSpam: detects rapid webhook creation
  webhookSpamThreshold: integer("webhook_spam_threshold").notNull().default(3),
  webhookSpamInterval: integer("webhook_spam_interval").notNull().default(60),
  // AntiSuspiciousActivity: broad multi-action detection
  antiSuspiciousActivity: boolean("anti_suspicious_activity").notNull().default(false),
  suspiciousThreshold: integer("suspicious_threshold").notNull().default(5),
  // Lockdown: emergency server lock
  lockdownEnabled: boolean("lockdown_enabled").notNull().default(false),
  lockdownRoleId: text("lockdown_role_id"),
  // AntiCaps: bloquea mensajes con demasiadas mayusculas
  antiCaps: boolean("anti_caps").notNull().default(false),
  antiCapsMinLength: integer("anti_caps_min_length").notNull().default(10),
  antiCapsPercent: integer("anti_caps_percent").notNull().default(70),
  antiCapsAction: text("anti_caps_action").notNull().default("delete"),
  // WordFilter: filtra palabras prohibidas
  wordFilter: boolean("word_filter").notNull().default(false),
  wordFilterList: text("word_filter_list").array().notNull().default([]),
  wordFilterAction: text("word_filter_action").notNull().default("delete"),
  wordFilterWildcard: boolean("word_filter_wildcard").notNull().default(false),
  // AntiScam: detecta enlaces y patrones de estafa conocidos
  antiScam: boolean("anti_scam").notNull().default(false),
  antiScamAction: text("anti_scam_action").notNull().default("ban"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const antiraidStatsTable = pgTable("antiraid_stats", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  detectedToday: integer("detected_today").notNull().default(0),
  blockedAlt: integer("blocked_alt").notNull().default(0),
  blockedVpn: integer("blocked_vpn").notNull().default(0),
  blockedBot: integer("blocked_bot").notNull().default(0),
  blockedSpam: integer("blocked_spam").notNull().default(0),
  totalDetections: integer("total_detections").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAntiraidConfigSchema = createInsertSchema(antiraidConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAntiraidConfig = z.infer<typeof insertAntiraidConfigSchema>;
export type AntiraidConfig = typeof antiraidConfigsTable.$inferSelect;
