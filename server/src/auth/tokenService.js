import jwt from "jsonwebtoken";

export function createToken(user, config, sessionId = null) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: "member", sid: sessionId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: "HS256", issuer: "distributed-chat", audience: "distributed-chat-client" }
  );
}

export function verifyToken(token, config) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ["HS256"],
    issuer: "distributed-chat",
    audience: "distributed-chat-client",
    requiredClaims: ["sub", "username", "sid"]
  });
}
