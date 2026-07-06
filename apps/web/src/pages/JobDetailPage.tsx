import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { JobPosting } from "../lib/types";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const [posting, setPosting] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState<File | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("job_postings")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setPosting(data as JobPosting | null);
        setLoading(false);
      });
    if (session) {
      supabase
        .from("applications")
        .select("id")
        .eq("posting_id", id)
        .eq("applicant_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => setApplied(!!data));
    }
  }, [id, session]);

  async function apply(e: FormEvent) {
    e.preventDefault();
    if (!session || !posting) return;
    setBusy(true);
    setError(null);
    try {
      let resumePath: string | null = null;
      if (resume) {
        resumePath = `${session.user.id}/${Date.now()}-${resume.name}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(resumePath, resume);
        if (uploadError) throw uploadError;
      }
      const { error: insertError } = await supabase.from("applications").insert({
        applicant_id: session.user.id,
        posting_id: posting.id,
        resume_file_path: resumePath,
      });
      if (insertError) throw insertError;
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!posting) return <p>This posting doesn't exist or isn't visible to you.</p>;

  return (
    <div className="narrow">
      <h1>{posting.title}</h1>
      <p className="muted">
        {posting.department || "General"}
        {posting.visibility === "internal" && " · internal only"}
      </p>
      <p className="prewrap">{posting.description}</p>

      <section className="card">
        <h2>Apply</h2>
        {!session ? (
          <p>
            <Link to="/signin">Sign in</Link> to apply for this position.
          </p>
        ) : applied ? (
          <p>
            You've applied to this position. Track it under{" "}
            <Link to="/applications">My applications</Link>.
          </p>
        ) : (
          <form onSubmit={apply} className="stack">
            <label>
              Resume / CV (PDF)
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setResume(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit application"}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </section>
    </div>
  );
}
