import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  DocumentSubmission,
  OnboardingCase,
  SubmissionStatus,
} from "../lib/types";
import { activeFiles, formatFileSize, supersededFiles } from "../lib/types";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  DocIcon,
  FolderIcon,
  HistoryIcon,
  RedoIcon,
  SearchIcon,
} from "../components/icons";

type CaseWithSubs = OnboardingCase & { submissions: DocumentSubmission[] };

function tileFor(status: SubmissionStatus) {
  switch (status) {
    case "approved":
      return (
        <span className="icon-tile tint-emerald">
          <CheckIcon />
        </span>
      );
    case "submitted":
      return (
        <span className="icon-tile tint-amber">
          <ClockIcon />
        </span>
      );
    case "rejected":
    case "resubmit_requested":
      return (
        <span className="icon-tile tint-red">
          <RedoIcon />
        </span>
      );
    default:
      return (
        <span className="icon-tile tint-slate">
          <DocIcon />
        </span>
      );
  }
}

function initials(nameOrEmail: string) {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return nameOrEmail.slice(0, 2);
}

function displayName(c: OnboardingCase) {
  return c.profiles?.full_name || c.profiles?.email || "Unnamed applicant";
}

export default function ReviewPage() {
  const [cases, setCases] = useState<CaseWithSubs[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  async function load() {
    const { data: caseRows, error: caseError } = await supabase
      .from("onboarding_cases")
      .select("*, profiles!onboarding_cases_new_hire_profile_id_fkey(full_name, email)")
      .order("created_at", { ascending: false });
    if (caseError) {
      setError(caseError.message);
      setLoading(false);
      return;
    }
    const { data: subRows } = await supabase
      .from("document_submissions")
      .select("*, document_types(*), document_files(*)");
    const subs = (subRows as DocumentSubmission[]) ?? [];
    setCases(
      ((caseRows as OnboardingCase[]) ?? []).map((c) => ({
        ...c,
        submissions: subs
          .filter((s) => s.case_id === c.id)
          .sort(
            (a, b) =>
              (a.document_types?.sort_order ?? 0) -
              (b.document_types?.sort_order ?? 0),
          ),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => {
      const name = c.profiles?.full_name?.toLowerCase() ?? "";
      const email = c.profiles?.email?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q);
    });
  }, [cases, search]);

  // Keep a valid selection as the filter narrows the list.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
    } else if (!filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((c) => c.id === selectedId) ?? null;

  async function decide(submission: DocumentSubmission, status: SubmissionStatus) {
    setError(null);
    const { error } = await supabase
      .from("document_submissions")
      .update({ status, reviewer_notes: notes[submission.id] || null })
      .eq("id", submission.id);
    if (error) setError(error.message);
    else await load();
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage
      .from("onboarding-documents")
      .createSignedUrl(path, 300);
    if (error) setError(error.message);
    else if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function pendingCount(c: CaseWithSubs) {
    return c.submissions.filter((s) => s.status === "submitted").length;
  }

  if (loading) return <p className="muted">Loading…</p>;

  const activeCases = cases.filter((c) => c.status !== "complete").length;

  return (
    <div>
      <div className="page-head">
        <h1>Onboarding &amp; Document Review</h1>
        <p>
          {activeCases} active case{activeCases === 1 ? "" : "s"}
        </p>
      </div>
      {error && <p className="error">{error}</p>}

      {cases.length === 0 ? (
        <div className="empty">
          No onboarding cases yet — they appear automatically when an
          application is marked hired.
        </div>
      ) : (
        <div className="explorer">
          <aside className="explorer-sidebar">
            <div className="explorer-search">
              <SearchIcon />
              <input
                placeholder="Search applicants…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="explorer-count muted">
              {filtered.length} of {cases.length} applicant
              {cases.length === 1 ? "" : "s"}
            </p>
            <ul className="plain folder-list">
              {filtered.map((c) => {
                const waiting = pendingCount(c);
                return (
                  <li key={c.id}>
                    <button
                      className={`folder${c.id === selectedId ? " selected" : ""}`}
                      onClick={() => {
                        setSelectedId(c.id);
                        setOpenDocId(null);
                      }}
                    >
                      <FolderIcon className="folder-icon" />
                      <span className="grow folder-name">{displayName(c)}</span>
                      {waiting > 0 && <span className="pill-count">{waiting}</span>}
                      <ChevronRightIcon className="folder-chevron" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length === 0 && (
              <p className="muted explorer-empty">No applicant matches “{search}”.</p>
            )}
          </aside>

          <section className="explorer-main">
            {!selected ? (
              <div className="empty">Select an applicant to see their documents.</div>
            ) : (
              <>
                <nav className="breadcrumb">
                  <span>Applicants</span>
                  <ChevronRightIcon />
                  <strong>{displayName(selected)}</strong>
                </nav>

                <div className="case-head">
                  <span className="avatar">{initials(displayName(selected))}</span>
                  <div className="grow">
                    <h2>{displayName(selected)}</h2>
                    <span className="muted">
                      {(() => {
                        const required = selected.submissions.filter(
                          (s) => s.document_types?.required !== false,
                        );
                        const approved = required.filter(
                          (s) => s.status === "approved",
                        ).length;
                        return `Documents: ${approved} / ${required.length} approved`;
                      })()}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      selected.status === "complete"
                        ? "status-complete"
                        : "status-in_progress"
                    }`}
                  >
                    {selected.status === "complete" ? "Complete" : "In progress"}
                  </span>
                </div>

                <ul className="plain doc-list">
                  {selected.submissions.map((s) => {
                    const current = activeFiles(s);
                    const history = supersededFiles(s);
                    const expanded = openDocId === s.id;
                    return (
                      <li key={s.id} className="doc-item">
                        <button
                          className={`doc-row${expanded ? " expanded" : ""}`}
                          onClick={() => setOpenDocId(expanded ? null : s.id)}
                        >
                          {tileFor(s.status)}
                          <div className="grow">
                            <strong>{s.document_types?.name}</strong>
                            {s.document_types?.required === false && (
                              <span className="muted"> (optional)</span>
                            )}
                            <div className="meta">
                              <span>
                                {current.length === 0
                                  ? "No files"
                                  : `${current.length} file${current.length === 1 ? "" : "s"}`}
                              </span>
                              {s.submitted_at && (
                                <span>
                                  Uploaded{" "}
                                  {new Date(s.submitted_at).toLocaleDateString()}
                                </span>
                              )}
                              {history.length > 0 && (
                                <span>{history.length} earlier</span>
                              )}
                            </div>
                          </div>
                          <span className={`badge status-${s.status}`}>
                            {s.status === "submitted" ? "Pending review" : s.status}
                          </span>
                          <ChevronRightIcon
                            className={`doc-chevron${expanded ? " open" : ""}`}
                          />
                        </button>

                        {expanded && (
                          <div className="doc-body">
                            {current.length === 0 ? (
                              <p className="muted">
                                The new hire hasn't uploaded anything yet.
                              </p>
                            ) : (
                              <ul className="file-list">
                                {current.map((f) => (
                                  <li key={f.id} className="file-row">
                                    <DocIcon className="file-icon" />
                                    <button
                                      className="link grow"
                                      onClick={() => openFile(f.file_path)}
                                    >
                                      {f.file_name}
                                    </button>
                                    <span className="muted file-meta">
                                      {formatFileSize(f.file_size)}
                                    </span>
                                    <span className="muted file-meta file-date">
                                      {new Date(f.uploaded_at).toLocaleDateString()}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {history.length > 0 && (
                              <details className="file-history">
                                <summary>
                                  <HistoryIcon /> Previous versions ({history.length})
                                </summary>
                                <ul className="file-list">
                                  {history.map((f) => (
                                    <li key={f.id} className="file-row superseded">
                                      <DocIcon className="file-icon" />
                                      <button
                                        className="link grow"
                                        onClick={() => openFile(f.file_path)}
                                      >
                                        {f.file_name}
                                      </button>
                                      <span className="muted file-meta">
                                        {new Date(f.uploaded_at).toLocaleDateString()}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}

                            {s.reviewer_notes && (
                              <p className="reviewer-note">
                                Reviewer notes: {s.reviewer_notes}
                              </p>
                            )}

                            {s.status === "submitted" && (
                              <div className="review-actions">
                                <input
                                  placeholder="Reviewer notes (required when sending back)"
                                  value={notes[s.id] ?? ""}
                                  onChange={(e) =>
                                    setNotes({ ...notes, [s.id]: e.target.value })
                                  }
                                />
                                <div className="actions">
                                  <button onClick={() => decide(s, "approved")}>
                                    <CheckIcon /> Approve
                                  </button>
                                  <button
                                    className="danger-outline"
                                    onClick={() => decide(s, "resubmit_requested")}
                                  >
                                    Request Revision
                                  </button>
                                  <button
                                    className="outline"
                                    onClick={() => decide(s, "rejected")}
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
