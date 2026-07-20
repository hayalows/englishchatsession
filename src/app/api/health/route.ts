import { NextResponse } from "next/server";

import { hasRequiredServerEnvironment } from "@/lib/env";

export function GET() {
  const configured = hasRequiredServerEnvironment();
  return NextResponse.json({ status: configured ? "ready" : "configuration_required", configured }, { status: configured ? 200 : 503 });
}
