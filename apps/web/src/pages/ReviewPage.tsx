import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  DocumentSubmission,
  OnboardingCase,
  SubmissionStatus,
} from "../lib/types";

type CaseWithSubs = OnboardingCase & { submissions: DocumentSubmission[] };

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
      <h1>Document review</h1>
      {error && <p className="error">{error}</p>}
      {cases.length === 0 && <p className="muted">No onboarding cases yet.</p>}
      {cases.map((c) => (
        <section key={c.id} className="card">
          <div className="row">
            <h2>{c.profiles?.full_name || c.profiles?.email}</h2>
            <span className={`badge status-${c.status}`}>
              {c.status === "complete" ? "complete" : "in progress"}
            </span>
          </div>
          <ul className="plain">
            {c.submissions.map((s) => (
              <li key={s.id} className="review-row">
                <div className="row">
                  <div>
                    <strong>{s.document_types?.name}</strong>
                    {s.document_types?.required === false && (
                      <span className="muted"> (optional)</span>
                    )}
                    {s.file_path && (
                      <button className="link" onClick={() => openFile(s.file_path!)}>
                        View file
                      </button>
                    )}
                  </div>
                  <span className={`badge status-${s.status}`}>{s.status}</span>
                </div>
                {s.status === "submitted" && (
                  <div className="stack">
                    <input
                      placeholder="Reviewer notes (required when sending back)"
                      value={notes[s.id] ?? ""}
                      onChange={(e) =>
                        setNotes({ ...notes, [s.id]: e.target.value })
                      }
                    />
                    <div className="actions">
                      <button onClick={() => decide(s, "approved")}>Approve</button>
                      <button
                        className="secondary"
                        onClick={() => decide(s, "resubmit_requested")}
                      >
                        Request resubmission
                      </button>
                      <button className="danger" onClick={() => decide(s, "rejected")}>
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
