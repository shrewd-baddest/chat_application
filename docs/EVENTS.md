# Event Catalogue

## `room:list`
- Direction: server to client on connect; client may request.
- Authentication: required.
- Payload request: `{}` optional with ack callback.
- Response: array of `{ id, name }`.

## `room:join`
- Direction: client to server.
- Authentication: required.
- Payload: `{ roomId }`.
- Acknowledgement: `{ success, roomId }` or `{ success:false, code, message }`.
- Codes: `ROOM_NOT_FOUND`, `ROOM_FORBIDDEN`.

## `room:leave`
- Direction: client to server.
- Payload: `{ roomId }`.
- Acknowledgement: `{ success, roomId }` or `{ success:false, code, message }`.

## `message:send`
- Direction: client to server.
- Payload: `{ roomId, content, clientMessageId }`.
- Rules: room ID 1-64 characters, content 1-2000 characters, client ID 1-128 characters.
- Ack: `{ success, accepted, duplicate, message }` or stable error fields.
- Codes: `AUTH_REQUIRED`, `ROOM_NOT_FOUND`, `ROOM_FORBIDDEN`, `NOT_IN_ROOM`, `INVALID_MESSAGE`, `MESSAGE_TOO_LARGE`.

## `message:received`
- Direction: server to authenticated room members.
- Payload: canonical server message containing `messageId`, `clientMessageId`, `roomId`, authoritative `sender`, `content`, `timestamp`, and `originNodeId`.
