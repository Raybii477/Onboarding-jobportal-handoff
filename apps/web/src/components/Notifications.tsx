import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { describe, useNotifications, type NotificationTone } from "../lib/notifications";
import { when } from "../lib/format";
import type { AppNotification } from "../lib/types";
import { AlertIcon, BellIcon, CheckIcon, ClockIcon, InboxIcon, RedoIcon, XIcon } from "./icons";

function ToneIcon({ tone }: { tone: NotificationTone }) {
  const Icon = tone === "success" ? CheckIcon : tone === "warning" ? RedoIcon : tone === "danger" ? AlertIcon : ClockIcon;
  return (
    <span className={`tile sm tone-${tone === "info" ? "info" : tone}`}>
      <Icon />
    </span>
  );
}

export function NotificationBell({ onNavy = false }: { onNavy?: boolean }) {
  const { items, unread, error, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = filter === "unread" ? items.filter((n) => !n.read_at) : items;

  function openItem(n: AppNotification) {
    if (!n.read_at) void markRead(n.id);
    setOpen(false);
    navigate(describe(n).href);
  }

  return (
    <div className="bell" ref={ref}>
      <button
        className="icon-btn"
        style={onNavy ? { color: "var(--on-navy)" } : undefined}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
      </button>
      {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}

      {open && (
        <div className="card notif-panel" role="dialog" aria-label="Notifications">
          <div className="panel-head">
            <h2 style={{ fontSize: 17 }}>Notifications</h2>
            <button className="link" onClick={() => void markAllRead()} disabled={!unread}>
              Mark all read
            </button>
          </div>
          <div className="segmented" style={{ margin: "10px 16px" }} role="tablist">
            <button className="seg" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>
              All
            </button>
            <button className="seg" role="tab" aria-selected={filter === "unread"} onClick={() => setFilter("unread")}>
              Unread{unread ? ` ${unread}` : ""}
            </button>
          </div>
          {error && (
            <p className="error-text" style={{ padding: "0 16px 10px" }} role="alert">
              Couldn't load notifications: {error}
            </p>
          )}
          {shown.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }} className="muted">
              <InboxIcon style={{ width: 28, height: 28 }} />
              <p>{filter === "unread" ? "You're all caught up." : "Nothing here yet."}</p>
            </div>
          ) : (
            <ul className="notif-list">
              {shown.map((n) => {
                const d = describe(n);
                return (
                  <li key={n.id}>
                    <a
                      href={d.href}
                      className={`notif-item${n.read_at ? "" : " unread"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        openItem(n);
                      }}
                    >
                      <ToneIcon tone={d.tone} />
                      <span className="grow">
                        <span className="title">
                          {d.title}
                          {!n.read_at && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="text" style={{ display: "block" }}>
                          {d.text}
                        </span>
                        <span className="when" style={{ display: "block" }}>
                          {when(n.created_at)}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast, markRead } = useNotifications();

  // Each toast leaves on its own after a while; hovering doesn't matter
  // because the same item stays in the bell.
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dismissToast(t.id), 9000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((n) => {
        const d = describe(n);
        return (
          <div className="card toast" key={n.id} role="status">
            <ToneIcon tone={d.tone} />
            <div className="grow">
              <div className="title">{d.title}</div>
              <div className="text">{d.text}</div>
              {d.href && (
                <Link
                  to={d.href}
                  className="small"
                  style={{ fontWeight: 600, display: "inline-block", marginTop: 6 }}
                  onClick={() => {
                    void markRead(n.id);
                    dismissToast(n.id);
                  }}
                >
                  {d.tone === "warning" ? "Re-upload now" : "Open"}
                </Link>
              )}
            </div>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => dismissToast(n.id)}>
              <XIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}
