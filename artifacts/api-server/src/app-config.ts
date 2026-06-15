/**
 * Runtime app configuration — stores platform-level settings loaded from DB
 * at startup and updated by the admin panel without requiring a restart.
 *
 * URL DETECTION PRIORITY (highest → lowest):
 *   1. APP_URL env var (manual override — only needed for custom domains)
 *   2. Admin-configured custom URL saved in DB
 *   3. REPLIT_DOMAINS — production *.replit.app URL (set by Replit automatically on deploy)
 *   4. REPLIT_APP_URL — legacy Replit production URL env
 *   5. REPLIT_DEV_DOMAIN — development workspace URL (changes every session, only used in dev)
 *
 * In production (deployed on Replit): REPLIT_DOMAINS is always present and
 * contains the stable *.replit.app URL — no manual configuration needed.
 */

import { logger } from "./lib/logger";

let _customBaseUrl: string | null = null;
let _supportServerInvite: string = "discord.gg/wukr8apdQq";
let _appealServerId: string = "1493023527887048724";
let _appealServerInvite: string = "https://discord.gg/wukr8apdQq";

export function getCustomBaseUrl(): string | null {
  return _customBaseUrl;
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Returns true for stable *.replit.app production domains */
function isProductionDomain(domain: string): boolean {
  return domain.endsWith(".replit.app") && !domain.includes("worf.replit.dev");
}

/**
 * Single source of truth for the application's public domain.
 * Returns the bare hostname (no protocol, no trailing slash), e.g.
 *   "myapp.replit.app"  or  "neuralixallow.vercel.app"
 */
export function getAppDomain(): string | null {
  // 1. Explicit APP_URL env — manual override for custom domains / Vercel setups
  if (process.env.APP_URL) {
    return stripProtocol(process.env.APP_URL);
  }

  // 2. Admin-configured custom base URL (populated from DB at startup)
  if (_customBaseUrl) {
    return stripProtocol(_customBaseUrl);
  }

  // 3. Replit production domains list — STABLE *.replit.app URL, set automatically on deploy
  //    Prefer production domains over dev domains when multiple are present
  const replitDomains = process.env.REPLIT_DOMAINS
    ?.split(",")
    .map((d) => d.trim())
    .filter(Boolean) ?? [];

  const prodDomain = replitDomains.find(isProductionDomain);
  if (prodDomain) return prodDomain;

  // 4. Legacy Replit production URL env
  if (process.env.REPLIT_APP_URL) {
    return stripProtocol(process.env.REPLIT_APP_URL);
  }

  // 5. Any remaining domain from REPLIT_DOMAINS (could be dev domain)
  if (replitDomains.length) return replitDomains[0];

  // 6. Replit dev domain — only available in development workspace
  if (process.env.REPLIT_DEV_DOMAIN) return process.env.REPLIT_DEV_DOMAIN;

  return null;
}

/** Log the detected app domain at startup so it's visible in logs */
export function logAppDomain(): void {
  const domain = getAppDomain();
  const source = (() => {
    if (process.env.APP_URL) return "APP_URL env var";
    if (_customBaseUrl) return "DB custom URL";
    const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean) ?? [];
    if (domains.find(isProductionDomain)) return "REPLIT_DOMAINS (production *.replit.app)";
    if (process.env.REPLIT_APP_URL) return "REPLIT_APP_URL";
    if (domains.length) return "REPLIT_DOMAINS (dev)";
    if (process.env.REPLIT_DEV_DOMAIN) return "REPLIT_DEV_DOMAIN";
    return "none";
  })();

  if (domain) {
    logger.info({ domain: `https://${domain}`, source }, "App domain detected — OAuth callback URL configured");
  } else {
    logger.warn("No app domain detected — Discord OAuth will not work. Set APP_URL env var or deploy on Replit.");
  }
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
