/**
 * Runtime app configuration — stores the custom base URL that overrides
 * the auto-detected Replit domain. Loaded from DB at startup and updated
 * by the admin panel.
 */

let _customBaseUrl: string | null = null;

export function getCustomBaseUrl(): string | null {
  return _customBaseUrl;
}

export function setCustomBaseUrl(url: string | null) {
  _customBaseUrl = url ? url.replace(/\/$/, "") : null;
}

export async function loadCustomBaseUrl() {
  try {
    const { db, botSettingsTable } = await import("@workspace/db");
    const rows = await db.select().from(botSettingsTable).limit(1);
    if (rows[0]?.customBaseUrl) {
      _customBaseUrl = rows[0].customBaseUrl.replace(/\/$/, "");
    }
  } catch {
    // Non-fatal — fall back to env-based detection
  }
}
