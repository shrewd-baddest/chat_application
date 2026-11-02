import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "../server/node_modules/bcryptjs/index.js";
import jwt from "../server/node_modules/jsonwebtoken/index.js";
import { loadConfig } from "../server/src/config/env.js";
import { createToken, verifyToken } from "../server/src/auth/tokenService.js";
import { users } from "../server/src/data/users.js";
import { rooms, canAccessRoom, getAuthorizedRooms } from "../server/src/data/rooms.js";
import { DeduplicationCache } from "../server/src/services/deduplicationCache.js";
import { loadEnvironmentFile } from "../server/src/config/env.js";

const config = { port: 3001, serverId: "node-1", jwtSecret: "test-secret-that-is-long-enough-for-hs256", jwtExpiresIn: "1h", redisUrl: "redis://localhost:6379", clientOrigin: "http://localhost:5173" };

test("environment validation rejects missing required values", () => {
  assert.throws(() => loadConfig({}), /Missing required environment variables/);
});

test("node environment files load their node-specific port and shared configuration", () => {
  loadEnvironmentFile({ NODE_ENV_FILE: "./.env.node1" });
  const node1 = loadConfig(process.env);
  assert.equal(node1.port, 3001);
  assert.equal(node1.serverId, "node-1");

  for (const key of ["PORT", "SERVER_ID", "JWT_SECRET", "JWT_EXPIRES_IN", "REDIS_URL", "CLIENT_ORIGIN"]) {
    delete process.env[key];
  }
  loadEnvironmentFile({ NODE_ENV_FILE: "./.env.node2" });
  const node2 = loadConfig(process.env);
  assert.equal(node2.port, 3002);
  assert.equal(node2.serverId, "node-2");
  assert.equal(node1.jwtSecret, node2.jwtSecret);
  assert.equal(node1.redisUrl, node2.redisUrl);
});

test("seeded demo password matches fixed bcrypt hash", async () => {
  assert.equal(await bcrypt.compare("demo-password", users.get("alice").passwordHash), true);
});

test("valid JWT is signed and verified with explicit claims", () => {
  const user = users.get("alice");
  const token = createToken(user, config);
  const claims = verifyToken(token, config);
  assert.equal(claims.sub, user.id);
  assert.equal(claims.username, "alice");
});

test("expired and wrong-secret JWTs are rejected", () => {
  const user = users.get("alice");
  const expired = jwt.sign({ sub: user.id, username: "alice", role: "member" }, config.jwtSecret, { expiresIn: "-1s", algorithm: "HS256" });
  assert.throws(() => verifyToken(expired, config), /jwt expired/i);
  const foreign = jwt.sign({ sub: user.id, username: "alice", role: "member" }, "wrong-secret", { expiresIn: "1h", algorithm: "HS256" });
  assert.throws(() => verifyToken(foreign, config));
});

test("room policy only exposes authorized rooms", () => {
  assert.equal(canAccessRoom("member", "general"), true);
  assert.equal(canAccessRoom("member", "moderators"), false);
  assert.equal(getAuthorizedRooms("member").some((room) => room.id === "moderators"), false);
  assert.equal(getAuthorizedRooms("admin").length, rooms.size);
});

test("deduplication cache returns the same accepted message once", () => {
  const cache = new DeduplicationCache(2);
  const message = { messageId: "server-1" };
  cache.set("client-1", message);
  assert.strictEqual(cache.get("client-1"), message);
  cache.set("client-2", { messageId: "server-2" });
  assert.equal(cache.get("client-3"), null);
});
