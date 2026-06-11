import type { Client } from "discord.js";
import { pool } from "@workspace/db";

let botClient: Client | undefined;
let botStartTime = Date.now();

export function setBotClient(c: Client | undefined) {
  botClient = c;
  if (c) botStartTime = Date.now();
}

export function getBotClient(): Client | undefined {
  return botClient;
}

export async function getBotStatus() {
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const uptimeSec = Math.floor((Date.now() - botStartTime) / 1000);

  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {}

  if (!botClient || !botClient.isReady()) {
    return {
      online: false,
      ping: null,
      tag: null,
      guilds: 0,
      users: 0,
      memoryMb: memMb,
      uptimeSec: 0,
      dbStatus: dbOk ? "ok" : "error",
    };
  }

  const totalUsers = botClient.guilds.cache.reduce(
    (acc, g) => acc + (g.memberCount ?? 0),
    0,
  );

  return {
    online: true,
    ping: botClient.ws.ping,
    tag: botClient.user?.tag ?? null,
    guilds: botClient.guilds.cache.size,
    users: totalUsers,
    memoryMb: memMb,
    uptimeSec,
    dbStatus: dbOk ? "ok" : "error",
  };
}
