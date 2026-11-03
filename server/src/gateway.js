import http from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createLogger } from "./logging/logger.js";

const logger = createLogger({ service: "gateway", nodeId: "gateway", logFile: process.env.LOG_FILE || "logs/gateway.log" });

const port = Number(process.env.GATEWAY_PORT || 4000);
const nodeSpecs = [
  { id: "node-1", port: 3001 },
  { id: "node-2", port: 3002 }
];
const nodeRegistry = new Map(nodeSpecs.map((node) => [node.id, { ...node, status: "starting", failures: 0, child: null }]));
let roundRobin = 0;
let shuttingDown = false;

function spawnNode(node) {
  if (node.child || shuttingDown) return;
  const serverEntry = resolve(process.cwd(), "server/src/startNode.js");
  const child = spawn(process.execPath, [serverEntry], {
    cwd: resolve(process.cwd()),
    env: {
      ...process.env,
      NODE_ID: node.id,
      SERVER_ID: node.id,
      PORT: String(node.port),
      NODE_ENV_FILE: node.id === "node-1" ? ".env.node1" : ".env.node2"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  node.child = child;
  node.pid = child.pid;
  logger.info({ event: "node_spawned", nodeId: node.id, pid: child.pid, port: node.port }, "Backend node process started");
  child.stdout.on("data", (chunk) => process.stdout.write(`[${node.id}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${node.id}] ${chunk}`));
  child.on("error", (error) => console.error(JSON.stringify({ level: "error", service: "gateway", nodeId: node.id, event: "child_error", error: error.message })));
  child.on("exit", (code, signal) => {
    console.error(JSON.stringify({ level: "warn", service: "gateway", nodeId: node.id, event: "child_exit", code, signal, pid: node.pid }));
    node.child = null;
    node.status = "stopped";
    setTimeout(() => spawnNode(node), 1000 + Math.floor(Math.random() * 500));
  });
}

async function probe(node) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`http://127.0.0.1:${node.port}/health/ready`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function selectNode() {
  const ready = [...nodeRegistry.values()].filter((node) => node.status === "ready");
  if (!ready.length) return null;
  const selected = ready[roundRobin % ready.length];
  roundRobin += 1;
  return selected;
}

async function monitor() {
  for (const node of nodeRegistry.values()) {
    if (!node.child) spawnNode(node);
    const isReady = await probe(node);
    const previous = node.status;
    node.status = isReady ? "ready" : node.child ? "starting" : "stopped";
    if (isReady) node.failures = 0;
    else node.failures += 1;
    if (previous !== node.status) {
      console.log(JSON.stringify({ level: "info", service: "gateway", nodeId: node.id, event: "node_status", status: node.status }));
    }
  }
}

function proxyHttp(req, res) {
  const node = selectNode();
  if (!node) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No healthy backend nodes are available" }));
    return;
  }
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: node.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${node.port}`, "x-forwarded-for": req.socket.remoteAddress || "", "x-forwarded-port": String(node.port) }
  }, (upstream) => {
    logger.info({
      event: "http_proxy_request",
      method: req.method,
      path: req.url,
      nodeId: node.id,
      statusCode: upstream.statusCode
    }, "Gateway proxyed HTTP request");
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", () => {
    node.status = "starting";
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Backend proxy connection failed" }));
  });
  req.pipe(proxy);
}

const gateway = http.createServer((req, res) => {
  if (req.url === "/gateway/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", nodes: [...nodeRegistry.values()].map(({ child, ...node }) => ({ id: node.id, port: node.port, status: node.status, pid: node.pid })) }));
    return;
  }
  proxyHttp(req, res);
});

gateway.on("upgrade", async (request, socket, head) => {
  const node = selectNode();
  if (!node) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: node.port,
    path: request.url,
    method: "GET",
    headers: { ...request.headers, connection: "Upgrade", upgrade: "websocket", host: `127.0.0.1:${node.port}` }
  });
  upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
    const statusLine = "HTTP/1.1 101 Switching Protocols\r\n";
    const headers = Object.entries(response.headers).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`).join("");
    socket.on("error", () => socket.destroy());
    upstreamSocket.on("error", () => upstreamSocket.destroy());
    if (socket.destroyed || !socket.writable) {
      upstreamSocket.destroy();
      return;
    }
    socket.write(statusLine + headers + "\r\n");
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
    if (upstreamHead.length) socket.write(upstreamHead);
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", service: "gateway", event: "shutdown_started", signal }));
  for (const node of nodeRegistry.values()) {
    if (node.child) node.child.kill("SIGTERM");
  }
  gateway.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
for (const node of nodeRegistry.values()) spawnNode(node);
setInterval(monitor, 3000);
monitor();
gateway.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", service: "gateway", event: "gateway_listening", port }));
});
