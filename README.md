# Distributed Chat

A two-node real-time chat application with one gateway, Socket.IO WebSockets, Redis Pub/Sub and the Socket.IO Redis Adapter, registration, login, chat, and profile settings.

## Start

Redis must be running first:

```powershell
npm run status:redis:wsl
npm run dev
```

If Redis is stopped:

```powershell
npm run start:redis:wsl
```

Ports:

- Gateway: `http://localhost:4000`
- Node 1: `http://localhost:3001`
- Node 2: `http://localhost:3002`
- Frontend: `http://localhost:5173`
- Socket.IO WebSocket: `ws://localhost:4000/socket.io/`

`npm run dev` starts the gateway, supervised nodes, and frontend. Application traffic uses the gateway only.

## Environment

Create node configuration from the examples:

```powershell
Copy-Item .env.node1.example .env.node1
Copy-Item .env.node2.example .env.node2
```

Node-specific values:

- Node 1: `PORT=3001`, `SERVER_ID=node-1`, `.env.node1`
- Node 2: `PORT=3002`, `SERVER_ID=node-2`, `.env.node2`

Both files must use the same JWT secret, Redis URL, and client origin.

## Logging

Node logs are structured JSON for machine-readable monitoring:

- Console: every node writes logs through its gateway-prefixed process output.
- Files: `.env.node1` writes to `logs/node-1.log`; `.env.node2` writes to `logs/node-2.log`.
- Level: set `LOG_LEVEL=debug` or `LOG_LEVEL=info` in each node environment file.

Logged events include startup and shutdown, HTTP requests, Redis connections, WebSocket authentication and disconnects, room joins, message delivery, registration, login, logout, and gateway node restarts.

## Product pages

1. Authentication page with login and registration modes.
2. Chat page.
3. Profile and settings page.

Registration requires only username, password and matching password confirmation. A successful registration returns the user to the login form.

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `PUT /api/auth/profile`
- `POST /api/auth/logout`
- `GET /health/live`
- `GET /health/ready`

## Tests

```powershell
npm test
npm --prefix client run build
```

Docker is not required for this project and has not been included.
