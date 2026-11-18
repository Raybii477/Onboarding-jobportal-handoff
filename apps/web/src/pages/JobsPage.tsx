import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { JobPosting } from "../lib/types";
import { formatDate, plural } from "../lib/format";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui";
import { ArrowRightIcon, BriefcaseIcon, SearchIcon } from "../components/icons";

const ALL = "__all__";

export default function JobsPage() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState(ALL);
  const [showExternal, setShowExternal] = useState(true);
  const [showInternal, setShowInternal] = useState(true);

  async function load() {
    setLoading(true);
    // RLS decides what each viewer sees: anonymous visitors and
    // candidates get open public postings; employees also get internal ones.
    const { data, error: err } = await supabase
      .from("job_postings")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError(null);
      setPostings((data as JobPosting[]) ?? []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const hasInternal = postings.some((p) => p.visibility !== "public");

  const byAudience = postings.filter((p) => {
    if (!hasInternal) return true;
    const external = p.visibility !== "internal";
    const internal = p.visibility !== "public";
    return (showExternal && external) || (showInternal && internal);
  });

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    byAudience.forEach((p) => {
      const d = p.department || "General";
      counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [byAudience]);

  const q = search.trim().toLowerCase();
  const visible = byAudience.filter(
    (p) =>
      (dept === ALL || (p.department || "General") === dept) &&
      (!q || p.title.toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q)),
  );

  const filtered = q || dept !== ALL || !showExternal || !showInternal;

  function clearFilters() {
    setSearch("");
    setDept(ALL);
    setShowExternal(true);
    setShowInternal(true);
  }

  return (
    <>
      <section className="hero">
        <span className="glow-blob" aria-hidden="true" />
        <div className="container">
          {!loading && !error && (
            <span className="hero-pill">{plural(postings.length, "open role")}</span>
          )}
          <h1>
            Find your next <em>career-defining</em> role.
          </h1>
          <p>Browse open positions and apply in minutes. All you need is an email address and your CV.</p>
          <form
            className="hero-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <label>
              <SearchIcon style={{ width: 20, height: 20 }} />
              <span className="sr-only">Search jobs</span>
              <input
                placeholder="Job title or department"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button type="submit" className="lg">
              Search jobs
            </button>
          </form>
        </div>
      </section>

      <div className="container">
        <div className="board">
          <aside className="card filters" aria-label="Filters">
            <div>
              <h2 className="eyebrow">Department</h2>
              <div className="filter-list">
                <button
                  className="filter-option"
                  aria-pressed={dept === ALL}
                  onClick={() => setDept(ALL)}
                >
                  <span>All departments</span>
                  <span className="count">{byAudience.length}</span>
                </button>
                {departments.map(([name, count]) => (
                  <button
                    key={name}
                    className="filter-option"
                    aria-pressed={dept === name}
                    onClick={() => setDept(name)}
                  >
                    <span>{name}</span>
                    <span className="count">{count}</span>
                  </button>
                ))}
              </div>
            </div>
            {hasInternal && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 10 }}>
                  Open to
                </legend>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showExternal}
                    onChange={(e) => setShowExternal(e.target.checked)}
                  />
                  External candidates
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showInternal}
                    onChange={(e) => setShowInternal(e.target.checked)}
                  />
                  Internal employees
                </label>
              </fieldset>
            )}
          </aside>

          <section className="results" id="results" aria-labelledby="results-h">
            <div className="row between" style={{ alignItems: "baseline" }}>
              <h2 id="results-h">Open positions</h2>
              {!loading && !error && (
                <span className="muted small">
                  {plural(visible.length, "role")} · newest first
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows rows={4} label="Loading open positions" />
            ) : error ? (
              <ErrorState title="We couldn't load the job board" message={error} onRetry={load} />
            ) : postings.length === 0 ? (
              <EmptyState icon={<BriefcaseIcon />} title="No open roles right now">
                New positions are posted here first. Check back soon.
              </EmptyState>
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<SearchIcon />}
                title="Nothing matches your search"
                action={
                  filtered && (
                    <button className="secondary" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )
                }
              >
                Try a different job title or department, or clear the filters.
              </EmptyState>
            ) : (
              visible.map((p) => {
                const internal = p.visibility === "internal";
                return (
                  <Link key={p.id} to={`/jobs/${p.id}`} className="card job-row">
                    <span className={`tile${internal ? " tone-violet" : ""}`}>
                      <BriefcaseIcon />
                    </span>
                    <span className="grow stack-sm" style={{ gap: 6 }}>
                      <span className="title">{p.title}</span>
                      <span className="meta">
                        <span className="chip">{p.department || "General"}</span>
                        {internal && <span className="badge tone-violet">Internal only</span>}
                        <span>Posted {formatDate(p.created_at)}</span>
                      </span>
                    </span>
                    <span className="cta">
                      Apply now <ArrowRightIcon />
                    </span>
                  </Link>
                );
              })
            )}
          </section>
        </div>
      </div>
    </>
  );
}
