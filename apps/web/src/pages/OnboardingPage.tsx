import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { DocumentFile, DocumentSubmission, OnboardingCase } from "../lib/types";
import { activeFiles, supersededFiles } from "../lib/types";
import { errorMessage, firstName, formatDate, formatFileSize, plural, safeFileName } from "../lib/format";
import { Badge, EmptyState, ErrorState, SkeletonRows, SubmissionBadge, submissionMeta } from "../components/ui";
import {
  AlertIcon,
  CameraIcon,
  ClipboardIcon,
  DocIcon,
  HistoryIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
} from "../components/icons";

function ProgressRing({ percent }: { percent: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <div className="progress-ring" role="img" aria-label={`${percent}% of required documents approved`}>
      <svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true">
        <circle className="track" cx="84" cy="84" r={r} strokeWidth="14" fill="none" />
        <circle
          className="bar"
          cx="84"
          cy="84"
          r={r}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <span className="pct" aria-hidden="true">
        {percent}%
      </span>
    </div>
  );
}

const needsAction = (s: DocumentSubmission) =>
  s.status === "pending" || s.status === "rejected" || s.status === "resubmit_requested";

export default function OnboardingPage() {
  const { session, profile } = useAuth();
  const [onboardingCase, setCase] = useState<OnboardingCase | null>(null);
  const [submissions, setSubmissions] = useState<DocumentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // A failed upload keeps its files so "Try again" doesn't make the
  // new hire pick them a second time.
  const [failed, setFailed] = useState<Record<string, { files: File[]; message: string }>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    if (!session) return;
    const { data: c, error: caseErr } = await supabase
      .from("onboarding_cases")
      .select("*")
      .eq("new_hire_profile_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (caseErr) {
      setLoadError(caseErr.message);
      setLoading(false);
      return;
    }
    setCase(c as OnboardingCase | null);
    if (c) {
      const { data: subs, error: subErr } = await supabase
        .from("document_submissions")
        .select("*, document_types(*), document_files(*)")
        .eq("case_id", c.id);
      if (subErr) {
        setLoadError(subErr.message);
        setLoading(false);
        return;
      }
      const list = (subs as DocumentSubmission[]) ?? [];
      list.sort((a, b) => (a.document_types?.sort_order ?? 0) - (b.document_types?.sort_order ?? 0));
      setSubmissions(list);
    }
    setLoadError(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Storage keys stay inside {case_id}/{document_type_id}/ for the bucket
  // policies; the original name is kept on the row for display.
  function storageKey(s: DocumentSubmission, file: File, i: number) {
    return `${s.case_id}/${s.document_type_id}/${Date.now()}-${i}-${safeFileName(file.name)}`;
  }

  async function upload(s: DocumentSubmission, files: File[]) {
    if (!session || files.length === 0) return;
    setBusyId(s.id);
    setActionError(null);
    setFailed(({ [s.id]: _dropped, ...rest }) => rest);
    try {
      const uploaded: { path: string; file: File }[] = [];
      for (const [i, file] of files.entries()) {
        const path = storageKey(s, file, i);
        const { error } = await supabase.storage.from("onboarding-documents").upload(path, file);
        if (error) throw error;
        uploaded.push({ path, file });
      }
      const { error: insertError } = await supabase.from("document_files").insert(
        uploaded.map(({ path, file }) => ({
          submission_id: s.id,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
          uploaded_by: session.user.id,
        })),
      );
      if (insertError) throw insertError;
      // Flipping the submission last is what retires the previous attempt
      // (the retire_previous_attempt trigger). A row already under review is
      // closed to the new hire by RLS; the files above are enough.
      if (s.status !== "submitted") {
        const { error } = await supabase.from("document_submissions").update({ status: "submitted" }).eq("id", s.id);
        if (error) throw error;
      }
      await load();
    } catch (err) {
      setFailed((f) => ({ ...f, [s.id]: { files, message: errorMessage(err) } }));
    } finally {
      setBusyId(null);
    }
  }

  async function removeFile(s: DocumentSubmission, file: DocumentFile) {
    setBusyId(s.id);
    setActionError(null);
    try {
      const { error } = await supabase.from("document_files").delete().eq("id", file.id);
      if (error) throw error;
      await supabase.storage.from("onboarding-documents").remove([file.file_path]);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("onboarding-documents").createSignedUrl(path, 300);
    if (error) setActionError(error.message);
    else if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  if (loading)
    return (
      <div className="container page">
        <SkeletonRows rows={5} label="Loading your checklist" />
      </div>
    );
  if (loadError)
    return (
      <div className="container page">
        <ErrorState title="We couldn't load your checklist" message={loadError} onRetry={load} />
      </div>
    );
  if (!onboardingCase)
    return (
      <div className="container page">
        <EmptyState icon={<ClipboardIcon />} title="Your onboarding starts soon">
          Your checklist appears here as soon as your offer is marked as hired. We'll email you when it's ready.
        </EmptyState>
      </div>
    );

  const required = submissions.filter((s) => s.document_types?.required !== false);
  const approved = required.filter((s) => s.status === "approved").length;
  const percent = required.length ? Math.round((approved / required.length) * 100) : 0;
  const inReview = submissions.filter((s) => s.status === "submitted").length;
  const toDo = required.filter(needsAction).length;
  const optional = submissions.filter((s) => s.document_types?.required === false).length;
  const pending = required.length - approved;
  const nextUp = submissions.find(needsAction);
  const name = firstName(profile);

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Welcome to the team{name ? `, ${name}` : ""}.</h1>
          <p>Upload the documents below so we can finish your onboarding. We email you as soon as each one is reviewed.</p>
        </div>
      </div>

      <div className="onboarding-grid">
        <section className="card progress-card" aria-labelledby="progress-h">
          <ProgressRing percent={percent} />
          <div className="stack-sm" style={{ alignItems: "inherit" }}>
            <h2 id="progress-h">
              {onboardingCase.status === "complete"
                ? "All done"
                : percent >= 40
                  ? "Almost there"
                  : percent > 0
                    ? "Good progress"
                    : "Let's get started"}
            </h2>
            <p className="muted">
              {approved} of {required.length} required documents approved
            </p>
          </div>
          <ul className="legend">
            <li>
              <span className="swatch" style={{ background: "#10B981" }} />
              Approved <span className="n">{submissions.filter((s) => s.status === "approved").length}</span>
            </li>
            <li>
              <span className="swatch" style={{ background: "#6366F1" }} />
              In review <span className="n">{inReview}</span>
            </li>
            <li>
              <span className="swatch" style={{ background: "#F59E0B" }} />
              Needs your action <span className="n">{toDo}</span>
            </li>
            {optional > 0 && (
              <li>
                <span className="swatch" style={{ background: "#CBD5E1" }} />
                Optional <span className="n">{optional}</span>
              </li>
            )}
          </ul>
        </section>

        <section className="card" aria-labelledby="checklist-h">
          <div className="panel-head">
            <h2 id="checklist-h">Onboarding checklist</h2>
            {onboardingCase.status === "complete" ? (
              <Badge tone="success">Complete</Badge>
            ) : (
              <Badge tone={pending ? "warning" : "success"}>{plural(pending, "task")} pending</Badge>
            )}
          </div>
          {actionError && (
            <p className="error-text" role="alert" style={{ padding: "12px 24px 0" }}>
              {actionError}
            </p>
          )}
          <div className="checklist">
            {submissions.map((s) => {
              const meta = submissionMeta(s.status, "hire");
              const current = activeFiles(s);
              const history = supersededFiles(s);
              const sentBack = s.status === "resubmit_requested" || s.status === "rejected";
              const canAttach = s.status !== "approved";
              const fail = failed[s.id];
              const busy = busyId === s.id;
              const label =
                s.status === "pending" ? "Upload" : s.status === "submitted" ? "Add file" : "Re-upload";
              return (
                <div key={s.id} className={`check-item${sentBack ? " attention" : ""}`} id={`doc-${s.id}`}>
                  <div className="check-row">
                    <span className={`tile sm tone-${meta.tone}`}>
                      <meta.Icon />
                    </span>
                    <div className="grow">
                      <strong>{s.document_types?.name}</strong>
                      {s.document_types?.required === false && <span className="muted"> (optional)</span>}
                      <p className="desc">{s.document_types?.description}</p>
                    </div>
                    <div className="upload-actions">
                      {s.status !== "pending" && <SubmissionBadge status={s.status} audience="hire" />}
                      {canAttach && (
                        <>
                          <label className={`btn sm upload-label${s.status === "pending" ? " secondary" : ""}`}>
                            <UploadIcon /> {busy ? "Uploading…" : label}
                            <input
                              type="file"
                              multiple
                              disabled={busyId !== null}
                              aria-label={`${label}: ${s.document_types?.name}`}
                              onChange={(e) => {
                                const picked = Array.from(e.target.files ?? []);
                                e.target.value = "";
                                if (picked.length) void upload(s, picked);
                              }}
                            />
                          </label>
                          <label className="btn sm ghost upload-label" title="Scan with your camera">
                            <CameraIcon />
                            <span className="sr-only">Scan {s.document_types?.name} with camera</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              disabled={busyId !== null}
                              onChange={(e) => {
                                const picked = Array.from(e.target.files ?? []);
                                e.target.value = "";
                                if (picked.length) void upload(s, picked);
                              }}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </div>

                  {sentBack && s.reviewer_notes && (
                    <p className="reviewer-note">
                      <AlertIcon /> Reviewer note: {s.reviewer_notes}
                    </p>
                  )}

                  {fail && (
                    <div className="banner tone-danger" role="alert" style={{ marginLeft: 0 }}>
                      <AlertIcon />
                      <span className="grow">
                        <strong>That upload did not finish.</strong> Your file was not saved. {fail.message}
                      </span>
                      <button className="sm secondary" disabled={busyId !== null} onClick={() => void upload(s, fail.files)}>
                        <RefreshIcon /> Try again
                      </button>
                    </div>
                  )}

                  {current.length > 0 && (
                    <ul className="file-list">
                      {current.map((f) => (
                        <li key={f.id} className="file-row">
                          <DocIcon className="file-icon" />
                          <button className="link name" onClick={() => void openFile(f.file_path)}>
                            {f.file_name}
                          </button>
                          <span className="file-meta">{formatFileSize(f.file_size)}</span>
                          {canAttach && current.length > 1 && (
                            <button
                              className="icon-btn"
                              style={{ width: 32, height: 32 }}
                              aria-label={`Remove ${f.file_name}`}
                              disabled={busyId !== null}
                              onClick={() => void removeFile(s, f)}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {history.length > 0 && (
                    <details className="history">
                      <summary>
                        <HistoryIcon /> {plural(history.length, "earlier upload")}
                      </summary>
                      <ul className="file-list">
                        {history.map((f) => (
                          <li key={f.id} className="file-row superseded">
                            <DocIcon className="file-icon" />
                            <button className="link name" onClick={() => void openFile(f.file_path)}>
                              {f.file_name}
                            </button>
                            <span className="file-meta">{formatDate(f.uploaded_at)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Phones: one big button that scans straight into the next item due. */}
      {nextUp && (
        <div className="scan-next">
          <label className="btn lg block upload-label">
            <CameraIcon /> Scan next document
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busyId !== null}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (picked.length) {
                  document.getElementById(`doc-${nextUp.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  void upload(nextUp, picked);
                }
              }}
            />
          </label>
          <span className="muted small">Next up: {nextUp.document_types?.name}</span>
        </div>
      )}
    </div>
  );
}
