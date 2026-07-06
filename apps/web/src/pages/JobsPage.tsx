import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { JobPosting } from "../lib/types";
import { BriefcaseIcon, SearchIcon } from "../components/icons";

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

  const departments = [...new Set(postings.map((p) => p.department).filter(Boolean))];

  return (
    <div>
      <section className="hero">
        <h1>
          Find your next <span className="accent">career-defining</span> role.
        </h1>
        <p>
          Browse our open positions and apply in minutes — all you need is an
          email address.
        </p>
        <div className="searchbar">
          <input
            placeholder="Job title or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="btn">
            <SearchIcon /> Search Jobs
          </span>
        </div>
        {departments.length > 0 && (
          <div className="chip-row">
            {departments.map((d) => (
              <button key={d} className="link" onClick={() => setSearch(d!)}>
                <span className="chip">{d}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <h2>
        Open Positions <span className="muted">({visible.length} roles)</span>
      </h2>
      {loading && <p className="muted">Loading…</p>}
      {!loading && visible.length === 0 && (
        <div className="empty">No open positions right now — check back soon.</div>
      )}
      <ul className="cards">
        {visible.map((p) => (
          <li key={p.id} className="card hoverable">
            <div className="job-row">
              <span className="icon-tile">
                <BriefcaseIcon />
              </span>
              <div className="grow">
                <h2>
                  <Link to={`/jobs/${p.id}`}>{p.title}</Link>
                </h2>
                <div className="meta">
                  <span>{p.department || "General"}</span>
                  {p.visibility === "internal" && <span>Internal only</span>}
                  <span>
                    Posted {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <Link className="btn" to={`/jobs/${p.id}`}>
                Apply Now
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
