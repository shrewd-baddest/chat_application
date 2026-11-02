import express from "express";

export function createHealthRouter(config, getRedisStatus) {
  const router = express.Router();
  router.get("/live", (_req, res) => res.json({ status: "alive", serverId: config.serverId }));
  router.get("/ready", (_req, res) => {
    const redisConnected = getRedisStatus();
    const status = redisConnected ? "ready" : "degraded";
    res.status(redisConnected ? 200 : 503).json({
      status,
      serverId: config.serverId,
      redis: redisConnected ? "connected" : "disconnected",
      uptimeSeconds: Math.floor(process.uptime())
    });
  });
  return router;
}
