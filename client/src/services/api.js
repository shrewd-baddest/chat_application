import { servers } from "../config/servers.js";

const baseUrl = servers[0].url;

export async function login(username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: username, password })
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || "Unable to sign in"), { status: response.status, fieldErrors: data.fieldErrors });
  return data;
}

export async function register(registration) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registration)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || "Registration failed"), { status: response.status, fieldErrors: data.fieldErrors });
  return data;
}

function authorization(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getSession(token) {
  const response = await fetch(`${baseUrl}/api/auth/session`, { headers: authorization(token) });
  if (!response.ok) throw new Error("Session is no longer active");
  return response.json();
}

export async function getUsers(token) {
  const response = await fetch(`${baseUrl}/api/auth/users`, { headers: authorization(token) });
  if (!response.ok) throw new Error("Unable to load users");
  return response.json();
}

export async function getConversationHistory(token, peerId) {
  const response = await fetch(`${baseUrl}/api/auth/messages/${encodeURIComponent(peerId)}`, { headers: authorization(token) });
  if (!response.ok) throw new Error("Unable to load conversation");
  return response.json();
}

export async function updateProfile(token, profile) {
  const response = await fetch(`${baseUrl}/api/auth/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify(profile)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || "Unable to update profile"), { fieldErrors: data.fieldErrors });
  return data;
}

export async function logout(token) {
  await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: authorization(token) });
}

export async function updatePassword(token, passwords) {
  const response = await fetch(`${baseUrl}/api/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authorization(token) },
    body: JSON.stringify(passwords)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || "Unable to change password"), { fieldErrors: data.fieldErrors });
  return data;
}
