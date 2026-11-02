import { verifyToken } from "./tokenService.js";
import { users } from "../data/users.js";

export function authenticateSocket(config, socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== "string") {
    const error = new Error("Authentication required");
    error.data = { code: "AUTH_REQUIRED" };
    return next(error);
  }
  try {
    const claims = verifyToken(token, config);
    const user = [...users.values()].find((candidate) => candidate.id === claims.sub && candidate.username === claims.username);
    if (!user?.active || user.role !== claims.role) {
      const error = new Error("Invalid session");
      error.data = { code: "INVALID_TOKEN" };
      return next(error);
    }
    socket.data.user = { id: user.id, username: user.username, role: user.role };
    next();
  } catch (error) {
    const authError = new Error(error.name === "TokenExpiredError" ? "Token expired" : "Invalid token");
    authError.data = { code: error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN" };
    next(authError);
  }
}
