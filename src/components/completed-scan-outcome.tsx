type CompletedScanOutcomeProps = {
  available: number;
  checkedRange: string;
  confirmedEmpty: number;
  isStale: boolean;
  later: number;
  nextWeek: number;
  onCheckAgain: () => void;
  onFindAny: () => void;
  onNewSearch: () => void;
  onViewSessions: () => void;
  singleTutor: string | null;
  temporarilyUnavailable: number;
  temporaryErrors: number;
  thisWeek: number;
};

export function CompletedScanOutcome({
  available,
  checkedRange,
  confirmedEmpty,
  isStale,
  later,
  nextWeek,
  onCheckAgain,
  onFindAny,
  onNewSearch,
  onViewSessions,
  singleTutor,
  temporarilyUnavailable,
  temporaryErrors,
  thisWeek,
}: CompletedScanOutcomeProps) {
  const hasReliableResult = available > 0 || confirmedEmpty > 0;
  const checkedLabel = isStale ? "Checked earlier · Availability may have changed" : "Checked just now";

  if (available > 0) {
    return (
      <>
        <div className="outcome-announcement" role="status">
          <span className="state-label">Scan complete</span>
          <h3>
            {singleTutor
              ? `${singleTutor} has available sessions`
              : `${available} volunteer${available === 1 ? "" : "s"} with open times`}
          </h3>
          <p>
            {singleTutor
              ? `View ${singleTutor}’s available dates below, then book the exact time on Google.`
              : "Choose an opening below, then book the exact time on Google."}
          </p>
          <div className="outcome-facts" aria-label="Available sessions by date">
            {thisWeek > 0 ? <span><b>{thisWeek}</b> this week</span> : null}
            {nextWeek > 0 ? <span><b>{nextWeek}</b> next week</span> : null}
            {later > 0 ? <span><b>{later}</b> later</span> : null}
          </div>
          <small>{checkedLabel}{checkedRange ? ` · Searched ${checkedRange}` : ""}</small>
        </div>
        <div className="outcome-actions">
          <button onClick={onViewSessions} type="button">
            {singleTutor ? `View ${singleTutor}’s sessions` : "View available sessions"}
          </button>
          <button className="quiet-button" onClick={onNewSearch} type="button">
            {singleTutor ? "Search another volunteer" : "New search"}
          </button>
        </div>
      </>
    );
  }

  if (hasReliableResult) {
    return (
      <>
        <div className="outcome-announcement" role="status">
          <span className="state-label">Scan complete</span>
          <h3>{singleTutor ? `${singleTutor} has no available sessions right now` : "No sessions available right now"}</h3>
          <p>
            {singleTutor
              ? `We checked ${singleTutor}’s calendar, but Google returned no open appointment times. Availability can change, so check again later.`
              : "We checked every volunteer calendar ready now. Availability changes as volunteers update their calendars, so check again later."}
          </p>
          <small>{checkedLabel}{checkedRange ? ` · Searched ${checkedRange}` : ""}</small>
        </div>
        <div className="outcome-actions">
          <button onClick={onCheckAgain} type="button">{singleTutor ? `Check ${singleTutor} again` : "Check again"}</button>
          <button className="quiet-button" onClick={onNewSearch} type="button">
            {singleTutor ? "Search another volunteer" : "New search"}
          </button>
        </div>
      </>
    );
  }

  const onlyPausedCalendar = Boolean(singleTutor && temporarilyUnavailable > 0 && temporaryErrors === 0);
  const everyCalendarWaiting = Boolean(!singleTutor && temporarilyUnavailable > 0 && temporaryErrors === 0);
  return (
    <>
      <div className="outcome-announcement" role="alert">
        <span className="state-label">Search incomplete</span>
        <h3>
          {onlyPausedCalendar
            ? `${singleTutor}’s calendar is temporarily unavailable`
            : everyCalendarWaiting
              ? "Calendars are waiting briefly"
              : singleTutor
                ? `We couldn’t confirm ${singleTutor}’s availability`
                : "We couldn’t check availability"}
        </h3>
        <p>
          {onlyPausedCalendar
            ? `We could not check ${singleTutor}’s calendar right now. Search all volunteers for the best chance of finding a session.`
            : everyCalendarWaiting
              ? "No volunteer calendar is ready to check right now. Waiting calendars automatically return to a future search."
              : singleTutor
                ? `Google did not return enough reliable information to confirm ${singleTutor}’s availability. This does not mean there are no sessions.`
                : "Google did not return enough reliable information to confirm whether sessions are available. Please try again in a moment."}
        </p>
        <small>
          {onlyPausedCalendar
            ? "This calendar will become eligible for an automatic future check."
            : everyCalendarWaiting
              ? "This is temporary. No calendar has been removed permanently."
              : "We did not label this as “no sessions available” because the check was incomplete."}
        </small>
      </div>
      <div className="outcome-actions">
        <button onClick={onlyPausedCalendar ? onFindAny : onCheckAgain} type="button">
          {onlyPausedCalendar ? "Search all volunteers" : "Check again"}
        </button>
        {!onlyPausedCalendar ? (
          <button className="quiet-button" onClick={onNewSearch} type="button">
            {singleTutor ? "Search another volunteer" : "New search"}
          </button>
        ) : null}
      </div>
    </>
  );
}
