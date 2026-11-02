import { verifyToken } from "../auth/tokenService.js";

export function createHttpAuth(config) {
  return (req, res, next) => {
    const value = req.headers.authorization;
    if (!value?.startsWith("Bearer ")) return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "Authentication required" });
    try {
      req.user = verifyToken(value.slice(7), config);
      next();
    } catch (error) {
      const expired = error.name === "TokenExpiredError";
      res.status(401).json({ success: false, code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN", message: expired ? "Token expired" : "Invalid token" });
    }
  };
}
