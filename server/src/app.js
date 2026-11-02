import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createHealthRouter } from "./routes/healthRoutes.js";

export function createApp(config, getRedisStatus) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.clientOrigin, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api/auth/login", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
  app.use("/api/auth", createAuthRouter(config));
  app.use("/health", createHealthRouter(config, getRedisStatus));
  return app;
}
