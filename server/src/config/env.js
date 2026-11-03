
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

export function loadEnvironmentFile(env = process.env) {
  const envFile = env.NODE_ENV_FILE;
  if (!envFile?.trim()) return env;

  const directPath = resolve(envFile);
  const parentPath = resolve(process.cwd(), "..", basename(envFile));
  const selectedPath = existsSync(directPath)
    ? directPath
    : existsSync(parentPath)
      ? parentPath
      : directPath;

  const result = dotenv.config({ path: selectedPath, override: false, quiet: true });
  if (result.error) throw new Error(`Unable to load environment file "${selectedPath}": ${result.error.message}`);
  return process.env;
}

export function loadConfig(env = process.env) {
  const required = ["PORT", "SERVER_ID", "JWT_SECRET", "JWT_EXPIRES_IN", "REDIS_URL", "CLIENT_ORIGIN"];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");

  return Object.freeze({
    port,
    serverId: env.SERVER_ID.trim(),
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN.trim(),
    redisUrl: env.REDIS_URL.trim(),
    clientOrigin: env.CLIENT_ORIGIN.trim(),
    logLevel: env.LOG_LEVEL?.trim() || "info",
    logFile: env.LOG_FILE?.trim() || null
  });
}
