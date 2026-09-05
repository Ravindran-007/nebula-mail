"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Filters, ComposeState, ThemeMode } from "@/lib/types";
import { MailSummary, MailDetail } from "@/lib/gmail";
import AssistantActions from "@/components/AssistantActions";

const emptyCompose: ComposeState = { to: "", subject: "", body: "" };

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function timeAgo(date: Date | null) {
  if (!date) return "Waiting for sync";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "Synced just now";
  if (seconds < 60) return `Synced ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `Synced ${minutes}m ago`;
}

export default function MailApp() {
  const [view, setView] = useState<View>("inbox");
  const [lastMailboxView, setLastMailboxView] = useState<"inbox" | "sent">("inbox");
  const [filters, setFilters] = useState<Filters>({});
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [compose, setCompose] = useState<ComposeState>(emptyCompose);
  const [sending, setSending] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [relativeSyncTime, setRelativeSyncTime] = useState<string>("Waiting for sync");

  // Load theme preference
  useEffect(() => {
    const saved = (localStorage.getItem("nebula_mail_theme") ||
      localStorage.getItem("postmark_theme")) as ThemeMode | null;
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.setAttribute("data-theme", initial);
    }
  }, []);

  const handleSetTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem("nebula_mail_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  // Check URL parameters for OAuth status
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "success") {
        setToast({ type: "success", message: "Gmail connected successfully! Real emails loaded." });
        window.history.replaceState({}, "", "/");
      } else if (params.get("auth_error")) {
        setToast({
          type: "error",
          message: `Authorization failed (${params.get("auth_error")}). Please reconnect Gmail.`,
        });
        window.history.replaceState({}, "", "/");
      }
    }
  }, []);

  // Update relative sync time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeSyncTime(timeAgo(lastSynced));
    }, 5000);
    return () => clearInterval(interval);
  }, [lastSynced]);

  const refresh = useCallback(
    async (override?: { view?: View; filters?: Filters }) => {
      const targetView = override?.view ?? view;
      const targetFilters = override?.filters ?? filters;
      if (targetView !== "inbox" && targetView !== "sent") return;

      setLoading(true);
      setError("");
      const params = new URLSearchParams({ label: targetView === "sent" ? "SENT" : "INBOX" });
      if (targetFilters.query?.trim()) params.set("query", targetFilters.query.trim());
      if (targetFilters.sender?.trim()) params.set("sender", targetFilters.sender.trim());
      if (targetFilters.afterDays) params.set("afterDays", String(targetFilters.afterDays));
      if (targetFilters.unreadOnly) params.set("unreadOnly", "true");

      try {
        const res = await fetch(`/api/gmail/messages?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Unable to load mail.");
        setMessages(Array.isArray(data) ? data : []);
        setLastSynced(new Date());
        setRelativeSyncTime("Synced just now");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load mail.");
      } finally {
        setLoading(false);
      }
    },
    [view, filters]
  );

  // Background polling every 15 seconds for real-time sync
  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(), 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function openMessage(id: string) {
    setError("");
    setLoading(true);
    try {
      if (view === "inbox" || view === "sent") {
        setLastMailboxView(view);
      }
      const res = await fetch(`/api/gmail/messages?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const detail = await res.json();
      if (!res.ok) throw new Error(detail?.error || "Unable to open email.");
      setSelected(detail);
      setView("detail");

      // Mark locally as read in message list
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, unread: false } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open email.");
    } finally {
      setLoading(false);
    }
  }

  async function sendCompose(overrideCompose?: ComposeState) {
    const payload = overrideCompose || compose;
    if (!payload.to || !payload.subject || !payload.body) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unable to send email.");
      setCompose(emptyCompose);
      setView("sent");
      setLastMailboxView("sent");
      setToast({ type: "success", message: `Email sent to ${payload.to}` });
      await refresh({ view: "sent", filters: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send email.");
    } finally {
      setSending(false);
    }
  }

  const handleDatePresetChange = (preset: "all" | "today" | "7d" | "30d") => {
    let days: number | undefined;
    if (preset === "today") days = 1;
    else if (preset === "7d") days = 7;
    else if (preset === "30d") days = 30;

    const next = { ...filters, datePreset: preset, afterDays: days };
    setFilters(next);
    refresh({ filters: next });
  };

  const handleClearFilters = () => {
    const cleared: Filters = {};
    setFilters(cleared);
    refresh({ filters: cleared });
  };

  const handleInitiateReply = () => {
    if (!selected) return;
    setCompose({
      to: selected.from,
      subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
      body: "",
      inReplyToMessageId: selected.id,
      threadId: selected.threadId,
    });
    setView("compose");
  };

  const handleInitiateForward = () => {
    if (!selected) return;
    const forwardSubject = selected.subject.startsWith("Fwd:")
      ? selected.subject
      : `Fwd: ${selected.subject}`;
    const quoted = `\n\n---------- Forwarded message ---------\nFrom: ${selected.from}\nDate: ${selected.date}\nSubject: ${selected.subject}\nTo: ${selected.to}\n\n${selected.body || selected.preview || ""}`;

    setCompose({
      to: "",
      subject: forwardSubject,
      body: quoted,
      isForward: true,
    });
    setView("compose");
  };

  const title =
    view === "sent"
      ? "Sent Mail"
      : view === "detail"
      ? "Email Message"
      : view === "compose"
      ? "Compose Mail"
      : "Inbox";

  const unreadCount = useMemo(() => messages.filter((m) => m.unread).length, [messages]);

  return (
    <>
      <AssistantActions
        state={{ view, filters, messages, selected, compose, theme }}
        actions={{
          setView,
          setFilters,
          openMessage,
          setCompose,
          sendCompose,
          refresh,
          setTheme: handleSetTheme,
        }}
      />

      <div className="app-shell">
        {/* Navigation Sidebar */}
        <aside className="nav-pane">
          <div className="brand-row">
            <div className="brand">
              Nebula <span>Mail</span>
            </div>
            <div className="brand-dot" />
          </div>
          <div className="brand-subtitle-group">
            <span className="brand-org-pill">Nebula KnowLab</span>
            <p className="brand-tag">AI-powered mail client</p>
          </div>

          <div className="theme-toggle-row">
            <span className="theme-label">Appearance</span>
            <button
              className="theme-btn"
              onClick={() => handleSetTheme(theme === "light" ? "dark" : "light")}
              title="Toggle Dark/Light Mode"
            >
              {theme === "light" ? "🌙 Dark" : "☀ Light"}
            </button>
          </div>

          <button
            className="compose-btn"
            onClick={() => {
              setCompose(emptyCompose);
              setView("compose");
            }}
          >
            <span>＋</span> Compose
          </button>

          <div className="nav-group">
            <p className="nav-label">Mailbox</p>
            <button
              className={`nav-tab ${view === "inbox" ? "active" : ""}`}
              onClick={() => {
                setView("inbox");
                setLastMailboxView("inbox");
              }}
            >
              <span>Inbox</span>
              {unreadCount > 0 && <span className="count-pill">{unreadCount}</span>}
            </button>
            <button
              className={`nav-tab ${view === "sent" ? "active" : ""}`}
              onClick={() => {
                setView("sent");
                setLastMailboxView("sent");
              }}
            >
              <span>Sent</span>
            </button>
          </div>

          {/* Interactive UI Filters Bar */}
          {(view === "inbox" || view === "sent") && (
            <div className="filters-card">
              <div className="filters-heading">
                <span>Smart Filters</span>
                {(filters.query ||
                  filters.sender ||
                  filters.afterDays ||
                  filters.unreadOnly ||
                  filters.datePreset) && (
                  <button onClick={handleClearFilters}>Clear all</button>
                )}
              </div>
              <label>
                Keyword / Subject
                <input
                  value={filters.query || ""}
                  onChange={(e) => {
                    const next = { ...filters, query: e.target.value };
                    setFilters(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") refresh();
                  }}
                  placeholder="e.g. project update, meeting"
                />
              </label>
              <label>
                Sender
                <input
                  value={filters.sender || ""}
                  onChange={(e) => {
                    const next = { ...filters, sender: e.target.value };
                    setFilters(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") refresh();
                  }}
                  placeholder="e.g. Sarah, john@company.com"
                />
              </label>
              <label>
                Date Range
                <select
                  value={filters.datePreset || "all"}
                  onChange={(e) =>
                    handleDatePresetChange(e.target.value as "all" | "today" | "7d" | "30d")
                  }
                >
                  <option value="all">All time</option>
                  <option value="today">Today (last 24h)</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!filters.unreadOnly}
                  onChange={(e) => {
                    const next = { ...filters, unreadOnly: e.target.checked };
                    setFilters(next);
                    refresh({ filters: next });
                  }}
                />
                <span>Unread only</span>
              </label>
            </div>
          )}

          {/* Real-time Sync Indicator Footer */}
          <div className="nav-footer">
            <div className="sync-status">
              <div className={`sync-dot ${loading ? "syncing" : ""}`} />
              <span>{relativeSyncTime}</span>
            </div>
            <button
              className={`refresh-btn ${loading ? "spinning" : ""}`}
              onClick={() => refresh()}
              disabled={loading}
              title="Sync now"
              style={{ width: "26px", height: "26px", fontSize: "12px" }}
            >
              ↻
            </button>
          </div>
        </aside>

        {/* Central Mail List */}
        <section className="list-pane">
          <div className="list-header">
            <div>
              <p className="eyebrow">Mailbox</p>
              <h1>{title}</h1>
            </div>
            <div className="header-actions">
              <button
                className={`refresh-btn ${loading ? "spinning" : ""}`}
                onClick={() => refresh()}
                disabled={loading}
                aria-label="Refresh mail"
              >
                ↻
              </button>
            </div>
          </div>

          {toast && (
            <div className={`toast-banner ${toast.type}`}>
              <span>{toast.message}</span>
              <button onClick={() => setToast(null)}>✕</button>
            </div>
          )}

          {error && (
            <div className="error-banner">
              {error}{" "}
              <a href="/api/gmail/auth" target="_blank" rel="noopener noreferrer">
                Authorize Gmail here →
              </a>
            </div>
          )}

          {(view === "inbox" || view === "sent" || view === "detail") && (
            <div className="mail-list">
              {loading && messages.length === 0 && (
                <div className="empty-state">
                  <div className="spinner" />
                  <span>Fetching latest emails…</span>
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="empty-state">
                  <strong>No messages match your criteria</strong>
                  <span>Try changing filters or ask the AI assistant to search.</span>
                </div>
              )}
              {messages.map((m) => (
                <button
                  key={m.id}
                  className={`mail-item ${m.unread ? "unread" : ""}`}
                  onClick={() => openMessage(m.id)}
                >
                  <div className="mail-avatar">
                    {(m.from || "?").replace(/<.*?>/g, "").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="mail-copy">
                    <div className="mail-topline">
                      <span className="mail-from">{m.from}</span>
                      <span className="mail-date">{formatDate(m.date)}</span>
                    </div>
                    <div className="mail-subject">{m.subject}</div>
                    <div className="mail-preview">{m.preview}</div>
                  </div>
                  {m.unread && <span className="unread-dot" />}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Detail & Compose Pane */}
        <main className="detail-pane">
          {view === "detail" && selected && (
            <article className="message-view">
              <div className="message-toolbar">
                <div className="toolbar-left">
                  <button className="ghost-btn" onClick={() => setView(lastMailboxView)}>
                    ← Back to {lastMailboxView === "sent" ? "Sent" : "Inbox"}
                  </button>
                </div>
                <div className="toolbar-right">
                  <button className="ghost-btn" onClick={handleInitiateReply}>
                    ↩ Reply
                  </button>
                  <button className="ghost-btn" onClick={handleInitiateForward}>
                    ↪ Forward
                  </button>
                </div>
              </div>

              <div className="detail-header">
                <span className="message-chip">
                  {selected.thread?.messages && selected.thread.messages.length > 1
                    ? `CONVERSATION (${selected.thread.messages.length})`
                    : "EMAIL"}
                </span>
                <h2>{selected.subject}</h2>
                <div className="detail-meta">
                  <strong>{selected.from}</strong> → {selected.to} · {formatDate(selected.date)}
                </div>
              </div>

              <div className="detail-body">
                {selected.body || selected.preview || "(empty message)"}
              </div>

              {/* Thread / Conversation View (+3 Bonus) */}
              {selected.thread?.messages && selected.thread.messages.length > 1 && (
                <div className="thread-section">
                  <div className="thread-heading">Conversation Timeline</div>
                  <div className="thread-timeline">
                    {selected.thread.messages.map((threadMsg, idx) => (
                      <div key={threadMsg.id || idx} className="thread-message-card">
                        <div className="thread-header-row">
                          <span className="thread-sender">{threadMsg.from}</span>
                          <span className="thread-date">{formatDate(threadMsg.date)}</span>
                        </div>
                        <div className="thread-body">
                          {threadMsg.body || threadMsg.preview || "(no content)"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-actions-row">
                <button className="reply-btn" onClick={handleInitiateReply}>
                  ↩ Reply to this email
                </button>
                <button className="forward-btn" onClick={handleInitiateForward}>
                  ↪ Forward this email
                </button>
              </div>
            </article>
          )}

          {view === "compose" && (
            <div className="compose-form">
              <div className="compose-heading">
                <div>
                  <p className="eyebrow">
                    {compose.inReplyToMessageId ? "Reply" : compose.isForward ? "Forward" : "New message"}
                  </p>
                  <h2>
                    {compose.inReplyToMessageId
                      ? "Reply to Email"
                      : compose.isForward
                      ? "Forward Email"
                      : "Compose Email"}
                  </h2>
                </div>
                <span className="draft-badge">Draft Active</span>
              </div>

              <label>
                To
                <input
                  className="pulse-highlight"
                  value={compose.to}
                  onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                  placeholder="recipient@example.com"
                  autoFocus
                />
              </label>

              <label>
                Subject
                <input
                  className="pulse-highlight"
                  value={compose.subject}
                  onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                  placeholder="Subject line"
                />
              </label>

              <label>
                Message
                <textarea
                  className="pulse-highlight"
                  value={compose.body}
                  onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                  placeholder="Write your email here..."
                />
              </label>

              <div className="compose-actions">
                <span>The AI assistant can visibly fill or rewrite these fields.</span>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="ghost-btn"
                    onClick={() => {
                      setCompose(emptyCompose);
                      setView(lastMailboxView);
                    }}
                  >
                    Discard
                  </button>
                  <button
                    className="send-btn"
                    disabled={sending || !compose.to || !compose.subject || !compose.body}
                    onClick={() => sendCompose()}
                  >
                    {sending ? "Sending…" : "Send Email"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(view === "inbox" || view === "sent") && (
            <div className="welcome-card">
              <div className="welcome-icon">✦</div>
              <p className="eyebrow">AI-Controlled Mail</p>
              <h2>Tell your mail what to do.</h2>
              <p>
                The AI assistant directly drives this interface. Try asking:
                <br />
                • <em>“Send an email to john@example.com with subject Meeting Tomorrow and body Let’s meet at 3pm”</em>
                <br />
                • <em>“Show me emails from the last 10 days”</em>
                <br />
                • <em>“Show unread emails”</em>
                <br />
                • <em>“Open the latest email from Sarah”</em>
                <br />
                • While viewing an email: <em>“Reply to this”</em> or <em>“Forward this to team@example.com”</em>
              </p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
