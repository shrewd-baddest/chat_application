import { useState } from "react";

export default function Profile({ user, onUpdate, onPasswordChange, onBack, onLogout }) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("chat-notifications") !== "off");
  const [sound, setSound] = useState(() => localStorage.getItem("chat-sound") !== "off");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await onUpdate({ displayName, email });
      setMessage("Profile saved.");
    } catch (reason) {
      setError(reason.message || "Unable to save profile.");
    }
  }

  async function changePassword(event) {
    event.preventEvent?.();
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await onPasswordChange({ currentPassword, newPassword, confirmPassword });
      setMessage("Password changed. Please sign in again.");
    } catch (reason) {
      setError(reason.message || "Unable to change password.");
    }
  }

  function updateSetting(name, value) {
    if (name === "notifications") {
      setNotifications(value);
      localStorage.setItem("chat-notifications", value ? "on" : "off");
    } else {
      setSound(value);
      localStorage.setItem("chat-sound", value ? "on" : "off");
    }
  }

  return (
    <main className="profile-shell">
      <section className="profile-card">
        <button type="button" className="back-button" onClick={onBack}>← Back to chat</button>
        <div className="profile-header">
          <div className="profile-avatar">{(user?.displayName || user?.username || "U").slice(0, 2).toUpperCase()}</div>
          <div><h1>Profile & settings</h1><p>@{user?.username}</p></div>
        </div>
        <form onSubmit={submit}>
          <label>Username<input value={user?.username || ""} disabled /></label>
          <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {error && <div className="form-error">{error}</div>}
          {message && <div className="form-success">{message}</div>}
          <button className="primary" type="submit">Save profile</button>
          <button className="danger-button" type="button" onClick={onLogout}>Sign out</button>
        </form>
        <form onSubmit={changePassword} className="password-form">
          <h2>Security</h2>
          <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          <button className="primary" type="submit">Change password</button>
        </form>
        <div className="settings-list">
          <h2>Settings</h2>
          <label><input type="checkbox" checked={notifications} onChange={(event) => updateSetting("notifications", event.target.checked)} /> Browser notifications</label>
          <label><input type="checkbox" checked={sound} onChange={(event) => updateSetting("sound", event.target.checked)} /> Notification sound</label>
        </div>
      </section>
    </main>
  );
}
