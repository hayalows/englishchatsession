import { NextRequest, NextResponse } from "next/server";

import { getServerEnvironment } from "@/lib/env";
import { runMonitoring } from "@/lib/monitoring/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { CRON_SECRET } = getServerEnvironment();
    if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const result = await runMonitoring();
    return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to run monitor." }, { status: 500 });
  }
}
