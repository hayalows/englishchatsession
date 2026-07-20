import { CheckNowButton } from "@/components/check-now-button";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function formatRunTime(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const admin = createAdminClient();
  const [{ data: sessions }, { data: runs }, { count: activeCount }] = await Promise.all([
    admin.from("sessions").select("id, tutor, booking_url, status, last_seen_at").eq("status", "open").order("tutor").limit(40),
    admin.from("monitoring_runs").select("id, status, completed_at, sessions_found, changes_found, error_message").order("started_at", { ascending: false }).limit(8),
    admin.from("sessions").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const latestRun = runs?.[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Private availability desk</p>
          <h1>English Chat Monitor</h1>
        </div>
        <nav aria-label="Main navigation">
          <span>{user.email}</span>
        </nav>
      </header>

      <section className="signal-panel">
        <div>
          <p className="eyebrow">Manual appointment check</p>
          <p className="signal-number">{activeCount ?? 0}</p>
          <p className="signal-label">booking pages currently listed</p>
        </div>
        <div className="signal-detail">
          <p>Last check</p>
          <strong>{formatRunTime(latestRun?.completed_at ?? null)}</strong>
          <span>{latestRun?.status ?? "No checks yet"}</span>
        </div>
        <CheckNowButton />
      </section>
      <p className="manual-notice">Automatic monitoring is currently disabled. Appointment checks run only when you press the check button.</p>

      <section className="content-grid">
        <div className="panel sessions-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current listings</p>
              <h2>Choose a tutor</h2>
            </div>
            <span>{sessions?.length ?? 0} shown</span>
          </div>
          <div className="session-list">
            {sessions?.map((session) => (
              <a className="session-row" href={session.booking_url} key={session.id} rel="noreferrer" target="_blank">
                <span>{session.tutor ?? "English Chat tutor"}</span>
                <small>Open booking page</small>
              </a>
            ))}
            {sessions?.length === 0 ? <p className="empty-state">No booking links have been recorded yet. Run the first check to establish a baseline.</p> : null}
          </div>
        </div>

        <aside className="panel history-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Monitor history</p>
              <h2>Recent checks</h2>
            </div>
          </div>
          <ol className="run-list">
            {runs?.map((run) => (
              <li key={run.id}>
                <span className={`status-dot ${run.status}`} aria-hidden="true" />
                <div>
                  <strong>{run.status}</strong>
                  <small>{formatRunTime(run.completed_at)}</small>
                  {run.error_message ? <small className="error-copy">{run.error_message}</small> : <small>{run.sessions_found} links · {run.changes_found} changes</small>}
                </div>
              </li>
            ))}
            {runs?.length === 0 ? <li className="empty-state">No checks yet.</li> : null}
          </ol>
        </aside>
      </section>
    </main>
  );
}
