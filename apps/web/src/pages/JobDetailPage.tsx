import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { Application, JobPosting } from "../lib/types";
import { errorMessage, formatDate, formatFileSize, safeFileName } from "../lib/format";
import { Badge, EmptyState, ErrorState, SkeletonRows, StageBadge } from "../components/ui";
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  CameraIcon,
  CheckIcon,
  DocIcon,
  UploadIcon,
  XIcon,
} from "../components/icons";

/** Postings are plain text. Lines starting "## " become headings and
 *  "- " / "* " become bullets, so HR can structure a posting without
 *  a rich-text editor. Everything is rendered as text, never as HTML. */
function Description({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{para.join(" ")}</p>);
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length)
      blocks.push(
        <ul key={blocks.length}>
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
    bullets = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushBullets();
    } else if (line.startsWith("## ")) {
      flushPara();
      flushBullets();
      blocks.push(<h2 key={blocks.length}>{line.slice(3)}</h2>);
    } else if (/^[-*•]\s+/.test(line)) {
      flushPara();
      bullets.push(line.replace(/^[-*•]\s+/, ""));
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushPara();
  flushBullets();
  const hasHeading = /^##\s/m.test(text);
  return (
    <div className="prose">
      {!hasHeading && <h2>About the role</h2>}
      {blocks}
    </div>
  );
}

const NEXT_STEPS = ["Application received", "Screening by our team", "Interview", "Offer and onboarding"];

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { session, profile } = useAuth();
  const [posting, setPosting] = useState<JobPosting | null>(null);
  const [application, setApplication] = useState<Pick<Application, "id" | "stage"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    const { data, error: err } = await supabase.from("job_postings").select("*").eq("id", id).maybeSingle();
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setPosting(data as JobPosting | null);
    if (session) {
      const { data: app } = await supabase
        .from("applications")
        .select("id, stage")
        .eq("posting_id", id)
        .eq("applicant_id", session.user.id)
        .maybeSingle();
      setApplication(app as Pick<Application, "id" | "stage"> | null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  async function apply(e: FormEvent) {
    e.preventDefault();
    if (!session || !posting) return;
    setBusy(true);
    setError(null);
    try {
      let resumePath: string | null = null;
      if (resume) {
        resumePath = `${session.user.id}/${Date.now()}-${safeFileName(resume.name)}`;
        const { error: uploadError } = await supabase.storage.from("resumes").upload(resumePath, resume);
        if (uploadError) throw uploadError;
      }
      const { data, error: insertError } = await supabase
        .from("applications")
        .insert({ applicant_id: session.user.id, posting_id: posting.id, resume_file_path: resumePath })
        .select("id, stage")
        .single();
      if (insertError) throw insertError;
      setApplication(data as Pick<Application, "id" | "stage">);
      setResume(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="container page">
        <SkeletonRows rows={3} label="Loading the role" />
      </div>
    );
  if (loadError)
    return (
      <div className="container page">
        <ErrorState title="We couldn't load this role" message={loadError} onRetry={load} />
      </div>
    );
  if (!posting)
    return (
      <div className="container page">
        <EmptyState
          icon={<BriefcaseIcon />}
          title="This role isn't available"
          action={
            <Link to="/" className="btn">
              See open positions
            </Link>
          }
        >
          It may have been filled, or it may only be open to internal employees.
        </EmptyState>
      </div>
    );

  const isOpen = posting.status === "open";

  return (
    <div className="container page">
      <Link to="/" className="back-link">
        <ArrowLeftIcon /> All open positions
      </Link>

      <div className="detail-head">
        <span className="tile">
          <BriefcaseIcon />
        </span>
        <div className="grow stack-sm">
          <h1>{posting.title}</h1>
          <div className="meta">
            <span className="chip">{posting.department || "General"}</span>
            {isOpen ? (
              <Badge tone="success" icon={<CheckIcon />}>
                Open
              </Badge>
            ) : (
              <Badge tone="neutral">Closed</Badge>
            )}
            {posting.visibility === "internal" && <Badge tone="violet">Internal only</Badge>}
            <span>Posted {formatDate(posting.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <article className="card">
          <Description text={posting.description} />
        </article>

        <aside>
          <section className="card card-pad stack" aria-labelledby="apply-h">
            <div className="stack-sm" style={{ gap: 4 }}>
              <h2 id="apply-h">{application ? "Your application" : "Apply for this role"}</h2>
              {session && !application && isOpen && (
                <p className="muted small">Applying as {profile?.email ?? session.user.email}</p>
              )}
            </div>

            {application ? (
              <>
                <div className="row">
                  <StageBadge stage={application.stage} />
                </div>
                <p className="muted small">Follow each step, and any messages from the team, on your applications page.</p>
                <Link to="/applications" className="btn secondary block">
                  Track my application
                </Link>
              </>
            ) : !isOpen ? (
              <p className="muted">This role is no longer accepting applications.</p>
            ) : !session ? (
              <>
                <p className="muted small">Sign in with your email to apply. No password needed.</p>
                <Link to="/signin" state={{ from: location.pathname }} className="btn block">
                  Sign in to apply
                </Link>
              </>
            ) : (
              <form onSubmit={apply} className="stack">
                <div className="stack-sm">
                  <span className="field" id="cv-label">
                    Resume / CV
                  </span>
                  {resume ? (
                    <div className="picked-file">
                      <DocIcon />
                      <span className="grow">
                        <strong className="truncate" style={{ display: "block" }}>
                          {resume.name}
                        </strong>
                        <span className="small">{formatFileSize(resume.size)} · ready to submit</span>
                      </span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Remove file"
                        onClick={() => setResume(null)}
                      >
                        <XIcon />
                      </button>
                    </div>
                  ) : (
                    <>
                      <label
                        className={`dropzone${dragOver ? " dragover" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) setResume(f);
                        }}
                      >
                        <span className="dz-icon">
                          <UploadIcon />
                        </span>
                        <strong>Choose a file</strong>
                        <span className="muted small">or drop it here · PDF, DOC or DOCX</span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          aria-labelledby="cv-label"
                          onChange={(e) => setResume(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <label className="btn secondary upload-label">
                        <CameraIcon /> Scan with camera
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => setResume(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </>
                  )}
                </div>
                <button type="submit" className="lg" disabled={busy}>
                  {busy ? "Submitting…" : "Submit application"}
                </button>
                {!resume && <p className="muted small">A CV is optional, but it helps the team review you sooner.</p>}
                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}
              </form>
            )}
          </section>

          <section className="card card-pad stack" aria-labelledby="next-h">
            <h3 id="next-h">What happens next</h3>
            <ol className="steps">
              {NEXT_STEPS.map((label, i) => (
                <li key={label}>
                  <span className="step-num">{i + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
