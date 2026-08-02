"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import styles from "../admin.module.css";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json() as { message?: unknown };
      if (!response.ok) {
        setMessage(typeof payload.message === "string" ? payload.message : "Unable to sign in.");
        return;
      }
      window.location.assign("/admin");
    } catch {
      setMessage("Unable to reach the administrator sign-in service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginCard} aria-labelledby="admin-login-title">
        <a className={styles.backLink} href="/">← Student finder</a>
        <p className={styles.eyebrow}>English Chat Finder</p>
        <h1 id="admin-login-title">Administrator sign-in</h1>
        <p className={styles.loginLead}>Use the operations password to review current volunteer calendar health.</p>
        <form className={styles.loginForm} onSubmit={submit}>
          <label>
            <span>Administrator password</span>
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {message ? <p className={styles.loginError} role="alert">{message}</p> : null}
          <button disabled={submitting || !password} type="submit">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className={styles.loginFootnote}>The password is checked on the server and is never stored in this browser.</p>
      </section>
    </main>
  );
}
