# Technical Report

## Architecture

The system consists of a React client and two independent Express/Socket.IO processes. Both server processes share the same JWT configuration and server-side room policy but maintain separate in-memory users, sockets, and deduplication caches. Redis and the Socket.IO Redis Adapter distribute room broadcasts across the independent application nodes.

## Concurrency and communication

Node.js handles HTTP and socket work through asynchronous event-driven I/O. Multiple clients use independent Socket.IO connections, while room broadcasts are scoped by server-authoritative room membership. The Redis Adapter avoids application HTTP relays and uses the approved Redis Pub/Sub infrastructure.

## Security and authorization

Login passwords are compared with bcrypt hashes. Successful login creates an HS256 JWT with a shared secret and configured expiry. Socket authentication validates the token, required claims, local active user record, and role. Room membership is never trusted from browser state; every room join and message send is revalidated on the server.

## Failover

The centralized browser socket manager retries the current node, alternates to the other node, and restores remembered authorized rooms after reconnection. The browser repeats JWT authentication because an existing socket cannot migrate. Unacknowledged messages are retained as pending items during this interruption.

## Evaluation and limitations

Automated core tests cover environment validation, fixed bcrypt credentials, JWT verification, expiry/signature rejection, room policy, and bounded deduplication. Redis-backed and full multi-node/manual failover evidence must be recorded from a running Docker/Redis environment before the assignment is presented. Known limitations include no durable history, process-local users, Redis as a single shared infrastructure dependency, possible message loss during outages, and no global exactly-once delivery.
