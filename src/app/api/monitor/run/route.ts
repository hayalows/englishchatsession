import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { runMonitoring } from "@/lib/monitoring/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireApiUser();
    const result = await runMonitoring();
    return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ message: "Sign in to run a manual check." }, { status: 401 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to run monitor." }, { status: 500 });
  }
}
