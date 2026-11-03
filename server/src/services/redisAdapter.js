import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { createLogger } from "../logging/logger.js";

export async function configureRedisAdapter(redisUrl, nodeId, logFile = null, socketServer = null) {
  const logger = createLogger({ service: "redis", nodeId, logFile });
  const pubClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3000,
      family: 4,
      reconnectStrategy: (retries) => Math.min(1000 * (retries + 1), 10_000)
    }
  });
  const subClient = pubClient.duplicate();
  let connected = false;

  pubClient.on("error", (error) => {
    connected = false;
    console.error(`Redis publisher unavailable: ${error.message}`);
    logger.error({ event: "redis_publisher_error", error: error.message }, "Redis publisher unavailable");
  });
  pubClient.on("reconnecting", () => {
    logger.warn({ event: "redis_publisher_reconnecting" }, "Redis publisher reconnecting");
  });
  pubClient.on("end", () => {
    logger.warn({ event: "redis_publisher_disconnected" }, "Redis publisher disconnected");
  });
  subClient.on("error", (error) => {
    connected = false;
    console.error(`Redis subscriber unavailable: ${error.message}`);
    logger.error({ event: "redis_subscriber_error", error: error.message }, "Redis subscriber unavailable");
  });
  subClient.on("reconnecting", () => {
    logger.warn({ event: "redis_subscriber_reconnecting" }, "Redis subscriber reconnecting");
  });
  subClient.on("end", () => {
    logger.warn({ event: "redis_subscriber_disconnected" }, "Redis subscriber disconnected");
  });
  pubClient.on("ready", () => {
    connected = pubClient.isReady && subClient.isReady;
    logger.info({ event: "redis_publisher_ready" }, "Redis publisher ready");
  });
  subClient.on("ready", () => {
    connected = pubClient.isReady && subClient.isReady;
    logger.info({ event: "redis_subscriber_ready" }, "Redis subscriber ready");
  });

  console.log("[startup] Connecting Redis publisher and subscriber...");
  logger.info({ event: "redis_connections_connecting", channel: "chat:v2:events" }, "Connecting Redis publisher and subscriber");
  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    if (socketServer) socketServer.adapter(createAdapter(pubClient, subClient));
    connected = true;
    console.log("[startup] Redis adapter connected");
    logger.info({ event: "redis_adapter_connected" }, "Redis publisher and subscriber connected");
  } catch (error) {
    connected = false;
    console.error(`[startup] Redis unavailable; starting node in degraded mode: ${error.message || "connection failed"}`);
    logger.error({ event: "redis_adapter_connection_failed", error: error.message }, "Redis unavailable; node entering degraded mode");
  }

  return {
    pubClient,
    subClient,
    subscribe: async (handler) => {
      await subClient.subscribe("chat:v2:events", (message) => {
        try {
          const event = JSON.parse(message);
          logger.info({
            event: "redis_subscriber_event_received",
            channel: "chat:v2:events",
            eventType: event.eventType,
            eventId: event.eventId,
            conversationId: event.conversationId,
            sourceNode: event.sourceNode
          }, "Redis subscriber received event");
          handler(event);
        } catch (error) {
          logger.error({ event: "redis_subscriber_invalid_event", error: error.message }, "Redis subscriber received an invalid event");
        }
      });
      logger.info({ event: "redis_subscribed", channel: "chat:v2:events" }, "Redis subscriber subscribed to channel");
    },
    publish: async (event) => {
      try {
        await pubClient.publish("chat:v2:events", JSON.stringify(event));
        logger.info({
          event: "redis_published",
          channel: "chat:v2:events",
          eventType: event.eventType,
          eventId: event.eventId,
          conversationId: event.conversationId,
          sourceNode: event.sourceNode
        }, "Redis publisher published event");
      } catch (error) {
        logger.error({
          event: "redis_publish_failed",
          channel: "chat:v2:events",
          eventType: event.eventType,
          eventId: event.eventId,
          error: error.message
        }, "Redis publisher failed to publish event");
        throw error;
      }
    },
    isConnected: () => connected && pubClient.isReady && subClient.isReady,
    close: async () => {
      await Promise.all([
        pubClient.isOpen ? pubClient.quit() : Promise.resolve(),
        subClient.isOpen ? subClient.quit() : Promise.resolve()
      ]);
      logger.info({ event: "redis_adapter_closed" }, "Redis publisher and subscriber closed");
    }
  };
}
