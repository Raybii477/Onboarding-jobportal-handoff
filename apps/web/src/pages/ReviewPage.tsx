import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  DocumentSubmission,
  OnboardingCase,
  SubmissionStatus,
} from "../lib/types";
import { CheckIcon, ClockIcon, DocIcon, RedoIcon } from "../components/icons";

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

export default function ReviewPage() {
  const [cases, setCases] = useState<CaseWithSubs[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      .select("*, document_types(*)");
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

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Onboarding &amp; Document Review</h1>
        <p>
          {cases.filter((c) => c.status !== "complete").length} active case
          {cases.filter((c) => c.status !== "complete").length === 1 ? "" : "s"}
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      {cases.length === 0 && (
        <div className="empty">
          No onboarding cases yet — they appear automatically when an
          application is marked hired.
        </div>
      )}
      <div className="stack">
        {cases.map((c) => {
          const who = c.profiles?.full_name || c.profiles?.email || "";
          const required = c.submissions.filter(
            (s) => s.document_types?.required !== false,
          );
          const approved = required.filter((s) => s.status === "approved").length;
          return (
            <section key={c.id} className="card">
              <div className="case-head">
                <span className="avatar">{initials(who)}</span>
                <div>
                  <h2>{who}</h2>
                  <span className="muted">
                    Documents: {approved} / {required.length} approved
                  </span>
                </div>
                <span
                  className={`badge ${
                    c.status === "complete" ? "status-complete" : "status-in_progress"
                  }`}
                >
                  {c.status === "complete" ? "Complete" : "In progress"}
                </span>
              </div>
              <ul className="plain">
                {c.submissions.map((s) => (
                  <li key={s.id} className="review-row">
                    <div className="job-row">
                      {tileFor(s.status)}
                      <div className="grow">
                        <strong>{s.document_types?.name}</strong>
                        {s.document_types?.required === false && (
                          <span className="muted"> (optional)</span>
                        )}
                        <div className="meta">
                          {s.submitted_at && (
                            <span>
                              Uploaded{" "}
                              {new Date(s.submitted_at).toLocaleDateString()}
                            </span>
                          )}
                          {s.file_path && (
                            <button
                              className="link"
                              onClick={() => openFile(s.file_path!)}
                            >
                              View file
                            </button>
                          )}
                        </div>
                      </div>
                      <span className={`badge status-${s.status}`}>
                        {s.status === "submitted" ? "Pending review" : s.status}
                      </span>
                    </div>
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
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
