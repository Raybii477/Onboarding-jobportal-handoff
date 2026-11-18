import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { JobPosting, PostingStatus, PostingVisibility } from "../../lib/types";
import { formatDate, plural } from "../../lib/format";
import { Badge, EmptyState, ErrorState, SkeletonRows } from "../../components/ui";
import { BriefcaseIcon, CheckIcon, PlusIcon } from "../../components/icons";

const EMPTY = { title: "", description: "", department: "", visibility: "public" as PostingVisibility };

const TEMPLATE = `## About the role
One or two sentences on what this person will do.

## Responsibilities
- First responsibility
- Second responsibility

## Requirements
- First requirement
- Second requirement`;

const VISIBILITY_LABEL: Record<PostingVisibility, string> = {
  public: "Public",
  internal: "Internal only",
  both: "Public and internal",
};

export default function PostingsPage() {
  const { session } = useAuth();
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [p, a] = await Promise.all([
      supabase.from("job_postings").select("*").order("created_at", { ascending: false }),
      supabase.from("applications").select("posting_id"),
    ]);
    const err = p.error ?? a.error;
    if (err) setLoadError(err.message);
    else {
      setLoadError(null);
      setPostings((p.data as JobPosting[]) ?? []);
      const c: Record<string, number> = {};
      ((a.data as { posting_id: string }[]) ?? []).forEach((r) => (c[r.posting_id] = (c[r.posting_id] ?? 0) + 1));
      setCounts(c);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPosting(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("job_postings").insert({
      title: form.title.trim(),
      description: form.description,
      department: form.department.trim() || null,
      visibility: form.visibility,
      created_by: session.user.id,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setForm(EMPTY);
      await load();
    }
  }

  async function setStatus(id: string, status: PostingStatus) {
    setError(null);
    const { error: err } = await supabase.from("job_postings").update({ status }).eq("id", id);
    if (err) setError(err.message);
    else await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>Create postings, publish them, and close them when filled.</p>
        </div>
      </div>

      <div className="postings-grid">
        <section aria-labelledby="postings-h" className="stack">
          <h2 id="postings-h" className="sr-only">
            Postings
          </h2>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <SkeletonRows rows={4} label="Loading postings" />
          ) : loadError ? (
            <ErrorState title="We couldn't load postings" message={loadError} onRetry={load} />
          ) : postings.length === 0 ? (
            <EmptyState icon={<BriefcaseIcon />} title="No postings yet">
              Create your first posting with the form. It starts as a draft, so you can check it before it goes live.
            </EmptyState>
          ) : (
            postings.map((p) => (
              <article key={p.id} className="card job-row" style={{ cursor: "default" }}>
                <span className={`tile${p.visibility === "internal" ? " tone-violet" : ""}`}>
                  <BriefcaseIcon />
                </span>
                <div className="grow stack-sm" style={{ gap: 4 }}>
                  <span className="title">
                    {p.status === "open" ? (
                      <Link to={`/jobs/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {p.title}
                      </Link>
                    ) : (
                      p.title
                    )}
                  </span>
                  <span className="meta">
                    <span className="chip">{p.department || "General"}</span>
                    <span>{VISIBILITY_LABEL[p.visibility]}</span>
                    <span>{plural(counts[p.id] ?? 0, "applicant")}</span>
                    <span>Created {formatDate(p.created_at)}</span>
                  </span>
                </div>
                {p.status === "open" ? (
                  <Badge tone="success" icon={<CheckIcon />}>
                    Open
                  </Badge>
                ) : p.status === "draft" ? (
                  <Badge tone="warning">Draft</Badge>
                ) : (
                  <Badge tone="neutral">Closed</Badge>
                )}
                <div className="row">
                  {p.status === "draft" && (
                    <button className="sm" onClick={() => void setStatus(p.id, "open")}>
                      Publish
                    </button>
                  )}
                  {p.status === "open" && (
                    <button className="sm secondary" onClick={() => void setStatus(p.id, "closed")}>
                      Close
                    </button>
                  )}
                  {p.status === "closed" && (
                    <button className="sm secondary" onClick={() => void setStatus(p.id, "open")}>
                      Reopen
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="card card-pad" aria-labelledby="new-h">
          <form onSubmit={createPosting} className="stack">
            <h2 id="new-h">New posting</h2>
            <label className="field">
              Title
              <input
                required
                placeholder="e.g. Senior Software Engineer"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="field">
              Department
              <input
                placeholder="e.g. Engineering"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </label>
            <label className="field">
              Who can see it
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as PostingVisibility })}
              >
                <option value="public">Public (external candidates)</option>
                <option value="internal">Internal (employees only)</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label className="field">
              <span className="row between">
                Description
                {!form.description && (
                  <button type="button" className="link small" onClick={() => setForm({ ...form, description: TEMPLATE })}>
                    Use template
                  </button>
                )}
              </span>
              <textarea
                required
                rows={10}
                placeholder="What the role is, what they'll do, what you need."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <span className="muted small" style={{ fontWeight: 400 }}>
                Start a line with “## ” for a heading and “- ” for a bullet.
              </span>
            </label>
            <button type="submit" className="dark" disabled={busy}>
              <PlusIcon /> {busy ? "Creating…" : "Create draft"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
