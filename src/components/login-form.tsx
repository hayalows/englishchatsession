"use client";

import { FormEvent, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setSubmitting(false);
    setMessage(error ? error.message : "Check your inbox for the sign-in link.");
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Email address
        <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
      </label>
      <button disabled={submitting} type="submit">{submitting ? "Sending link…" : "Send sign-in link"}</button>
      {message ? <p aria-live="polite" className="form-message">{message}</p> : null}
    </form>
  );
}
