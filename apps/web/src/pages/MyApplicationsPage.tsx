import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { Application } from "../lib/types";

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
      <h1>My applications</h1>
      {applications.length === 0 && (
        <p className="muted">You haven't applied to anything yet.</p>
      )}
      <ul className="cards">
        {applications.map((a) => (
          <li key={a.id} className="card row">
            <div>
              <strong>{a.job_postings?.title ?? "Posting"}</strong>
              <p className="muted">{a.job_postings?.department || "General"}</p>
            </div>
            <span className={`badge stage-${a.stage}`}>{a.stage}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
