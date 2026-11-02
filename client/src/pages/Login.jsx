import { useState } from "react";

export default function Login({ onLogin, loading }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password) return setError("Enter both username and password.");
    setError("");
    try { await onLogin(username.trim(), password); }
    catch (reason) { setError(reason.message || "Unable to sign in."); }
  };
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">DC</div>
        <p className="eyebrow">Distributed chat</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your workspace.</p>
        <form onSubmit={submit}>
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
