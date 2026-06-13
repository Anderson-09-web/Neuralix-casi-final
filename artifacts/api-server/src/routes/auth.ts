import { Router } from "express";
import axios from "axios";
import { db, usersTable, secondaryAdminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../lib/auth";

const router = Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;

function getAppDomain(): string | null {
  // 1. Admin-configured custom base URL takes top priority
  const { getCustomBaseUrl } = require("../app-config");
  const custom = getCustomBaseUrl();
  if (custom) return custom.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // 2. Replit deployment URL
  if (process.env.REPLIT_APP_URL) {
    return process.env.REPLIT_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  // 3. Replit domains list
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean);
  if (domains?.length) return domains[0];
  // 4. Dev domain
  if (process.env.REPLIT_DEV_DOMAIN) return process.env.REPLIT_DEV_DOMAIN;
  return null;
}

function getRedirectUri(): string {
  const domain = getAppDomain();
  if (domain) return `https://${domain}/api/auth/discord/callback`;
  return `http://localhost:8080/api/auth/discord/callback`;
}

function getFrontendUrl(): string {
  const domain = getAppDomain();
  if (domain) return `https://${domain}`;
  return `http://localhost:23133`;
}

router.get("/auth/bot-invite", (_req, res) => {
  const clientId = DISCORD_CLIENT_ID;
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
  res.json({ url });
});

router.get("/auth/discord/url", (_req, res) => {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email guilds",
  });
  res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
});

router.get("/auth/login", (_req, res) => {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email guilds",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

router.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code as string;
  const discordError = req.query.error as string | undefined;
  const frontend = getFrontendUrl();

  if (discordError) {
    req.log.warn({ discordError }, "Discord OAuth returned error");
    res.redirect(`${frontend}/?error=${encodeURIComponent(discordError)}`);
    return;
  }

  if (!code) {
    res.redirect(`${frontend}/?error=no_code`);
    return;
  }
  try {
    const redirectUri = getRedirectUri();
    req.log.info({ redirectUri, clientId: DISCORD_CLIENT_ID }, "Exchanging OAuth code");
    let tokenRes: any;
    try {
      tokenRes = await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
    } catch (tokenErr: any) {
      const discordMsg = tokenErr?.response?.data?.error_description || tokenErr?.response?.data?.error || tokenErr?.message || "token_exchange_failed";
      req.log.error({ discordMsg, status: tokenErr?.response?.status, data: tokenErr?.response?.data }, "Discord token exchange failed");
      res.redirect(`${frontend}/?error=${encodeURIComponent(discordMsg)}`);
      return;
    }
    const { access_token, refresh_token } = tokenRes.data;

    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const discordUser = userRes.data;

    const OWNER_IDS = (process.env.OWNER_DISCORD_IDS || "").split(",").filter(Boolean);
    const isOwner = OWNER_IDS.includes(discordUser.id);

    const existingUsers = await db.select().from(usersTable).where(eq(usersTable.discordId, discordUser.id));
    let user;
    if (existingUsers.length > 0) {
      const [updated] = await db
        .update(usersTable)
        .set({
          username: discordUser.username,
          discriminator: discordUser.discriminator || "0",
          avatar: discordUser.avatar,
          email: discordUser.email,
          accessToken: access_token,
          refreshToken: refresh_token,
          isOwner,
        })
        .where(eq(usersTable.discordId, discordUser.id))
        .returning();
      user = updated;
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: `user_${discordUser.id}`,
          discordId: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator || "0",
          avatar: discordUser.avatar,
          email: discordUser.email,
          accessToken: access_token,
          refreshToken: refresh_token,
          isOwner,
        })
        .returning();
      user = created;
    }

    const token = signToken({ userId: user.id, discordId: user.discordId, isOwner: user.isOwner });
    const isHttps = !!getAppDomain();
    res.cookie("token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${frontend}/auth/callback`);
  } catch (err: any) {
    req.log.error({ err }, "Discord OAuth error");
    res.redirect(`${frontend}/?error=oauth_failed`);
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = (req as any).user;

  let isSecondaryAdmin = false;
  let adminPermissions: string[] = [];

  if (!user.isOwner) {
    const [secondaryAdmin] = await db
      .select()
      .from(secondaryAdminsTable)
      .where(eq(secondaryAdminsTable.discordId, user.discordId));
    if (secondaryAdmin?.active) {
      isSecondaryAdmin = true;
      adminPermissions = (secondaryAdmin.permissions as string[]) || [];
    }
  }

  res.json({
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    discriminator: user.discriminator,
    avatar: user.avatar,
    email: user.email,
    isOwner: user.isOwner,
    isPremium: user.isPremium,
    premiumPlan: user.premiumPlan,
    createdAt: user.createdAt,
    isSecondaryAdmin,
    adminPermissions,
  });
});

router.post("/auth/logout", (_req, res) => {
  const isHttps = !!getAppDomain();
  res.clearCookie("token", {
    path: "/",
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
  });
  res.json({ ok: true });
});

/**
 * GET /api/auth/token
 * Returns the JWT so bots/scripts can use the API externally.
 *
 * How to authenticate after getting this token:
 *   Authorization: Bearer <token>
 *   X-API-Key: <token>
 *   ?token=<token>          (query param, easiest for testing)
 *
 * Example (curl):
 *   curl https://your-domain/api/guilds -H "Authorization: Bearer TOKEN"
 *   curl "https://your-domain/api/guilds?token=TOKEN"
 */
router.get("/auth/token", requireAuth, (req, res) => {
  const user = (req as any).user;
  // Re-issue a fresh 365-day token so it won't expire soon
  const freshToken = signToken({
    userId: user.id,
    discordId: user.discordId,
    isOwner: user.isOwner,
  });
  res.json({
    token: freshToken,
    userId: user.id,
    discordId: user.discordId,
    username: user.username,
    usage: {
      header: `Authorization: Bearer ${freshToken}`,
      queryParam: `?token=${freshToken}`,
      xApiKey: `X-API-Key: ${freshToken}`,
    },
  });
});

export default router;
