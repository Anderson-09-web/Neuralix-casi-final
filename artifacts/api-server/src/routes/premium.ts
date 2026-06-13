import { Router } from "express";
import { db, guildConfigsTable, licensesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireOwner } from "../lib/auth";
import crypto from "crypto";

const router = Router();

const PLANS = [
  {
    id: "plus", name: "Plus", price: 4.99,
    features: [
      "5 backups por servidor",
      "Asistente IA basico",
      "Soporte prioritario",
      "5 comandos personalizados",
      "AntiSpam mejorado",
      "Logs avanzados de moderacion",
    ],
  },
  {
    id: "pro", name: "Pro", price: 9.99,
    features: [
      "Backups ilimitados",
      "IA Avanzada con analisis de seguridad",
      "AntiNuke (proteccion total)",
      "Multi-panel de tickets",
      "25 comandos personalizados",
      "Verificacion CAPTCHA avanzada",
      "Analitica basica del servidor",
      "Acceso a API de Neuralix",
    ],
  },
  {
    id: "ultra", name: "Ultra", price: 19.99,
    features: [
      "Todo lo incluido en Pro",
      "Soporte dedicado 24/7",
      "Integraciones personalizadas",
      "SLA de disponibilidad garantizado",
      "Analitica avanzada con reportes",
      "Comandos ilimitados",
      "Backup en tiempo real",
      "Bot con nombre personalizado",
      "Acceso anticipado a nuevas funciones",
    ],
  },
];

router.get("/guilds/:guildId/premium", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  const features = cfg?.premiumPlan ? PLANS.find((p) => p.id === cfg.premiumPlan)?.features || [] : [];
  res.json({
    guildId,
    active: cfg?.premiumActive || false,
    plan: cfg?.premiumPlan || null,
    expiresAt: cfg?.premiumExpiresAt?.toISOString() || null,
    features,
  });
});

router.get("/premium/plans", async (_req, res) => {
  res.json(PLANS);
});


router.post("/guilds/:guildId/premium/activate", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const { key } = req.body as { key: string };
  if (!key) { res.status(400).json({ error: "Clave requerida" }); return; }

  const [license] = await db.select().from(licensesTable).where(
    and(eq(licensesTable.key, key.trim().toUpperCase()), eq(licensesTable.active, true))
  );

  if (!license) { res.status(404).json({ error: "Clave invalida o ya utilizada" }); return; }
  if (license.guildId && license.guildId !== guildId) {
    res.status(403).json({ error: "Esta clave no es valida para este servidor" }); return;
  }
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    res.status(410).json({ error: "Esta clave ha expirado" }); return;
  }

  await db.update(licensesTable).set({ guildId, active: false }).where(eq(licensesTable.id, license.id));

  const existing = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  if (existing.length > 0) {
    await db.update(guildConfigsTable).set({
      premiumActive: true,
      premiumPlan: license.plan,
      premiumExpiresAt: license.expiresAt,
    }).where(eq(guildConfigsTable.guildId, guildId));
  } else {
    await db.insert(guildConfigsTable).values({
      guildId,
      guildName: guildId,
      premiumActive: true,
      premiumPlan: license.plan,
      premiumExpiresAt: license.expiresAt,
    });
  }

  const plan = PLANS.find((p) => p.id === license.plan);
  res.json({
    ok: true,
    plan: license.plan,
    planName: plan?.name,
    expiresAt: license.expiresAt?.toISOString() || null,
  });
});

router.get("/guilds/:guildId/premium/webhook-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  res.json({
    webhookBotName: cfg?.webhookBotName || null,
    webhookBotAvatar: cfg?.webhookBotAvatar || null,
  });
});

router.put("/guilds/:guildId/premium/webhook-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const { webhookBotName, webhookBotAvatar } = req.body as { webhookBotName?: string; webhookBotAvatar?: string };

  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  if (cfg) {
    await db.update(guildConfigsTable).set({
      webhookBotName: webhookBotName?.trim() || null,
      webhookBotAvatar: webhookBotAvatar?.trim() || null,
    }).where(eq(guildConfigsTable.guildId, guildId));
  } else {
    await db.insert(guildConfigsTable).values({
      guildId, guildName: guildId,
      webhookBotName: webhookBotName?.trim() || null,
      webhookBotAvatar: webhookBotAvatar?.trim() || null,
    });
  }
  res.json({ ok: true });
});

export default router;
