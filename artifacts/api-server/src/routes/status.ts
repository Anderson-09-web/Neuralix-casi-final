import { Router } from "express";
import { getBotStatus } from "../bot-state";

const router = Router();

router.get("/status", async (_req, res) => {
  try {
    const status = await getBotStatus();
    res.set("Cache-Control", "no-store");
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener estado" });
  }
});

export default router;
