import { NextRequest, NextResponse } from "next/server";

import { checkBookingSlots } from "@/lib/monitoring/slots";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { bookingUrl?: unknown };
    if (typeof body.bookingUrl !== "string") return NextResponse.json({ message: "A booking URL is required." }, { status: 400 });
    return NextResponse.json(await checkBookingSlots(body.bookingUrl, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to check this booking page." }, { status: 502 });
  }
}
