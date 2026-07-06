import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { Application } from "../lib/types";
import { BriefcaseIcon } from "../components/icons";

export default function MyApplicationsPage() {
  const { session } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("applications")
      .select("*, job_postings(title, department)")
      .eq("applicant_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setApplications((data as Application[]) ?? []);
        setLoading(false);
      });
  }, [session]);

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>My Applications</h1>
        <p>Track where each of your applications is in the hiring pipeline.</p>
      </div>
      {applications.length === 0 && (
        <div className="empty">You haven't applied to anything yet.</div>
      )}
      <ul className="cards">
        {applications.map((a) => (
          <li key={a.id} className="card">
            <div className="job-row">
              <span className="icon-tile">
                <BriefcaseIcon />
              </span>
              <div className="grow">
                <strong>{a.job_postings?.title ?? "Posting"}</strong>
                <div className="meta">
                  <span>{a.job_postings?.department || "General"}</span>
                  <span>
                    Applied {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <span className={`badge stage-${a.stage}`}>{a.stage}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
