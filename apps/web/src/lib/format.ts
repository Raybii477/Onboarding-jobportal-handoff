export function initials(nameOrEmail: string | null | undefined): string {
  const s = (nameOrEmail ?? "").trim();
  if (!s) return "?";
  const local = s.includes("@") ? s.split("@")[0] : s;
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function displayName(p: { full_name?: string | null; email?: string | null } | null | undefined): string {
  return p?.full_name?.trim() || p?.email || "Unknown";
}

export function firstName(p: { full_name?: string | null } | null | undefined): string {
  return (p?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatShortDate = (iso: string) => shortFmt.format(new Date(iso));

/** "2h", "1d", "3w" — the compact age shown in the review queue. */
export function age(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

/** "2h ago", "Yesterday 16:12", "Mon 09:12", "12 Nov" — for feeds. */
export function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${Math.round(mins / 60)}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${timeFmt.format(d)}`;
  if (now.getTime() - d.getTime() < 6 * 864e5) {
    return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${timeFmt.format(d)}`;
  }
  return shortFmt.format(d);
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Storage keys keep the bucket policies' folder layout; names are display-only. */
export function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_");
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
