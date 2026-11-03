import bcrypt from "bcryptjs";
import express from "express";
import { createToken, verifyToken } from "../auth/tokenService.js";
import { createLogger } from "../logging/logger.js";
import { directConversationId } from "../auth/accountStore.js";

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

function bearerToken(req) {
  const header = req.get("authorization");
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export function createAuthRouter(config, accountStore) {
  const router = express.Router();
  const logger = createLogger({ service: "auth", nodeId: config.serverId, logFile: config.logFile });

  router.post("/register", async (req, res) => {
    const { username, password, confirmPassword } = req.body ?? {};
    const fieldErrors = {};
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username.trim())) fieldErrors.username = "Use 3-32 letters, numbers, dots, underscores or hyphens.";
    if (typeof password !== "string" || !PASSWORD_PATTERN.test(password)) fieldErrors.password = "Use 8-128 characters with uppercase, lowercase and a number.";
    if (password !== confirmPassword) fieldErrors.confirmPassword = "Passwords do not match.";
    if (Object.keys(fieldErrors).length) return res.status(400).json({ success: false, code: "VALIDATION_ERROR", fieldErrors });

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await accountStore.register({
        username: username.trim(),
        passwordHash
      });
      if (result.conflict) return res.status(409).json({
        success: false,
        code: "ACCOUNT_EXISTS",
        message: "That username is already registered.",
        fieldErrors: { username: "Username may already be in use." }
      });
      logger.info({ event: "registration_success", userId: result.user.id, username: result.user.username }, "User registered");
      return res.status(201).json({ success: true, message: "Registration successful. Please sign in.", user: result.user });
    } catch (error) {
      console.error(`[auth] registration failed: ${error.message}`);
      logger.error({ event: "registration_failed", error: error.message }, "Registration failed");
      return res.status(503).json({ success: false, code: "AUTH_UNAVAILABLE", message: "Registration is temporarily unavailable." });
    }
  });

  router.post("/login", async (req, res) => {
    const { identifier, username, password } = req.body ?? {};
    const loginIdentifier = typeof identifier === "string" ? identifier : username;
    if (typeof loginIdentifier !== "string" || !loginIdentifier.trim() || typeof password !== "string") {
      return res.status(400).json({ success: false, code: "VALIDATION_ERROR", fieldErrors: { identifier: "Enter your username.", password: "Enter your password." } });
    }

    try {
      const user = await accountStore.findByUsername(loginIdentifier.trim());
      const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!passwordMatches) {
        logger.warn({ event: "login_failed", identifier: loginIdentifier.trim(), reason: "invalid_credentials" }, "Login rejected");
        return res.status(401).json({ success: false, code: "INVALID_CREDENTIALS", message: "Invalid username or password." });
      }

      const ttlSeconds = 3600;
      const sessionId = await accountStore.createSession(user.id, ttlSeconds);
      const token = createToken(user, config, sessionId);
      logger.info({ event: "login_success", userId: user.id, username: user.username }, "User logged in");
      return res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email }
      });
    } catch (error) {
      console.error(`[auth] login failed: ${error.message}`);
      return res.status(503).json({ success: false, code: "AUTH_UNAVAILABLE", message: "Login is temporarily unavailable." });
    }
  });

  async function authenticatedUser(req, res, next) {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "Authentication required." });
    try {
      const claims = verifyToken(token, config);
      const session = await accountStore.getSession(claims.sid, claims.sub);
      if (!session) return res.status(401).json({ success: false, code: "SESSION_REVOKED", message: "Your session is no longer active." });
      req.auth = claims;
      next();
    } catch {
      return res.status(401).json({ success: false, code: "INVALID_TOKEN", message: "Your session is invalid or expired." });
    }
  }

  router.get("/session", authenticatedUser, async (req, res) => {
    const user = await accountStore.getPublicUser(req.auth.sub);
    return user ? res.json({ success: true, user }) : res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found." });
  });

  router.get("/users", authenticatedUser, async (req, res) => {
    const users = await accountStore.listUsers(req.auth.sub);
    return res.json({ success: true, users });
  });

  router.get("/messages/:peerId", authenticatedUser, async (req, res) => {
    const peer = await accountStore.getPublicUser(req.params.peerId);
    if (!peer) return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found." });
    const conversationId = directConversationId(req.auth.sub, peer.id);
    const messages = await accountStore.getConversationHistory(conversationId);
    return res.json({ success: true, conversationId, messages });
  });

  router.post("/logout", authenticatedUser, async (req, res) => {
    await accountStore.revokeSession(req.auth.sid);
    logger.info({ event: "logout", userId: req.auth.sub }, "User signed out and session revoked");
    return res.json({ success: true, message: "Signed out." });
  });

  router.put("/profile", authenticatedUser, async (req, res) => {
    const { displayName, email } = req.body ?? {};
    const fieldErrors = {};
    if (displayName !== undefined && (typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 64)) fieldErrors.displayName = "Display name must be 1-64 characters.";
    if (email !== undefined && (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))) fieldErrors.email = "Enter a valid email address.";
    if (Object.keys(fieldErrors).length) return res.status(400).json({ success: false, code: "VALIDATION_ERROR", fieldErrors });

    const result = await accountStore.updateProfile(req.auth.sub, {
      displayName: displayName?.trim(),
      email: email?.trim()
    });
    if (result?.conflict) return res.status(409).json({ success: false, code: "EMAIL_EXISTS", fieldErrors: { email: "Email address is already in use." } });
    return result?.user ? res.json({ success: true, user: result.user }) : res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found." });
  });

  router.put("/password", authenticatedUser, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (typeof newPassword !== "string" || !PASSWORD_PATTERN.test(newPassword)) {
      return res.status(400).json({ success: false, code: "VALIDATION_ERROR", fieldErrors: { newPassword: "Use 8-128 characters with uppercase, lowercase and a number." } });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, code: "VALIDATION_ERROR", fieldErrors: { confirmPassword: "Passwords do not match." } });
    }
    const user = await accountStore.getUser(req.auth.sub);
    if (!user || !(await bcrypt.compare(typeof currentPassword === "string" ? currentPassword : "", user.passwordHash))) {
      return res.status(401).json({ success: false, code: "INVALID_PASSWORD", fieldErrors: { currentPassword: "Current password is incorrect." } });
    }
    await accountStore.updatePassword(req.auth.sub, await bcrypt.hash(newPassword, 12));
    await accountStore.revokeSession(req.auth.sid);
    return res.json({ success: true, message: "Password changed. Please sign in again.", sessionRevoked: true });
  });

  return router;
}
