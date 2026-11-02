import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

export async function configureRedisAdapter(io, redisUrl) {
  const pubClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: false
    }
  });
  const subClient = pubClient.duplicate();
  let connected = false;

  pubClient.on("error", (error) => {
    connected = false;
    console.error(`Redis publisher unavailable: ${error.message}`);
  });
  subClient.on("error", (error) => {
    connected = false;
    console.error(`Redis subscriber unavailable: ${error.message}`);
  });
  pubClient.on("ready", () => { connected = pubClient.isReady && subClient.isReady; });
  subClient.on("ready", () => { connected = pubClient.isReady && subClient.isReady; });

  console.log("[startup] Connecting Redis publisher and subscriber...");
  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    connected = true;
    console.log("[startup] Redis adapter connected");
  } catch (error) {
    connected = false;
    console.error(`[startup] Redis unavailable; starting node in degraded mode: ${error.message || "connection failed"}`);
  }

  return {
    pubClient,
    subClient,
    isConnected: () => connected && pubClient.isReady && subClient.isReady
  };
}
