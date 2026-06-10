import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, secondaryAdminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AdminPermission } from "@workspace/db";

const JWT_SECRET = process.env.SESSION_SECRET || "neuralix-secret";

export interface JwtPayload {
  userId: string;
  discordId: string;
  isOwner: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts the auth token using multiple methods (in priority order):
 *
 *  1. Cookie `token`             — browser login via Discord OAuth
 *  2. Authorization header       — `Bearer <token>` or just `<token>`
 *  3. X-API-Key header           — `<token>`
 *  4. Query parameter ?token=    — easiest for testing / curl
 *  5. JSON body field `token`    — POST/PUT body `{ "token": "...", ... }`
 *
 * Python examples:
 *   import requests
 *   TOKEN = "your_jwt_token"
 *
 *   # Option A — header
 *   resp = requests.get(url, headers={"Authorization": f"Bearer {TOKEN}"})
 *
 *   # Option B — query param
 *   resp = requests.get(f"{url}?token={TOKEN}")
 *
 *   # Option C — POST body
 *   resp = requests.post(url, json={"token": TOKEN, "enabled": True})
 */
function extractToken(req: Request): string | null {
  // 1. Cookie (browser)
  if (req.cookies?.token) return req.cookies.token as string;

  // 2. Authorization header — accepts `Bearer <token>` or bare `<token>`
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
  }

  // 3. X-API-Key header
  const apiKey = req.headers["x-api-key"];
  if (apiKey && typeof apiKey === "string") return apiKey.trim();

  // 4. ?token= query parameter
  const queryToken = req.query.token;
  if (queryToken && typeof queryToken === "string") return queryToken.trim();

  // 5. JSON body field (for POST/PUT requests where body has { "token": "..." })
  const bodyToken = (req as any).body?.token;
  if (bodyToken && typeof bodyToken === "string") return bodyToken.trim();

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: "No autorizado",
      hint: "Incluye tu token via: Authorization: Bearer <token> | X-API-Key: <token> | ?token=<token> | body: { token: '...' }",
    });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token invalido o expirado. Visita /api/auth/token para obtener uno nuevo." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: "Usuario no encontrado" });
    return;
  }
  (req as any).user = user;

  if (!user.isOwner) {
    const [secondaryAdmin] = await db
      .select()
      .from(secondaryAdminsTable)
      .where(eq(secondaryAdminsTable.discordId, user.discordId));
    (req as any).secondaryAdmin = secondaryAdmin?.active ? secondaryAdmin : null;
  }

  next();
}

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    const user = (req as any).user;
    if (!user?.isOwner) {
      res.status(403).json({ error: "Acceso de propietario requerido" });
      return;
    }
    next();
  });
}

export function requireAdminAccess(permission?: AdminPermission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      const user = (req as any).user;
      if (user?.isOwner) {
        next();
        return;
      }
      const secondaryAdmin = (req as any).secondaryAdmin;
      if (!secondaryAdmin) {
        res.status(403).json({ error: "Acceso denegado" });
        return;
      }
      if (permission && !(secondaryAdmin.permissions as AdminPermission[]).includes(permission)) {
        res.status(403).json({ error: "Permisos insuficientes" });
        return;
      }
      next();
    });
  };
}
