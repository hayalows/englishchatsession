import { NextResponse } from "next/server";

import { getCurrentBookings } from "@/lib/monitoring/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCurrentBookings(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to read the scheduling page." }, { status: 502 });
  }
}
