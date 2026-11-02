import { MESSAGE_EVENTS } from "../../../shared/messageEvents.js";
import { VALIDATION } from "../../../shared/validation.js";
import { rooms, getAuthorizedRooms, canAccessRoom } from "../data/rooms.js";
import { createMessageHandler } from "../services/messageService.js";
import { internalEventBus } from "../events/internalEventBus.js";

export function registerSocketHandlers(io, config, dedupe) {
  const handleMessage = createMessageHandler(io, dedupe, config);

  io.on("connection", (socket) => {
    const user = socket.data.user;
    console.log(`Client connected node=${config.serverId} user=${user.username}`);

    socket.emit(MESSAGE_EVENTS.ROOM_LIST, getAuthorizedRooms(user.role));

    socket.on(MESSAGE_EVENTS.ROOM_LIST, (ack = () => {}) => ack({ success: true, rooms: getAuthorizedRooms(user.role) }));

    socket.on(MESSAGE_EVENTS.ROOM_JOIN, (payload, ack = () => {}) => {
      const roomId = payload?.roomId;
      if (typeof roomId !== "string" || roomId.length > VALIDATION.ROOM_ID_MAX || !rooms.has(roomId)) {
        return ack({ success: false, code: "ROOM_NOT_FOUND", message: "Unknown room" });
      }
      if (!canAccessRoom(user.role, roomId)) return ack({ success: false, code: "ROOM_FORBIDDEN", message: "Room access denied" });
      socket.join(roomId);
      internalEventBus.emit("room:user-joined", { roomId, username: user.username });
      ack({ success: true, roomId });
    });

    socket.on(MESSAGE_EVENTS.ROOM_LEAVE, (payload, ack = () => {}) => {
      const roomId = payload?.roomId;
      if (typeof roomId !== "string" || !rooms.has(roomId)) return ack({ success: false, code: "ROOM_NOT_FOUND", message: "Unknown room" });
      socket.leave(roomId);
      internalEventBus.emit("room:user-left", { roomId, username: user.username });
      ack({ success: true, roomId });
    });

    socket.on(MESSAGE_EVENTS.MESSAGE_SEND, (payload, ack) => handleMessage(socket, payload, ack));
    socket.on("disconnect", (reason) => console.log(`Client disconnected node=${config.serverId} user=${user.username} reason=${reason}`));
  });
}
