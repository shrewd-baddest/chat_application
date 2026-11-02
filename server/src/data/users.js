// Fixed bcrypt hash generated from the documented demo password. No plaintext passwords are stored here.
const demoHash = "$2b$10$Evq27U362SSd5VUi/TsmuOmm3JV/9B2W0TxgsDEwOfGT3L.oGFHV.";

export const users = new Map([
  ["alice", { id: "user-001", username: "alice", passwordHash: demoHash, role: "member", active: true }],
  ["bob", { id: "user-002", username: "bob", passwordHash: demoHash, role: "member", active: true }],
  ["mod", { id: "user-003", username: "mod", passwordHash: demoHash, role: "moderator", active: true }],
  ["admin", { id: "user-004", username: "admin", passwordHash: demoHash, role: "admin", active: true }]
]);
