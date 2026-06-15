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
