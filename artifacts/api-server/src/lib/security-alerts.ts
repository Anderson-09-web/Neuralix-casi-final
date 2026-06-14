export type SecurityAlert = {
  id: string;
  ts: number;
  module: string;
  description: string;
  action: string;
  username?: string;
  userId?: string;
};

const alertStore = new Map<string, SecurityAlert[]>();
const sseClients = new Map<string, Set<(chunk: string) => void>>();

export function pushAlert(guildId: string, alert: Omit<SecurityAlert, "id" | "ts">): void {
  const full: SecurityAlert = {
    ...alert,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
  };
  if (!alertStore.has(guildId)) alertStore.set(guildId, []);
  const list = alertStore.get(guildId)!;
  list.unshift(full);
  if (list.length > 100) list.splice(100);

  const clients = sseClients.get(guildId);
  if (clients?.size) {
    const chunk = `data: ${JSON.stringify(full)}\n\n`;
    for (const send of clients) { try { send(chunk); } catch {} }
  }
}

export function getRecentAlerts(guildId: string): SecurityAlert[] {
  return alertStore.get(guildId) ?? [];
}

export function registerSseClient(guildId: string, send: (chunk: string) => void): () => void {
  if (!sseClients.has(guildId)) sseClients.set(guildId, new Set());
  sseClients.get(guildId)!.add(send);
  return () => sseClients.get(guildId)?.delete(send);
}
