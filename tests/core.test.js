import test from "node:test";
import assert from "node:assert/strict";
import jwt from "../server/node_modules/jsonwebtoken/index.js";
import { loadConfig } from "../server/src/config/env.js";
import { createToken, verifyToken } from "../server/src/auth/tokenService.js";
import { loadEnvironmentFile } from "../server/src/config/env.js";
import { directConversationId } from "../server/src/auth/accountStore.js";

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

test("valid JWT is signed and verified with explicit claims", () => {
  const user = { id: "test-user", username: "tester" };
  const token = createToken(user, config, "test-session");
  const claims = verifyToken(token, config);
  assert.equal(claims.sub, user.id);
  assert.equal(claims.username, "tester");
  assert.equal(claims.sid, "test-session");
});

test("expired and wrong-secret JWTs are rejected", () => {
  const expired = jwt.sign({ sub: "test-user", username: "tester", sid: "test-session" }, config.jwtSecret, { expiresIn: "-1s", algorithm: "HS256", issuer: "distributed-chat", audience: "distributed-chat-client" });
  assert.throws(() => verifyToken(expired, config), /jwt expired/i);
  const foreign = jwt.sign({ sub: "test-user", username: "tester", sid: "test-session" }, "wrong-secret", { expiresIn: "1h", algorithm: "HS256", issuer: "distributed-chat", audience: "distributed-chat-client" });
  assert.throws(() => verifyToken(foreign, config));
});

test("direct conversations use a deterministic pair identifier", () => {
  assert.equal(directConversationId("user-a", "user-b"), directConversationId("user-b", "user-a"));
  assert.equal(directConversationId("user-a", "user-b"), "direct:user-a:user-b");
});
