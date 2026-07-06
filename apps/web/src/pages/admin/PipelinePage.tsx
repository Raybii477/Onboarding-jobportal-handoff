import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { STAGES, type Application, type ApplicationStage } from "../../lib/types";

export default function PipelinePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("applications")
      .select("*, job_postings(title, department), profiles!applications_applicant_id_fkey(full_name, email)")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setApplications((data as Application[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function moveStage(id: string, stage: ApplicationStage) {
    setError(null);
    // Moving to 'hired' fires the hired-to-onboarding Edge Function via
    // the database webhook — the onboarding case is created automatically.
    const { error } = await supabase
      .from("applications")
      .update({ stage })
      .eq("id", id);
    if (error) setError(error.message);
    else await load();
  }

  async function openResume(path: string) {
    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(path, 300);
    if (error) setError(error.message);
    else if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div>
      <h1>Hiring pipeline</h1>
      {error && <p className="error">{error}</p>}
      {STAGES.map((stage) => {
        const inStage = applications.filter((a) => a.stage === stage);
        if (inStage.length === 0) return null;
        return (
          <section key={stage}>
            <h2 className="stage-heading">
              <span className={`badge stage-${stage}`}>{stage}</span>{" "}
              <span className="muted">({inStage.length})</span>
            </h2>
            <ul className="cards">
              {inStage.map((a) => (
                <li key={a.id} className="card row">
                  <div>
                    <strong>{a.profiles?.full_name || a.profiles?.email}</strong>
                    <p className="muted">
                      {a.job_postings?.title} · applied{" "}
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                    {a.resume_file_path && (
                      <button
                        className="link"
                        onClick={() => openResume(a.resume_file_path!)}
                      >
                        View resume
                      </button>
                    )}
                  </div>
                  <div className="actions">
                    <select
                      value={a.stage}
                      onChange={(e) =>
                        moveStage(a.id, e.target.value as ApplicationStage)
                      }
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {applications.length === 0 && <p className="muted">No applications yet.</p>}
    </div>
  );
}
