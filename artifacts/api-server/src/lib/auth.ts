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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts the auth token from the request using multiple methods (in order):
 * 1. httpOnly cookie `token`  (browser login via Discord OAuth)
 * 2. Authorization header     `Bearer <token>` or just `<token>`
 * 3. X-API-Key header         `<token>`
 * 4. Query parameter          `?token=<token>`
 */
function extractToken(req: Request): string | null {
  // 1. Cookie (browser)
  if (req.cookies?.token) return req.cookies.token as string;

  // 2. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
  }

  // 3. X-API-Key header
  const apiKey = req.headers["x-api-key"];
  if (apiKey && typeof apiKey === "string") return apiKey.trim();

  // 4. Query param ?token=
  const queryToken = req.query.token;
  if (queryToken && typeof queryToken === "string") return queryToken.trim();

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "No autorizado. Incluye el token via cookie, header Authorization: Bearer <token>, X-API-Key: <token>, o ?token=<token>" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token invalido o expirado" });
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
