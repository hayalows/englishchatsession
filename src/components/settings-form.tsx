"use client";

import { FormEvent, useState } from "react";

type Settings = {
  notifications_enabled: boolean;
  preferred_days: string[];
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  preferred_tutors: string[];
  timezone: string;
};

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleDay(day: string) {
    setSettings((current) => ({ ...current, preferred_days: current.preferred_days.includes(day) ? current.preferred_days.filter((value) => value !== day) : [...current.preferred_days, day] }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const payload = (await response.json()) as { message?: string };
    setSaving(false);
    setMessage(response.ok ? "Settings saved." : payload.message ?? "Settings could not be saved.");
  }

  return (
    <form className="settings-form" onSubmit={save}>
      <label className="toggle-row"><input checked={settings.notifications_enabled} onChange={(event) => setSettings({ ...settings, notifications_enabled: event.target.checked })} type="checkbox" /> Send email alerts</label>
      <fieldset>
        <legend>Preferred days</legend>
        <div className="day-grid">{days.map((day) => <label key={day}><input checked={settings.preferred_days.includes(day)} onChange={() => toggleDay(day)} type="checkbox" /> {day.slice(0, 3)}</label>)}</div>
      </fieldset>
      <div className="time-grid">
        <label>Earliest time<input onChange={(event) => setSettings({ ...settings, preferred_start_time: event.target.value || null })} type="time" value={settings.preferred_start_time ?? ""} /></label>
        <label>Latest time<input onChange={(event) => setSettings({ ...settings, preferred_end_time: event.target.value || null })} type="time" value={settings.preferred_end_time ?? ""} /></label>
      </div>
      <label>Preferred tutors <span>one per line</span><textarea onChange={(event) => setSettings({ ...settings, preferred_tutors: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} rows={5} value={settings.preferred_tutors.join("\n")} /></label>
      <label>Display timezone<input readOnly value={settings.timezone} /></label>
      <button disabled={saving} type="submit">{saving ? "Saving…" : "Save settings"}</button>
      {message ? <p aria-live="polite" className="form-message">{message}</p> : null}
    </form>
  );
}
