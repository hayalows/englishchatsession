import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const settingsSchema = z
  .object({
    notifications_enabled: z.boolean(),
    preferred_days: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])).max(7),
    preferred_start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    preferred_end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    preferred_tutors: z.array(z.string().trim().min(1).max(120)).max(100),
    timezone: z.literal("Africa/Accra"),
  })
  .refine((value) => !value.preferred_start_time || !value.preferred_end_time || value.preferred_start_time < value.preferred_end_time, {
    message: "Latest time must be after earliest time.",
  });

function unauthorized(error: unknown) {
  return error instanceof Error && error.message === "UNAUTHORIZED";
}

export async function GET() {
  try {
    const user = await requireApiUser();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("user_settings").select("*").eq("id", user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error) {
    return NextResponse.json({ message: unauthorized(error) ? "Unauthorized" : "Unable to load settings." }, { status: unauthorized(error) ? 401 : 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: "Invalid settings.", issues: parsed.error.flatten() }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("user_settings").upsert({ id: user.id, email: user.email ?? "", ...parsed.data });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: unauthorized(error) ? "Unauthorized" : "Unable to save settings." }, { status: unauthorized(error) ? 401 : 500 });
  }
}
