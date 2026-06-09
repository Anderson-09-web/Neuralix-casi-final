import type { Request, Response, NextFunction } from "express";
import axios from "axios";
import { db, guildConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DISCORD_API = "https://discord.com/api/v10";
const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

function hasAdminPerms(permissions: string): boolean {
  try {
    const perms = BigInt(permissions);
    return (perms & BigInt(ADMINISTRATOR)) !== 0n || (perms & BigInt(MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

export async function requireGuildAccess(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const guildId = req.params.guildId as string;

  if (!guildId) {
    res.status(400).json({ error: "guildId requerido" });
    return;
  }

  if (user?.isOwner) {
    next();
    return;
  }

  try {
    const guildsRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      validateStatus: () => true,
    });

    if (guildsRes.status !== 200) {
      res.status(403).json({ error: "No se pudo verificar acceso al servidor. Vuelve a iniciar sesion." });
      return;
    }

    const guild = guildsRes.data.find((g: any) => g.id === guildId);
    if (!guild || !hasAdminPerms(guild.permissions)) {
      res.status(403).json({ error: "No tienes permisos de administrador en este servidor." });
      return;
    }

    await db.update(guildConfigsTable)
      .set({ guildName: guild.name, guildIcon: guild.icon || null })
      .where(eq(guildConfigsTable.guildId, guildId))
      .catch(() => {});

    next();
  } catch {
    next();
  }
}
