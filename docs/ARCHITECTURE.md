# Architecture

## Components

The React client connects through a single central `SocketManager`. Two independently launched Node.js processes expose Express and Socket.IO servers. Both nodes use the same Redis URL and install a Socket.IO Redis Adapter. Room membership and authorization decisions remain server-side on each node.

## Authentication sequence

The login route validates the username and password, compares against a bcrypt hash in the in-memory Map, and signs a short-lived HS256 JWT. The browser sends that JWT in the Socket.IO `auth` handshake payload, never in a URL query string.

## Room and message sequence

The client requests a room join. The node verifies the role against the server room policy, joins the local socket, and acknowledges. For a send, the node verifies authentication, room existence, membership, payload size, and authorization, then creates the canonical message and emits it through `io.to(roomId)`. The Redis Adapter propagates that room broadcast to sockets on the other node.

## Failover

The socket manager uses bounded exponential backoff, then alternates between Node 1 and Node 2. Authentication errors stop network retrying. After reconnection, the manager rechecks and restores its remembered rooms. There is no existing-socket migration.

## Redis outage

When Redis is unavailable, new server startup fails because cross-node chat cannot be initialized safely. If Redis fails after startup, the Redis health status becomes disconnected and readiness returns 503. Messages are not replayed when Redis returns.
