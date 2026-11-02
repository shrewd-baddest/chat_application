import { io } from "socket.io-client";
import { servers } from "../config/servers.js";
import { MESSAGE_EVENTS } from "../../../shared/messageEvents.js";

export class SocketManager {
  constructor(token, callbacks) {
    this.token = token;
    this.callbacks = callbacks;
    this.socket = null;
    this.serverIndex = 0;
    this.desiredRooms = new Set();
    this.retryCount = 0;
  }

  connect() {
    const server = servers[this.serverIndex];
    this.callbacks.onState({ status: this.retryCount ? "reconnecting" : "connecting", serverId: server.id });
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = io(server.url, {
      auth: { token: this.token },
      transports: ["polling", "websocket"],
      reconnection: false,
      timeout: 5000
    });
    this.socket.on("connect", () => {
      this.retryCount = 0;
      this.checkReadiness(server);
      this.restoreRooms();
    });
    this.socket.on(MESSAGE_EVENTS.ROOM_LIST, (rooms) => this.callbacks.onRooms(rooms));
    this.socket.on(MESSAGE_EVENTS.MESSAGE_RECEIVED, (message) => this.callbacks.onMessage(message));
    this.socket.on("connect_error", (error) => {
      if (["AUTH_REQUIRED", "TOKEN_EXPIRED", "INVALID_TOKEN"].includes(error?.data?.code)) {
        this.callbacks.onAuthError(error.data.code);
        return;
      }
      this.retryOrSwitch();
    });
    this.socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") this.retryOrSwitch();
    });
  }

  retryOrSwitch() {
    this.retryCount += 1;
    if (this.retryCount > 2) {
      this.serverIndex = (this.serverIndex + 1) % servers.length;
      this.retryCount = 0;
    }
    const delay = Math.min(10000, 500 * 2 ** Math.min(this.retryCount, 4)) + Math.random() * 250;
    this.callbacks.onState({ status: "reconnecting", serverId: servers[this.serverIndex].id });
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  async checkReadiness(server) {
    try {
      const response = await fetch(`${server.url}/health/ready`);
      const data = await response.json();
      this.callbacks.onState({
        status: response.ok && data.redis === "connected" ? "connected" : "degraded",
        serverId: server.id
      });
    } catch {
      this.callbacks.onState({ status: "degraded", serverId: server.id });
    }
  }

  joinRoom(roomId) {
    this.desiredRooms.add(roomId);
    this.socket?.emit(MESSAGE_EVENTS.ROOM_JOIN, { roomId }, (result) => {
      if (!result.success) this.desiredRooms.delete(roomId);
      this.callbacks.onRoomAck(result);
    });
  }

  leaveRoom(roomId) {
    this.desiredRooms.delete(roomId);
    this.socket?.emit(MESSAGE_EVENTS.ROOM_LEAVE, { roomId }, (result) => this.callbacks.onRoomAck(result));
  }

  restoreRooms() {
    for (const roomId of this.desiredRooms) this.joinRoom(roomId);
  }

  sendMessage(roomId, content, clientMessageId) {
    this.socket?.emit(MESSAGE_EVENTS.MESSAGE_SEND, { roomId, content, clientMessageId }, (result) => {
      this.callbacks.onSendAck(result);
    });
  }

  close() {
    window.clearTimeout(this.retryTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
  }
}
