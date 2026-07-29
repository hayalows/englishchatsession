type CompletedScanOutcomeProps = {
  available: number;
  checkedRange: string;
  confirmedEmpty: number;
  isStale: boolean;
  later: number;
  nextWeek: number;
  onCheckAgain: () => void;
  onNewSearch: () => void;
  onViewSessions: () => void;
  permanentProblems: number;
  singleTutor: string | null;
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
  onNewSearch,
  onViewSessions,
  permanentProblems,
  singleTutor,
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
          <h3>{available} volunteer{available === 1 ? "" : "s"} with open times</h3>
          <p>Choose an opening below, then book the exact time on Google.</p>
          <div className="outcome-facts" aria-label="Available sessions by date">
            {thisWeek > 0 ? <span><b>{thisWeek}</b> this week</span> : null}
            {nextWeek > 0 ? <span><b>{nextWeek}</b> next week</span> : null}
            {later > 0 ? <span><b>{later}</b> later</span> : null}
          </div>
          <small>{checkedLabel}{checkedRange ? ` · Searched ${checkedRange}` : ""}</small>
        </div>
        <div className="outcome-actions">
          <button onClick={onViewSessions} type="button">View available sessions</button>
          <button className="quiet-button" onClick={onNewSearch} type="button">New search</button>
        </div>
      </>
    );
  }

  if (hasReliableResult) {
    return (
      <>
        <div className="outcome-announcement" role="status">
          <span className="state-label">Scan complete</span>
          <h3>No sessions available right now</h3>
          <p>
            We did not find a bookable appointment
            {checkedRange ? ` between ${checkedRange.replace("–", " and ")}` : " in the checked date range"}.
            {" "}Availability changes as volunteers update their calendars, so check again later.
          </p>
          <small>{checkedLabel}</small>
        </div>
        <div className="outcome-actions">
          <button onClick={onCheckAgain} type="button">Check again</button>
          <button className="quiet-button" onClick={onNewSearch} type="button">New search</button>
        </div>
      </>
    );
  }

  const onlyPermanentProblems = permanentProblems > 0 && temporaryErrors === 0;
  return (
    <>
      <div className="outcome-announcement" role="alert">
        <span className="state-label">Search incomplete</span>
        <h3>{singleTutor && onlyPermanentProblems ? "This booking page is unavailable" : "We couldn’t check availability"}</h3>
        <p>
          {singleTutor && onlyPermanentProblems
            ? `We could not reach ${singleTutor}’s booking calendar. Choose another volunteer or use the official schedule.`
            : "Google did not return enough reliable information to confirm whether sessions are available. Please try again in a moment."}
        </p>
        <small>We did not label this as “no sessions available” because the check was incomplete.</small>
      </div>
      <div className="outcome-actions">
        <button onClick={onlyPermanentProblems ? onNewSearch : onCheckAgain} type="button">
          {onlyPermanentProblems ? "Find another session" : "Check again"}
        </button>
        {!onlyPermanentProblems ? (
          <button className="quiet-button" onClick={onNewSearch} type="button">New search</button>
        ) : null}
      </div>
    </>
  );
}
