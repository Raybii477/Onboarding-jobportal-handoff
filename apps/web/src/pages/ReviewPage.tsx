import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { DocumentFile, DocumentSubmission, OnboardingCase, SubmissionStatus } from "../lib/types";
import { activeFiles, supersededFiles } from "../lib/types";
import { age, displayName, formatDate, formatFileSize, plural } from "../lib/format";
import { Avatar, Badge, EmptyState, ErrorState, SkeletonRows, SubmissionBadge, submissionMeta } from "../components/ui";
import {
  CheckIcon,
  ChevronRightIcon,
  DocIcon,
  DownloadIcon,
  ExternalIcon,
  FolderIcon,
  HistoryIcon,
  InboxIcon,
  RedoIcon,
  SearchIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../components/icons";

type Case = OnboardingCase & { submissions: DocumentSubmission[] };
type QueueItem = { sub: DocumentSubmission; kase: Case };

const CHECKS = ["Name matches the new hire", "Dated within the last 3 months", "Fully visible and legible"];
const REASONS = ["Scan is cut off", "Document expired", "Name does not match", "Not legible"];

function isImage(f: DocumentFile) {
  return (f.content_type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(f.file_name);
}
function isPdf(f: DocumentFile) {
  return f.content_type === "application/pdf" || /\.pdf$/i.test(f.file_name);
}

async function signedUrl(path: string, download = false) {
  const { data, error } = await supabase.storage
    .from("onboarding-documents")
    .createSignedUrl(path, 600, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export default function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "cases" ? "cases" : "queue";
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase
        .from("onboarding_cases")
        .select("*, profiles!onboarding_cases_new_hire_profile_id_fkey(full_name, email)")
        .order("created_at", { ascending: false }),
      supabase.from("document_submissions").select("*, document_types(*), document_files(*)"),
    ]);
    const err = c.error ?? s.error;
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    const subs = (s.data as DocumentSubmission[]) ?? [];
    setCases(
      ((c.data as OnboardingCase[]) ?? []).map((k) => ({
        ...k,
        submissions: subs
          .filter((x) => x.case_id === k.id)
          .sort((a, b) => (a.document_types?.sort_order ?? 0) - (b.document_types?.sort_order ?? 0)),
      })),
    );
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queue: QueueItem[] = useMemo(
    () =>
      cases
        .flatMap((kase) => kase.submissions.filter((s) => s.status === "submitted").map((sub) => ({ sub, kase })))
        .sort((a, b) => (b.sub.submitted_at ?? "").localeCompare(a.sub.submitted_at ?? "")),
    [cases],
  );

  function setTab(t: "queue" | "cases", extra: Record<string, string> = {}) {
    setParams({ ...(t === "cases" ? { tab: "cases" } : {}), ...extra });
  }

  const active = cases.filter((c) => c.status !== "complete").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Onboarding &amp; document review</h1>
          <p>
            {loading ? "Loading…" : `${plural(active, "active case")} · ${plural(queue.length, "document")} waiting for review`}
          </p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Review" style={{ marginBottom: 20 }}>
        <button className="tab" role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")}>
          To review{queue.length ? ` (${queue.length})` : ""}
        </button>
        <button className="tab" role="tab" aria-selected={tab === "cases"} onClick={() => setTab("cases")}>
          All cases
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} label="Loading onboarding cases" />
      ) : loadError ? (
        <ErrorState title="We couldn't load onboarding cases" message={loadError} onRetry={load} />
      ) : cases.length === 0 ? (
        <EmptyState icon={<FolderIcon />} title="No onboarding cases yet">
          They appear automatically when an application is marked hired in the pipeline.
        </EmptyState>
      ) : tab === "queue" ? (
        <ReviewQueue queue={queue} onDecided={load} onShowCases={() => setTab("cases")} initialDoc={params.get("doc")} />
      ) : (
        <AllCases cases={cases} onReview={(docId) => setTab("queue", { doc: docId })} />
      )}
    </div>
  );
}

/* ---------------- To review: queue · document · decision ---------------- */

function ReviewQueue({
  queue,
  onDecided,
  onShowCases,
  initialDoc,
}: {
  queue: QueueItem[];
  onDecided: () => Promise<void>;
  onShowCases: () => void;
  initialDoc: string | null;
}) {
  const [search, setSearch] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(initialDoc);

  const q = search.trim().toLowerCase();
  const shown = queue.filter(
    ({ sub, kase }) =>
      !q ||
      displayName(kase.profiles).toLowerCase().includes(q) ||
      (kase.profiles?.email ?? "").toLowerCase().includes(q) ||
      (sub.document_types?.name ?? "").toLowerCase().includes(q),
  );

  // Keep a valid selection as the queue changes or the search narrows it.
  useEffect(() => {
    if (!shown.some((i) => i.sub.id === currentId)) setCurrentId(shown[0]?.sub.id ?? null);
  }, [shown, currentId]);

  const current = shown.find((i) => i.sub.id === currentId) ?? null;

  if (queue.length === 0)
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="Nothing waiting for review"
        action={
          <button className="secondary" onClick={onShowCases}>
            Browse all cases
          </button>
        }
      >
        New uploads land here, and you get a notification when one arrives.
      </EmptyState>
    );

  return (
    <div className="review-split">
      <section className="card queue" aria-labelledby="queue-h">
        <div className="panel-head" style={{ paddingBottom: 0, borderBottom: 0 }}>
          <h2 id="queue-h" style={{ fontSize: 17 }}>
            To review
          </h2>
          <span className="muted small">{plural(queue.length, "document")} waiting</span>
        </div>
        <label className="search-field">
          <SearchIcon />
          <span className="sr-only">Search the queue</span>
          <input placeholder="Search name or document" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {shown.length === 0 ? (
          <p className="muted small" style={{ padding: "0 16px 16px" }}>
            No document matches “{search}”.
          </p>
        ) : (
          <ul className="queue-list">
            {shown.map(({ sub, kase }) => {
              const name = displayName(kase.profiles);
              return (
                <li key={sub.id}>
                  <button
                    className="queue-item"
                    aria-current={sub.id === current?.sub.id}
                    onClick={() => setCurrentId(sub.id)}
                  >
                    <Avatar name={name} size="sm" />
                    <span className="grow">
                      <span className="truncate" style={{ display: "block" }}>
                        {name}
                      </span>
                      <span className="doc truncate">{sub.document_types?.name}</span>
                    </span>
                    {sub.submitted_at && <span className="age">{age(sub.submitted_at)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {current ? (
        <>
          <DocumentViewer key={current.sub.id} sub={current.sub} />
          <Decision
            key={`d-${current.sub.id}`}
            item={current}
            onDecided={async () => {
              // Move on to the next document in the queue.
              const i = shown.findIndex((x) => x.sub.id === current.sub.id);
              setCurrentId(shown[i + 1]?.sub.id ?? shown[i - 1]?.sub.id ?? null);
              await onDecided();
            }}
          />
        </>
      ) : (
        <div className="card card-pad muted" style={{ gridColumn: "span 2" }}>
          Pick a document from the queue.
        </div>
      )}
    </div>
  );
}

function DocumentViewer({ sub }: { sub: DocumentSubmission }) {
  const files = activeFiles(sub);
  const history = supersededFiles(sub);
  const [fileId, setFileId] = useState(files[0]?.id ?? null);
  const [zoom, setZoom] = useState(1);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = [...files, ...history].find((f) => f.id === fileId) ?? files[0] ?? null;

  useEffect(() => {
    setUrl(null);
    setError(null);
    setZoom(1);
    if (!file) return;
    signedUrl(file.file_path)
      .then(setUrl)
      .catch((e) => setError(e.message ?? String(e)));
  }, [file?.id]);

  async function download() {
    if (!file) return;
    try {
      window.location.href = await signedUrl(file.file_path, true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!file)
    return (
      <section className="card viewer">
        <div className="viewer-stage">
          <p className="muted">This submission has no files attached.</p>
        </div>
      </section>
    );

  return (
    <section className="card viewer" aria-label={`Preview of ${file.file_name}`}>
      <div className="viewer-bar">
        <span className="file-title">
          <DocIcon style={{ width: 16, height: 16, color: "var(--muted)", flex: "none" }} />
          <strong className="truncate" title={file.file_name}>
            {file.file_name}
          </strong>
          {file.superseded_at && <Badge tone="neutral">Earlier version</Badge>}
        </span>
        {isImage(file) && (
          <>
            <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
              <ZoomOutIcon />
            </button>
            <span className="small muted" style={{ minWidth: 40, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
              <ZoomInIcon />
            </button>
          </>
        )}
        {url && (
          <a className="icon-btn" href={url} target="_blank" rel="noopener" aria-label="Open in a new tab">
            <ExternalIcon />
          </a>
        )}
        <button className="secondary sm" onClick={() => void download()}>
          <DownloadIcon /> Download
        </button>
      </div>

      <div className="viewer-stage">
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : !url ? (
          <span className="skeleton" style={{ width: "70%", height: 420 }} />
        ) : isImage(file) ? (
          <img src={url} alt={file.file_name} style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? "none" : "100%" }} />
        ) : isPdf(file) ? (
          <iframe src={url} title={file.file_name} />
        ) : (
          <div className="state compact">
            <p>No preview for this file type.</p>
            <a className="btn secondary" href={url} target="_blank" rel="noopener">
              <ExternalIcon /> Open file
            </a>
          </div>
        )}
      </div>

      {(files.length > 1 || history.length > 0) && (
        <div className="file-tabs" role="group" aria-label="Files in this submission">
          {files.map((f, i) => (
            <button
              key={f.id}
              className="chip-btn"
              aria-pressed={f.id === file.id}
              onClick={() => setFileId(f.id)}
              title={f.file_name}
            >
              File {i + 1} · {formatFileSize(f.file_size)}
            </button>
          ))}
          {history.map((f) => (
            <button
              key={f.id}
              className="chip-btn"
              aria-pressed={f.id === file.id}
              onClick={() => setFileId(f.id)}
              title={f.file_name}
            >
              <HistoryIcon style={{ width: 14, height: 14 }} /> Earlier · {formatDate(f.uploaded_at)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Decision({ item, onDecided }: { item: QueueItem; onDecided: () => Promise<void> }) {
  const { sub, kase } = item;
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const required = kase.submissions.filter((s) => s.document_types?.required !== false);
  const approved = required.filter((s) => s.status === "approved").length;

  const decide = useCallback(
    async (status: SubmissionStatus) => {
      if (busy) return;
      if (status !== "approved" && !notes.trim()) {
        setError("Add a note so the new hire knows what to fix.");
        document.getElementById("reviewer-notes")?.focus();
        return;
      }
      setBusy(true);
      setError(null);
      const { error: err } = await supabase
        .from("document_submissions")
        .update({ status, reviewer_notes: notes.trim() || null })
        .eq("id", sub.id);
      setBusy(false);
      if (err) setError(err.message);
      else await onDecided();
    },
    [busy, notes, sub.id, onDecided],
  );

  // A approves, R requests a revision — unless the reviewer is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        void decide("approved");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void decide("resubmit_requested");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  function addReason(r: string) {
    setNotes((n) => (n.trim() ? `${n.trim()} ${r}.` : `${r}.`));
  }

  return (
    <section className="card decision decision-card" aria-labelledby="decision-h">
      <div className="stack-sm" style={{ gap: 4 }}>
        <span className="eyebrow">Reviewing</span>
        <h2 id="decision-h" style={{ fontSize: 18 }}>
          {sub.document_types?.name}
        </h2>
        <p className="muted small">
          {displayName(kase.profiles)}
          {sub.submitted_at ? ` · uploaded ${age(sub.submitted_at)} ago` : ""} · {approved} of {required.length} approved
        </p>
      </div>

      <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack-sm">
        <legend className="eyebrow" style={{ marginBottom: 8 }}>
          Checks
        </legend>
        {CHECKS.map((c, i) => (
          <label key={c} className="check">
            <input
              type="checkbox"
              checked={checks[i]}
              onChange={(e) => setChecks((cs) => cs.map((v, j) => (j === i ? e.target.checked : v)))}
            />
            {c}
          </label>
        ))}
      </fieldset>

      <div className="stack-sm">
        <span className="eyebrow">If sending back</span>
        <div className="reason-chips">
          {REASONS.map((r) => (
            <button key={r} type="button" className="chip-btn" onClick={() => addReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="reviewer-notes">
          Reviewer notes
        </label>
        <textarea
          id="reviewer-notes"
          rows={3}
          placeholder="Add a note for the new hire (required when sending back)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className="decision-actions">
        <button disabled={busy} onClick={() => void decide("approved")}>
          <span className="row" style={{ gap: 8 }}>
            <CheckIcon /> Approve
          </span>
          <span className="kbd" aria-hidden="true">
            A
          </span>
        </button>
        <button className="secondary" disabled={busy} onClick={() => void decide("resubmit_requested")}>
          <span className="row" style={{ gap: 8 }}>
            <RedoIcon /> Request revision
          </span>
          <span className="kbd" aria-hidden="true">
            R
          </span>
        </button>
        <button className="danger-outline" disabled={busy} onClick={() => void decide("rejected")}>
          <span className="row" style={{ gap: 8 }}>
            <XIcon /> Reject
          </span>
        </button>
      </div>
      {!checks.every(Boolean) && (
        <p className="muted small">Tick the checks as you go. They're a guide and aren't saved.</p>
      )}
    </section>
  );
}

/* ---------------- All cases: applicant folders ---------------- */

function AllCases({ cases, onReview }: { cases: Case[]; onReview: (docId: string) => void }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = cases.filter(
    (c) =>
      !q ||
      (c.profiles?.full_name ?? "").toLowerCase().includes(q) ||
      (c.profiles?.email ?? "").toLowerCase().includes(q),
  );

  useEffect(() => {
    if (!filtered.some((c) => c.id === selectedId)) setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = filtered.find((c) => c.id === selectedId) ?? null;

  async function open(path: string) {
    window.open(await signedUrl(path), "_blank", "noopener");
  }

  return (
    <div className="case-grid">
      <aside className="card queue" aria-label="Applicants">
        <label className="search-field">
          <SearchIcon />
          <span className="sr-only">Search applicants</span>
          <input placeholder="Search applicants" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <p className="eyebrow" style={{ margin: "0 16px 8px" }}>
          {filtered.length} of {cases.length} applicants
        </p>
        {filtered.length === 0 ? (
          <p className="muted small" style={{ padding: "0 16px 16px" }}>
            No applicant matches “{search}”.
          </p>
        ) : (
          <ul className="folder-list">
            {filtered.map((c) => {
              const name = displayName(c.profiles);
              const waiting = c.submissions.filter((s) => s.status === "submitted").length;
              return (
                <li key={c.id}>
                  <button
                    className="queue-item"
                    aria-current={c.id === selectedId}
                    onClick={() => {
                      setSelectedId(c.id);
                      setOpenDoc(null);
                    }}
                  >
                    <FolderIcon style={{ width: 18, height: 18, flex: "none", color: "var(--muted)" }} />
                    <span className="grow truncate">{name}</span>
                    {c.status === "complete" ? (
                      <CheckIcon style={{ width: 16, height: 16, color: "var(--success-fg)" }} aria-label="Complete" />
                    ) : (
                      waiting > 0 && <span className="badge tone-warning">{waiting}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {selected && (
        <section className="card" aria-label={`Documents for ${displayName(selected.profiles)}`}>
          <div className="panel-head">
            <div className="row">
              <Avatar name={displayName(selected.profiles)} />
              <div>
                <h2 style={{ fontSize: 18 }}>{displayName(selected.profiles)}</h2>
                <p className="muted small">
                  {selected.submissions.filter((s) => s.document_types?.required !== false && s.status === "approved").length} of{" "}
                  {selected.submissions.filter((s) => s.document_types?.required !== false).length} required approved
                </p>
              </div>
            </div>
            <Badge tone={selected.status === "complete" ? "success" : "info"} icon={selected.status === "complete" ? <CheckIcon /> : undefined}>
              {selected.status === "complete" ? "Complete" : "In progress"}
            </Badge>
          </div>
          <div className="doc-list">
            {selected.submissions.map((s) => {
              const meta = submissionMeta(s.status, "staff");
              const files = activeFiles(s);
              const history = supersededFiles(s);
              const expanded = openDoc === s.id;
              return (
                <div key={s.id} className="doc-item">
                  <button className="doc-toggle" aria-expanded={expanded} onClick={() => setOpenDoc(expanded ? null : s.id)}>
                    <span className={`tile sm tone-${meta.tone}`}>
                      <meta.Icon />
                    </span>
                    <span className="grow">
                      <strong>{s.document_types?.name}</strong>
                      {s.document_types?.required === false && <span className="muted"> (optional)</span>}
                      <span className="meta" style={{ marginTop: 2 }}>
                        <span>{files.length ? plural(files.length, "file") : "No files"}</span>
                        {s.submitted_at && <span>Uploaded {formatDate(s.submitted_at)}</span>}
                        {history.length > 0 && <span>{history.length} earlier</span>}
                      </span>
                    </span>
                    <SubmissionBadge status={s.status} audience="staff" />
                    <ChevronRightIcon className="chev" style={{ width: 18, height: 18 }} />
                  </button>
                  {expanded && (
                    <div className="doc-body">
                      {files.length === 0 ? (
                        <p className="muted small">The new hire hasn't uploaded anything yet.</p>
                      ) : (
                        <ul className="file-list">
                          {files.map((f) => (
                            <li key={f.id} className="file-row">
                              <DocIcon className="file-icon" />
                              <button className="link name" onClick={() => void open(f.file_path)}>
                                {f.file_name}
                              </button>
                              <span className="file-meta">{formatFileSize(f.file_size)}</span>
                              <span className="file-meta">{formatDate(f.uploaded_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {history.length > 0 && (
                        <details className="history">
                          <summary>
                            <HistoryIcon /> Previous versions ({history.length})
                          </summary>
                          <ul className="file-list">
                            {history.map((f) => (
                              <li key={f.id} className="file-row superseded">
                                <DocIcon className="file-icon" />
                                <button className="link name" onClick={() => void open(f.file_path)}>
                                  {f.file_name}
                                </button>
                                <span className="file-meta">{formatDate(f.uploaded_at)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {s.reviewer_notes && <p className="small muted">Reviewer note: {s.reviewer_notes}</p>}
                      {s.status === "submitted" && (
                        <button className="sm" style={{ alignSelf: "flex-start" }} onClick={() => onReview(s.id)}>
                          Review now
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
