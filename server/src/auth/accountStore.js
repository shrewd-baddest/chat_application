import { randomUUID } from "node:crypto";
import { createClient } from "redis";

const NS = "chat:v2";

export function directConversationId(userA, userB) {
  return `direct:${[userA, userB].sort().join(":")}`;
}

export class AccountStore {
  constructor(redisUrl) {
    this.redisUrl = redisUrl;
    this.client = createClient({
      url: redisUrl,
      socket: { connectTimeout: 3000, family: 4, reconnectStrategy: (retries) => Math.min(1000 * (retries + 1), 10_000) }
    });
  }

  async connect() {
    await this.client.connect();
  }

  async register({ username, passwordHash }) {
    const normalizedUsername = username.toLowerCase();
    const userId = randomUUID();
    const createdAt = new Date().toISOString();
    const created = await this.client.eval(
      `if redis.call("exists", KEYS[1]) == 1 then
         return 0
       end
       redis.call("hset", KEYS[2],
         "id", ARGV[1], "username", ARGV[2], "displayName", ARGV[3],
         "email", ARGV[4], "passwordHash", ARGV[5], "createdAt", ARGV[6], "active", "1")
       redis.call("set", KEYS[1], ARGV[1])
      redis.call("zadd", KEYS[3], ARGV[7], ARGV[1])
       return 1`,
      {
        keys: [
           `${NS}:index:username:${normalizedUsername}`,
            `${NS}:user:${userId}`,
            `${NS}:users`
         ],
        arguments: [userId, normalizedUsername, normalizedUsername, "", passwordHash, createdAt, String(Date.now())]
      }
    );
    if (Number(created) !== 1) return { conflict: true };
    return { user: await this.getPublicUser(userId) };
  }

  async findByUsername(identifier) {
    const normalized = identifier.toLowerCase();
    const userId = await this.client.get(`${NS}:index:username:${normalized}`);
    return userId ? this.getUser(userId) : null;
  }

  async getUser(userId) {
    const values = await this.client.hGetAll(`${NS}:user:${userId}`);
    if (!values?.id || values.active !== "1") return null;
    return values;
  }

  async getPublicUser(userId) {
    const user = await this.getUser(userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email
    };
  }

  async createSession(userId, ttlSeconds) {
    const sessionId = randomUUID();
    await this.client.hSet(`${NS}:session:${sessionId}`, {
      id: sessionId,
      userId,
      createdAt: new Date().toISOString()
    });
    await this.client.expire(`${NS}:session:${sessionId}`, ttlSeconds);
    return sessionId;
  }

  async getSession(sessionId, userId) {
    const session = await this.client.hGetAll(`${NS}:session:${sessionId}`);
    return session?.userId === userId ? session : null;
  }

  async revokeSession(sessionId) {
    await this.client.del(`${NS}:session:${sessionId}`);
  }

  async listUsers(excludeUserId) {
    const userIds = await this.client.zRange(`${NS}:users`, 0, -1);
    const users = [];
    for (const userId of userIds) {
      if (userId === excludeUserId) continue;
      const user = await this.getPublicUser(userId);
      if (user) users.push(user);
    }
    return users;
  }

  async getConversationHistory(conversationId, limit = 100) {
    const values = await this.client.lRange(`${NS}:messages:${conversationId}`, 0, limit - 1);
    return values.map((value) => JSON.parse(value)).reverse();
  }

  async updateProfile(userId, { displayName, email }) {
    const user = await this.getUser(userId);
    if (!user) return null;

    if (email) {
      const normalizedEmail = email.toLowerCase();
      const ownedBy = await this.client.get(`${NS}:index:email:${normalizedEmail}`);
      if (ownedBy && ownedBy !== userId) return { conflict: true };
      await this.client.del(`${NS}:index:email:${user.email.toLowerCase()}`);
      await this.client.set(`${NS}:index:email:${normalizedEmail}`, userId);
      user.email = normalizedEmail;
    }
    if (displayName) user.displayName = displayName;
    await this.client.hSet(`${NS}:user:${userId}`, {
      displayName: user.displayName,
      email: user.email
    });
    return { user: await this.getPublicUser(userId) };
  }

  async updatePassword(userId, passwordHash) {
    const updated = await this.client.hSet(`${NS}:user:${userId}`, { passwordHash });
    return updated >= 0;
  }

  isConnected() {
    return this.client.isReady;
  }

  async close() {
    if (this.client.isOpen) await this.client.quit();
  }
}
