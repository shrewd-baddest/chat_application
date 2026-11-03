import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pino from "pino";

let loggerCache = new Map();

export function createLogger({ service = "backend", nodeId = process.env.SERVER_ID || process.env.NODE_ID || "unknown", logFile } = {}) {
  const key = `${service}:${nodeId}:${logFile || ""}`;
  if (loggerCache.has(key)) return loggerCache.get(key);

  const streams = [{ stream: process.stdout }];
  if (logFile) {
    const absolutePath = resolve(logFile);
    mkdirSync(dirname(absolutePath), { recursive: true });
    streams.push({ stream: pino.destination({ dest: absolutePath, sync: false }) });
  }

  const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    base: { service, nodeId },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ["req.headers.authorization", "token", "*.token", "password", "*.password", "*.currentPassword", "*.newPassword"],
      censor: "[REDACTED]"
    }
  }, pino.multistream(streams));

  loggerCache.set(key, logger);
  return logger;
}
