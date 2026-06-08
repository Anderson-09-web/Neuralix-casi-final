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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
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
      res.status(403).json({ error: "Owner access required" });
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
