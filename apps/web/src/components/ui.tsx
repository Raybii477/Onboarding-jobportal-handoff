import type { ReactNode } from "react";
import type { ApplicationStage, SubmissionStatus } from "../lib/types";
import { STAGE_LABEL } from "../lib/types";
import { initials } from "../lib/format";
import {
  AlertIcon,
  BriefcaseIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  RedoIcon,
  RefreshIcon,
  XIcon,
} from "./icons";

export function BrandMark() {
  return (
    <span className="brand-mark">
      <BriefcaseIcon />
    </span>
  );
}

export function Avatar({
  name,
  size,
}: {
  name: string | null | undefined;
  size?: "sm" | "lg";
}) {
  return (
    <span className={`avatar${size ? ` ${size}` : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

type Tone = "success" | "warning" | "danger" | "info" | "violet" | "neutral";

export function Badge({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={`badge tone-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

/** How a document submission reads, for the new hire and for reviewers. */
export function submissionMeta(status: SubmissionStatus, audience: "hire" | "staff") {
  switch (status) {
    case "approved":
      return { tone: "success" as Tone, label: "Approved", Icon: CheckIcon };
    case "submitted":
      return {
        tone: "info" as Tone,
        label: audience === "hire" ? "In review" : "Pending review",
        Icon: ClockIcon,
      };
    case "resubmit_requested":
      return {
        tone: "warning" as Tone,
        label: audience === "hire" ? "Needs another upload" : "Revision sent",
        Icon: RedoIcon,
      };
    case "rejected":
      return { tone: "danger" as Tone, label: "Rejected", Icon: XIcon };
    default:
      return {
        tone: "neutral" as Tone,
        label: audience === "hire" ? "To do" : "Not uploaded",
        Icon: DocIcon,
      };
  }
}

export function SubmissionBadge({
  status,
  audience,
}: {
  status: SubmissionStatus;
  audience: "hire" | "staff";
}) {
  const m = submissionMeta(status, audience);
  return (
    <Badge tone={m.tone} icon={<m.Icon />}>
      {m.label}
    </Badge>
  );
}

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  const tone: Tone =
    stage === "hired"
      ? "success"
      : stage === "rejected"
        ? "danger"
        : stage === "offer"
          ? "warning"
          : stage === "interview"
            ? "violet"
            : stage === "screening"
              ? "info"
              : "neutral";
  const Icon = stage === "hired" ? CheckIcon : stage === "rejected" ? XIcon : ClockIcon;
  return (
    <Badge tone={tone} icon={<Icon />}>
      {stage === "rejected" ? "Not progressed" : STAGE_LABEL[stage]}
    </Badge>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`state${compact ? " compact" : ""}`}>
      <span className="state-icon">{icon}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** A failed load says so, instead of quietly rendering an empty list. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state error" role="alert">
      <span className="state-icon">
        <AlertIcon />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button className="secondary" onClick={onRetry}>
          <RefreshIcon /> Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="card" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
          <span className="skeleton" style={{ width: 44, height: 44, borderRadius: 12, flex: "none" }} />
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="skeleton" style={{ width: `${55 - i * 6}%`, height: 14 }} />
            <span className="skeleton" style={{ width: `${32 + i * 4}%`, height: 12 }} />
          </span>
          <span className="skeleton" style={{ width: 88, height: 32, flex: "none" }} />
        </div>
      ))}
    </div>
  );
}

export function Banner({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`banner tone-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
