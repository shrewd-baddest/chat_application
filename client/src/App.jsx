import { useEffect, useRef, useState } from "react";
import Login from "./pages/Login.jsx";
import { login } from "./services/api.js";
import { SocketManager } from "./services/socketManager.js";

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("chat-auth")); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState([]);
  const [connection, setConnection] = useState({ status: "offline", serverId: "-" });
  const manager = useRef(null);

  useEffect(() => {
    if (!auth) return;
    manager.current = new SocketManager(auth.token, {
      onState: setConnection,
      onRooms: (nextRooms) => {
        setRooms(nextRooms);
        if (!activeRoom && nextRooms.length) setActiveRoom(nextRooms[0].id);
      },
      onMessage: (message) => setMessages((current) => [...current, message].slice(-500)),
      onRoomAck: (result) => { if (!result.success) console.warn(result.code); },
      onSendAck: (result) => {
        if (result.success) setPending((items) => items.filter((item) => item.clientMessageId !== result.message?.clientMessageId));
        else setPending((items) => items.map((item) => item.clientMessageId === result.clientMessageId ? { ...item, failed: true } : item));
      },
      onAuthError: () => logout()
    });
    manager.current.connect();
    return () => manager.current?.close();
  }, [auth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeRoom) manager.current?.joinRoom(activeRoom);
  }, [activeRoom]);

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

  function logout() {
    manager.current?.close();
    sessionStorage.removeItem("chat-auth");
    setAuth(null);
    setMessages([]);
    setPending([]);
  }

  function sendMessage(event) {
    event.preventEvent?.();
    event.preventDefault();
    if (!draft.trim() || !activeRoom || connection.status !== "connected") return;
    const clientMessageId = crypto.randomUUID();
    const item = { clientMessageId, roomId: activeRoom, content: draft.trim(), failed: false };
    setPending((items) => [...items, item]);
    manager.current?.sendMessage(activeRoom, draft.trim(), clientMessageId);
    setDraft("");
  }

  if (!auth) return <Login onLogin={handleLogin} loading={loading} />;

  const visibleMessages = messages.filter((message) => message.roomId === activeRoom);
  const visiblePending = pending.filter((item) => item.roomId === activeRoom);
  return (
    <main className="chat-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark small">DC</div><div><strong>Distributed Chat</strong><span>{auth.user.username}</span></div></div>
        <div className="room-heading"><span>Rooms</span></div>
        <nav>
          {rooms.map((room) => (
            <button key={room.id} className={activeRoom === room.id ? "room active" : "room"} onClick={() => setActiveRoom(room.id)}>
              <span className="room-icon">#</span><span>{room.name}</span>
            </button>
          ))}
        </nav>
        <button className="logout" onClick={logout}>Sign out</button>
      </aside>

      <section className="chat">
        <header>
          <div>
            <p className="eyebrow">Room</p>
            <h1># {rooms.find((room) => room.id === activeRoom)?.name || activeRoom || "Select a room"}</h1>
          </div>
          <div className={`connection ${connection.status}`}>
            <span className="status-dot"></span>
            <div><strong>{connection.status}</strong><small>{connection.serverId}</small></div>
          </div>
        </header>

        <div className="messages">
          {visibleMessages.length === 0 && visiblePending.length === 0 && (
            <div className="empty"><div className="brand-mark">#</div><h2>No messages yet</h2><p>Start the conversation in this room.</p></div>
          )}
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
          }} placeholder={connection.status === "connected" ? "Write a message..." : "Reconnecting..."} maxLength={2000} />
          <button className="send" disabled={!draft.trim() || connection.status !== "connected"} aria-label="Send message">➤</button>
        </form>
      </section>
    </main>
  );
}
