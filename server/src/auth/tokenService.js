import jwt from "jsonwebtoken";

export function createToken(user, config) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: "HS256" }
  );
}

export function verifyToken(token, config) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"], requiredClaims: ["sub", "username", "role"] });
}
