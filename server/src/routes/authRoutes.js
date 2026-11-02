import bcrypt from "bcryptjs";
import express from "express";
import { VALIDATION } from "../../../shared/validation.js";
import { users } from "../data/users.js";
import { createToken } from "../auth/tokenService.js";

export function createAuthRouter(config) {
  const router = express.Router();
  router.post("/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" ||
        username.length < VALIDATION.USERNAME_MIN || username.length > VALIDATION.USERNAME_MAX ||
        password.length < VALIDATION.PASSWORD_MIN || password.length > VALIDATION.PASSWORD_MAX) {
      return res.status(400).json({ success: false, code: "INVALID_INPUT", message: "Invalid username or password" });
    }
    const user = users.get(username.toLowerCase());
    const passwordMatches = user?.active ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!passwordMatches) return res.status(401).json({ success: false, code: "INVALID_CREDENTIALS", message: "Invalid username or password" });

    const token = createToken(user, config);
    return res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  });
  return router;
}
