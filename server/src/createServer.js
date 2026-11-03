import http from "node:http";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { AccountStore, directConversationId } from "./auth/accountStore.js";
import { configureRedisAdapter } from "./services/redisAdapter.js";
import { createLogger } from "./logging/logger.js";

export async function createServer(config) {
  const logger = createLogger({ service: "chat-node", nodeId: config.serverId, logFile: config.logFile });
  const accountStore = new AccountStore(config.redisUrl);
  logger.info({ event: "redis_account_store_connecting", redisUrl: config.redisUrl.replace(/\/\/[^@]*@/, "//[REDACTED]@") }, "Connecting account store to Redis");
  await accountStore.connect();
  logger.info({ event: "redis_account_store_connected" }, "Account store connected to Redis");

  let redis;
  const app = createApp(config, () => accountStore.isConnected() && redis?.isConnected(), accountStore);
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.clientOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
      methods: ["GET", "POST"]
    }
  });
  redis = await configureRedisAdapter(config.redisUrl, config.serverId, config.logFile, io);
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"], issuer: "distributed-chat", audience: "distributed-chat-client" });
      const session = await accountStore.getSession(claims.sid, claims.sub);
      const user = await accountStore.getPublicUser(claims.sub);
      if (!session || !user) return next(new Error("SESSION_REVOKED"));
      socket.data.user = user;
      logger.info({ event: "socket_authenticated", socketId: socket.id, userId: user.id, serverId: config.serverId }, "Socket.IO client authenticated");
      next();
    } catch (error) {
      logger.warn({ event: "socket_authentication_failed", error: error.message }, "Socket.IO authentication rejected");
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const joinedRooms = new Set();
    const user = socket.data.user;
    logger.info({ event: "socket_connected", socketId: socket.id, userId: user.id, serverId: config.serverId }, "Socket.IO client connected");

    socket.on("dm:join", async (peerId, ack) => {
      const peer = await accountStore.getPublicUser(peerId);
      if (!peer) return ack?.({ success: false, code: "USER_NOT_FOUND" });
      const conversationId = directConversationId(user.id, peer.id);
      socket.join(conversationId);
      joinedRooms.add(conversationId);
      logger.info({ event: "direct_conversation_joined", socketId: socket.id, userId: user.id, peerId, conversationId }, "User joined direct conversation");
      ack?.({ success: true, conversationId, peer });
    });
    socket.on("message:send", async (payload = {}, ack) => {
      const peerId = payload.peerId;
      const content = typeof payload.content === "string" ? payload.content.trim() : "";
      const clientMessageId = typeof payload.clientMessageId === "string" ? payload.clientMessageId.trim() : "";
      const peer = await accountStore.getPublicUser(peerId);
      if (!peer) return ack?.({ success: false, code: "USER_NOT_FOUND", clientMessageId });
      const conversationId = directConversationId(user.id, peer.id);
      if (!joinedRooms.has(conversationId) || !content || content.length > 2000 || !clientMessageId || clientMessageId.length > 128) {
        return ack?.({ success: false, code: "INVALID_MESSAGE", clientMessageId });
      }
      const existing = await accountStore.client.get(`chat:v2:dedupe:${user.id}:${clientMessageId}`);
      if (existing) return ack?.({ success: true, accepted: true, duplicate: true, message: JSON.parse(existing) });
      const message = {
        messageId: crypto.randomUUID(),
        clientMessageId,
        conversationId,
        peerId: peer.id,
        sender: { id: user.id, username: user.username, displayName: user.displayName },
        content,
        timestamp: new Date().toISOString(),
        originNodeId: config.serverId
      };
      await accountStore.client.lPush(`chat:v2:messages:${conversationId}`, JSON.stringify(message));
      await accountStore.client.lTrim(`chat:v2:messages:${conversationId}`, 0, 499);
      await accountStore.client.set(`chat:v2:dedupe:${user.id}:${clientMessageId}`, JSON.stringify(message), { EX: 86400 });
      io.to(conversationId).emit("message:received", message);
      logger.info({ event: "direct_message_sent", userId: user.id, peerId, messageId: message.messageId, conversationId, clientMessageId, originNodeId: config.serverId }, "Direct message broadcast through Socket.IO Redis adapter");
      ack?.({ success: true, accepted: true, duplicate: false, message });
    });
    socket.on("disconnect", (reason) => logger.info({ event: "socket_disconnected", socketId: socket.id, userId: user.id, reason }, "Socket.IO client disconnected"));
  });

  return {
    app,
    httpServer,
    io,
    redis,
    close: async () => {
      io.close();
      await accountStore.close();
      await redis.close();
    }
  };
}
