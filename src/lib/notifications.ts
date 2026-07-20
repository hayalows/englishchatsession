import { Resend } from "resend";

import { getServerEnvironment } from "@/lib/env";
import type { DetectedChange } from "@/lib/monitoring/types";

function displaySession(change: DetectedChange) {
  const session = change.current;
  const schedule = session.sessionDate
    ? `${session.sessionDate}${session.startTime ? ` at ${session.startTime}` : ""}${session.sourceTimezone ? ` (${session.sourceTimezone})` : ""}`
    : "Availability is listed, but the source page does not provide a date or time.";
  return `${session.tutor ?? "English Chat tutor"}\n${schedule}\n${session.bookingUrl}`;
}

export async function sendSessionNotification(change: DetectedChange) {
  const environment = getServerEnvironment();
  const resend = new Resend(environment.RESEND_API_KEY);
  const subject =
    change.type === "new_session"
      ? `New English Chat booking: ${change.current.tutor ?? "tutor available"}`
      : `English Chat update: ${change.current.tutor ?? "booking changed"}`;

  return resend.emails.send({
    from: environment.ALERT_EMAIL_FROM,
    to: [environment.ALERT_EMAIL_TO],
    subject,
    text: `${subject}\n\n${displaySession(change)}\n\nOpen the booking link to choose a time.`,
  });
}
