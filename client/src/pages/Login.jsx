import { useState } from "react";

export default function Login({ onLogin, onRegister, loading }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setSuccess("");
    try {
      if (mode === "login") {
        await onLogin(username.trim(), password);
      } else {
        await onRegister({ username: username.trim(), password, confirmPassword });
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setSuccess("Registration successful. Please sign in.");
      }
    } catch (reason) {
      setError(reason.message || "Unable to continue.");
      setFieldErrors(reason.fieldErrors || {});
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setFieldErrors({});
    setSuccess("");
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">DC</div>
        <p className="eyebrow">Distributed chat</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">{mode === "login" ? "Sign in to your workspace." : "Register a new profile."}</p>
        <div className="auth-switch">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Register</button>
        </div>
        <form onSubmit={submit}>
          <label>Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          {fieldErrors.username && <span className="field-error">{fieldErrors.username}</span>}
          <label>Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </label>
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          {mode === "register" && <>
            <label>Confirm password
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
          </>}
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <button className="primary" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
      </section>
    </main>
  );
}
