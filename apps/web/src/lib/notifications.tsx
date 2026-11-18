import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { errorMessage } from "./format";
import type { AppNotification } from "./types";
import { STAGE_LABEL, type ApplicationStage } from "./types";

export type NotificationTone = "success" | "warning" | "danger" | "info";

export interface Described {
  title: string;
  text: string;
  href: string;
  tone: NotificationTone;
}

/** One readable line per event, for the bell, the toasts, and the email
 *  subjects' in-app twin. Payloads carry their display names. */
export function describe(n: AppNotification): Described {
  const p = n.payload ?? {};
  const posting = p.posting_title || "your application";
  switch (n.type) {
    case "application_received":
      return {
        title: "Application received",
        text: `We received your application for ${posting}.`,
        href: "/applications",
        tone: "info",
      };
    case "stage_changed": {
      const to = (p.to_stage ?? "applied") as ApplicationStage;
      if (to === "rejected")
        return {
          title: "Application update",
          text: `${posting}: we won't be moving forward this time.`,
          href: "/applications",
          tone: "danger",
        };
      if (to === "hired")
        return {
          title: "You're hired",
          text: `Congratulations on the ${posting} role.`,
          href: "/onboarding",
          tone: "success",
        };
      return {
        title: "Application update",
        text: `${posting} moved to ${STAGE_LABEL[to] ?? to}.`,
        href: "/applications",
        tone: "info",
      };
    }
    case "onboarding_created":
      return {
        title: "Welcome aboard",
        text: "Your onboarding checklist is ready.",
        href: "/onboarding",
        tone: "success",
      };
    case "document_decision": {
      const doc = p.document_name || "A document";
      if (p.decision === "approved")
        return {
          title: "Document approved",
          text: `Your ${doc} was approved.`,
          href: "/onboarding",
          tone: "success",
        };
      if (p.decision === "resubmit_requested")
        return {
          title: "Revision requested",
          text: p.reviewer_notes ? `${doc}: ${p.reviewer_notes}` : `${doc} needs another upload.`,
          href: "/onboarding",
          tone: "warning",
        };
      return {
        title: "Document rejected",
        text: p.reviewer_notes ? `${doc}: ${p.reviewer_notes}` : `${doc} was not accepted.`,
        href: "/onboarding",
        tone: "danger",
      };
    }
    case "case_complete":
      return {
        title: "Case complete",
        text: `${p.new_hire_name || "A new hire"} finished onboarding. All required documents approved.`,
        href: "/review?tab=cases",
        tone: "success",
      };
    case "new_application":
      return {
        title: "New application",
        text: `${p.applicant_name || "Someone"} applied for ${p.posting_title || "a role"}.`,
        href: "/pipeline",
        tone: "info",
      };
    case "document_submitted":
      return {
        title: "New document uploaded",
        text: `${p.new_hire_name || "A new hire"} uploaded ${p.document_name || "a document"}.`,
        href: p.submission_id ? `/review?doc=${p.submission_id}` : "/review",
        tone: "info",
      };
    case "staff_message":
      return {
        title: p.subject || "Message from the hiring team",
        text: p.message || "",
        href: "/applications",
        tone: "info",
      };
  }
}

interface NotificationsState {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  error: string | null;
  toasts: AppNotification[];
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<NotificationsState>({
  items: [],
  unread: 0,
  loading: false,
  error: null,
  toasts: [],
  markRead: async () => {},
  markAllRead: async () => {},
  dismissToast: () => {},
  reload: async () => {},
});

const SEEN_KEY = "toasts-seen";
const TOAST_ON_LOAD_TYPES = new Set(["document_decision", "onboarding_created", "stage_changed", "staff_message"]);

function seenIds(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function rememberSeen(ids: string[]) {
  try {
    const s = seenIds();
    ids.forEach((id) => s.add(id));
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
    // Without storage a toast may repeat on reload; harmless.
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, isStaff } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const isStaffRef = useRef(isStaff);
  isStaffRef.current = isStaff;

  const pushToasts = useCallback((list: AppNotification[]) => {
    if (!list.length) return;
    rememberSeen(list.map((n) => n.id));
    setToasts((t) => [...list, ...t].slice(0, 3));
  }, []);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("notifications")
      .select("id, user_id, type, payload, created_at, read_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    const list = (data as AppNotification[]) ?? [];
    setItems(list);

    // A new hire returning to the app sees what happened while away, once.
    if (!isStaffRef.current) {
      const seen = seenIds();
      const fresh = list.filter(
        (n) =>
          !n.read_at &&
          !seen.has(n.id) &&
          TOAST_ON_LOAD_TYPES.has(n.type) &&
          Date.now() - new Date(n.created_at).getTime() < 3 * 864e5,
      );
      pushToasts(fresh.slice(0, 3));
    }
  }, [userId, pushToasts]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setToasts([]);
      return;
    }
    void reload();
    // RLS limits the stream to the subscriber's own rows.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (msg) => {
          const n = msg.new as AppNotification;
          setItems((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list]));
          pushToasts([n]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, reload, pushToasts]);

  async function markRead(id: string) {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
    const { error: err } = await supabase.from("notifications").update({ read_at: now }).eq("id", id);
    if (err) setError(errorMessage(err));
  }

  async function markAllRead() {
    if (!userId) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error: err } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
    if (err) setError(errorMessage(err));
  }

  function dismissToast(id: string) {
    setToasts((t) => t.filter((n) => n.id !== id));
  }

  return (
    <Ctx.Provider
      value={{
        items,
        unread: items.filter((n) => !n.read_at).length,
        loading,
        error,
        toasts,
        markRead,
        markAllRead,
        dismissToast,
        reload,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useNotifications = () => useContext(Ctx);
