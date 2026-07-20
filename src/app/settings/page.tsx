import Link from "next/link";

import { SettingsForm } from "@/components/settings-form";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireCurrentUser();
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_settings")
    .select("notifications_enabled, preferred_days, preferred_start_time, preferred_end_time, preferred_tutors, timezone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="app-shell settings-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Personal preferences</p>
          <h1>Alert settings</h1>
        </div>
        <nav aria-label="Main navigation"><Link href="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="panel settings-panel">
        <p className="lede">Filters apply only when the source includes a session date or time. Booking links without a published schedule are never assigned a guessed timezone.</p>
        <SettingsForm initial={data ?? { notifications_enabled: true, preferred_days: [], preferred_start_time: null, preferred_end_time: null, preferred_tutors: [], timezone: "Africa/Accra" }} />
      </section>
    </main>
  );
}
