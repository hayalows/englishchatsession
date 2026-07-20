import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { sendSessionNotification } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireApiUser();
    const result = await sendSessionNotification({
      type: "details_changed",
      previous: null,
      current: {
        sourceId: "test-email",
        title: "English Chat booking",
        tutor: "Test tutor",
        sessionDate: null,
        startTime: null,
        endTime: null,
        sourceTimezone: null,
        bookingUrl: "https://sites.google.com/view/english-chat-student-center/Scheduling",
        status: "open",
        rawData: { kind: "test" },
      },
    });
    if (result.error) return NextResponse.json({ message: result.error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && error.message === "UNAUTHORIZED" ? "Unauthorized" : "Unable to send test email." }, { status: error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
