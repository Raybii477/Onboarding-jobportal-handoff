import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { JobPosting } from "../lib/types";

export default function JobsPage() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // RLS decides what each viewer sees: anon/candidates get open public
    // postings, employees additionally get internal ones.
    supabase
      .from("job_postings")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPostings((data as JobPosting[]) ?? []);
        setLoading(false);
      });
  }, []);

  const visible = postings.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.department ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <h1>Open positions</h1>
      <input
        className="search"
        placeholder="Search by title or department…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading && <p className="muted">Loading…</p>}
      {!loading && visible.length === 0 && <p className="muted">No open positions.</p>}
      <ul className="cards">
        {visible.map((p) => (
          <li key={p.id} className="card">
            <h2>
              <Link to={`/jobs/${p.id}`}>{p.title}</Link>
            </h2>
            <p className="muted">
              {p.department || "General"}
              {p.visibility === "internal" && " · internal only"}
            </p>
            <p>{p.description.slice(0, 180)}{p.description.length > 180 ? "…" : ""}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
