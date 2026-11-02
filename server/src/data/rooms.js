export const rooms = new Map([
  ["general", { id: "general", name: "General", roles: ["member", "moderator", "admin"] }],
  ["engineering", { id: "engineering", name: "Engineering", roles: ["member", "moderator", "admin"] }],
  ["moderators", { id: "moderators", name: "Moderators", roles: ["moderator", "admin"] }]
]);

export function getAuthorizedRooms(role) {
  return [...rooms.values()].filter((room) => room.roles.includes(role)).map(({ id, name }) => ({ id, name }));
}

export function canAccessRoom(role, roomId) {
  const room = rooms.get(roomId);
  return Boolean(room?.roles.includes(role));
}
