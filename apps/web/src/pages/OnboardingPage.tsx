import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { DocumentSubmission, OnboardingCase } from "../lib/types";

export default function OnboardingPage() {
  const { session } = useAuth();
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
        .select("*, document_types(*)")
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

  async function upload(submission: DocumentSubmission, file: File) {
    setBusyId(submission.id);
    setError(null);
    try {
      const path = `${submission.case_id}/${submission.document_type_id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("onboarding-documents")
        .upload(path, file);
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("document_submissions")
        .update({ file_path: path, status: "submitted" })
        .eq("id", submission.id);
      if (updateError) throw updateError;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!onboardingCase)
    return (
      <div>
        <h1>My onboarding</h1>
        <p className="muted">
          No onboarding case yet. One is created automatically when you're hired.
        </p>
      </div>
    );

  const canUpload = (s: DocumentSubmission) =>
    ["pending", "rejected", "resubmit_requested"].includes(s.status);

  return (
    <div className="narrow">
      <h1>My onboarding documents</h1>
      <p>
        Case status:{" "}
        <span className={`badge status-${onboardingCase.status}`}>
          {onboardingCase.status === "complete" ? "complete" : "in progress"}
        </span>
      </p>
      <ul className="cards">
        {submissions.map((s) => (
          <li key={s.id} className="card">
            <div className="row">
              <div>
                <strong>{s.document_types?.name}</strong>
                {s.document_types?.required === false && (
                  <span className="muted"> (optional)</span>
                )}
                <p className="muted">{s.document_types?.description}</p>
                {s.reviewer_notes && s.status !== "approved" && (
                  <p className="error">Reviewer notes: {s.reviewer_notes}</p>
                )}
              </div>
              <span className={`badge status-${s.status}`}>{s.status}</span>
            </div>
            {canUpload(s) && (
              <label className="upload">
                {busyId === s.id
                  ? "Uploading…"
                  : s.status === "pending"
                    ? "Upload document"
                    : "Upload replacement"}
                <input
                  type="file"
                  hidden
                  disabled={busyId !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(s, file);
                  }}
                />
              </label>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
