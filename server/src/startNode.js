import { loadConfig, loadEnvironmentFile } from "./config/env.js";
import { createServer } from "./createServer.js";
import { createLogger } from "./logging/logger.js";

let server;
let shuttingDown = false;

async function start() {
  let logger;
  try {
    console.log("[startup] Loading node environment configuration...");
    const env = loadEnvironmentFile(process.env);
    const config = loadConfig(env);
    process.env.LOG_LEVEL = config.logLevel;
    logger = createLogger({ service: "chat-node", nodeId: config.serverId, logFile: config.logFile });
    logger.info({ event: "startup_environment_loaded", port: config.port }, "Node environment loaded");
    console.log(`[startup] Connecting node=${config.serverId} port=${config.port}`);
    server = await createServer(config);
    server.httpServer.listen(config.port, () => {
      console.log(`Server listening serverId=${config.serverId} port=${config.port}`);
      logger.info({ event: "node_listening", port: config.port }, "Node HTTP server listening");
    });
  } catch (error) {
    console.error(`Startup failed: ${error.message}`);
    logger?.error({ event: "startup_failed", error: error.message }, "Node startup failed");
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutdown started signal=${signal}`);
  if (!server) return process.exit(0);
  await new Promise((resolve) => server.httpServer.close(resolve)).catch(() => {});
  await server.close().catch((error) => console.error(`Shutdown error: ${error.message}`));
  console.log("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
start();
