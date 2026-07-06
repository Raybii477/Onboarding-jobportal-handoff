import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { DocumentSubmission, OnboardingCase } from "../lib/types";
import {
  CheckIcon,
  ClockIcon,
  DocIcon,
  RedoIcon,
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
        <h1>My Onboarding</h1>
        <div className="empty">
          No onboarding case yet. One is created automatically when you're
          hired.
        </div>
      </div>
    );

  const canUpload = (s: DocumentSubmission) =>
    ["pending", "rejected", "resubmit_requested"].includes(s.status);

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
            {submissions.map((s) => (
              <div
                key={s.id}
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
                {canUpload(s) ? (
                  <label className="upload">
                    <UploadIcon />
                    {busyId === s.id
                      ? "Uploading…"
                      : s.status === "pending"
                        ? "Upload"
                        : "Re-upload"}
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
                ) : (
                  <span className={`badge status-${s.status}`}>
                    {s.status === "submitted" ? "In review" : s.status}
                  </span>
                )}
              </div>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
