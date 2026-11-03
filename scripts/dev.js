import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";
let shuttingDown = false;
const children = [];

function redisIsRunning() {
  if (isWindows) {
    const result = spawnSync("wsl.exe", ["-d", "Ubuntu", "redis-cli", "ping"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000
    });
    return result.status === 0 && result.stdout.trim() === "PONG";
  }

  const result = spawnSync("redis-cli", ["ping"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000
  });
  return result.status === 0 && result.stdout.trim() === "PONG";
}

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: isWindows
  });
  children.push({ label, child });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[dev] ${label} exited code=${code ?? "none"} signal=${signal ?? "none"}`);
      shutdown();
    }
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.killed) continue;
    if (isWindows && child.pid) {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: root,
        encoding: "utf8",
        timeout: 5000
      });
    } else {
      child.kill("SIGTERM");
    }
  }
}

async function waitForGateway(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4000/gateway/health", { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        const status = health.nodes?.map((node) => `${node.id}:${node.status}`).join(", ") || "gateway starting";
        if (status !== lastStatus) {
          console.log(`[dev] Waiting for backend nodes (${status})`);
          lastStatus = status;
        }
        const ready = health.nodes?.length === 2 && health.nodes.every((node) => node.status === "ready");
        if (ready) return health;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Gateway did not become ready within 30 seconds");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!redisIsRunning()) {
  console.error("[dev] Redis is not responding. Start it first, then run npm run dev.");
  console.error("[dev] Windows/WSL: npm run start:redis:wsl");
  process.exit(1);
}

console.log("[dev] Redis is ready");
const npmCommand = isWindows ? "npm.cmd" : "npm";
start("gateway-and-nodes", npmCommand, ["run", "dev:gateway"]);
try {
  const health = await waitForGateway();
  console.log(`[dev] Gateway is ready at http://localhost:4000 (${health.nodes.map((node) => `${node.id}:${node.status}`).join(", ")})`);
  start("client", npmCommand, ["--prefix", "client", "run", "dev"]);
  console.log("[dev] Frontend is starting at http://localhost:5173");
} catch (error) {
  console.error(`[dev] ${error.message}`);
  shutdown();
  process.exit(1);
}
