import { describe, expect, it } from "vitest";

import { parseSchedulingPage } from "./parser";

const source = "https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0";

describe("parseSchedulingPage", () => {
  it("keeps only trusted Google Calendar booking links and makes stable source IDs", () => {
    const html = `
      <a href="https://calendar.app.google/Example123?authuser=0&utm_source=site">  Ada Tutor  </a>
      <a href="https://example.com/not-a-booking">Ignore me</a>
      <a href="https://calendar.app.google/Example123">Ada Tutor duplicate</a>
    `;
    const sessions = parseSchedulingPage(html, source);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ tutor: "Ada Tutor duplicate", bookingUrl: "https://calendar.app.google/Example123" });
    expect(sessions[0].sourceId).toHaveLength(64);
  });

  it("unwraps an Outlook Safe Links calendar URL without trusting arbitrary redirects", () => {
    const html = '<a href="https://nam10.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcalendar.app.google%2FSafe123">Jordan Tutor</a>';
    expect(parseSchedulingPage(html, source)[0].bookingUrl).toBe("https://calendar.app.google/Safe123");
  });
});
