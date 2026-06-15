/**
 * Runtime app configuration — stores platform-level settings loaded from DB
 * at startup and updated by the admin panel without requiring a restart.
 */

let _customBaseUrl: string | null = null;
let _supportServerInvite: string = "discord.gg/wukr8apdQq";
let _appealServerId: string = "1493023527887048724";
let _appealServerInvite: string = "https://discord.gg/wukr8apdQq";

export function getCustomBaseUrl(): string | null {
  return _customBaseUrl;
}

/**
 * Single source of truth for the application's public domain.
 * Priority: APP_URL env → custom DB URL (loaded at startup) → Replit deploy URL
 *           → Replit domains list → Replit dev domain → null
 *
 * Returns the bare hostname (no protocol, no trailing slash), e.g.
 *   "myapp.replit.app"  or  "example.com"
 */
export function getAppDomain(): string | null {
  // 1. Explicit APP_URL env overrides everything
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  // 2. Admin-configured custom base URL (populated from DB at startup)
  if (_customBaseUrl) {
    return _customBaseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  // 3. Replit deployment URL
  if (process.env.REPLIT_APP_URL) {
    return process.env.REPLIT_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  // 4. First domain from the Replit domains list
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean);
  if (domains?.length) return domains[0];
  // 5. Replit dev domain
  if (process.env.REPLIT_DEV_DOMAIN) return process.env.REPLIT_DEV_DOMAIN;
  return null;
}

export function setCustomBaseUrl(url: string | null) {
  _customBaseUrl = url ? url.replace(/\/$/, "") : null;
}

export function getSupportServerInvite(): string {
  return _supportServerInvite;
}

export function getAppealServerId(): string {
  return _appealServerId;
}

export function getAppealServerInvite(): string {
  return _appealServerInvite;
}

export function setPlatformLinks(opts: {
  supportServerInvite?: string | null;
  appealServerId?: string | null;
  appealServerInvite?: string | null;
}) {
  if (opts.supportServerInvite != null) _supportServerInvite = opts.supportServerInvite || "discord.gg/wukr8apdQq";
  if (opts.appealServerId != null) _appealServerId = opts.appealServerId || "1493023527887048724";
  if (opts.appealServerInvite != null) _appealServerInvite = opts.appealServerInvite || "https://discord.gg/wukr8apdQq";
}

export async function loadCustomBaseUrl() {
  try {
    const { db, botSettingsTable } = await import("@workspace/db");
    const rows = await db.select().from(botSettingsTable).limit(1);
    const s = rows[0];
    if (s?.customBaseUrl) {
      _customBaseUrl = s.customBaseUrl.replace(/\/$/, "");
    }
    if (s?.supportServerInvite) _supportServerInvite = s.supportServerInvite;
    if (s?.appealServerId) _appealServerId = s.appealServerId;
    if (s?.appealServerInvite) _appealServerInvite = s.appealServerInvite;
  } catch {
    // Non-fatal — fall back to defaults
  }
}
