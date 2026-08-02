import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  clearedAdminSessionCookieOptions,
} from "../../../../lib/admin/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(ADMIN_SESSION_COOKIE, "", clearedAdminSessionCookieOptions());
  return response;
}
