import crypto from "node:crypto";
import { MESSAGE_EVENTS } from "../../../shared/messageEvents.js";
import { VALIDATION } from "../../../shared/validation.js";
import { rooms, canAccessRoom } from "../data/rooms.js";
import { internalEventBus } from "../events/internalEventBus.js";

export function createMessageHandler(io, dedupe, config) {
  return (socket, payload, ack = () => {}) => {
    const respond = (result) => typeof ack === "function" && ack(result);
    const user = socket.data.user;
    if (!user) return respond({ success: false, code: "AUTH_REQUIRED", message: "Authentication required" });
    if (!payload || typeof payload !== "object") return respond({ success: false, code: "INVALID_MESSAGE", message: "Invalid message payload" });

    const { roomId, content, clientMessageId } = payload;
    if (typeof roomId !== "string" || roomId.length < VALIDATION.ROOM_ID_MIN || roomId.length > VALIDATION.ROOM_ID_MAX || !rooms.has(roomId)) {
      return respond({ success: false, code: "ROOM_NOT_FOUND", message: "Unknown room" });
    }
    if (!canAccessRoom(user.role, roomId)) return respond({ success: false, code: "ROOM_FORBIDDEN", message: "Room access denied" });
    if (!socket.rooms.has(roomId)) return respond({ success: false, code: "NOT_IN_ROOM", message: "Join the room before sending" });
    if (typeof clientMessageId !== "string" || !clientMessageId.trim() || clientMessageId.length > VALIDATION.CLIENT_MESSAGE_ID_MAX) {
      return respond({ success: false, code: "INVALID_MESSAGE", message: "Invalid client message ID" });
    }
    if (typeof content !== "string" || !content.trim()) return respond({ success: false, code: "INVALID_MESSAGE", message: "Message cannot be empty" });
    if (content.length > VALIDATION.MESSAGE_MAX_LENGTH) return respond({ success: false, code: "MESSAGE_TOO_LARGE", message: "Message is too large" });

    const existing = dedupe.get(`${socket.data.user.id}:${clientMessageId}`);
    if (existing) return respond({ success: true, accepted: true, duplicate: true, message: existing });

    const message = {
      messageId: crypto.randomUUID(),
      clientMessageId,
      roomId,
      sender: { id: user.id, username: user.username },
      content: content.trim(),
      timestamp: new Date().toISOString(),
      originNodeId: config.serverId
    };
    dedupe.set(`${user.id}:${clientMessageId}`, message);
    io.to(roomId).emit(MESSAGE_EVENTS.MESSAGE_RECEIVED, message);
    internalEventBus.emit("message:accepted", { messageId: message.messageId, serverId: config.serverId });
    respond({ success: true, accepted: true, duplicate: false, message });
  };
}
