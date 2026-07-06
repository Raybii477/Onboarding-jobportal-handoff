import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { BriefcaseIcon } from "../../components/icons";
import type { JobPosting, PostingStatus, PostingVisibility } from "../../lib/types";

const EMPTY = {
  title: "",
  description: "",
  department: "",
  visibility: "public" as PostingVisibility,
};

export default function PostingsPage() {
  const { session } = useAuth();
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("job_postings")
      .select("*")
      .order("created_at", { ascending: false });
    setPostings((data as JobPosting[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPosting(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    const { error } = await supabase.from("job_postings").insert({
      title: form.title,
      description: form.description,
      department: form.department || null,
      visibility: form.visibility,
      created_by: session.user.id,
    });
    if (error) setError(error.message);
    else {
      setForm(EMPTY);
      await load();
    }
  }

  async function setStatus(id: string, status: PostingStatus) {
    const { error } = await supabase
      .from("job_postings")
      .update({ status })
      .eq("id", id);
    if (error) setError(error.message);
    else await load();
  }

  return (
    <div>
      <div className="page-head">
        <h1>Jobs</h1>
        <p>Create postings, publish them, and close them when filled.</p>
      </div>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>New posting</h2>
        <form onSubmit={createPosting} className="stack" style={{ marginTop: "0.75rem" }}>
          <label>
            Title
            <input
              required
              placeholder="e.g. Senior Software Engineer"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              required
              rows={6}
              placeholder="Role description, responsibilities, requirements…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label>
            Department
            <input
              placeholder="e.g. Engineering"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </label>
          <label>
            Visibility
            <select
              value={form.visibility}
              onChange={(e) =>
                setForm({ ...form, visibility: e.target.value as PostingVisibility })
              }
            >
              <option value="public">Public (external candidates)</option>
              <option value="internal">Internal (employees only)</option>
              <option value="both">Both</option>
            </select>
          </label>
          <button type="submit" className="dark">
            + Create draft
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <ul className="cards">
        {postings.map((p) => (
          <li key={p.id} className="card">
            <div className="job-row">
              <span className="icon-tile">
                <BriefcaseIcon />
              </span>
              <div className="grow">
                <strong>{p.title}</strong>
                <div className="meta">
                  <span>{p.department || "General"}</span>
                  <span>{p.visibility}</span>
                </div>
              </div>
              <span className={`badge status-${p.status}`}>{p.status}</span>
              <div className="actions">
                {p.status === "draft" && (
                  <button onClick={() => setStatus(p.id, "open")}>Publish</button>
                )}
                {p.status === "open" && (
                  <button className="outline" onClick={() => setStatus(p.id, "closed")}>
                    Close
                  </button>
                )}
                {p.status === "closed" && (
                  <button className="outline" onClick={() => setStatus(p.id, "open")}>
                    Reopen
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
