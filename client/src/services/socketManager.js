import { servers } from "../config/servers.js";
import { io } from "socket.io-client";

export class SocketManager {
  constructor(token, callbacks) {
    this.token = token;
    this.callbacks = callbacks;
    this.socket = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.closed = false;
  }

  connect() {
    if (this.closed) return;
    this.callbacks.onState({ status: this.retryCount ? "reconnecting" : "connecting", serverId: "gateway" });
    const gatewayUrl = new URL(servers[0].url);
    this.socket = io(gatewayUrl.origin, {
      transports: ["websocket", "polling"],
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: Infinity
    });
    this.socket.on("connect", () => {
      this.retryCount = 0;
      this.callbacks.onState({ status: "connected", serverId: "gateway-node" });
    });
    this.socket.on("message:received", (message) => this.callbacks.onMessage(message));
    this.socket.on("connect_error", (error) => {
      if (["UNAUTHENTICATED", "SESSION_REVOKED"].includes(error.message)) this.callbacks.onAuthError(error.message);
      else this.retryOrSwitch();
    });
    this.socket.on("disconnect", () => {
      if (!this.closed) this.retryOrSwitch();
    });
  }

  retryOrSwitch() {
    this.retryCount += 1;
    const delay = Math.min(10000, 500 * 2 ** Math.min(this.retryCount, 4)) + Math.random() * 250;
    this.callbacks.onState({ status: "reconnecting", serverId: "gateway" });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  joinDirectChat(peerId) {
    this.socket?.connected && this.socket.emit("dm:join", peerId, (ack) => this.callbacks.onRoomAck(ack));
  }

  sendDirectMessage(peerId, content, clientMessageId) {
    this.socket?.connected && this.socket.emit("message:send", { peerId, content, clientMessageId }, (ack) => this.callbacks.onSendAck(ack));
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.socket?.close();
  }
}
