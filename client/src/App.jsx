import { useEffect, useRef, useState } from "react";
import Login from "./pages/Login.jsx";
import Profile from "./pages/Profile.jsx";
import { login, register, getSession, getUsers, getConversationHistory, updateProfile, updatePassword, logout as revokeLogout } from "./services/api.js";
import { SocketManager } from "./services/socketManager.js";

export default function App() {
  const [page, setPage] = useState("chat");
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("chat-auth")); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [activePeer, setActivePeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState([]);
  const [connection, setConnection] = useState({ status: "offline", serverId: "-" });
  const manager = useRef(null);

  useEffect(() => {
    if (!auth) return;
    manager.current = new SocketManager(auth.token, {
      onState: setConnection,
      onMessage: (message) => setMessages((current) => [...current.filter((item) => item.messageId !== message.messageId), message].slice(-500)),
      onRoomAck: (result) => {
        if (result.success && result.conversationId) setMessages((current) => current);
        if (!result.success) console.warn(result.code);
      },
      onSendAck: (result) => {
        if (result.success) {
          if (result.message) setMessages((current) => [...current.filter((item) => item.messageId !== result.message.messageId), result.message].slice(-500));
          setPending((items) => items.filter((item) => item.clientMessageId !== result.message?.clientMessageId));
        } else {
          setPending((items) => items.map((item) => item.clientMessageId === result.clientMessageId ? { ...item, failed: true } : item));
        }
      },
      onAuthError: () => logout()
    });
    manager.current.connect();
    return () => manager.current?.close();
  }, [auth?.token]);

  useEffect(() => {
    if (!auth?.token) return;
    refreshSession();
    const refreshUsers = () => {
      getUsers(auth.token)
        .then((result) => setUsers(Array.isArray(result.users) ? result.users : []))
        .catch(() => setUsers([]));
    };
    refreshUsers();
    const intervalId = window.setInterval(refreshUsers, 10_000);
    return () => window.clearInterval(intervalId);
  }, [auth?.token]);

  useEffect(() => {
    if (!activePeer || !auth?.token) return;
    setMessages([]);
    manager.current?.joinDirectChat(activePeer.id);
    getConversationHistory(auth.token, activePeer.id)
      .then((result) => setMessages(result.messages))
      .catch(() => setMessages([]));
  }, [activePeer?.id]);

  async function handleLogin(username, password) {
    setLoading(true);
    try {
      const result = await login(username, password);
      sessionStorage.setItem("chat-auth", JSON.stringify(result));
      setAuth(result);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(registration) {
    setLoading(true);
    try { return await register(registration); }
    finally { setLoading(false); }
  }

  async function logout() {
    if (auth?.token) await revokeLogout(auth.token).catch(() => {});
    manager.current?.close();
    sessionStorage.removeItem("chat-auth");
    setAuth(null);
    setPage("chat");
    setMessages([]);
    setPending([]);
  }

  async function refreshSession() {
    try {
      const result = await getSession(auth.token);
      const nextAuth = { ...auth, user: result.user };
      setAuth(nextAuth);
      sessionStorage.setItem("chat-auth", JSON.stringify(nextAuth));
    } catch {
      await logout();
    }
  }

  async function saveProfile(profile) {
    const result = await updateProfile(auth.token, profile);
    setAuth((current) => {
      const next = { ...current, user: result.user };
      sessionStorage.setItem("chat-auth", JSON.stringify(next));
      return next;
    });
  }

  async function changePassword(passwords) {
    const result = await updatePassword(auth.token, passwords);
    if (result.sessionRevoked) await logout();
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!draft.trim() || !activePeer || connection.status !== "connected") return;
    const clientMessageId = crypto.randomUUID();
    const item = { clientMessageId, peerId: activePeer.id, content: draft.trim(), failed: false };
    setPending((items) => [...items, item]);
    manager.current?.sendDirectMessage(activePeer.id, draft.trim(), clientMessageId);
    setDraft("");
  }

  if (!auth) return <Login onLogin={handleLogin} onRegister={handleRegister} loading={loading} />;
  if (page === "profile") return <Profile user={auth.user} onUpdate={saveProfile} onPasswordChange={changePassword} onBack={() => setPage("chat")} onLogout={logout} />;

  const visiblePending = pending.filter((item) => item.peerId === activePeer?.id);
  const directConversationId = activePeer
    ? `direct:${[auth.user.id, activePeer.id].sort().join(":")}`
    : null;
  const visibleMessages = activePeer
    ? messages.filter((message) => message.conversationId ? message.conversationId === directConversationId : message.peerId === activePeer.id || message.sender?.id === activePeer.id)
    : [];

  return (
    <main className="chat-shell">
      <header className="topbar">
        <div className="topbar-brand"><div className="brand-mark small">DC</div><strong>Distributed Chat</strong></div>
        <div className="topbar-actions">
          <div className={`connection ${connection.status}`}><span className="status-dot"></span><div><strong>{connection.status}</strong><small>{connection.serverId}</small></div></div>
          <button className="user-menu" onClick={() => setPage("profile")}><span className="top-avatar">{auth.user.username.slice(0, 2).toUpperCase()}</span><span>{auth.user.displayName || auth.user.username}</span></button>
        </div>
      </header>

      <aside className="people-panel">
        <div className="people-heading"><div><p className="eyebrow">Messages</p><h2>People</h2></div><span className="people-count">{users.length}</span></div>
        <div className="people-list">
          {users.map((user) => (
            <button key={user.id} className={activePeer?.id === user.id ? "person active" : "person"} onClick={() => setActivePeer(user)}>
              <span className="person-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
              <span className="person-details"><strong>{user.displayName || user.username}</strong><small>Direct message</small></span>
            </button>
          ))}
          {users.length === 0 && <div className="people-empty">Registered users will appear here.</div>}
        </div>
      </aside>

      <section className="conversation">
        {activePeer ? (
          <>
            <header className="conversation-header">
              <span className="person-avatar large">{activePeer.username.slice(0, 2).toUpperCase()}</span>
              <div><p className="eyebrow">Direct message</p><h1>{activePeer.displayName || activePeer.username}</h1></div>
            </header>
            <div className="messages">
              {visibleMessages.length === 0 && visiblePending.length === 0 && <div className="empty"><div className="brand-mark">HI</div><h2>Start a conversation</h2><p>Send a private message to {activePeer.username}.</p></div>}
              {visibleMessages.map((message) => (
                <article key={message.messageId} className={message.sender.id === auth.user.id ? "message mine" : "message"}>
                  <div className="avatar">{message.sender.username.slice(0, 2).toUpperCase()}</div>
                  <div><div className="message-meta"><strong>{message.sender.username}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.content}</p></div>
                </article>
              ))}
              {visiblePending.map((item) => (
                <article key={item.clientMessageId} className="message mine pending"><div className="avatar">{auth.user.username.slice(0, 2).toUpperCase()}</div><div><div className="message-meta"><strong>{auth.user.username}</strong><time>{item.failed ? "Failed" : "Pending"}</time></div><p>{item.content}</p></div></article>
              ))}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) sendMessage(event);
              }} placeholder={`Message ${activePeer.username}`} maxLength={2000} />
              <button className="send" disabled={!draft.trim() || connection.status !== "connected"} aria-label="Send message">➤</button>
            </form>
          </>
        ) : (
          <div className="empty conversation-empty"><div className="brand-mark">DC</div><h2>Select a person</h2><p>Choose someone from the left to start a direct chat.</p></div>
        )}
      </section>
    </main>
  );
}
