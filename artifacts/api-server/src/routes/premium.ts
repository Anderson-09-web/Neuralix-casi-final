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
      "Backup en tiempo real con restauracion de estructura Discord",
      "Bot con nombre y avatar personalizados (en todos los modulos)",
      "Acceso anticipado a nuevas funciones",
    ],
  },
];

router.get("/guilds/:guildId/premium", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  const features = cfg?.premiumPlan ? PLANS.find((p) => p.id === cfg.premiumPlan)?.features || [] : [];

  // Check if premium is expired
  let active = cfg?.premiumActive || false;
  if (active && cfg?.premiumExpiresAt && new Date(cfg.premiumExpiresAt) < new Date()) {
    active = false;
    // Auto-deactivate expired premium
    await db.update(guildConfigsTable).set({ premiumActive: false }).where(eq(guildConfigsTable.guildId, guildId));
  }

  res.json({
    guildId,
    active,
    plan: cfg?.premiumPlan || null,
    expiresAt: cfg?.premiumExpiresAt?.toISOString() || null,
    features,
    webhookBotName: cfg?.webhookBotName || null,
    webhookBotAvatar: cfg?.webhookBotAvatar || null,
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
    canCustomize: cfg?.premiumActive && cfg?.premiumPlan === "ultra",
  });
});

router.put("/guilds/:guildId/premium/webhook-config", requireAuth, async (req, res) => {
  const guildId = req.params.guildId as string;
  const { webhookBotName, webhookBotAvatar } = req.body as { webhookBotName?: string; webhookBotAvatar?: string };

  // Pro and Ultra plans can customize webhook name/avatar
  const [cfg] = await db.select().from(guildConfigsTable).where(eq(guildConfigsTable.guildId, guildId));
  const canCustomize = cfg?.premiumActive && (cfg?.premiumPlan === "pro" || cfg?.premiumPlan === "ultra");
  if (!canCustomize) {
    res.status(403).json({
      error: "La personalizacion del bot es exclusiva de los planes Pro y Ultra.",
      requiredPlan: "pro",
    });
    return;
  }

  // Validate avatar URL if provided
  if (webhookBotAvatar && webhookBotAvatar.trim()) {
    try {
      const url = new URL(webhookBotAvatar.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        res.status(400).json({ error: "La URL del avatar debe ser https:// o http://" });
        return;
      }
    } catch {
      res.status(400).json({ error: "URL de avatar invalida. Debe ser una URL publica de imagen (jpg, png, webp, gif)." });
      return;
    }
  }

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
  res.json({ ok: true, message: "Personalizacion del bot actualizada correctamente." });
});

// Admin-only: generate license keys
router.post("/admin/licenses/generate", requireOwner, async (req, res) => {
  const { plan, count = 1, durationDays, guildId: targetGuildId } = req.body as { plan: string; count?: number; durationDays?: number; guildId?: string };
  if (!plan || !PLANS.find((p) => p.id === plan)) {
    res.status(400).json({ error: "Plan invalido. Opciones: plus, pro, ultra" }); return;
  }
  const n = Math.min(Number(count) || 1, 50);
  const expiresAt = durationDays && Number(durationDays) > 0
    ? new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000)
    : null;

  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = `NLX-${plan.toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    await db.insert(licensesTable).values({ key, plan, active: true, expiresAt, guildId: targetGuildId || null });
    keys.push(key);
  }

  res.status(201).json({ ok: true, keys, plan, expiresAt: expiresAt?.toISOString() || null });
});

export default router;
