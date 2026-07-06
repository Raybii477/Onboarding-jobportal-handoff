import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
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
      <h1>Manage postings</h1>

      <section className="card">
        <h2>New posting</h2>
        <form onSubmit={createPosting} className="stack">
          <input
            required
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            required
            rows={6}
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            placeholder="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          <label>
            Visibility{" "}
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
          <button type="submit">Create draft</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <ul className="cards">
        {postings.map((p) => (
          <li key={p.id} className="card row">
            <div>
              <strong>{p.title}</strong>
              <p className="muted">
                {p.department || "General"} · {p.visibility} ·{" "}
                <span className={`badge status-${p.status}`}>{p.status}</span>
              </p>
            </div>
            <div className="actions">
              {p.status === "draft" && (
                <button onClick={() => setStatus(p.id, "open")}>Publish</button>
              )}
              {p.status === "open" && (
                <button onClick={() => setStatus(p.id, "closed")}>Close</button>
              )}
              {p.status === "closed" && (
                <button onClick={() => setStatus(p.id, "open")}>Reopen</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
