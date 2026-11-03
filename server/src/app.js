import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createHealthRouter } from "./routes/healthRoutes.js";
import { createLogger } from "./logging/logger.js";

export function createApp(config, getRedisStatus, accountStore) {
  const app = express();
  const logger = createLogger({ service: "chat-node", nodeId: config.serverId, logFile: config.logFile });
  const allowedOrigins = config.clientOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.info({
        event: "http_request",
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        remoteAddress: req.ip
      }, "HTTP request completed");
    });
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api/auth/login", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
  app.use("/api/auth", createAuthRouter(config, accountStore));
  app.use("/health", createHealthRouter(config, getRedisStatus));
  return app;
}
