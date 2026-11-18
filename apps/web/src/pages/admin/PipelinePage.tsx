import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Application, ApplicationEvent, ApplicationNote, ApplicationStage, JobPosting } from "../../lib/types";
import { PROGRESS_STAGES, STAGES, STAGE_COLOR, STAGE_LABEL } from "../../lib/types";
import { displayName, errorMessage, formatDate, formatShortDate, plural, when } from "../../lib/format";
import { Avatar, EmptyState, ErrorState, SkeletonRows, StageBadge } from "../../components/ui";
import {
  CheckIcon,
  DocIcon,
  ExternalIcon,
  KanbanIcon,
  MailIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "../../components/icons";

type App = Application & { profiles: { full_name: string; email: string } | null };
type Event = ApplicationEvent;
type Note = ApplicationNote;

const APP_SELECT =
  "*, job_postings(title, department), profiles!applications_applicant_id_fkey(full_name, email)";
const EVENT_SELECT =
  "*, actor:profiles!application_events_actor_id_fkey(full_name, email), applications(profiles!applications_applicant_id_fkey(full_name, email), job_postings(title))";

/** Moves that email the candidate and can't be quietly undone. */
const CONSEQUENTIAL: ApplicationStage[] = ["hired", "rejected"];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 26}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Seven weekly buckets, oldest first. */
function weekly(dates: string[]): number[] {
  const buckets = Array(7).fill(0);
  const now = Date.now();
  for (const d of dates) {
    const weeksAgo = Math.floor((now - new Date(d).getTime()) / (7 * 864e5));
    if (weeksAgo >= 0 && weeksAgo < 7) buckets[6 - weeksAgo]++;
  }
  return buckets;
}

function eventText(e: Event): string {
  const who = displayName(e.applications?.profiles);
  const role = e.applications?.job_postings?.title ?? "a role";
  if (e.kind === "applied") return `${who} applied for ${role}`;
  const to = e.to_stage as ApplicationStage;
  if (to === "hired") return `${who} hired. Onboarding case created`;
  if (to === "rejected") return `${who} not progressed (${role})`;
  if (to === "offer") return `Offer stage: ${who}, ${role}`;
  return `${who} moved to ${STAGE_LABEL[to].toLowerCase()}`;
}

export default function PipelinePage() {
  const { isAdmin } = useAuth();
  const [apps, setApps] = useState<App[]>([]);
  const [postings, setPostings] = useState<Pick<JobPosting, "id" | "title">[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [postingFilter, setPostingFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStage | null>(null);
  const [moveMenu, setMoveMenu] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ ids: string[]; stage: ApplicationStage } | null>(null);
  const [composeFor, setComposeFor] = useState<string[] | null>(null);

  async function load() {
    const since = new Date(Date.now() - 49 * 864e5).toISOString();
    const [a, p, e] = await Promise.all([
      supabase.from("applications").select(APP_SELECT).order("created_at", { ascending: false }),
      supabase.from("job_postings").select("id, title").order("title"),
      supabase.from("application_events").select(EVENT_SELECT).gte("created_at", since).order("created_at", { ascending: false }),
    ]);
    const err = a.error ?? p.error ?? e.error;
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    setApps((a.data as App[]) ?? []);
    setPostings((p.data as Pick<JobPosting, "id" | "title">[]) ?? []);
    setEvents((e.data as Event[]) ?? []);
    setLoadError(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const q = search.trim().toLowerCase();
  const visible = apps.filter(
    (a) =>
      (postingFilter === "all" || a.posting_id === postingFilter) &&
      (!q ||
        displayName(a.profiles).toLowerCase().includes(q) ||
        (a.profiles?.email ?? "").toLowerCase().includes(q) ||
        (a.job_postings?.title ?? "").toLowerCase().includes(q)),
  );

  const kpis = useMemo(() => {
    const toStage = (s: ApplicationStage) => events.filter((e) => e.to_stage === s).map((e) => e.created_at);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return [
      {
        label: "Open applications",
        value: apps.filter((a) => a.stage !== "hired" && a.stage !== "rejected").length,
        color: "#6366F1",
        series: weekly(events.filter((e) => e.kind === "applied").map((e) => e.created_at)),
      },
      { label: "In interview", value: apps.filter((a) => a.stage === "interview").length, color: "#8B5CF6", series: weekly(toStage("interview")) },
      { label: "Offers out", value: apps.filter((a) => a.stage === "offer").length, color: "#D97706", series: weekly(toStage("offer")) },
      {
        label: "Hired this month",
        value: events.filter((e) => e.to_stage === "hired" && new Date(e.created_at) >= monthStart).length,
        color: "#10B981",
        series: weekly(toStage("hired")),
      },
    ];
  }, [apps, events]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestMove(ids: string[], stage: ApplicationStage) {
    const moving = ids.filter((id) => apps.find((a) => a.id === id)?.stage !== stage);
    if (!moving.length) return;
    if (CONSEQUENTIAL.includes(stage)) setPendingMove({ ids: moving, stage });
    else void move(moving, stage);
  }

  async function move(ids: string[], stage: ApplicationStage) {
    setError(null);
    setMoveMenu(false);
    const before = apps;
    // Optimistic; a failure puts the board back the way it was.
    setApps((list) => list.map((a) => (ids.includes(a.id) ? { ...a, stage } : a)));
    // Moving to 'hired' fires the hired-to-onboarding Edge Function, which
    // creates the onboarding case and emails the new hire.
    const { error: err } = await supabase.from("applications").update({ stage }).in("id", ids);
    if (err) {
      setApps(before);
      setError(`Couldn't move ${plural(ids.length, "application")}: ${err.message}`);
      return;
    }
    setSelected(new Set());
    void load();
  }

  async function openResume(path: string) {
    const { data, error: err } = await supabase.storage.from("resumes").createSignedUrl(path, 300);
    if (err) setError(err.message);
    else if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  const openApp = apps.find((a) => a.id === openId) ?? null;
  const selectedIds = [...selected];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Hiring pipeline</h1>
          <p>
            {loading
              ? "Loading…"
              : `${plural(apps.filter((a) => a.stage !== "hired" && a.stage !== "rejected").length, "open application")} · drag cards between stages, or select several to act in bulk`}
          </p>
        </div>
        {isAdmin && (
          <Link to="/postings" className="btn">
            <PlusIcon /> New posting
          </Link>
        )}
      </div>

      {loading ? (
        <SkeletonRows rows={4} label="Loading the pipeline" />
      ) : loadError ? (
        <ErrorState title="We couldn't load the pipeline" message={loadError} onRetry={load} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<KanbanIcon />}
          title="No applications yet"
          action={
            isAdmin && (
              <Link to="/postings" className="btn">
                Create a job posting
              </Link>
            )
          }
        >
          Once candidates apply, they will appear here. Publish a job posting to get started.
        </EmptyState>
      ) : (
        <>
          <div className="kpis">
            {kpis.map((k) => (
              <div className="card kpi" key={k.label}>
                <span className="label">{k.label}</span>
                <span className="value">{k.value}</span>
                <Sparkline values={k.series} color={k.color} />
                <span className="sr-only">Last 7 weeks: {k.series.join(", ")}</span>
              </div>
            ))}
          </div>

          <div className="toolbar">
            <label className="search-field">
              <SearchIcon />
              <span className="sr-only">Search candidates</span>
              <input placeholder="Search candidates or roles" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>
              <span className="sr-only">Filter by job</span>
              <select value={postingFilter} onChange={(e) => setPostingFilter(e.target.value)}>
                <option value="all">All jobs</option>
                {postings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            {(q || postingFilter !== "all") && (
              <span className="muted small">
                Showing {visible.length} of {apps.length}
              </span>
            )}
          </div>

          {error && (
            <p className="error-text" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </p>
          )}

          <div className="pipeline-layout">
            <div className="board-wrap">
              <div className="kanban" role="list" aria-label="Pipeline stages">
                {STAGES.map((stage) => {
                  const inStage = visible.filter((a) => a.stage === stage);
                  const isTarget = overStage === stage && dragIds !== null;
                  return (
                    <section
                      key={stage}
                      role="listitem"
                      aria-label={`${STAGE_LABEL[stage]}, ${inStage.length}`}
                      className={`kanban-col${isTarget ? " drop-target" : ""}`}
                      onDragOver={(e) => {
                        if (!dragIds) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (overStage !== stage) setOverStage(stage);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIds) requestMove(dragIds, stage);
                        setDragIds(null);
                        setOverStage(null);
                      }}
                    >
                      <h2 className="kanban-head">
                        <span className="stage-dot" style={{ background: STAGE_COLOR[stage] }} />
                        {STAGE_LABEL[stage]}
                        <span className="count">{inStage.length}</span>
                      </h2>
                      {isTarget && <div className="drop-hint">Drop to move to {STAGE_LABEL[stage]}</div>}
                      {inStage.map((a) => {
                        const name = displayName(a.profiles);
                        const isSel = selected.has(a.id);
                        return (
                          <article
                            key={a.id}
                            className={`card kanban-card${isSel ? " selected" : ""}${openId === a.id ? " open" : ""}${dragIds?.includes(a.id) ? " dragging" : ""}`}
                            draggable
                            onDragStart={(e) => {
                              const ids = isSel ? selectedIds : [a.id];
                              setDragIds(ids);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", ids.join(","));
                            }}
                            onDragEnd={() => {
                              setDragIds(null);
                              setOverStage(null);
                            }}
                          >
                            <div className="card-top">
                              <Avatar name={name} size="sm" />
                              <input
                                type="checkbox"
                                checked={isSel}
                                onChange={() => toggle(a.id)}
                                aria-label={`Select ${name}`}
                              />
                            </div>
                            <div>
                              <button className="name" onClick={() => setOpenId(a.id)}>
                                {name}
                              </button>
                              <div className="role truncate" title={a.job_postings?.title ?? undefined}>
                                {a.job_postings?.title ?? "—"}
                              </div>
                            </div>
                            <div className="foot">
                              <span title={`Applied ${formatDate(a.created_at)}`}>{formatShortDate(a.created_at)}</span>
                              {a.resume_file_path && (
                                <button className="link small" onClick={() => void openResume(a.resume_file_path!)}>
                                  View CV
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  );
                })}
              </div>

              <section className="card" style={{ marginTop: 20 }} aria-labelledby="activity-h">
                <div className="panel-head">
                  <h2 id="activity-h">Recent activity</h2>
                </div>
                {events.length === 0 ? (
                  <p className="muted" style={{ padding: "16px 24px" }}>
                    Nothing in the last seven weeks.
                  </p>
                ) : (
                  <ul className="activity">
                    {events.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        <span
                          className="stage-dot"
                          style={{ background: STAGE_COLOR[(e.to_stage ?? "applied") as ApplicationStage], alignSelf: "center" }}
                        />
                        <span>{eventText(e)}</span>
                        <span className="time">{when(e.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {openApp && (
              <CandidatePanel
                app={openApp}
                events={events.filter((e) => e.application_id === openApp.id)}
                onClose={() => setOpenId(null)}
                onMove={(stage) => requestMove([openApp.id], stage)}
                onOpenResume={openResume}
                onEmail={() => setComposeFor([openApp.id])}
              />
            )}
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span className="count">{selected.size} selected</span>
          <div className="menu">
            <button className="secondary sm" aria-expanded={moveMenu} aria-haspopup="menu" onClick={() => setMoveMenu((m) => !m)}>
              Move to…
            </button>
            {moveMenu && (
              <div className="menu-list" role="menu">
                {STAGES.map((s) => (
                  <button key={s} role="menuitem" onClick={() => requestMove(selectedIds, s)}>
                    <span className="stage-dot" style={{ background: STAGE_COLOR[s] }} /> {STAGE_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="secondary sm" onClick={() => setComposeFor(selectedIds)}>
            <MailIcon /> Email candidates
          </button>
          <button className="danger sm" onClick={() => requestMove(selectedIds, "rejected")}>
            Reject
          </button>
          <button className="icon-btn" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <XIcon />
          </button>
        </div>
      )}

      {pendingMove && (
        <ConfirmMove
          count={pendingMove.ids.length}
          name={pendingMove.ids.length === 1 ? displayName(apps.find((a) => a.id === pendingMove.ids[0])?.profiles) : null}
          stage={pendingMove.stage}
          onCancel={() => setPendingMove(null)}
          onConfirm={() => {
            void move(pendingMove.ids, pendingMove.stage);
            setPendingMove(null);
          }}
        />
      )}

      {composeFor && (
        <ComposeMessage
          ids={composeFor}
          names={composeFor.map((id) => displayName(apps.find((a) => a.id === id)?.profiles))}
          onClose={() => setComposeFor(null)}
          onSent={() => {
            setComposeFor(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // No close() in a cleanup: closing fires the dialog's close event, which
  // means "cancel" here, so a remount (React StrictMode does one) would
  // cancel the action. Unmounting removes the dialog on its own.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={label} onClose={onClose} onCancel={onClose}>
      {children}
    </dialog>
  );
}

function ConfirmMove({
  count,
  name,
  stage,
  onCancel,
  onConfirm,
}: {
  count: number;
  name: string | null;
  stage: ApplicationStage;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const who = name ?? plural(count, "candidate");
  return (
    <Modal onClose={onCancel} label={stage === "hired" ? "Confirm hire" : "Confirm rejection"}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <h2>{stage === "hired" ? `Mark ${who} as hired?` : `Reject ${who}?`}</h2>
        <p className="muted">
          {stage === "hired"
            ? "This creates an onboarding case with the document checklist and emails the new hire their upload link."
            : "The candidate is emailed that their application was not progressed. You can still move them back later."}
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={stage === "rejected" ? "danger" : undefined} autoFocus>
            {stage === "hired" ? "Mark as hired" : "Reject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ComposeMessage({
  ids,
  names,
  onClose,
  onSent,
}: {
  ids: string[];
  names: string[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("send_candidate_message", {
      p_application_ids: ids,
      p_subject: subject,
      p_body: body,
    });
    setBusy(false);
    if (err) setError(err.message);
    else onSent();
  }

  return (
    <Modal onClose={onClose} label="Email candidates">
      <form onSubmit={send}>
        <h2>Email {names.length === 1 ? names[0] : plural(names.length, "candidate")}</h2>
        {names.length > 1 && <p className="muted small">{names.join(", ")}</p>}
        <label className="field">
          Subject
          <input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="field">
          Message
          <textarea required rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <p className="muted small">Each candidate gets their own email, and it also appears in their notifications.</p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            <MailIcon /> {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CandidatePanel({
  app,
  events,
  onClose,
  onMove,
  onOpenResume,
  onEmail,
}: {
  app: App;
  events: Event[];
  onClose: () => void;
  onMove: (stage: ApplicationStage) => void;
  onOpenResume: (path: string) => Promise<void>;
  onEmail: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "cv" | "notes" | "history">("overview");
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<Event[]>(events);
  const [draft, setDraft] = useState("");
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(app.profiles);

  useEffect(() => {
    setTab("overview");
    setDraft("");
    setCvUrl(null);
    setError(null);
    // The board only loads recent events; the panel shows the whole story.
    void Promise.all([
      supabase
        .from("application_notes")
        .select("*, profiles(full_name, email)")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false }),
      supabase.from("application_events").select(EVENT_SELECT).eq("application_id", app.id).order("created_at", { ascending: false }),
    ]).then(([n, h]) => {
      if (n.error ?? h.error) setError((n.error ?? h.error)!.message);
      setNotes((n.data as Note[]) ?? []);
      setHistory((h.data as Event[]) ?? []);
    });
  }, [app.id, app.stage]);

  useEffect(() => {
    if (tab !== "cv" || !app.resume_file_path || cvUrl) return;
    void supabase.storage
      .from("resumes")
      .createSignedUrl(app.resume_file_path, 600)
      .then(({ data, error: err }) => (err ? setError(err.message) : setCvUrl(data?.signedUrl ?? null)));
  }, [tab, app.resume_file_path, cvUrl]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const { data, error: err } = await supabase
      .from("application_notes")
      .insert({ application_id: app.id, body })
      .select("*, profiles(full_name, email)")
      .single();
    if (err) setError(errorMessage(err));
    else {
      setNotes((n) => [data as Note, ...n]);
      setDraft("");
    }
  }

  const at = PROGRESS_STAGES.indexOf(app.stage);
  const next = at >= 0 && at < PROGRESS_STAGES.length - 1 ? PROGRESS_STAGES[at + 1] : null;
  const isPdf = app.resume_file_path?.toLowerCase().endsWith(".pdf");

  return (
    <aside className="card side-panel" aria-label={`Candidate: ${name}`}>
      <div className="head">
        <Avatar name={name} size="lg" />
        <div className="grow">
          <h2 style={{ fontSize: 18 }}>{name}</h2>
          <p className="muted small">
            {app.job_postings?.title ?? "—"}
            {app.job_postings?.department ? ` · ${app.job_postings.department}` : ""}
          </p>
          <div style={{ marginTop: 6 }}>
            <StageBadge stage={app.stage} />
          </div>
        </div>
        <button className="icon-btn" aria-label="Close candidate panel" onClick={onClose}>
          <XIcon />
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Candidate details">
        {(["overview", "cv", "notes", "history"] as const).map((t) => (
          <button key={t} className="tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "cv" ? "CV" : t[0].toUpperCase() + t.slice(1)}
            {t === "notes" && notes.length > 0 ? ` (${notes.length})` : ""}
          </button>
        ))}
      </div>

      <div className="body" role="tabpanel">
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {tab === "overview" && (
          <>
            <ol className="stepper" aria-label="Stage">
              {PROGRESS_STAGES.map((s, i) => {
                const done = app.stage !== "rejected" && (i < at || (s === "hired" && app.stage === "hired"));
                const current = s === app.stage && s !== "hired";
                return (
                  <li key={s} className={done ? "done" : current ? "current" : ""} aria-current={current ? "step" : undefined}>
                    <span className="dot">{done ? <CheckIcon /> : i + 1}</span>
                    {STAGE_LABEL[s]}
                  </li>
                );
              })}
            </ol>
            <dl className="stack-sm" style={{ margin: 0, fontSize: 14 }}>
              <div className="row between">
                <dt className="muted">Email</dt>
                <dd style={{ margin: 0 }} className="truncate">
                  {app.profiles?.email}
                </dd>
              </div>
              <div className="row between">
                <dt className="muted">Applied</dt>
                <dd style={{ margin: 0 }}>{formatDate(app.created_at)}</dd>
              </div>
            </dl>
            {app.resume_file_path ? (
              <div className="file-row">
                <DocIcon className="file-icon" />
                <span className="name">{app.resume_file_path.split("/").pop()?.replace(/^\d+-/, "")}</span>
                <button className="link small" onClick={() => void onOpenResume(app.resume_file_path!)}>
                  Open
                </button>
              </div>
            ) : (
              <p className="muted small">No CV uploaded.</p>
            )}
            <button className="secondary" onClick={onEmail}>
              <MailIcon /> Email candidate
            </button>
          </>
        )}

        {tab === "cv" &&
          (!app.resume_file_path ? (
            <p className="muted">This candidate applied without a CV.</p>
          ) : isPdf && cvUrl ? (
            <>
              <iframe src={cvUrl} title={`CV of ${name}`} style={{ width: "100%", height: 480, border: 0, borderRadius: 8 }} />
              <a href={cvUrl} target="_blank" rel="noopener" className="btn secondary">
                <ExternalIcon /> Open in a new tab
              </a>
            </>
          ) : (
            <button className="secondary" onClick={() => void onOpenResume(app.resume_file_path!)}>
              <ExternalIcon /> Open CV
            </button>
          ))}

        {tab === "notes" && (
          <>
            <form onSubmit={addNote} className="stack-sm">
              <label className="field">
                Internal note
                <textarea
                  rows={3}
                  placeholder="Visible to reviewers and admins only"
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </label>
              <button type="submit" className="sm" style={{ alignSelf: "flex-end" }} disabled={!draft.trim()}>
                Add note
              </button>
            </form>
            {notes.length === 0 ? (
              <p className="muted small">No notes yet.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="stack-sm" style={{ gap: 4 }}>
                  <div className="note">{n.body}</div>
                  <span className="muted small">
                    {displayName(n.profiles)} · {when(n.created_at)}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {tab === "history" && (
          <ol className="timeline">
            {history.map((e) => (
              <li key={e.id}>
                {e.kind === "applied"
                  ? "Applied via the job board"
                  : `Moved to ${STAGE_LABEL[e.to_stage!]}${e.actor ? ` by ${displayName(e.actor)}` : ""}`}
                <span className="when">{when(e.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="actions">
        {next && app.stage !== "rejected" && <button onClick={() => onMove(next)}>Move to {STAGE_LABEL[next]}</button>}
        {app.stage === "rejected" ? (
          <button className="secondary" onClick={() => onMove("applied")}>
            Reopen application
          </button>
        ) : (
          app.stage !== "hired" && (
            <button className="danger-outline" onClick={() => onMove("rejected")}>
              Reject
            </button>
          )
        )}
      </div>
    </aside>
  );
}
