import { servers } from "../config/servers.js";

export async function login(username, password) {
  let lastError;
  for (const server of servers) {
    try {
      const response = await fetch(`${server.url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.message || "Unable to sign in"), { status: response.status });
      return data;
    } catch (error) {
      if (error.status === 400 || error.status === 401) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error("Servers are unavailable");
}
