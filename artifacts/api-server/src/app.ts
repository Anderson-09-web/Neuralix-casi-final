import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Global rate limiter (protects API from DDoS / brute-force) ─────────────────
const globalLimiter = rateLimit({
  windowMs: 60_000,        // 1 minute window
  max: 300,                // max 300 requests per IP per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
  skip: (req) => req.path === "/api/status", // don't rate-limit health checks
});

// ── Strict limiter for auth endpoints (prevents OAuth token brute-force) ───────
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,  // 15 minutes
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de autenticacion. Intenta de nuevo en 15 minutos." },
});

app.use("/api/auth", authLimiter);
app.use(globalLimiter);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", router);

// ── Serve React frontend static build ─────────────────────────────────────────
// Looks for the Vite build output relative to the API server's working directory
const frontendDist = path.resolve(process.cwd(), "../neuralix/dist/public");

if (fs.existsSync(frontendDist)) {
  logger.info({ frontendDist }, "Serving frontend static files");
  app.use(express.static(frontendDist, { maxAge: 0, etag: false }));
  // SPA fallback — all non-API routes serve index.html (React Router handles them)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const indexPath = path.join(frontendDist, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
} else {
  logger.warn({ frontendDist }, "Frontend dist not found — run: pnpm --filter @workspace/neuralix run build");
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status || err?.statusCode || 500;
  const message = err?.message || "Internal server error";
  logger.error({ err, status }, "Unhandled error");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
