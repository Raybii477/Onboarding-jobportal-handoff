import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { Application, ApplicationEvent, ApplicationStage } from "../lib/types";
import { PROGRESS_STAGES, STAGE_LABEL } from "../lib/types";
import { formatDate } from "../lib/format";
import { EmptyState, ErrorState, SkeletonRows, StageBadge } from "../components/ui";
import { BriefcaseIcon, CheckIcon, XIcon } from "../components/icons";

/** Where a declined application stopped: the stage it left for "rejected". */
function stoppedAt(app: Application, events: ApplicationEvent[]): ApplicationStage {
  const exit = events
    .filter((e) => e.application_id === app.id && e.to_stage === "rejected")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const from = exit?.from_stage;
  return from && from !== "rejected" ? from : "applied";
}

function Tracker({ app, events }: { app: Application; events: ApplicationEvent[] }) {
  const declined = app.stage === "rejected";
  const current = declined ? stoppedAt(app, events) : app.stage;
  const at = PROGRESS_STAGES.indexOf(current);

  return (
    <ol className="tracker" aria-label={`Progress: ${declined ? `not progressed after ${STAGE_LABEL[current]}` : STAGE_LABEL[current]}`}>
      {PROGRESS_STAGES.map((stage, i) => {
        const done = i < at || (!declined && stage === "hired" && current === "hired");
        const isCurrent = i === at && !(stage === "hired" && current === "hired");
        const cls = [done ? "done" : "", isCurrent ? "current" : "", isCurrent && declined ? "stopped" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={stage} className={cls} aria-current={isCurrent ? "step" : undefined}>
            <span className="dot">
              {done ? <CheckIcon /> : isCurrent && declined ? <XIcon /> : i + 1}
            </span>
            <span className="label">{STAGE_LABEL[stage]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function MyApplicationsPage() {
  const { session } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!session) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("applications")
      .select("*, job_postings(title, department)")
      .eq("applicant_id", session.user.id)
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const list = (data as Application[]) ?? [];
    setApps(list);
    if (list.some((a) => a.stage === "rejected")) {
      const { data: ev } = await supabase
        .from("application_events")
        .select("id, application_id, kind, from_stage, to_stage, created_at")
        .in("application_id", list.map((a) => a.id));
      setEvents((ev as ApplicationEvent[]) ?? []);
    }
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>My applications</h1>
          <p>See where each application is in the hiring process.</p>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={3} label="Loading your applications" />
      ) : error ? (
        <ErrorState title="We couldn't load your applications" message={error} onRetry={load} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon />}
          title="No applications yet"
          action={
            <Link to="/" className="btn">
              Browse open roles
            </Link>
          }
        >
          When you apply for a role, you can follow every step from here.
        </EmptyState>
      ) : (
        <ul className="list-reset stack">
          {apps.map((a) => (
            <li key={a.id} className="card card-pad stack">
              <div className="row-wrap">
                <span className="tile">
                  <BriefcaseIcon />
                </span>
                <div className="grow">
                  <h2 style={{ fontSize: 18 }}>
                    {a.job_postings ? (
                      <Link to={`/jobs/${a.posting_id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {a.job_postings.title}
                      </Link>
                    ) : (
                      "A role that has since closed"
                    )}
                  </h2>
                  <div className="meta">
                    {a.job_postings?.department && <span>{a.job_postings.department}</span>}
                    <span>Applied {formatDate(a.created_at)}</span>
                  </div>
                </div>
                <StageBadge stage={a.stage} />
              </div>
              <Tracker app={a} events={events} />
              {a.stage === "hired" && (
                <Link to="/onboarding" className="btn secondary" style={{ alignSelf: "flex-start" }}>
                  Go to onboarding
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
