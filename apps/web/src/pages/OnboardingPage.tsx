import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { DocumentFile, DocumentSubmission, OnboardingCase } from "../lib/types";
import { activeFiles, formatFileSize, supersededFiles } from "../lib/types";
import {
  CheckIcon,
  ClockIcon,
  DocIcon,
  HistoryIcon,
  RedoIcon,
  TrashIcon,
  UploadIcon,
} from "../components/icons";

function ProgressRing({ percent }: { percent: number }) {
  const r = 66;
  const c = 2 * Math.PI * r;
  return (
    <div className="progress-ring">
      <svg width="160" height="160">
        <circle cx="80" cy="80" r={r} stroke="#e2e8f0" strokeWidth="12" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={r}
          stroke="#6366f1"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <span className="pct">{percent}%</span>
    </div>
  );
}

function statusDot(status: DocumentSubmission["status"]) {
  switch (status) {
    case "approved":
      return (
        <span className="check-dot done">
          <CheckIcon />
        </span>
      );
    case "submitted":
      return (
        <span className="check-dot waiting">
          <ClockIcon />
        </span>
      );
    case "rejected":
    case "resubmit_requested":
      return (
        <span className="check-dot redo">
          <RedoIcon />
        </span>
      );
    default:
      return (
        <span className="check-dot todo">
          <DocIcon />
        </span>
      );
  }
}

export default function OnboardingPage() {
  const { session, profile } = useAuth();
  const [onboardingCase, setCase] = useState<OnboardingCase | null>(null);
  const [submissions, setSubmissions] = useState<DocumentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!session) return;
    const { data: c } = await supabase
      .from("onboarding_cases")
      .select("*")
      .eq("new_hire_profile_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCase(c as OnboardingCase | null);
    if (c) {
      const { data: subs } = await supabase
        .from("document_submissions")
        .select("*, document_types(*), document_files(*)")
        .eq("case_id", c.id);
      const list = (subs as DocumentSubmission[]) ?? [];
      list.sort(
        (a, b) =>
          (a.document_types?.sort_order ?? 0) - (b.document_types?.sort_order ?? 0),
      );
      setSubmissions(list);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Storage keys must stay within {case_id}/{document_type_id}/... for the
  // bucket policies to match; the original name is kept on the row instead.
  function storageKey(submission: DocumentSubmission, file: File, index: number) {
    const safeName = file.name.replace(/[^\w.-]+/g, "_");
    return `${submission.case_id}/${submission.document_type_id}/${Date.now()}-${index}-${safeName}`;
  }

  async function upload(submission: DocumentSubmission, files: File[]) {
    if (!session || files.length === 0) return;
    setBusyId(submission.id);
    setError(null);
    try {
      const uploaded: { path: string; file: File }[] = [];
      for (const [index, file] of files.entries()) {
        const path = storageKey(submission, file, index);
        const { error: uploadError } = await supabase.storage
          .from("onboarding-documents")
          .upload(path, file);
        if (uploadError) throw uploadError;
        uploaded.push({ path, file });
      }

      const { error: insertError } = await supabase.from("document_files").insert(
        uploaded.map(({ path, file }) => ({
          submission_id: submission.id,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
          uploaded_by: session.user.id,
        })),
      );
      if (insertError) throw insertError;

      // Flipping the submission last is what retires the previous attempt
      // (see the retire_previous_attempt trigger). Already-submitted rows are
      // closed to the new hire by RLS -- the files above are enough.
      if (submission.status !== "submitted") {
        const { error: updateError } = await supabase
          .from("document_submissions")
          .update({ status: "submitted" })
          .eq("id", submission.id);
        if (updateError) throw updateError;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  // The submission's file_path pointer is repointed by a database trigger.
  async function removeFile(submission: DocumentSubmission, file: DocumentFile) {
    setBusyId(submission.id);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("document_files")
        .delete()
        .eq("id", file.id);
      if (deleteError) throw deleteError;
      await supabase.storage.from("onboarding-documents").remove([file.file_path]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage
      .from("onboarding-documents")
      .createSignedUrl(path, 300);
    if (error) setError(error.message);
    else if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!onboardingCase)
    return (
      <div>
        <h1>My Onboarding</h1>
        <div className="empty">
          No onboarding case yet. One is created automatically when you're
          hired.
        </div>
      </div>
    );

  const canUpload = (s: DocumentSubmission) =>
    ["pending", "rejected", "resubmit_requested"].includes(s.status);
  // Approved documents are frozen; anything else can still take another file.
  const canAttach = (s: DocumentSubmission) => s.status !== "approved";
  const uploadLabel = (s: DocumentSubmission) => {
    if (s.status === "pending") return "Upload";
    if (s.status === "submitted") return "Add file";
    return "Re-upload";
  };

  const required = submissions.filter((s) => s.document_types?.required !== false);
  const approved = required.filter((s) => s.status === "approved").length;
  const percent = required.length
    ? Math.round((approved / required.length) * 100)
    : 0;
  const pendingCount = required.length - approved;
  const firstName = (profile?.full_name || "").split(" ")[0];

  return (
    <div>
      <div className="page-head">
        <h1>Welcome to the team{firstName ? `, ${firstName}` : ""}!</h1>
        <p>
          We're thrilled to have you. Let's get your journey started by
          completing your onboarding checklist.
        </p>
      </div>

      <div className="onboarding-grid">
        <div className="card progress-card">
          <ProgressRing percent={percent} />
          <h2>
            {onboardingCase.status === "complete"
              ? "All done!"
              : percent > 0
                ? "Almost there!"
                : "Let's get started"}
          </h2>
          <p className="muted">
            {approved} of {required.length} required documents approved.
          </p>
        </div>

        <div className="card">
          <div className="row row-center">
            <h2>Onboarding Checklist</h2>
            <span
              className={`badge ${
                onboardingCase.status === "complete"
                  ? "status-complete"
                  : "status-in_progress"
              }`}
            >
              {onboardingCase.status === "complete"
                ? "Complete"
                : `${pendingCount} task${pendingCount === 1 ? "" : "s"} pending`}
            </span>
          </div>
          <div className="stack">
            {submissions.map((s) => {
              const current = activeFiles(s);
              const history = supersededFiles(s);
              return (
                <div key={s.id} className="checklist-item">
                  <div
                    className={`checklist-row${canUpload(s) && s.status !== "pending" ? " attention" : ""}`}
                  >
                    {statusDot(s.status)}
                    <div className="grow">
                      <strong>{s.document_types?.name}</strong>
                      {s.document_types?.required === false && (
                        <span className="muted"> (optional)</span>
                      )}
                      <p>{s.document_types?.description}</p>
                      {s.reviewer_notes && s.status !== "approved" && (
                        <p className="reviewer-note">
                          Reviewer notes: {s.reviewer_notes}
                        </p>
                      )}
                    </div>
                    <div className="checklist-actions">
                      {s.status !== "pending" && (
                        <span className={`badge status-${s.status}`}>
                          {s.status === "submitted" ? "In review" : s.status}
                        </span>
                      )}
                      {canAttach(s) && (
                        <label className="upload">
                          <UploadIcon />
                          {busyId === s.id ? "Uploading…" : uploadLabel(s)}
                          <input
                            type="file"
                            hidden
                            multiple
                            disabled={busyId !== null}
                            onChange={(e) => {
                              const picked = Array.from(e.target.files ?? []);
                              e.target.value = "";
                              if (picked.length) void upload(s, picked);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {current.length > 0 && (
                    <ul className="file-list">
                      {current.map((f) => (
                        <li key={f.id} className="file-row">
                          <DocIcon className="file-icon" />
                          <button className="link grow" onClick={() => openFile(f.file_path)}>
                            {f.file_name}
                          </button>
                          <span className="muted file-meta">
                            {formatFileSize(f.file_size)}
                          </span>
                          {canAttach(s) && current.length > 1 && (
                            <button
                              className="icon-btn"
                              title="Remove this file"
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
                    <details className="file-history">
                      <summary>
                        <HistoryIcon /> {history.length} earlier upload
                        {history.length === 1 ? "" : "s"}
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
                </div>
              );
            })}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
