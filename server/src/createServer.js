import http from "node:http";
import { Server as SocketServer } from "socket.io";
import { createApp } from "./app.js";
import { authenticateSocket } from "./auth/socketAuth.js";
import { configureRedisAdapter } from "./services/redisAdapter.js";
import { registerSocketHandlers } from "./sockets/registerSocketHandlers.js";
import { DeduplicationCache } from "./services/deduplicationCache.js";

export async function createServer(config) {
  let redis = null;
  let httpServer = null;
  const getRedisStatus = () => Boolean(redis?.isConnected());
  const app = createApp(config, getRedisStatus);
  httpServer = http.createServer(app);

  const io = new SocketServer(httpServer, {
    cors: { origin: config.clientOrigin, methods: ["GET", "POST"], allowedHeaders: ["Authorization"] },
    transports: ["polling", "websocket"],
    maxHttpBufferSize: 64_000
  });
  io.use((socket, next) => authenticateSocket(config, socket, next));

  redis = await configureRedisAdapter(io, config.redisUrl);
  registerSocketHandlers(io, config, new DeduplicationCache());

  return {
    app,
    httpServer,
    io,
    redis,
    close: async () => {
      await new Promise((resolve) => io.close(resolve));
      await Promise.all([
        redis.pubClient.isOpen ? redis.pubClient.quit() : Promise.resolve(),
        redis.subClient.isOpen ? redis.subClient.quit() : Promise.resolve()
      ]);
    }
  };
}
